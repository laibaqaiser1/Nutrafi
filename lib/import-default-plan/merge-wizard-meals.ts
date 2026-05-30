import type { AppliedImportMeal, WizardMealRow } from './types'

function slotKey(date: string, slotIndex: number): string {
  return `${date}\0${slotIndex}`
}

function indexExistingMealsBySlot(existing: WizardMealRow[]): Map<string, WizardMealRow> {
  const byDate = new Map<string, WizardMealRow[]>()
  for (const m of existing) {
    const list = byDate.get(m.date) ?? []
    list.push(m)
    byDate.set(m.date, list)
  }

  const byKey = new Map<string, WizardMealRow>()
  for (const [date, list] of byDate) {
    list.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot))
    list.forEach((m, slotIndex) => {
      byKey.set(slotKey(date, slotIndex), { ...m })
    })
  }
  return byKey
}

function appliedToWizardRow(
  slot: AppliedImportMeal,
  prev: WizardMealRow | undefined
): WizardMealRow {
  return {
    ...(prev ?? { showDishFields: false }),
    date: slot.date,
    timeSlot: prev?.timeSlot ?? slot.timeSlot,
    dishId: slot.isSkipped ? '' : slot.dishId,
    dishName: slot.isSkipped ? undefined : slot.dishName,
    dishDescription: slot.isSkipped ? undefined : slot.dishDescription,
    dishCategory: slot.isSkipped ? undefined : slot.dishCategory,
    ingredients: slot.isSkipped ? undefined : slot.ingredients,
    allergens: slot.isSkipped ? undefined : slot.allergens,
    calories: slot.isSkipped ? undefined : slot.calories,
    protein: slot.isSkipped ? undefined : slot.protein,
    carbs: slot.isSkipped ? undefined : slot.carbs,
    fats: slot.isSkipped ? undefined : slot.fats,
    price: slot.isSkipped ? undefined : slot.price,
    deliveryType: slot.deliveryType,
    deliveryTime: slot.deliveryTime,
    location: slot.location,
    isSkipped: slot.isSkipped,
    customNote: slot.customNote,
    showDishFields: prev?.showDishFields ?? false,
  }
}

/**
 * Merge applied template meals into wizard rows from importStart onward.
 * Matches by date + slot index so multiple meals/day survive even when time slots match.
 */
export function mergeAppliedIntoWizardMeals(
  existing: WizardMealRow[],
  applied: AppliedImportMeal[],
  importStartYmd: string
): WizardMealRow[] {
  const inRange = applied.filter((a) => a.date >= importStartYmd)
  if (inRange.length === 0) return existing

  const byKey = indexExistingMealsBySlot(existing)

  for (const slot of inRange) {
    const key = slotKey(slot.date, slot.slotIndex)
    byKey.set(key, appliedToWizardRow(slot, byKey.get(key)))
  }

  return [...byKey.entries()]
    .sort(([ka], [kb]) => {
      const [dateA, idxA] = ka.split('\0')
      const [dateB, idxB] = kb.split('\0')
      const d = dateA!.localeCompare(dateB!)
      if (d !== 0) return d
      return Number(idxA) - Number(idxB)
    })
    .map(([, row]) => row)
}
