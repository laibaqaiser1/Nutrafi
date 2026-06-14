import { prisma } from '@/lib/prisma'
import { processInboundAgentMessage } from './handle-inbound'

/**
 * Called after webhook stores an inbound text message.
 * Runs asynchronously — errors are logged, not thrown to webhook.
 */
export async function triggerAgentAfterInbound(params: {
  conversationId: number
  inboundMessageId: number
  phoneE164: string
  body: string
  messageType: string
  direction: 'INBOUND' | 'OUTBOUND'
}): Promise<void> {
  if (params.direction !== 'INBOUND') return
  if (params.messageType !== 'text') return
  if (!params.body.trim()) return

  try {
    await processInboundAgentMessage({
      conversationId: params.conversationId,
      inboundMessageId: params.inboundMessageId,
      phoneE164: params.phoneE164,
      body: params.body,
    })
  } catch (error) {
    console.error('[whatsapp agent] process failed:', error)
  }
}

/** Resolve message id after upsert — for webhook hook. */
export async function findInboundMessageId(
  externalId: string
): Promise<number | null> {
  const msg = await prisma.whatsAppMessage.findUnique({
    where: { externalId },
    select: { id: true, direction: true },
  })
  if (!msg || msg.direction !== 'INBOUND') return null
  return msg.id
}
