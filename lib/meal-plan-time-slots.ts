/** Normalize MealPlan.timeSlots JSON to a string array. */
export function parseMealPlanTimeSlots(value: unknown): string[] {
  if (value == null) return []
  if (!Array.isArray(value)) return []
  return value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}
