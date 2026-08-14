import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { logger, serializeError } from '@/lib/logger'
import { getRequestId } from '@/lib/request-context'
import type { MealPlanHistoryActionName } from '@/lib/meal-plan-history-actions'

/** Prisma client or interactive transaction — only models history needs. */
export type MealPlanHistoryDb = {
  mealPlan: Prisma.TransactionClient['mealPlan']
  mealPlanItem: Prisma.TransactionClient['mealPlanItem']
  mealPlanHistory: Prisma.TransactionClient['mealPlanHistory']
}

export type MealPlanHistorySnapshot = {
  totalMeals: number | null
  remainingMeals: number | null
  days: number
  mealsPerDay: number
  activeCount: number
  inactiveCount: number
  deliveredCount: number
  skippedCount: number
  wrongDeliveryCount: number
  scheduledCount: number
}

function hasAssignedDish(item: { dishId: number | null; dishName: string | null }): boolean {
  if (item.dishId != null) return true
  const name = item.dishName?.trim()
  return Boolean(name && name !== 'Not Assigned')
}

/** Count plan schedule / delivery state after an action. */
export async function snapshotMealPlanHistory(
  db: MealPlanHistoryDb,
  mealPlanId: number
): Promise<MealPlanHistorySnapshot | null> {
  const plan = await db.mealPlan.findUnique({
    where: { id: mealPlanId },
    select: {
      totalMeals: true,
      remainingMeals: true,
      days: true,
      mealsPerDay: true,
    },
  })
  if (!plan) return null

  const items = await db.mealPlanItem.findMany({
    where: { mealPlanId },
    select: {
      isSkipped: true,
      isDelivered: true,
      wrongDelivery: true,
      dishId: true,
      dishName: true,
    },
  })

  let skippedCount = 0
  let wrongDeliveryCount = 0
  let deliveredCount = 0
  let activeCount = 0
  let inactiveCount = 0

  for (const item of items) {
    if (item.isSkipped) {
      skippedCount += 1
      continue
    }
    if (item.wrongDelivery) {
      wrongDeliveryCount += 1
      continue
    }
    if (item.isDelivered) {
      deliveredCount += 1
      continue
    }
    if (hasAssignedDish(item)) activeCount += 1
    else inactiveCount += 1
  }

  const scheduledCount = activeCount + inactiveCount + deliveredCount

  return {
    totalMeals: plan.totalMeals,
    remainingMeals: plan.remainingMeals,
    days: plan.days,
    mealsPerDay: plan.mealsPerDay,
    activeCount,
    inactiveCount,
    deliveredCount,
    skippedCount,
    wrongDeliveryCount,
    scheduledCount,
  }
}

export type RecordMealPlanHistoryInput = {
  mealPlanId: number
  action: MealPlanHistoryActionName | string
  itemId?: number | null
  actorUserId?: number | null
  summary?: string | null
  details?: Prisma.InputJsonValue
  /** Captured up-front for async queue (ALS may not apply later). */
  requestId?: string | null
}

/**
 * Append one MealPlanHistory row with counts **after** the event.
 * Previous history rows already show the prior state — no before→after pair needed.
 */
export async function recordMealPlanHistory(
  db: MealPlanHistoryDb,
  input: RecordMealPlanHistoryInput
): Promise<MealPlanHistorySnapshot | null> {
  const after = await snapshotMealPlanHistory(db, input.mealPlanId)
  if (!after) return null

  const requestId = input.requestId ?? getRequestId() ?? null

  await db.mealPlanHistory.create({
    data: {
      mealPlanId: input.mealPlanId,
      action: input.action,
      summary: input.summary ?? null,
      itemId: input.itemId ?? null,
      actorUserId: input.actorUserId ?? null,
      requestId,
      ...(input.details !== undefined ? { details: input.details } : {}),
      totalMeals: after.totalMeals,
      remainingMeals: after.remainingMeals,
      days: after.days,
      mealsPerDay: after.mealsPerDay,
      activeCount: after.activeCount,
      inactiveCount: after.inactiveCount,
      deliveredCount: after.deliveredCount,
      skippedCount: after.skippedCount,
      wrongDeliveryCount: after.wrongDeliveryCount,
      scheduledCount: after.scheduledCount,
      // Only the post-action counts (kept on *After columns for older rows compatibility)
      remainingAfter: after.remainingMeals,
      deliveredAfter: after.deliveredCount,
      activeAfter: after.activeCount,
      inactiveAfter: after.inactiveCount,
    },
  })

  return after
}

/**
 * Fire-and-forget history write after a successful action.
 * Does not block the API response; failures are logged only.
 */
export function queueMealPlanHistory(input: RecordMealPlanHistoryInput): void {
  const requestId = input.requestId ?? getRequestId() ?? null
  void recordMealPlanHistory(prisma, { ...input, requestId }).catch((error) => {
    logger.error({
      event: 'meal_plan_history.record_failed',
      mealPlanId: input.mealPlanId,
      action: input.action,
      requestId,
      ...serializeError(error),
    })
  })
}

export function sessionActorUserId(session: { user?: { id?: number | string } } | null): number | null {
  const raw = session?.user?.id
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10)
    return Number.isNaN(n) ? null : n
  }
  return null
}
