import { format } from 'date-fns'
import { planWeekDayStringsOnOrAfterStart } from '@/lib/meal-plan-weeks'

/** JS `Date.getDay()`: Sunday = 0 … Saturday = 6 */
export function jsWeekdayFromYmd(ymd: string): number {
  const d = new Date(`${ymd}T12:00:00`)
  return d.getDay()
}

export function jsWeekdayFromPlanItemDate(date: string | Date): number {
  const ymd = format(typeof date === 'string' ? new Date(date) : date, 'yyyy-MM-dd')
  return jsWeekdayFromYmd(ymd)
}

/**
 * Stored skip weekdays use **Monday = 1 … Sunday = 7** (easy to read).
 * `Date.getDay()` uses Sunday = 0 … Saturday = 6 — convert for comparisons.
 */
export function jsWeekdayToMon1Sun7(jsWeekday: number): number {
  if (jsWeekday === 0) return 7
  return jsWeekday
}

/** Inverse of {@link jsWeekdayToMon1Sun7} (for tests / rare use). */
export function mon1Sun7ToJsWeekday(mon: number): number {
  if (mon === 7) return 0
  return mon
}

export function shouldSkipCalendarDay(
  ymd: string,
  weeklySkipDays: number[] | null | undefined
): boolean {
  if (!weeklySkipDays?.length) return false
  const set = new Set(normalizeWeeklySkipDays(weeklySkipDays))
  const mon = jsWeekdayToMon1Sun7(jsWeekdayFromYmd(ymd))
  return set.has(mon)
}

/**
 * Normalizes skip weekday lists to **1 = Monday … 7 = Sunday**, sorted unique.
 * Accepts legacy **0 = Sunday** (JS) from older rows or clients and maps it to **7**.
 */
export function normalizeWeeklySkipDays(days: unknown): number[] {
  if (!Array.isArray(days)) return []
  const out = new Set<number>()
  for (const x of days) {
    const n = typeof x === 'number' ? x : parseInt(String(x), 10)
    if (Number.isNaN(n)) continue
    if (n === 0) {
      out.add(7)
      continue
    }
    if (n >= 1 && n <= 7) out.add(n)
  }
  return Array.from(out).sort((a, b) => a - b)
}

/** Mon–Sun toggles; `value` is stored on MealPlan (1–7). */
export const WEEKDAY_SKIP_TOGGLES: { label: string; value: number }[] = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 7 },
]

const WEEKDAY_FULL_NAME_BY_VALUE: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
}

/** Full weekday name for headers (1 = Monday … 7 = Sunday). */
export function weekdayFullName(mon1Sun7: number): string {
  return WEEKDAY_FULL_NAME_BY_VALUE[mon1Sun7] ?? String(mon1Sun7)
}

/** Parse DB JSON `{ "1": [6,7] }` into normalized weekday arrays per plan week (1–7). */
export function parseWeeklySkipDaysByWeekJson(raw: unknown): Record<string, number[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, number[]> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(k)) continue
    out[k] = normalizeWeeklySkipDays(v)
  }
  return out
}

/**
 * Calendar dates to create when opening a new plan week:
 * the earliest eligible day (Mon–Sun on/after plan start) plus every other eligible day
 * in that week that matches the skip pattern (skipped rows do not use meal slots).
 */
export function datesToSeedWhenAddingPlanWeek(
  planStartDate: string | null,
  weekNumber: number,
  skipDaysForWeek: number[] | null | undefined
): string[] {
  const eligible = planWeekDayStringsOnOrAfterStart(planStartDate, weekNumber)
  if (eligible.length === 0) return []

  const skipNorm = normalizeWeeklySkipDays(skipDaysForWeek)
  const dates = new Set<string>()
  dates.add(eligible[0]!)

  if (skipNorm.length > 0) {
    for (const ymd of eligible) {
      if (shouldSkipCalendarDay(ymd, skipNorm)) dates.add(ymd)
    }
  }

  return Array.from(dates).sort()
}

export function serializeWeeklySkipDaysByWeek(
  draft: Record<number, number[]>
): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const [k, v] of Object.entries(draft)) {
    const week = parseInt(k, 10)
    if (Number.isNaN(week) || week < 1) continue
    const norm = normalizeWeeklySkipDays(v)
    if (norm.length > 0) out[String(week)] = norm
  }
  return out
}
