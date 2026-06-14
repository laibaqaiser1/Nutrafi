import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'
import { formatPhoneDisplay } from '@/lib/whatsapp/normalize-phone'

export const dynamic = 'force-dynamic'

/** Conversations that have at least one AI agent run (for debug grouping by phone). */
export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const conversations = await prisma.whatsAppConversation.findMany({
      where: { agentRuns: { some: {} } },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        agentRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            rawMessageBody: true,
            createdAt: true,
          },
        },
        _count: { select: { agentRuns: true } },
      },
    })

    return NextResponse.json({
      phones: conversations.map((c) => {
        const lastRun = c.agentRuns[0] ?? null
        return {
          conversationId: c.id,
          phoneE164: c.phoneE164,
          phoneDisplay: formatPhoneDisplay(c.phoneE164),
          contactName: c.contactName,
          customer: c.customer,
          runCount: c._count.agentRuns,
          lastMessageAt: c.lastMessageAt,
          lastRun: lastRun
            ? {
                id: lastRun.id,
                status: lastRun.status,
                rawMessageBody: lastRun.rawMessageBody,
                createdAt: lastRun.createdAt,
              }
            : null,
        }
      }),
    })
  } catch (error) {
    console.error('[whatsapp agent runs phones]', error)
    return NextResponse.json({ error: 'Failed to load phones' }, { status: 500 })
  }
}
