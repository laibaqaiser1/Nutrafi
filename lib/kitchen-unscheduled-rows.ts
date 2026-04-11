import { parseMealPlanTimeSlots } from '@/lib/meal-plan-time-slots'
import { prisma, withRetry } from '@/lib/prisma'

function itemHasDish(item: { dishId: number | null; dishName: string | null }): boolean {
  return (
    item.dishId != null ||
    (item.dishName != null &&
      item.dishName.trim() !== '' &&
      item.dishName.trim() !== 'Not Assigned')
  )
}

export type KitchenUnscheduledRow = {
  customerId: string
  customerName: string
  phone: string | null
  defaultTimeSlots: string[]
  mealPlanId: number
  mealsPerDay: number
  scheduledWithDishCount: number
}

/**
 * ACTIVE meal plans covering `date`, one row per customer when they still need
 * non-skipped meals with dishes (same rules as kitchen unscheduled tab).
 */
export async function getKitchenUnscheduledRows(date: string): Promise<KitchenUnscheduledRow[]> {
  const dayStart = new Date(new Date(date).setHours(0, 0, 0, 0))
  const dayEnd = new Date(new Date(date).setHours(23, 59, 59, 999))

  const plans = await withRetry(() =>
    prisma.mealPlan.findMany({
      where: {
        status: 'ACTIVE',
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: dayEnd } }] },
          { OR: [{ endDate: null }, { endDate: { gte: dayStart } }] },
        ],
      },
      include: { customer: true },
      orderBy: [{ customerId: 'asc' }, { id: 'asc' }],
    })
  )

  if (plans.length === 0) return []

  const planIds = plans.map((p) => p.id)
  const itemsOnDay = await withRetry(() =>
    prisma.mealPlanItem.findMany({
      where: {
        mealPlanId: { in: planIds },
        date: { gte: dayStart, lte: dayEnd },
      },
      select: {
        mealPlanId: true,
        isSkipped: true,
        dishId: true,
        dishName: true,
      },
    })
  )

  const byPlanId = new Map<number, typeof itemsOnDay>()
  for (const row of itemsOnDay) {
    if (!byPlanId.has(row.mealPlanId)) byPlanId.set(row.mealPlanId, [])
    byPlanId.get(row.mealPlanId)!.push(row)
  }

  const byCustomer = new Map<number, KitchenUnscheduledRow>()

  for (const plan of plans) {
    const items = byPlanId.get(plan.id) ?? []
    if (items.length > 0 && items.every((i) => i.isSkipped)) {
      continue
    }
    const scheduledWithDishCount = items.filter((i) => !i.isSkipped && itemHasDish(i)).length
    const expected = Math.max(1, plan.mealsPerDay)
    if (scheduledWithDishCount >= expected) {
      continue
    }

    const cid = plan.customerId
    if (!byCustomer.has(cid)) {
      byCustomer.set(cid, {
        customerId: String(cid),
        customerName: plan.customer.fullName,
        phone: plan.customer.phone,
        defaultTimeSlots: parseMealPlanTimeSlots(plan.timeSlots),
        mealPlanId: plan.id,
        mealsPerDay: expected,
        scheduledWithDishCount,
      })
    }
  }

  return Array.from(byCustomer.values()).sort((a, b) => a.customerName.localeCompare(b.customerName))
}
