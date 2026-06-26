import type { Dish } from '@/lib/generated/prisma/client'
import { prisma, withRetry } from '@/lib/prisma'
import { mealPlanDateFromYmd, mealPlanDateYmd, mealPlanDayBoundsUtc } from '@/lib/meal-plan-calendar-date'
import { planEndYmd } from '@/lib/import-default-plan/suggest-start-date'
import {
  normalizeMealPlanTimeSlotForKey,
  parseMealPlanTimeSlots,
} from '@/lib/meal-plan-time-slots'
import { syncMealPlanRemainingMeals } from '@/lib/meal-plan-balance'
import {
  deliveryTimeFromSlot,
  resolveDishDataForItem,
  type MealPlanItemCreateInput,
} from '@/lib/meal-plan-item-create-payload'
import { getDefaultCustomerLocationId } from '@/lib/customer-location'
import { stringSimilarity } from './string-similarity'

export interface AgentMealApplyItem {
  dateYmd: string
  slotIndex: number
  timeSlot: string
  dishId?: number
  dishName?: string
  customNote?: string
  /** Replace flow — update this exact row instead of adding a new meal. */
  replaceItemId?: number
}

export interface AgentMealApplyResult {
  mealPlanItemId: number
  dateYmd: string
  slotIndex: number
  dishId: number | null
  dishName: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown>
}

export interface SkipDayResult {
  dateYmd: string
  skippedCount: number
  createdCount: number
  updatedCount: number
  alreadyFullySkipped: boolean
  itemIds: number[]
}

export class SkipDayAlreadyDeliveredError extends Error {
  readonly code = 'ALREADY_DELIVERED' as const

  constructor(
    readonly dateYmd: string,
    readonly deliveredCount: number
  ) {
    super(`Meals for ${dateYmd} already delivered`)
    this.name = 'SkipDayAlreadyDeliveredError'
  }
}

type ExistingItemRow = {
  id: number
  date: Date
  timeSlot: string
  isSkipped: boolean
  wrongDelivery: boolean
  dishId: number | null
  dishName: string | null
  customNote: string | null
}

function isActiveRow(row: { isSkipped: boolean; wrongDelivery: boolean }): boolean {
  return !row.isSkipped && !row.wrongDelivery
}

const PLACEHOLDER_DISH_NAMES = new Set(['-', '—', 'n/a', 'na', 'none', 'tbd'])

function isPlaceholderDishName(name: string | null | undefined): boolean {
  if (name == null) return true
  const n = name.trim().toLowerCase()
  return n.length === 0 || PLACEHOLDER_DISH_NAMES.has(n)
}

function rowHasAssignedDish(row: {
  dishId: number | null
  dishName: string | null
}): boolean {
  if (row.dishId != null) return true
  return !isPlaceholderDishName(row.dishName)
}

/** Meal chosen for delivery — excludes empty/inactive placeholder slots. */
function isScheduledMealRow(row: ExistingItemRow): boolean {
  return isActiveRow(row) && rowHasAssignedDish(row)
}

/** Empty / inactive placeholder rows can be filled; rows with a dish cannot. */
function isFillableEmptyRow(row: ExistingItemRow): boolean {
  if (row.wrongDelivery) return false
  return !rowHasAssignedDish(row)
}

function groupExistingRowsByDateYmd(
  rows: ExistingItemRow[]
): Map<string, ExistingItemRow[]> {
  const byDate = new Map<string, ExistingItemRow[]>()
  for (const row of rows) {
    const ymd = mealPlanDateYmd(row.date)
    const list = byDate.get(ymd) ?? []
    list.push(row)
    byDate.set(ymd, list)
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot) || a.id - b.id)
  }
  return byDate
}

function pickFillableEmptyRow(
  candidates: ExistingItemRow[],
  preferredTimeSlot: string
): ExistingItemRow | undefined {
  if (candidates.length === 0) return undefined
  const norm = normalizeMealPlanTimeSlotForKey(preferredTimeSlot)
  const match = candidates.find(
    (r) => normalizeMealPlanTimeSlotForKey(r.timeSlot) === norm
  )
  return match ?? candidates[0]
}

