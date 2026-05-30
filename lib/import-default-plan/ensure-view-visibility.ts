import type { Dispatch, SetStateAction } from 'react'
import { getPlanWeekNumber } from '@/lib/meal-plan-weeks'
import { mealPlanDateYmd } from '@/lib/meal-plan-calendar-date'

/** Ensure imported dates appear in the meal plan view week/day schedule. */
export function ensureViewVisibilityForDates(
  dates: string[],
  planStartDate: string,
  setVisibleWeeks: Dispatch<SetStateAction<number[]>>,
  setVisibleDaysByWeek: Dispatch<SetStateAction<Record<number, string[]>>>,
  setExpandedWeeks: Dispatch<SetStateAction<Set<number>>>
): void {
  if (dates.length === 0 || !planStartDate) return
  const weeks = new Set<number>()
  for (const d of dates) {
    weeks.add(getPlanWeekNumber(d, planStartDate))
  }
  setVisibleWeeks((prev) => [...new Set([...prev, ...weeks])].sort((a, b) => a - b))
  setVisibleDaysByWeek((prev) => {
    const next = { ...prev }
    for (const d of dates) {
      const w = getPlanWeekNumber(d, planStartDate)
      const list = next[w] ? [...next[w]!] : []
      if (!list.includes(d)) list.push(d)
      list.sort()
      next[w] = list
    }
    return next
  })
  setExpandedWeeks((prev) => {
    const next = new Set(prev)
    for (const w of weeks) next.add(w)
    return next
  })
}

/** Latest meal date on plan (yyyy-MM-dd). */
export function latestMealDateYmd(
  items: { date: string | Date }[]
): string | null {
  let max: string | null = null
  for (const item of items) {
    const ymd = mealPlanDateYmd(item.date)
    if (!max || ymd > max) max = ymd
  }
  return max
}
