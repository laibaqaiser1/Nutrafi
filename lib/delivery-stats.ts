import { prisma } from '@/lib/prisma'
import { endOfDay, format, startOfDay, eachDayOfInterval } from 'date-fns'

export type DeliveryDayBucket = {
  date: string
  portal: number
  talabat: number
  total: number
}

export type DeliveryDishBucket = {
  dishId: number | null
  dishName: string
  portal: number
  talabat: number
  total: number
}

export type DeliveryStatsSummary = {
  from: string
  to: string
  portal: number
  /** Reserved — Talabat not wired yet */
  talabat: number
  total: number
  byDay: DeliveryDayBucket[]
  byDish: DeliveryDishBucket[]
  talabatStatus: 'not_configured'
}

function dayKey(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function deliveredWhere(from: Date, to: Date) {
  const start = startOfDay(from)
  const end = endOfDay(to)
  return {
    isDelivered: true as const,
    isSkipped: false as const,
    OR: [
      { deliveredAt: { gte: start, lte: end } },
      { deliveredAt: null, date: { gte: start, lte: end } },
    ],
  }
}

/** Count portal meals marked delivered in [from, to] (inclusive calendar days). Uses deliveredAt, falls back to meal date. */
export async function countPortalDelivered(from: Date, to: Date): Promise<number> {
  return prisma.mealPlanItem.count({ where: deliveredWhere(from, to) })
}

function dishLabel(item: {
  dishId: number | null
  dishName: string | null
  dish?: { name: string } | null
}): string {
  const name = (item.dishName || item.dish?.name || '').trim()
  return name || 'Not assigned'
}

function dishKey(item: {
  dishId: number | null
  dishName: string | null
  dish?: { name: string } | null
}): string {
  if (item.dishId != null) return `id:${item.dishId}`
  return `name:${dishLabel(item).toLowerCase()}`
}

async function portalDeliveredBreakdown(
  from: Date,
  to: Date
): Promise<{
  byDay: Map<string, number>
  byDish: Map<string, DeliveryDishBucket>
  portal: number
}> {
  const rangeStart = startOfDay(from)
  const rangeEnd = startOfDay(to)

  const items = await prisma.mealPlanItem.findMany({
    where: deliveredWhere(from, to),
    select: {
      deliveredAt: true,
      date: true,
      dishId: true,
      dishName: true,
      dish: { select: { name: true } },
    },
  })

  const byDay = new Map<string, number>()
  for (const d of eachDayOfInterval({ start: rangeStart, end: rangeEnd })) {
    byDay.set(dayKey(d), 0)
  }

  const byDish = new Map<string, DeliveryDishBucket>()

  for (const item of items) {
    const when = item.deliveredAt ?? item.date
    const key = dayKey(startOfDay(when))
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1)

    const dKey = dishKey(item)
    const existing = byDish.get(dKey)
    if (existing) {
      existing.portal += 1
      existing.total += 1
    } else {
      byDish.set(dKey, {
        dishId: item.dishId,
        dishName: dishLabel(item),
        portal: 1,
        talabat: 0,
        total: 1,
      })
    }
  }

  return { byDay, byDish, portal: items.length }
}

export async function getDeliveryStats(from: Date, to: Date): Promise<DeliveryStatsSummary> {
  const rangeStart = startOfDay(from)
  const rangeEnd = startOfDay(to)
  if (rangeStart > rangeEnd) {
    throw new Error('from must be on or before to')
  }

  const breakdown = await portalDeliveredBreakdown(rangeStart, rangeEnd)
  const talabat = 0

  const byDay: DeliveryDayBucket[] = Array.from(breakdown.byDay.entries()).map(
    ([date, portalCount]) => ({
      date,
      portal: portalCount,
      talabat: 0,
      total: portalCount,
    })
  )

  const byDish = Array.from(breakdown.byDish.values()).sort((a, b) => {
    if (b.portal !== a.portal) return b.portal - a.portal
    return a.dishName.localeCompare(b.dishName)
  })

  return {
    from: dayKey(rangeStart),
    to: dayKey(rangeEnd),
    portal: breakdown.portal,
    talabat,
    total: breakdown.portal + talabat,
    byDay,
    byDish,
    talabatStatus: 'not_configured',
  }
}
