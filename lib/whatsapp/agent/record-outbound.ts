import { prisma } from '@/lib/prisma'
import { sendWhatsAppText } from '@/lib/whatsapp/client'
import { logAgentAction } from './audit-log'

export async function sendAgentReply(params: {
  runId: number
  phoneE164: string
  conversationId: number
  body: string
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const result = await sendWhatsAppText(params.phoneE164, params.body)

  if (result.ok) {
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: params.conversationId,
        externalId: result.messageId ?? null,
        direction: 'OUTBOUND',
        messageType: 'text',
        body: params.body,
        status: 'SENT',
        timestamp: new Date(),
      },
    })

    await prisma.whatsAppConversation.update({
      where: { id: params.conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: params.body.slice(0, 120),
      },
    })
  }

  await logAgentAction({
    runId: params.runId,
    actionType: 'SEND_REPLY',
    status: result.ok ? 'OK' : 'FAILED',
    input: { phoneE164: params.phoneE164 },
    output: {
      body: params.body,
      messageId: result.messageId,
      error: result.error,
    },
  })

  return result
}
