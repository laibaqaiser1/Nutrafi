import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'
import { formatPhoneDisplay } from '@/lib/whatsapp/normalize-phone'
import {
  SUPPORT_ESCALATION_REPLY_MARKERS,
  inferSupportEscalationReason,
  supportEscalationReasonLabel,
} from '@/lib/whatsapp/support-queue'

export const dynamic = 'force-dynamic'

/**
 * Agent runs where the customer received a support redirect reply (for CS review).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)
    const days = Math.min(parseInt(searchParams.get('days') ?? '30', 10), 90)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const actions = await prisma.whatsAppAgentAction.findMany({
      where: {
        actionType: 'SEND_REPLY',
        status: 'OK',
        createdAt: { gte: since },
        OR: SUPPORT_ESCALATION_REPLY_MARKERS.map((marker) => ({
          output: { path: ['body'], string_contains: marker },
        })),
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 2,
      include: {
        run: {
          include: {
            customer: { select: { id: true, fullName: true, phone: true } },
            conversation: { select: { id: true, phoneE164: true, contactName: true } },
          },
        },
      },
    })

    const seenRunIds = new Set<number>()
    const items: Array<{
      runId: number
      conversationId: number | null
      phoneE164: string | null
      phoneDisplay: string | null
      contactName: string | null
      customer: { id: number; fullName: string; phone: string } | null
      customerMessage: string | null
      agentReplyPreview: string | null
      reason: string
      reasonLabel: string
      runStatus: string
      createdAt: string
    }> = []

    for (const action of actions) {
      const run = action.run
      if (!run || seenRunIds.has(run.id)) continue
      seenRunIds.add(run.id)

      const output = action.output as { body?: string } | null
      const replyBody = typeof output?.body === 'string' ? output.body : null
      const reason = inferSupportEscalationReason(run.parsedIntent, run.payload, replyBody)
      const phoneE164 = run.conversation?.phoneE164 ?? null

      items.push({
        runId: run.id,
        conversationId: run.conversationId,
        phoneE164,
        phoneDisplay: phoneE164 ? formatPhoneDisplay(phoneE164) : null,
        contactName: run.conversation?.contactName ?? null,
        customer: run.customer,
        customerMessage: run.rawMessageBody,
        agentReplyPreview: replyBody
          ? replyBody.length > 160
            ? `${replyBody.slice(0, 159)}…`
            : replyBody
          : null,
        reason,
        reasonLabel: supportEscalationReasonLabel(reason),
        runStatus: run.status,
        createdAt: run.createdAt.toISOString(),
      })

      if (items.length >= limit) break
    }

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const last24hCount = items.filter((i) => new Date(i.createdAt) >= last24h).length

    return NextResponse.json({
      summary: {
        total: items.length,
        last24h: last24hCount,
        days,
      },
      items,
    })
  } catch (error) {
    console.error('[whatsapp support-queue]', error)
    return NextResponse.json({ error: 'Failed to load support queue' }, { status: 500 })
  }
}
