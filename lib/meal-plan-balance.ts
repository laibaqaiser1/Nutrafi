import type { Prisma } from '@/lib/generated/prisma/client'

/**
 * Remaining meals = totalMeals minus count of items delivered (non-skipped).
 * Single source of truth so list/detail stay aligned with deliveries.
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
  const next = await remainingMealsFromDelivered(tx, mealPlanId)
  if (next === null) return null
  await tx.mealPlan.update({
    where: { id: mealPlanId },
    data: { remainingMeals: next },
  })
  return next
}
