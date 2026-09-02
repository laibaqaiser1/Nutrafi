import type { Prisma } from '@/lib/generated/prisma/client'
import { logMealPlanEvent } from '@/lib/meal-plan-logger'

/**
 * Remaining meals = totalMeals minus count of items delivered (non-skipped).
 * Call from deliver/undeliver, wrong-delivery, batch deliver, and skip only when
 * the meal was already delivered (skip of an active meal does not change balance).
 */
export async function remainingMealsFromDelivered(
  tx: Prisma.TransactionClient,
  mealPlanId: number
): Promise<number | null> {
  const plan = await tx.mealPlan.findUnique({
    where: { id: mealPlanId },
    select: { totalMeals: true },
  })
  if (!plan || plan.totalMeals == null) return null

  const deliveredCount = await tx.mealPlanItem.count({
    where: {
      mealPlanId,
      isDelivered: true,
      isSkipped: false,
    },
  })

  return Math.max(0, plan.totalMeals - deliveredCount)
}

export async function syncMealPlanRemainingMeals(
  tx: Prisma.TransactionClient,
  mealPlanId: number
): Promise<number | null> {
  const before = await tx.mealPlan.findUnique({
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

  const next = await remainingMealsFromDelivered(tx, mealPlanId)
  if (next === null) return null
  await tx.mealPlan.update({
    where: { id: mealPlanId },
    data: { remainingMeals: next },
  })

  if (before && before.remainingMeals !== next) {
    const deliveredCount = await tx.mealPlanItem.count({
      where: {
        mealPlanId,
        isDelivered: true,
        isSkipped: false,
      },
    })
    logMealPlanEvent({
      event: 'meal_plan.remaining_synced',
      planId: before.id,
      customerId: before.customerId,
      totalMeals: before.totalMeals,
      days: before.days,
      mealsPerDay: before.mealsPerDay,
      remainingBefore: before.remainingMeals,
      remainingAfter: next,
      deliveredCount,
    })
  }

  return next
}
