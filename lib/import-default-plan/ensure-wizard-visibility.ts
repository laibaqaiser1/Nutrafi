import type { Dispatch, SetStateAction } from 'react'
import { getPlanWeekNumber } from '@/lib/meal-plan-weeks'

/** Open imported dates in the new-plan wizard week/day UI. */
export function ensureWizardVisibilityForDates(
  dates: string[],
  planStartYmd: string,
  setVisibleWeeks: Dispatch<SetStateAction<number[]>>,
  setVisibleDaysByWeek: Dispatch<SetStateAction<Record<number, string[]>>>
): void {
  if (dates.length === 0) return
  const weeks = new Set<number>()
  for (const d of dates) {
    weeks.add(getPlanWeekNumber(d, planStartYmd))
  }
  setVisibleWeeks((prev) => [...new Set([...prev, ...weeks])].sort((a, b) => a - b))
  setVisibleDaysByWeek((prev) => {
    const next = { ...prev }
    for (const d of dates) {
      const w = getPlanWeekNumber(d, planStartYmd)
      const list = next[w] ? [...next[w]!] : []
      if (!list.includes(d)) list.push(d)
      list.sort()
      next[w] = list
    }
    return next
  })
}
