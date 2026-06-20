import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppText } from '@/lib/whatsapp/client'
import { logWhatsAppError, serializeError } from '@/lib/whatsapp/log'
import { formatPhoneDisplay } from '@/lib/whatsapp/normalize-phone'
import { buildAgentMessageStatus } from '@/lib/whatsapp/agent/agent-message-status'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, deliveryArea: true } },
        messages: { orderBy: { timestamp: 'asc' }, take: 500 },
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (conversation.unreadCount > 0) {
      await prisma.whatsAppConversation.update({
        where: { id },
        data: { unreadCount: 0 },
      })
    }

    const inboundIds = conversation.messages
      .filter((m) => m.direction === 'INBOUND' && m.messageType === 'text')
      .map((m) => m.id)

    const agentRuns =
      inboundIds.length > 0
        ? await prisma.whatsAppAgentRun.findMany({
            where: { inboundMessageId: { in: inboundIds } },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              inboundMessageId: true,
              status: true,
              errorMessage: true,
              parsedIntent: true,
              payload: true,
            },
          })
        : []

    const agentByMessageId: Record<number, ReturnType<typeof buildAgentMessageStatus>> = {}
    for (const run of agentRuns) {
      if (run.inboundMessageId == null || agentByMessageId[run.inboundMessageId]) continue
      agentByMessageId[run.inboundMessageId] = buildAgentMessageStatus({
        runId: run.id,
        status: run.status,
        errorMessage: run.errorMessage,
        parsedIntent: run.parsedIntent,
        payload: run.payload,
      })
    }

    return NextResponse.json({
      ...conversation,
      phoneDisplay: formatPhoneDisplay(conversation.phoneE164),
      unreadCount: 0,
      agentByMessageId,
    })
  } catch (error) {
    logWhatsAppError('conversation_get_failed', {
      ...serializeError(error),
    })
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
  }
}

const sendSchema = z.object({
  body: z.string().min(1).max(4096),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const conversation = await prisma.whatsAppConversation.findUnique({ where: { id } })
    if (!conversation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data = sendSchema.parse(await request.json())
    const result = await sendWhatsAppText(conversation.phoneE164, data.body)
    if (!result.ok) {
      logWhatsAppError('inbox_send_failed', {
        conversationId: conversation.id,
        to: conversation.phoneE164,
        error: result.error,
        errorCode: result.errorCode,
        fbtraceId: result.fbtraceId,
      })
      return NextResponse.json({ error: result.error ?? 'Send failed' }, { status: 400 })
    }

    const now = new Date()
    const message = await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        externalId: result.messageId ?? null,
        direction: 'OUTBOUND',
        messageType: 'text',
        body: data.body,
        status: 'SENT',
        timestamp: now,
      },
    })

    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: now,
        lastMessagePreview: data.body.length > 120 ? `${data.body.slice(0, 119)}…` : data.body,
      },
    })

    return NextResponse.json(message)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    logWhatsAppError('inbox_send_exception', serializeError(error))
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
