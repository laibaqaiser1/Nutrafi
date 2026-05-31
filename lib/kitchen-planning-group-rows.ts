/** Group kitchen planning items: one row per customer + time slot (all dishes in that slot). */

export interface KitchenGroupableItem {
  id: string
  timeSlot: string
  deliveryTime: string | null
  dishName: string | null
  customNote: string | null
  isDelivered: boolean
  isSkipped: boolean
  wrongDelivery?: boolean
  mealPlan: {
    id: string
    status?: string
    customer: {
      id: string
      fullName: string
      phone: string | null
      deliveryArea: string | null
    }
  }
  dish: { name: string } | null
}

export type KitchenGroupedRowStatus = 'delivered' | 'paused' | 'wrong_delivery' | 'active'

export interface KitchenGroupedCustomerRow<T extends KitchenGroupableItem = KitchenGroupableItem> {
  key: string
  timeSlot: string
  deliveryTime: string | null
  items: T[]
  customer: T['mealPlan']['customer']
  mealPlan: T['mealPlan']
  isPaused: boolean
  status: KitchenGroupedRowStatus
}

function mealPlanPaused(mealPlan: { status?: string }): boolean {
  return String(mealPlan.status || '').toUpperCase() === 'PAUSED'
}

function rowStatus<T extends KitchenGroupableItem>(
  items: T[],
  isPaused: boolean
): KitchenGroupedRowStatus {
  if (isPaused) return 'paused'
  if (items.every((i) => i.isDelivered)) return 'delivered'
  if (items.some((i) => i.wrongDelivery)) return 'wrong_delivery'
  return 'active'
}

/** Same grouping as kitchen export: date + customer + time slot → one row, all dishes together. */
export function groupKitchenItemsByCustomerSlot<T extends KitchenGroupableItem>(
  items: T[]
): KitchenGroupedCustomerRow<T>[] {
  const byKey = new Map<string, T[]>()
  for (const item of items) {
    const customerId = String(item.mealPlan.customer.id)
    const slotKey = (item.timeSlot || '').trim()
    const key = `${customerId}:${slotKey}`
    const list = byKey.get(key) ?? []
    list.push(item)
    byKey.set(key, list)
  }

  const rows: KitchenGroupedCustomerRow<T>[] = []
  for (const [key, groupItems] of byKey) {
    const first = groupItems[0]!
    const isPaused = mealPlanPaused(first.mealPlan)
    rows.push({
      key,
      timeSlot: first.timeSlot || '',
      deliveryTime: first.deliveryTime,
      items: groupItems,
      customer: first.mealPlan.customer,
      mealPlan: first.mealPlan,
      isPaused,
      status: rowStatus(groupItems, isPaused),
    })
  }

  rows.sort((a, b) => {
    const t = a.timeSlot.localeCompare(b.timeSlot)
    if (t !== 0) return t
    return a.customer.fullName.localeCompare(b.customer.fullName)
  })

  return rows
}
