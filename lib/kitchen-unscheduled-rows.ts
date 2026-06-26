import { parseMealPlanTimeSlots } from '@/lib/meal-plan-time-slots'
import { mealPlanDateFromYmd } from '@/lib/meal-plan-calendar-date'
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
 * ACTIVE meal plans for `date`, one row per customer when they still need
 * non-skipped meals with dishes (same rules as kitchen unscheduled tab).
 *
 * Plan must have: a **start date** on or before this day, and **remaining meals > 0**
 * (contract still open). `endDate` is not used here.
 */
export async function getKitchenUnscheduledRows(date: string): Promise<KitchenUnscheduledRow[]> {
  const ymd = date.slice(0, 10)
  const dayStart = mealPlanDateFromYmd(ymd)
  const dayEnd = new Date(dayStart)
  dayEnd.setUTCHours(23, 59, 59, 999)

  const plans = await withRetry(() =>
    prisma.mealPlan.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { not: null, lte: dayEnd },
        remainingMeals: { gt: 0 },
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
