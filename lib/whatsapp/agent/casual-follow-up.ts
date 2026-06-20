import { prisma } from '@/lib/prisma'
import { detectCasualMessage } from './casual-messages'
import { isFarewellReplyBody } from './replies'

const REDUNDANT_CASUAL_WINDOW_MS = 2 * 60 * 60 * 1000

/**
 * Ignore a second casual sign-off (e.g. "sure" after "ok") when we already sent the closing reply.
 */
export async function shouldIgnoreRedundantCasualFarewell(
  conversationId: number,
  body: string
): Promise<boolean> {
  if (detectCasualMessage(body) !== 'farewell') return false

  const lastOutbound = await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId,
      direction: 'OUTBOUND',
      messageType: 'text',
    },
    orderBy: { timestamp: 'desc' },
    select: { body: true, timestamp: true },
  })

  if (!lastOutbound?.body || !isFarewellReplyBody(lastOutbound.body)) {
    return false
  }

  const ageMs = Date.now() - lastOutbound.timestamp.getTime()
  return ageMs >= 0 && ageMs <= REDUNDANT_CASUAL_WINDOW_MS
}
