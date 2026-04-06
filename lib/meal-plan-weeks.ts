import { addDays, addWeeks, differenceInCalendarWeeks, format, parseISO, startOfWeek } from 'date-fns'

/** Monday of the ISO-style week (Mon–Sun) that contains the plan start date. Week 1 is anchored here. */
export function getPlanAnchorMonday(planStartDate: Date | string): Date {
  const start = typeof planStartDate === 'string' ? new Date(planStartDate) : planStartDate
  return startOfWeek(start, { weekStartsOn: 1 })
}

/**
 * Plan week index (1-based): same calendar week as anchor = 1, next Monday–Sunday = 2, etc.
 */
export function getPlanWeekNumber(date: Date | string, planStartDate: Date | string | null): number {
  if (!planStartDate) return 1
  const mealDate = typeof date === 'string' ? new Date(date) : date
  const start = typeof planStartDate === 'string' ? new Date(planStartDate) : planStartDate
  const anchor = getPlanAnchorMonday(start)
  const dateMonday = startOfWeek(mealDate, { weekStartsOn: 1 })
  const diff = differenceInCalendarWeeks(dateMonday, anchor, { weekStartsOn: 1 })
  return Math.max(1, diff + 1)
}

/** Monday of plan week `weekNumber` (1-based). */
export function getMondayOfPlanWeek(
  planStartDate: Date | string | null,
  weekNumber: number
): Date {
  const anchor = planStartDate
    ? getPlanAnchorMonday(planStartDate)
    : startOfWeek(new Date(), { weekStartsOn: 1 })
  return addWeeks(anchor, weekNumber - 1)
}

function planStartYmd(planStartDate: string | null): string | null {
  if (!planStartDate) return null
  const d = new Date(planStartDate)
  if (Number.isNaN(d.getTime())) return null
  return format(d, 'yyyy-MM-dd')
}

/**
 * Mon→Sun yyyy-MM-dd for that plan week, excluding calendar days strictly before the plan start date.
 * (Weeks still align Mon–Sun; “Add day” never opens a day before the subscription starts.)
 */
export function planWeekDayStringsOnOrAfterStart(
  planStartDate: string | null,
  weekNumber: number
): string[] {
  const monday = getMondayOfPlanWeek(planStartDate, weekNumber)
  const startYmd = planStartYmd(planStartDate)
  const keys: string[] = []
  for (let i = 0; i < 7; i++) {
    const key = format(addDays(monday, i), 'yyyy-MM-dd')
    if (startYmd && key < startYmd) continue
    keys.push(key)
  }
  return keys
}

/** Earliest eligible day in that plan week not yet in `existingYmd` (yyyy-MM-dd). */
export function nextMissingDayInPlanWeek(
  planStartDate: string | null,
  weekNumber: number,
  existingYmd: Set<string>
): Date | null {
  for (const key of planWeekDayStringsOnOrAfterStart(planStartDate, weekNumber)) {
    if (!existingYmd.has(key)) return parseISO(key)
  }
  return null
}

/** Millisecond day offset from `from` Monday to `to` Monday (whole days). */
export function dayOffsetBetweenPlanWeeks(
  planStartDate: string | null,
  fromWeek: number,
  toWeek: number
): number {
  const a = getMondayOfPlanWeek(planStartDate, fromWeek)
  const b = getMondayOfPlanWeek(planStartDate, toWeek)
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000))
}
