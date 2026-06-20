import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'
import { inboundMessageAlreadyHandled } from '@/lib/whatsapp/agent/audit-log'
import { processInboundAgentMessage } from '@/lib/whatsapp/agent/handle-inbound'
import { scheduleAgentAfterInbound } from '@/lib/whatsapp/agent/trigger-after-inbound'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  inboundMessageId: z.number().int().positive(),
})

/**
 * Re-run the meal agent for an inbound message (e.g. when the first run timed out).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { inboundMessageId } = bodySchema.parse(await request.json())

    const message = await prisma.whatsAppMessage.findUnique({
      where: { id: inboundMessageId },
      include: { conversation: true },
    })

    if (!message || message.direction !== 'INBOUND' || message.messageType !== 'text') {
      return NextResponse.json({ error: 'Invalid inbound text message' }, { status: 400 })
    }

    if (!message.body?.trim()) {
      return NextResponse.json({ error: 'Message has no text' }, { status: 400 })
    }

    if (await inboundMessageAlreadyHandled(inboundMessageId)) {
      return NextResponse.json(
        { error: 'This message was already handled (reply sent)' },
        { status: 409 }
      )
    }

    scheduleAgentAfterInbound({
      conversationId: message.conversationId,
      inboundMessageId: message.id,
      phoneE164: message.conversation.phoneE164,
      body: message.body,
      messageType: message.messageType,
      direction: message.direction,
    })

    return NextResponse.json({ ok: true, queued: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Synchronous reprocess (admin debug) — waits for agent to finish. */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { inboundMessageId } = bodySchema.parse(await request.json())

    const message = await prisma.whatsAppMessage.findUnique({
      where: { id: inboundMessageId },
      include: { conversation: true },
    })

    if (!message || message.direction !== 'INBOUND' || message.messageType !== 'text') {
      return NextResponse.json({ error: 'Invalid inbound text message' }, { status: 400 })
    }

    if (!message.body?.trim()) {
      return NextResponse.json({ error: 'Message has no text' }, { status: 400 })
    }

    if (await inboundMessageAlreadyHandled(inboundMessageId)) {
      return NextResponse.json(
        { error: 'This message was already handled (reply sent)' },
        { status: 409 }
      )
    }

    const result = await processInboundAgentMessage({
      conversationId: message.conversationId,
      inboundMessageId: message.id,
      phoneE164: message.conversation.phoneE164,
      body: message.body,
    })

    return NextResponse.json({ ok: true, result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
