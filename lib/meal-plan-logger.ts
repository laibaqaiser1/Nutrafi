import { prisma } from '@/lib/prisma'
import { logger, serializeError, type LogFields } from '@/lib/logger'
import { getRequestId } from '@/lib/request-context'

export type MealPlanCountSnapshot = {
  planId: number
  customerId: number
  totalMeals: number | null
  remainingMeals: number | null
  days: number
  mealsPerDay: number
  scheduledCount: number
  deliveredCount: number
  skippedCount: number
  wrongDeliveryCount: number
  scheduleSlotsLeft: number | null
}

/** Prisma client or transaction — only the models we need for counts. */
type MealPlanDb = {
  mealPlan: typeof prisma.mealPlan
  mealPlanItem: typeof prisma.mealPlanItem
}

/**
 * Count snapshot for meal-plan debugging (IDs + counts only — no PII).
 * scheduled = non-skipped, non-wrong-delivery (active + inactive + delivered).
 */
export async function snapshotMealPlanCounts(
  db: MealPlanDb,
  mealPlanId: number
): Promise<MealPlanCountSnapshot | null> {
  const plan = await db.mealPlan.findUnique({
    where: { id: mealPlanId },
    select: {
      id: true,
      customerId: true,
      totalMeals: true,
      remainingMeals: true,
      days: true,
      mealsPerDay: true,
    },
  })
  if (!plan) return null

  const [scheduledCount, deliveredCount, skippedCount, wrongDeliveryCount] =
    await Promise.all([
      db.mealPlanItem.count({
        where: { mealPlanId, isSkipped: false, wrongDelivery: false },
      }),
      db.mealPlanItem.count({
        where: {
          mealPlanId,
          isDelivered: true,
          isSkipped: false,
        },
      }),
      db.mealPlanItem.count({
        where: { mealPlanId, isSkipped: true },
      }),
      db.mealPlanItem.count({
        where: { mealPlanId, wrongDelivery: true, isSkipped: false },
      }),
    ])

  const totalMeals = plan.totalMeals
  return {
    planId: plan.id,
    customerId: plan.customerId,
    totalMeals,
    remainingMeals: plan.remainingMeals,
    days: plan.days,
    mealsPerDay: plan.mealsPerDay,
    scheduledCount,
    deliveredCount,
    skippedCount,
    wrongDeliveryCount,
    scheduleSlotsLeft:
      totalMeals != null ? Math.max(0, totalMeals - scheduledCount) : null,
  }
}

function baseFields(extra: LogFields = {}): LogFields {
  const requestId = getRequestId()
  return {
    ...(requestId ? { requestId } : {}),
    ...extra,
  }
}

/** Lean meal-plan business event log. */
export function logMealPlanEvent(fields: LogFields): void {
  const level = typeof fields.level === 'string' ? fields.level : 'info'
  const { level: _drop, ...rest } = fields
  const payload = baseFields(rest)
  if (level === 'warn') logger.warn(payload)
  else if (level === 'error') logger.error(payload)
  else if (level === 'debug') logger.debug(payload)
  else logger.info(payload)
}

export function logMealPlanError(
  event: string,
  error: unknown,
  fields: LogFields = {}
): void {
  logger.error(
    baseFields({
      event,
      ...serializeError(error),
      ...fields,
    })
  )
}

/** Attach before/after scheduled counts for create/delete/skip style events. */
export function countChangeFields(
  before: MealPlanCountSnapshot | null | undefined,
  after: MealPlanCountSnapshot | null | undefined,
  extras: LogFields = {}
): LogFields {
  return {
    planId: after?.planId ?? before?.planId,
    customerId: after?.customerId ?? before?.customerId,
    totalMeals: after?.totalMeals ?? before?.totalMeals,
    remainingMeals: after?.remainingMeals ?? before?.remainingMeals,
    days: after?.days ?? before?.days,
    mealsPerDay: after?.mealsPerDay ?? before?.mealsPerDay,
    scheduledBefore: before?.scheduledCount,
    scheduledAfter: after?.scheduledCount,
    deliveredBefore: before?.deliveredCount,
    deliveredAfter: after?.deliveredCount,
    skippedBefore: before?.skippedCount,
    skippedAfter: after?.skippedCount,
    scheduleSlotsLeft: after?.scheduleSlotsLeft ?? before?.scheduleSlotsLeft,
    ...extras,
  }
}