function findFillableEmptyRow(
  ymd: string,
  rowsByDate: Map<string, ExistingItemRow[]>,
  usedRowIds: Set<number>,
  preferredTimeSlot: string,
  dayRows: ExistingItemRow[] = []
): ExistingItemRow | undefined {
  const merged = new Map<number, ExistingItemRow>()
  for (const row of [...(rowsByDate.get(ymd) ?? []), ...dayRows]) {
    merged.set(row.id, row)
  }
  const candidates = [...merged.values()].filter(
    (r) => !usedRowIds.has(r.id) && isFillableEmptyRow(r)
  )
  if (candidates.length > 0) {
    return pickFillableEmptyRow(candidates, preferredTimeSlot)
  }

  // Fallback: scan cached plan rows for this calendar day (legacy date storage)
  const fromPlan = [...rowsByDate.values()]
    .flat()
    .filter(
      (r) =>
        mealPlanDateYmd(r.date) === ymd &&
        !usedRowIds.has(r.id) &&
        isFillableEmptyRow(r)
    )
  return pickFillableEmptyRow(fromPlan, preferredTimeSlot)
}

async function loadRowsForCalendarDay(
  tx: Pick<typeof prisma, 'mealPlanItem'>,
  mealPlanId: number,
  ymd: string
): Promise<ExistingItemRow[]> {
  const { gte, lte } = mealPlanDayBoundsUtc(ymd)
  return tx.mealPlanItem.findMany({
    where: { mealPlanId, date: { gte, lte } },
    select: {
      id: true,
      date: true,
      timeSlot: true,
      isSkipped: true,
      wrongDelivery: true,
      dishId: true,
      dishName: true,
      customNote: true,
    },
    orderBy: [{ timeSlot: 'asc' }, { id: 'asc' }],
  })
}

function mergeRowsIntoDateMap(
  rowsByDate: Map<string, ExistingItemRow[]>,
  rows: ExistingItemRow[]
): void {
  for (const row of rows) {
    const ymd = mealPlanDateYmd(row.date)
    const list = rowsByDate.get(ymd) ?? []
    if (!list.some((r) => r.id === row.id)) {
      list.push(row)
      list.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot) || a.id - b.id)
      rowsByDate.set(ymd, list)
    }
  }
}

/** Inactive placeholder slots on a calendar day (for agent diagnostics / replies). */
export async function countFillableEmptySlotsOnDate(
  mealPlanId: number,
  dateYmd: string
): Promise<number> {
  const rows = await loadRowsForCalendarDay(prisma, mealPlanId, dateYmd)
  return rows.filter(isFillableEmptyRow).length
}

/** Customer's delivery time for a day — same slot for every meal that day. */
function resolveCustomerDayTimeSlot(
  ymd: string,
  rowsByDate: Map<string, ExistingItemRow[]>,
  planTimeSlots: string[]
): string {
  const onDate = rowsByDate.get(ymd) ?? []
  const activeWithDish = onDate.find(
    (r) => isActiveRow(r) && (r.dishId != null || Boolean(r.dishName?.trim()))
  )
  if (activeWithDish?.timeSlot.trim()) return activeWithDish.timeSlot.trim()

  const anyOnDay = onDate.find((r) => r.timeSlot.trim())
  if (anyOnDay?.timeSlot.trim()) return anyOnDay.timeSlot.trim()

  if (planTimeSlots.length > 0) return planTimeSlots[0]!

  return '12:00'
}

function snapshotRow(row: ExistingItemRow): Record<string, unknown> {
  return {
    id: row.id,
    dateYmd: mealPlanDateYmd(row.date),
    timeSlot: row.timeSlot,
    dishId: row.dishId,
    dishName: row.dishName,
    customNote: row.customNote,
    isSkipped: row.isSkipped,
  }
}

