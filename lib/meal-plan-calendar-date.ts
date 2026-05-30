/** Calendar yyyy-MM-dd from API/DB value (never weekday — each day is distinct). */
export function mealPlanDateYmd(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

/** Store a calendar date on MealPlanItem (UTC midnight for yyyy-MM-dd strings). */
export function mealPlanDateFromYmd(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`)
}
