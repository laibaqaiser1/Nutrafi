import { format } from 'date-fns'
import type { Prisma } from '@/lib/generated/prisma/client'
import { getPlanWeekNumber } from '@/lib/meal-plan-weeks'
import { jsWeekdayFromYmd, normalizeWeeklySkipDays, parseWeeklySkipDaysByWeekJson } from '@/lib/meal-plan-skip-days'

/**
 * Sets `isSkipped: true` on all non-delivered items whose calendar weekday is in `skipDays`.
 * Does not unskip; does not change delivered rows.
 */
export async function markUndeliveredItemsSkippedForWeekdays(
  tx: Prisma.TransactionClient,
  mealPlanId: number,
  rawSkipDays: number[]
): Promise<number> {
  const skipDays = normalizeWeeklySkipDays(rawSkipDays)
  if (skipDays.length === 0) return 0
  const set = new Set(skipDays)
  const items = await tx.mealPlanItem.findMany({
    where: { mealPlanId, isDelivered: false },
    select: { id: true, date: true },
  })
  const ids: number[] = []
  for (const row of items) {
    const ymd = format(row.date, 'yyyy-MM-dd')
    if (set.has(jsWeekdayFromYmd(ymd))) ids.push(row.id)
  }
  if (ids.length === 0) return 0
  const res = await tx.mealPlanItem.updateMany({
    where: { id: { in: ids } },
    data: { isSkipped: true },
  })
  return res.count
}

/**
 * Like {@link markUndeliveredItemsSkippedForWeekdays} but respects per–plan-week patterns when
 * `sameEveryWeek` is false.
 */
export async function markUndeliveredItemsSkippedByPlanWeekPatterns(
  tx: Prisma.TransactionClient,
  mealPlanId: number,
  planStartDate: Date | string | null,
  sameEveryWeek: boolean,
  globalSkipDays: number[],
  byWeekRaw: unknown
): Promise<number> {
  const global = normalizeWeeklySkipDays(globalSkipDays)
  const byWeek = parseWeeklySkipDaysByWeekJson(byWeekRaw)
  const items = await tx.mealPlanItem.findMany({
    where: { mealPlanId, isDelivered: false },
    select: { id: true, date: true },
  })
  const ids: number[] = []
  for (const row of items) {
    const ymd = format(row.date, 'yyyy-MM-dd')
    const wk = getPlanWeekNumber(row.date, planStartDate)
    const pattern = sameEveryWeek
      ? global
      : normalizeWeeklySkipDays(byWeek[String(wk)] ?? global)
    if (pattern.length > 0 && pattern.includes(jsWeekdayFromYmd(ymd))) ids.push(row.id)
  }
  if (ids.length === 0) return 0
  const res = await tx.mealPlanItem.updateMany({
    where: { id: { in: ids } },
    data: { isSkipped: true },
  })
  return res.count
}
