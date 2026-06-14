import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'
import { processInboundAgentMessage } from '@/lib/whatsapp/agent/handle-inbound'
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/normalize-phone'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  conversationId: z.number().int().positive(),
  message: z.string().min(1),
})

/**
 * Manually trigger meal agent for a conversation (testing / retry).
 * Does not use meal-plan dashboard APIs.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = bodySchema.parse(await request.json())
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: parsed.conversationId },
    })
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const inbound = await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        messageType: 'text',
        body: parsed.message,
        status: 'RECEIVED',
        timestamp: new Date(),
      },
    })

    const result = await processInboundAgentMessage({
      conversationId: conversation.id,
      inboundMessageId: inbound.id,
      phoneE164: normalizeWhatsAppPhone(conversation.phoneE164),
      body: parsed.message,
    })

    return NextResponse.json({
      ok: true,
      inboundMessageId: inbound.id,
      result,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('[whatsapp agent process]', error)
    return NextResponse.json({ error: 'Agent process failed' }, { status: 500 })
  }
}