/** Agent-only meal plan writes — does not call dashboard meal-plan APIs. */
export async function applyAgentMealItems(
  mealPlanId: number,
  items: AgentMealApplyItem[]
): Promise<AgentMealApplyResult[]> {
  if (items.length === 0) return []

  const mealPlanRow = await prisma.mealPlan.findUnique({
    where: { id: mealPlanId },
    select: {
      id: true,
      customerId: true,
      totalMeals: true,
      days: true,
      mealsPerDay: true,
      remainingMeals: true,
      timeSlots: true,
      startDate: true,
    },
  })
  if (!mealPlanRow) throw new Error('Meal plan not found')

  const defaultCustomerLocationId = await getDefaultCustomerLocationId(
    prisma,
    mealPlanRow.customerId
  )

  const dishIds = items
    .map((i) => i.dishId)
    .filter((n): n is number => n != null && n > 0)
  const dishes =
    dishIds.length > 0
      ? await prisma.dish.findMany({ where: { id: { in: [...new Set(dishIds)] } } })
      : []
  const dishById = new Map<number, Dish>(dishes.map((d) => [d.id, d]))

  const existingRows = await prisma.mealPlanItem.findMany({
    where: { mealPlanId },
    select: {
      id: true,
      date: true,
      timeSlot: true,
      isSkipped: true,
      wrongDelivery: true,
      dishId: true,
      dishName: true,
      customNote: true,
    },
    orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }, { id: 'asc' }],
  })

  const rowsByDate = groupExistingRowsByDateYmd(existingRows)
  const planTimeSlots = parseMealPlanTimeSlots(mealPlanRow.timeSlots)
  const scheduledByDate = new Map<string, number>()
  let activeCount = 0
  for (const row of existingRows) {
    if (!isActiveRow(row)) continue
    activeCount++
    if (isScheduledMealRow(row)) {
      const ymd = mealPlanDateYmd(row.date)
      scheduledByDate.set(ymd, (scheduledByDate.get(ymd) ?? 0) + 1)
    }
  }

  const usedExistingRowIds = new Set<number>()
  const totalMealsCap =
    mealPlanRow.totalMeals ?? mealPlanRow.days * mealPlanRow.mealsPerDay
  const planStart = mealPlanRow.startDate
    ? mealPlanDateYmd(mealPlanRow.startDate)
    : ''
  const planEnd =
    planStart && mealPlanRow.days > 0 ? planEndYmd(planStart, mealPlanRow.days) : null

  const results: AgentMealApplyResult[] = []

  await withRetry(() =>
    prisma.$transaction(
      async (tx) => {
        for (const data of items) {
          const ymd = data.dateYmd
          if (planEnd && ymd > planEnd) {
            throw new Error(`${ymd} is after the plan end date (${planEnd}).`)
          }

          const scheduledOnDate = scheduledByDate.get(ymd) ?? 0
          const customerDayTimeSlot = resolveCustomerDayTimeSlot(
            ymd,
            rowsByDate,
            planTimeSlots
          )

          let existingRow: ExistingItemRow | undefined
          let slotIndex = data.slotIndex
          let timeSlot = customerDayTimeSlot
          let dayRows: ExistingItemRow[] = []

          if (data.replaceItemId) {
            existingRow = existingRows.find((r) => r.id === data.replaceItemId)
            if (!existingRow) {
              throw new Error(`Meal item #${data.replaceItemId} not found.`)
            }
            timeSlot = existingRow.timeSlot
          } else {
            dayRows = await loadRowsForCalendarDay(tx, mealPlanId, ymd)
            mergeRowsIntoDateMap(rowsByDate, dayRows)

            const fillable = findFillableEmptyRow(
              ymd,
              rowsByDate,
              usedExistingRowIds,
              customerDayTimeSlot,
              dayRows
            )

            if (fillable) {
              existingRow = fillable
              timeSlot = fillable.timeSlot
            } else {
              const scheduledWithDish = dayRows.filter(isScheduledMealRow).length
              if (
                mealPlanRow.mealsPerDay > 0 &&
                scheduledWithDish >= mealPlanRow.mealsPerDay
              ) {
                throw new Error(
                  `${ymd} already has ${mealPlanRow.mealsPerDay} active meal(s).`
                )
              }

              slotIndex = scheduledOnDate
              timeSlot = customerDayTimeSlot
              existingRow = undefined
            }
          }

          // Never create a new row while inactive placeholders exist on this day
          if (!existingRow && !data.replaceItemId) {
            if (dayRows.length === 0) {
              dayRows = await loadRowsForCalendarDay(tx, mealPlanId, ymd)
              mergeRowsIntoDateMap(rowsByDate, dayRows)
            }
            const openSlots = dayRows.filter(
              (r) => !usedExistingRowIds.has(r.id) && isFillableEmptyRow(r)
            )
            const forced = pickFillableEmptyRow(openSlots, customerDayTimeSlot)
            if (forced) {
              existingRow = forced
              timeSlot = forced.timeSlot
            }
          }

          if (totalMealsCap > 0 && !existingRow) {
            const overCap = activeCount + 1 > totalMealsCap
            const allowWhenAtCapButContractLeft =
              mealPlanRow.remainingMeals != null &&
              mealPlanRow.remainingMeals > 0 &&
              activeCount <= totalMealsCap
            if (overCap && !allowWhenAtCapButContractLeft) {
              throw new Error(`Plan allows at most ${totalMealsCap} active meals.`)
            }
          }

          const dish = data.dishId ? dishById.get(data.dishId) ?? null : null
          const dishData = resolveDishDataForItem(
            {
              dishId: data.dishId,
              dishName: data.dishName,
              customNote: data.customNote,
            } as MealPlanItemCreateInput,
            dish
          )

          const rowPayload = {
            date: mealPlanDateFromYmd(ymd),
            timeSlot,
            isSkipped: false,
            ...dishData,
            deliveryTime: deliveryTimeFromSlot(timeSlot) ?? undefined,
            customerLocationId: defaultCustomerLocationId ?? undefined,
            customNote:
              data.customNote != null && data.customNote.trim() !== ''
                ? data.customNote.trim()
                : undefined,
          }

          const before = existingRow ? snapshotRow(existingRow) : null

          if (existingRow) {
            usedExistingRowIds.add(existingRow.id)
            const wasActive = isActiveRow(existingRow)
            const hadDish = rowHasAssignedDish(existingRow)
            const row = await tx.mealPlanItem.update({
              where: { id: existingRow.id },
              data: rowPayload,
            })
            const nowActive = isActiveRow(row)
            const hasDish = rowHasAssignedDish(row)
            if (!wasActive && nowActive) {
              activeCount += 1
            } else if (wasActive && !nowActive) {
              activeCount -= 1
            }
            if (!hadDish && hasDish) {
              scheduledByDate.set(ymd, (scheduledByDate.get(ymd) ?? 0) + 1)
            } else if (hadDish && !hasDish) {
              scheduledByDate.set(ymd, Math.max(0, (scheduledByDate.get(ymd) ?? 1) - 1))
            }
            results.push({
              mealPlanItemId: row.id,
              dateYmd: ymd,
              slotIndex,
              dishId: row.dishId,
              dishName: row.dishName,
              before,
              after: snapshotRow({
                id: row.id,
                date: row.date,
                timeSlot: row.timeSlot,
                isSkipped: row.isSkipped,
                wrongDelivery: row.wrongDelivery,
                dishId: row.dishId,
                dishName: row.dishName,
                customNote: row.customNote,
              }),
            })
            continue
          }

          const row = await tx.mealPlanItem.create({
            data: {
              mealPlanId,
              ...rowPayload,
            },
          })
          usedExistingRowIds.add(row.id)
          if (isActiveRow(row)) {
            activeCount += 1
            if (rowHasAssignedDish(row)) {
              scheduledByDate.set(ymd, (scheduledByDate.get(ymd) ?? 0) + 1)
            }
            const list = rowsByDate.get(ymd) ?? []
            list.push({
              id: row.id,
              date: row.date,
              timeSlot: row.timeSlot,
              isSkipped: row.isSkipped,
              wrongDelivery: row.wrongDelivery,
              dishId: row.dishId,
              dishName: row.dishName,
              customNote: row.customNote,
            })
            rowsByDate.set(ymd, list)
          }

          results.push({
            mealPlanItemId: row.id,
            dateYmd: ymd,
            slotIndex,
            dishId: row.dishId,
            dishName: row.dishName,
            before: null,
            after: snapshotRow({
              id: row.id,
              date: row.date,
              timeSlot: row.timeSlot,
              isSkipped: row.isSkipped,
              wrongDelivery: row.wrongDelivery,
              dishId: row.dishId,
              dishName: row.dishName,
              customNote: row.customNote,
            }),
          })
        }

        await syncMealPlanRemainingMeals(tx, mealPlanId)
      },
      { timeout: 60_000 }
    )
  )

  return results
}

