/** Calendar yyyy-MM-dd from API/DB value (never weekday — each day is distinct). */
export function mealPlanDateYmd(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

/** Store a calendar date on MealPlanItem (UTC midnight for yyyy-MM-dd strings). */
export function mealPlanDateFromYmd(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`)
}

/** UTC bounds for all items on a calendar day (handles legacy rows with time on `date`). */
export function mealPlanDayBoundsUtc(ymd: string): { gte: Date; lte: Date } {
  const gte = mealPlanDateFromYmd(ymd)
  const lte = new Date(gte)
  lte.setUTCHours(23, 59, 59, 999)
  return { gte, lte }
}

/** Normalize any date input to stored UTC midnight for that calendar day. */
export function normalizeMealPlanItemDate(input: string | Date): Date {
  const ymd = mealPlanDateYmd(input)
  return mealPlanDateFromYmd(ymd)
}
