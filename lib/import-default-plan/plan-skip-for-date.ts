import { getPlanWeekNumber } from '@/lib/meal-plan-weeks'
import {
  normalizeWeeklySkipDays,
  parseWeeklySkipDaysByWeekJson,
  shouldSkipCalendarDay,
} from '@/lib/meal-plan-skip-days'

/** Customer plan skip pattern for a calendar day (global + per–plan-week overrides). */
export function isCustomerPlanCalendarDaySkipped(
  dateYmd: string,
  planStartYmd: string,
  weeklySkipDays: number[] | null | undefined,
  weeklySkipDaysByWeekRaw: unknown
): boolean {
  const global = normalizeWeeklySkipDays(weeklySkipDays)
  const byWeek = parseWeeklySkipDaysByWeekJson(weeklySkipDaysByWeekRaw)
  const weekKey = String(getPlanWeekNumber(dateYmd, planStartYmd))
  const pattern =
    byWeek[weekKey] !== undefined ? normalizeWeeklySkipDays(byWeek[weekKey]) : global
  return shouldSkipCalendarDay(dateYmd, pattern)
}
