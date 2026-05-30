import { addDays, format, parseISO } from 'date-fns'
import { mealPlanDateFromYmd, mealPlanDateYmd } from '@/lib/meal-plan-calendar-date'
import { existingMealDatesYmd, latestAssignedMealDateYmd } from './import-capacity'

/** Plan end date (inclusive) from start + day count. */
export function planEndYmd(planStartYmd: string, planDays: number): string {
  const start = mealPlanDateFromYmd(planStartYmd)
  return mealPlanDateYmd(addDays(start, Math.max(0, planDays - 1)))
}

/** True when import can place meals on this calendar date within the plan contract. */
export function isDateWithinPlanEnd(
  dateYmd: string,
  planStartYmd: string,
  planDays: number
): boolean {
  if (planDays <= 0 || !planStartYmd) return true
  return dateYmd <= planEndYmd(planStartYmd, planDays)
}

/**
 * One template cycle = 7 calendar days from import start.
 * Mid-week starts spill after Sunday (e.g. Tue → through Mon next week).
 */
export function wizardImportScanEndYmd(
  importStartYmd: string,
  planStartYmd: string,
  planDays?: number
): string {
  const oneWeekEnd = format(addDays(parseISO(importStartYmd), 6), 'yyyy-MM-dd')
  if (planDays != null && planDays > 0 && planStartYmd) {
    const planEnd = planEndYmd(planStartYmd, planDays)
    return oneWeekEnd <= planEnd ? oneWeekEnd : planEnd
  }
  return oneWeekEnd
}

/** First plan date with no existing meal rows (may be a skip day). */
export function firstAvailableImportStartYmd(
  planStartYmd: string,
  occupiedDates: Set<string>
): string {
  let cur = planStartYmd
  const limit = format(addDays(parseISO(planStartYmd), 365), 'yyyy-MM-dd')
  while (cur <= limit && occupiedDates.has(cur)) {
    cur = format(addDays(cur, 1), 'yyyy-MM-dd')
  }
  return cur
}

export function defaultImportStartForWizard(
  planStartYmd: string,
  datesWithDishes: Set<string>
): string {
  return firstAvailableImportStartYmd(planStartYmd, datesWithDishes)
}

export function defaultImportStartForExistingPlan(
  planStartYmd: string,
  planDays: number,
  items: {
    date: string | Date
    dishId?: string | null
    dishName?: string | null
  }[]
): string {
  const planEnd = planDays > 0 ? planEndYmd(planStartYmd, planDays) : null
  const occupied = existingMealDatesYmd(items)
  const fromFirstGap = firstAvailableImportStartYmd(planStartYmd, occupied)

  let candidate = fromFirstGap
  const latestDishYmd = latestAssignedMealDateYmd(planStartYmd, items)
  if (latestDishYmd) {
    const afterLatest = format(addDays(parseISO(`${latestDishYmd}T12:00:00`), 1), 'yyyy-MM-dd')
    if (afterLatest > candidate) candidate = afterLatest
  }

  if (planEnd && candidate > planEnd) return ''
  return candidate
}

/** Keep start on/after plan start; bump forward over occupied dates; stay within plan end. */
export function clampImportStartYmd(
  importStart: string,
  planStartYmd: string,
  occupiedDates: Set<string>,
  planEnd?: string | null
): string {
  if (!importStart) return ''
  let cur = importStart < planStartYmd ? planStartYmd : importStart
  const limit = format(addDays(parseISO(`${planStartYmd}T12:00:00`), 365), 'yyyy-MM-dd')
  while (cur <= limit && occupiedDates.has(cur)) {
    cur = format(addDays(parseISO(`${cur}T12:00:00`), 1), 'yyyy-MM-dd')
  }
  if (planEnd && cur > planEnd) return ''
  return cur
}
