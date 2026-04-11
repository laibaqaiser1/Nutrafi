import { format, startOfDay } from 'date-fns'
import type { Prisma } from '@/lib/generated/prisma/client'

/** Derive `deliveryTime` (HH:mm:ss) from a `timeSlot` label (same rules as POST meal item). */
export function deliveryTimeFromTimeSlotLabel(timeSlot: string): string {
  const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10)
    const minutes = timeMatch[2]
    return `${hours.toString().padStart(2, '0')}:${minutes}:00`
  }
  return timeSlot
}

/**
 * Reassign `timeSlot` / `deliveryTime` on items from today onward using the template (round-robin per calendar day).
 * Skips delivered, skipped, and wrong-delivery rows. Past dates are untouched.
 */
export async function applyMealPlanTimeSlotsToFutureItems(
  tx: Prisma.TransactionClient,
  mealPlanId: number,
  slotTemplate: string[]
): Promise<number> {
  if (slotTemplate.length === 0) return 0

  const today = startOfDay(new Date())
  const items = await tx.mealPlanItem.findMany({
    where: {
      mealPlanId,
      date: { gte: today },
      isDelivered: false,
      isSkipped: false,
      wrongDelivery: false,
    },
    orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }, { id: 'asc' }],
  })

  if (items.length === 0) return 0

  const byDay = new Map<string, typeof items>()
  for (const item of items) {
    const key = format(startOfDay(item.date), 'yyyy-MM-dd')
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(item)
  }

  let updated = 0
  for (const [, dayItems] of byDay) {
    dayItems.sort(
      (a, b) =>
        (a.timeSlot || '').localeCompare(b.timeSlot || '', undefined, { numeric: true }) ||
        a.id - b.id
    )
    for (let idx = 0; idx < dayItems.length; idx++) {
      const item = dayItems[idx]!
      const slot = slotTemplate[idx % slotTemplate.length]!
      const deliveryTime = deliveryTimeFromTimeSlotLabel(slot)
      await tx.mealPlanItem.update({
        where: { id: item.id },
        data: { timeSlot: slot, deliveryTime },
      })
      updated += 1
    }
  }

  return updated
}
