import { importDraftItemId } from './draft-ids'
import type { AppliedImportMeal } from './types'

/** Shape compatible with meal plan view `mealPlanItems` rows. */
export interface ViewImportDraftItem {
  id: string
  date: string
  timeSlot: string
  dishId: string | null
  dishName: string | null
  dishDescription: string | null
  dishCategory: string | null
  ingredients: string | null
  allergens: string | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fats: number | null
  price: number | null
  deliveryTime: string | null
  deliveryType: string | null
  deliveryLocation: string | null
  isSkipped: boolean
  isDelivered: boolean
  wrongDelivery?: boolean
  deliveredAt: string | null
  customNote: string | null
  /** Client-only flag for UI styling */
  isImportDraft?: boolean
}

export function appliedToViewDraftItems(applied: AppliedImportMeal[]): ViewImportDraftItem[] {
  return applied.map((slot) => ({
    id: importDraftItemId(slot.date, slot.slotIndex),
    date: slot.date,
    timeSlot: slot.timeSlot,
    dishId: slot.dishId || null,
    dishName: slot.dishName ?? null,
    dishDescription: slot.dishDescription ?? null,
    dishCategory: slot.dishCategory ?? null,
    ingredients: slot.ingredients ?? null,
    allergens: slot.allergens ?? null,
    calories: slot.calories ?? null,
    protein: slot.protein ?? null,
    carbs: slot.carbs ?? null,
    fats: slot.fats ?? null,
    price: slot.price ?? null,
    deliveryTime: slot.deliveryTime ?? null,
    deliveryType: slot.deliveryType,
    deliveryLocation: slot.location,
    isSkipped: slot.isSkipped,
    isDelivered: false,
    wrongDelivery: false,
    deliveredAt: null,
    customNote: slot.customNote ?? null,
    isImportDraft: true,
  }))
}

export function mergeDisplayItems<T extends { id: string; date: string }>(
  saved: T[],
  drafts: ViewImportDraftItem[],
  importStartYmd: string
): (T | ViewImportDraftItem)[] {
  const savedBefore = saved.filter((i) => {
    const ymd = typeof i.date === 'string' ? i.date.slice(0, 10) : i.date
    return ymd < importStartYmd
  })
  const savedOnOrAfter = saved.filter((i) => {
    const ymd = typeof i.date === 'string' ? i.date.slice(0, 10) : i.date
    return ymd >= importStartYmd
  })

  const draftKeys = new Set(drafts.map((d) => `${d.date.slice(0, 10)}\0${d.timeSlot}`))
  const keptSaved = savedOnOrAfter.filter((i) => {
    const ymd = typeof i.date === 'string' ? i.date.slice(0, 10) : i.date
    return !draftKeys.has(`${ymd}\0${(i as unknown as { timeSlot: string }).timeSlot}`)
  })

  return [...savedBefore, ...keptSaved, ...drafts].sort((a, b) => {
    const da = typeof a.date === 'string' ? a.date.slice(0, 10) : a.date
    const db = typeof b.date === 'string' ? b.date.slice(0, 10) : b.date
    const cmp = da.localeCompare(db)
    if (cmp !== 0) return cmp
    return ((a as { timeSlot: string }).timeSlot ?? '').localeCompare(
      (b as { timeSlot: string }).timeSlot ?? ''
    )
  })
}