export async function findMealItemForReplace(
  mealPlanId: number,
  dateYmd: string,
  removePhrase: string
): Promise<ExistingItemRow | null> {
  const dayStart = mealPlanDateFromYmd(dateYmd)
  const dayEnd = new Date(dayStart)
  dayEnd.setUTCHours(23, 59, 59, 999)

  const items = await prisma.mealPlanItem.findMany({
    where: {
      mealPlanId,
      date: { gte: dayStart, lte: dayEnd },
      isSkipped: false,
    },
    select: {
      id: true,
      date: true,
      timeSlot: true,
      isSkipped: true,
      wrongDelivery: true,
      dishId: true,
      dishName: true,
      customNote: true,
    },
  })

  let best: (ExistingItemRow & { score: number }) | null = null
  for (const item of items) {
    const name = item.dishName ?? ''
    const score = stringSimilarity(removePhrase, name)
    if (!best || score > best.score) {
      best = { ...item, score }
    }
  }
  if (!best || best.score < 0.4) return null
  return best
}

export interface MealDaySummary {
  dateYmd: string
  dishName: string | null
  slotIndex: number
}

export async function getActiveMealsSummaryForDate(
  mealPlanId: number,
  dateYmd: string
): Promise<MealDaySummary[]> {
  return getActiveMealsSummaryForDates(mealPlanId, [dateYmd])
}

