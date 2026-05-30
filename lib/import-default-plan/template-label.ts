import { parseMealPlanTimeSlots } from '@/lib/meal-plan-time-slots'
import { normalizeWeeklySkipDays, WEEKDAY_SKIP_TOGGLES } from '@/lib/meal-plan-skip-days'
import type { MealPlanTemplateListRow } from './types'

function planTypeLabel(t: string): string {
  if (t === 'WEEKLY') return 'Weekly'
  if (t === 'MONTHLY') return 'Monthly'
  return 'Custom'
}

function skipDaysSummary(days: number[] | undefined): string {
  const norm = normalizeWeeklySkipDays(days ?? [])
  if (norm.length === 0) return ''
  const byVal = new Map(WEEKDAY_SKIP_TOGGLES.map((t) => [t.value, t.label]))
  return norm.map((v) => byVal.get(v) ?? String(v)).join(', ')
}

/** Subtitle for template picker rows, e.g. "Weekly · 7 days · 2 meals/day". */
export function formatTemplateListSubtitle(template: MealPlanTemplateListRow): string {
  const parts = [
    planTypeLabel(template.planType),
    `${template.days} days`,
    `${template.mealsPerDay} meal${template.mealsPerDay === 1 ? '' : 's'}/day`,
  ]
  const skip = skipDaysSummary(template.weeklySkipDays)
  if (skip) parts.push(`Skip: ${skip}`)
  const slots = parseMealPlanTimeSlots(template.timeSlots)
  if (slots.length > 0) parts.push(slots.join(', '))
  return parts.join(' · ')
}
