import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import type {
  WhatsAppPendingActionStatus,
  WhatsAppPendingActionType,
} from '@/lib/generated/prisma/client'
import { whatsappAgentConfig } from './config'
import type { PendingBatchContext } from './types'

export async function expireStalePendingActions(
  conversationId: number
): Promise<void> {
  await prisma.whatsAppPendingAction.updateMany({
    where: {
      conversationId,
      status: 'OPEN',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  })
}

export async function getOpenPendingAction(conversationId: number) {
  await expireStalePendingActions(conversationId)
  return prisma.whatsAppPendingAction.findFirst({
    where: { conversationId, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createPendingAction(params: {
  conversationId: number
  customerId?: number
  mealPlanId?: number
  createdFromRunId?: number
  type: WhatsAppPendingActionType
  context: PendingBatchContext
}) {
  const { pendingExpiryHours } = whatsappAgentConfig()
  const expiresAt = new Date(Date.now() + pendingExpiryHours * 60 * 60 * 1000)

  await prisma.whatsAppPendingAction.updateMany({
    where: { conversationId: params.conversationId, status: 'OPEN' },
    data: { status: 'CANCELLED' },
  })

  return prisma.whatsAppPendingAction.create({
    data: {
      conversationId: params.conversationId,
      customerId: params.customerId,
      mealPlanId: params.mealPlanId,
      createdFromRunId: params.createdFromRunId,
      type: params.type,
      status: 'OPEN',
      context: params.context as unknown as Prisma.InputJsonValue,
      expiresAt,
    },
  })
}

export async function updatePendingContext(
  pendingId: number,
  context: PendingBatchContext
) {
  return prisma.whatsAppPendingAction.update({
    where: { id: pendingId },
    data: { context: context as unknown as Prisma.InputJsonValue },
  })
}

export async function setPendingStatus(
  pendingId: number,
  status: WhatsAppPendingActionStatus
) {
  return prisma.whatsAppPendingAction.update({
    where: { id: pendingId },
    data: { status },
  })
}

export function parsePendingContext(raw: unknown): PendingBatchContext | null {
  if (!raw || typeof raw !== 'object') return null
  return raw as PendingBatchContext
}

export function nextWaitingMealIndex(ctx: PendingBatchContext): number {
  return ctx.meals.findIndex((m) => m.status === 'waiting_dish')
}