/** Active meals on the given days — for confirmation messages listing the full day. */
export async function getActiveMealsSummaryForDates(
  mealPlanId: number,
  dateYmds: string[]
): Promise<MealDaySummary[]> {
  const unique = [...new Set(dateYmds)]
  if (unique.length === 0) return []

  const dayFilters = unique.map((ymd) => {
    const { gte, lte } = mealPlanDayBoundsUtc(ymd)
    return { date: { gte, lte } }
  })

  const items = await prisma.mealPlanItem.findMany({
    where: {
      mealPlanId,
      isSkipped: false,
      wrongDelivery: false,
      OR: dayFilters,
    },
    select: {
      date: true,
      timeSlot: true,
      dishId: true,
      dishName: true,
    },
    orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }, { id: 'asc' }],
  })

  const byDate = new Map<string, MealDaySummary[]>()
  for (const item of items) {
    const ymd = mealPlanDateYmd(item.date)
    if (!unique.includes(ymd)) continue
    if (!rowHasAssignedDish(item)) continue
    const name = item.dishName?.trim()
    const list = byDate.get(ymd) ?? []
    list.push({
      dateYmd: ymd,
      dishName: name ?? null,
      slotIndex: list.length,
    })
    byDate.set(ymd, list)
  }

  const result: MealDaySummary[] = []
  for (const ymd of unique) {
    result.push(...(byDate.get(ymd) ?? []))
  }
  return result
}

export async function findMealPlanItemSnapshot(
  itemId: number
): Promise<Record<string, unknown> | null> {
  const row = await prisma.mealPlanItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      date: true,
      timeSlot: true,
      dishId: true,
      dishName: true,
      customNote: true,
      isSkipped: true,
    },
  })
  if (!row) return null
  return snapshotRow({ ...row, wrongDelivery: false })
}

