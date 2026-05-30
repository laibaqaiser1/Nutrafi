import { mealPlanDateYmd } from '@/lib/meal-plan-calendar-date'

export function itemDateYmd(date: string | Date): string {
  return mealPlanDateYmd(date)
}

/** Calendar dates that already have at least one meal row on the plan. */
export function existingMealDatesYmd(items: { date: string | Date }[]): Set<string> {
  const set = new Set<string>()
  for (const item of items) {
    set.add(itemDateYmd(item.date))
  }
  return set
}

export function countActiveMealsOnPlan(
  items: { isSkipped?: boolean; wrongDelivery?: boolean }[]
): number {
  return items.filter((i) => !i.isSkipped && !i.wrongDelivery).length
}

/** Wizard row blocks import only when a dish is already chosen (not empty/skip placeholders). */
export function wizardMealHasDish(item: {
  dishId?: string | null
  dishName?: string | null
}): boolean {
  const id = item.dishId != null ? String(item.dishId).trim() : ''
  if (id !== '') return true
  const name = item.dishName?.trim() ?? ''
  return name !== ''
}

/** @deprecated use wizardMealHasDish */
export function wizardMealHasAssignment(item: {
  dishId?: string | null
  dishName?: string | null
  isSkipped?: boolean
}): boolean {
  return wizardMealHasDish(item)
}

/** Latest calendar date with an assigned dish (ignores empty / skip-only rows). */
export function latestAssignedMealDateYmd(
  planStartYmd: string,
  items: {
    date: string | Date
    dishId?: string | null
    dishName?: string | null
  }[]
): string | null {
  const withDishes = datesWithAssignedMealsYmd(items)
  if (withDishes.size === 0) return null
  let latest = planStartYmd
  for (const ymd of withDishes) {
    if (ymd > latest) latest = ymd
  }
  return latest
}

/** Dates that already have a dish — empty or skip-only placeholders do not block import. */
export function datesWithAssignedMealsYmd(
  items: {
    date: string | Date
    dishId?: string | null
    dishName?: string | null
  }[]
): Set<string> {
  const set = new Set<string>()
  for (const item of items) {
    if (wizardMealHasDish(item)) {
      set.add(itemDateYmd(item.date))
    }
  }
  return set
}

export function countWizardActiveMeals(
  items: {
    dishId?: string | null
    dishName?: string | null
    isSkipped?: boolean
    wrongDelivery?: boolean
  }[]
): number {
  return items.filter(
    (i) => wizardMealHasDish(i) && !i.isSkipped && !i.wrongDelivery
  ).length
}

/** How many more non-skipped meals can be imported onto this plan. */
export function maxActiveMealsToImport(input: {
  totalMeals: number | null | undefined
  days: number
  mealsPerDay: number
  existingItems: {
    isSkipped?: boolean
    wrongDelivery?: boolean
    dishId?: string | null
    dishName?: string | null
  }[]
  remainingMeals?: number | null
  /** Wizard: empty placeholder rows do not consume capacity. */
  wizardMode?: boolean
}): number {
  const cap = input.totalMeals ?? input.days * input.mealsPerDay
  if (cap <= 0) return 0
  const active = input.wizardMode
    ? countWizardActiveMeals(input.existingItems)
    : countActiveMealsOnPlan(input.existingItems)
  let room = Math.max(0, cap - active)
  if (input.remainingMeals != null && input.remainingMeals >= 0) {
    room = Math.min(room, input.remainingMeals)
  }
  return room
}
