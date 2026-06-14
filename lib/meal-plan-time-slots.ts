/** Normalize MealPlan.timeSlots JSON to a string array. */
export function parseMealPlanTimeSlots(value: unknown): string[] {
  if (value == null) return []
  if (!Array.isArray(value)) return []
  return value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

/** Every 30 minutes from 00:00 through 23:30 (24h `HH:mm`). */
export function generateMealPlanTimeOptions(): string[] {
  const times: string[] = []
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      times.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`)
    }
  }
  return times
}

/** Canonical `HH:mm` for matching time slots across formats (`08:00`, `8:00 AM`, etc.). */
export function normalizeMealPlanTimeSlotForKey(timeSlot: string): string {
  const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
  if (!timeMatch) return timeSlot.trim()
  let hours = parseInt(timeMatch[1]!, 10)
  const minutes = timeMatch[2]!
  const upper = timeSlot.toUpperCase()
  if (upper.includes('PM') && hours !== 12) hours += 12
  else if (upper.includes('AM') && hours === 12) hours = 0
  return `${hours.toString().padStart(2, '0')}:${minutes}`
}

/** Display `08:00` as `8:00 AM` (passes through values that already include AM/PM). */
export function formatMealPlanTime12Hour(timeSlot: string): string {
  const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
  if (!timeMatch) return timeSlot
  if (timeSlot.toUpperCase().includes('AM') || timeSlot.toUpperCase().includes('PM')) {
    return timeSlot
  }
  let hours = parseInt(timeMatch[1]!, 10)
  const minutes = timeMatch[2]!
  const period = hours >= 12 ? 'PM' : 'AM'
  if (hours > 12) hours -= 12
  if (hours === 0) hours = 12
  return `${hours}:${minutes} ${period}`
}

/** Per-meal slot times for a plan (cycles when fewer slots than mealsPerDay). */
export function expandMealTimeSlotTemplate(
  mealsPerDay: number,
  planTimeSlots: string[]
): string[] {
  const n = Math.max(mealsPerDay, 1)
  if (planTimeSlots.length > 0) {
    return Array.from({ length: n }, (_, i) => planTimeSlots[i % planTimeSlots.length]!)
  }
  return Array.from({ length: n }, () => '12:00')
}

/** Include a saved slot in the list when it is not one of the standard 30-minute options. */
export function mealPlanTimeOptionsForSlot(slot: string, standard: string[]): string[] {
  const s = slot.trim()
  if (s && !standard.includes(s)) return [s, ...standard]
  return standard
}