/** Mark all meals on a day as skipped — update existing rows or create skipped placeholders. */
export async function skipAgentMealsForDay(
  mealPlanId: number,
  dateYmd: string
): Promise<SkipDayResult> {
  const mealPlanRow = await prisma.mealPlan.findUnique({
    where: { id: mealPlanId },
    select: {
      id: true,
      customerId: true,
      mealsPerDay: true,
      timeSlots: true,
      days: true,
      startDate: true,
    },
  })
  if (!mealPlanRow) throw new Error('Meal plan not found')

  const planStart = mealPlanRow.startDate
    ? mealPlanDateYmd(mealPlanRow.startDate)
    : ''
  const planEnd =
    planStart && mealPlanRow.days > 0 ? planEndYmd(planStart, mealPlanRow.days) : null
  if (planEnd && dateYmd > planEnd) {
    throw new Error(`${dateYmd} is after the plan end date (${planEnd}).`)
  }

  const mealsPerDay = Math.max(1, mealPlanRow.mealsPerDay)
  const planTimeSlots = parseMealPlanTimeSlots(mealPlanRow.timeSlots)
  const timeSlots =
    planTimeSlots.length > 0
      ? planTimeSlots
      : Array.from({ length: mealsPerDay }, (_, i) => {
          const hour = 8 + i * 5
          return `${hour.toString().padStart(2, '0')}:00`
        })

  const defaultCustomerLocationId = await getDefaultCustomerLocationId(
    prisma,
    mealPlanRow.customerId
  )

  const dayDate = mealPlanDateFromYmd(dateYmd)
  const existingRows = await prisma.mealPlanItem.findMany({
    where: { mealPlanId, date: dayDate },
    select: {
      id: true,
      date: true,
      timeSlot: true,
      isSkipped: true,
      wrongDelivery: true,
      isDelivered: true,
      dishId: true,
      dishName: true,
      customNote: true,
    },
    orderBy: [{ timeSlot: 'asc' }, { id: 'asc' }],
  })

  const deliveredCount = existingRows.filter((r) => r.isDelivered).length
  if (deliveredCount > 0) {
    throw new SkipDayAlreadyDeliveredError(dateYmd, deliveredCount)
  }

  const alreadyFullySkipped =
    existingRows.length >= mealsPerDay &&
    existingRows.every((r) => r.isSkipped) &&
    existingRows.filter((r) => isActiveRow(r)).length === 0

  if (alreadyFullySkipped) {
    return {
      dateYmd,
      skippedCount: existingRows.length,
      createdCount: 0,
      updatedCount: 0,
      alreadyFullySkipped: true,
      itemIds: existingRows.map((r) => r.id),
    }
  }

  const skipPayload = {
    isSkipped: true,
    wrongDelivery: false,
    isDelivered: false,
    deliveredAt: null as Date | null,
    dishId: null as number | null,
    dishName: null as string | null,
  }

  let updatedCount = 0
  let createdCount = 0
  const itemIds: number[] = []

  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      for (const row of existingRows) {
        const updated = await tx.mealPlanItem.update({
          where: { id: row.id },
          data: skipPayload,
        })
        itemIds.push(updated.id)
        updatedCount++
      }

      const slotsNeeded = Math.max(0, mealsPerDay - existingRows.length)
      for (let i = 0; i < slotsNeeded; i++) {
        const slotIndex = existingRows.length + i
        const timeSlot = timeSlots[slotIndex] ?? timeSlots[0] ?? '12:00'
        const created = await tx.mealPlanItem.create({
          data: {
            mealPlanId,
            date: dayDate,
            timeSlot,
            ...skipPayload,
            customerLocationId: defaultCustomerLocationId ?? undefined,
          },
        })
        itemIds.push(created.id)
        createdCount++
      }

      await syncMealPlanRemainingMeals(tx, mealPlanId)
    })
  )

  return {
    dateYmd,
    skippedCount: updatedCount + createdCount,
    createdCount,
    updatedCount,
    alreadyFullySkipped: false,
    itemIds,
  }
}
