import { format } from 'date-fns'
import type { Prisma } from '@/lib/generated/prisma/client'
import { getPlanWeekNumber } from '@/lib/meal-plan-weeks'
import {
  jsWeekdayFromYmd,
  jsWeekdayToMon1Sun7,
  normalizeWeeklySkipDays,
  parseWeeklySkipDaysByWeekJson,
} from '@/lib/meal-plan-skip-days'

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
  const skipSet = new Set(skipDays)
  const items = await tx.mealPlanItem.findMany({
    where: { mealPlanId, isDelivered: false },
    select: { id: true, date: true },
  })
  const ids: number[] = []
  for (const row of items) {
    const ymd = format(row.date, 'yyyy-MM-dd')
    if (skipSet.has(jsWeekdayToMon1Sun7(jsWeekdayFromYmd(ymd)))) ids.push(row.id)
  }
  if (ids.length === 0) return 0
  const res = await tx.mealPlanItem.updateMany({
    where: { id: { in: ids } },
    data: { isSkipped: true },
  })
  return res.count
}

export type ApplyWeeklySkipPatternResult = {
  markedUndelivered: number
  markedDelivered: number
}

/**
 * Marks items on skip-pattern weekdays: all non-delivered rows (including empty “inactive” slots),
 * and optionally delivered rows (clears delivery — same semantics as skipping a delivered meal in the UI).
 */
export async function applyWeeklySkipPatternToExistingItems(
  tx: Prisma.TransactionClient,
  mealPlanId: number,
  planStartDate: Date | string | null,
  globalSkipDays: number[],
  byWeekRaw: unknown,
  options: { includeDelivered: boolean }
): Promise<ApplyWeeklySkipPatternResult> {
  const global = normalizeWeeklySkipDays(globalSkipDays)
  const byWeek = parseWeeklySkipDaysByWeekJson(byWeekRaw)

  /** Per plan-week from JSON; weeks missing in the map use plan-level `weeklySkipDays`. */
  function patternForRowDate(rowDate: Date): number[] {
    const wk = String(getPlanWeekNumber(rowDate, planStartDate))
    return normalizeWeeklySkipDays(byWeek[wk] ?? global)
  }

  function rowMatchesSkipPattern(rowDate: Date): boolean {
    const ymd = format(rowDate, 'yyyy-MM-dd')
    const pattern = patternForRowDate(rowDate)
    const patternSet = new Set(pattern)
    return (
      patternSet.size > 0 &&
      patternSet.has(jsWeekdayToMon1Sun7(jsWeekdayFromYmd(ymd)))
    )
  }

  const undelivered = await tx.mealPlanItem.findMany({
    where: { mealPlanId, isDelivered: false },
    select: { id: true, date: true },
  })
  const undeliveredIds: number[] = []
  for (const row of undelivered) {
    if (rowMatchesSkipPattern(row.date)) undeliveredIds.push(row.id)
  }
  let markedUndelivered = 0
  if (undeliveredIds.length > 0) {
    const res = await tx.mealPlanItem.updateMany({
      where: { id: { in: undeliveredIds } },
      data: { isSkipped: true },
    })
    markedUndelivered = res.count
  }

  let markedDelivered = 0
  if (options.includeDelivered) {
    const delivered = await tx.mealPlanItem.findMany({
      where: { mealPlanId, isDelivered: true, isSkipped: false },
      select: { id: true, date: true },
    })
    const deliveredIds: number[] = []
    for (const row of delivered) {
      if (rowMatchesSkipPattern(row.date)) deliveredIds.push(row.id)
    }
    if (deliveredIds.length > 0) {
      const res = await tx.mealPlanItem.updateMany({
        where: { id: { in: deliveredIds } },
        data: {
          isSkipped: true,
          isDelivered: false,
          deliveredAt: null,
          wrongDelivery: false,
        },
      })
      markedDelivered = res.count
    }
  }

  return { markedUndelivered, markedDelivered }
}

/**
 * Like {@link markUndeliveredItemsSkippedForWeekdays} but respects per–plan-week patterns in `weeklySkipDaysByWeek`.
 */
export async function markUndeliveredItemsSkippedByPlanWeekPatterns(
  tx: Prisma.TransactionClient,
  mealPlanId: number,
  planStartDate: Date | string | null,
  globalSkipDays: number[],
  byWeekRaw: unknown
): Promise<number> {
  const r = await applyWeeklySkipPatternToExistingItems(
    tx,
    mealPlanId,
    planStartDate,
    globalSkipDays,
    byWeekRaw,
    { includeDelivered: false }
  )
  return r.markedUndelivered
}
