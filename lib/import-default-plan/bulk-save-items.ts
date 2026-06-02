import type { AppliedImportMeal } from './types'

/** Keep at most `mealsPerDay` active (non-skipped) items per calendar date. */
export function limitActiveImportMealsPerDate(
  meals: AppliedImportMeal[],
  mealsPerDay: number
): AppliedImportMeal[] {
  if (mealsPerDay <= 0) return meals
  const activePerDate = new Map<string, number>()
  const out: AppliedImportMeal[] = []
  for (const m of meals) {
    const d = m.date.slice(0, 10)
    if (m.isSkipped) {
      out.push(m)
      continue
    }
    const n = activePerDate.get(d) ?? 0
    if (n >= mealsPerDay) continue
    activePerDate.set(d, n + 1)
    out.push(m)
  }
  return out
}

export function appliedMealsToBulkPayload(meals: AppliedImportMeal[]) {
  return meals.map((m) => ({
    date: m.date.slice(0, 10),
    slotIndex: m.slotIndex,
    timeSlot: m.timeSlot,
    dishId: m.dishId || undefined,
    dishName: m.dishName ?? undefined,
    dishDescription: m.dishDescription ?? undefined,
    dishCategory: m.dishCategory ?? undefined,
    ingredients: m.ingredients ?? undefined,
    allergens: m.allergens ?? undefined,
    calories: m.calories ?? undefined,
    protein: m.protein ?? undefined,
    carbs: m.carbs ?? undefined,
    fats: m.fats ?? undefined,
    price: m.price ?? undefined,
    deliveryTime: m.deliveryTime ?? undefined,
    deliveryType: m.deliveryType ?? 'delivery',
    isSkipped: m.isSkipped,
    customNote: m.customNote ?? undefined,
  }))
}
