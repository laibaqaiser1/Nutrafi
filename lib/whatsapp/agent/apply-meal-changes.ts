import type { Dish, Prisma } from '@/lib/generated/prisma/client'
import { prisma, withRetry } from '@/lib/prisma'
import { mealPlanDateFromYmd, mealPlanDateYmd } from '@/lib/meal-plan-calendar-date'
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
    list.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot))
  }
  return byDate
}

function indexExistingByPlanSlotOrder(
  rowsByDate: Map<string, ExistingItemRow[]>,
  planTimeSlots: string[]
): Map<string, Map<number, ExistingItemRow>> {
  const indexed = new Map<string, Map<number, ExistingItemRow>>()
  if (planTimeSlots.length === 0) return indexed
  const normalizedPlan = planTimeSlots.map(normalizeMealPlanTimeSlotForKey)
  for (const [ymd, list] of rowsByDate) {
    const slotMap = new Map<number, ExistingItemRow>()
    const unmatched = [...list]
    for (let i = 0; i < normalizedPlan.length; i++) {
      const idx = unmatched.findIndex(
        (r) => normalizeMealPlanTimeSlotForKey(r.timeSlot) === normalizedPlan[i]
      )
      if (idx >= 0) {
        slotMap.set(i, unmatched[idx]!)
        unmatched.splice(idx, 1)
      }
    }
    unmatched.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot))
    let nextIdx = normalizedPlan.length
    for (const row of unmatched) {
      while (slotMap.has(nextIdx)) nextIdx++
      slotMap.set(nextIdx, row)
      nextIdx++
    }
    indexed.set(ymd, slotMap)
  }
  return indexed
}

function indexExistingByDateTimeSlot(
  rowsByDate: Map<string, ExistingItemRow[]>
): Map<string, Map<string, ExistingItemRow>> {
  const indexed = new Map<string, Map<string, ExistingItemRow>>()
  for (const [ymd, list] of rowsByDate) {
    const slotMap = new Map<string, ExistingItemRow>()
    for (const row of list) {
      slotMap.set(normalizeMealPlanTimeSlotForKey(row.timeSlot), row)
    }
    indexed.set(ymd, slotMap)
  }
  return indexed
}

function resolveExistingRow(
  ymd: string,
  slotIndex: number,
  timeSlot: string,
  byPlanSlot: Map<string, Map<number, ExistingItemRow>>,
  byTimeSlot: Map<string, Map<string, ExistingItemRow>>,
  rowsByDate: Map<string, ExistingItemRow[]>,
  usedRowIds: Set<number>
): ExistingItemRow | undefined {
  const pick = (row: ExistingItemRow | undefined) =>
    row && !usedRowIds.has(row.id) ? row : undefined
  let row = pick(byPlanSlot.get(ymd)?.get(slotIndex))
  if (row) return row
  row = pick(byTimeSlot.get(ymd)?.get(normalizeMealPlanTimeSlotForKey(timeSlot)))
  if (row) return row
  const onDate = rowsByDate.get(ymd) ?? []
  return onDate.find((r) => !usedRowIds.has(r.id))
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
    orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
  })

  const rowsByDate = groupExistingRowsByDateYmd(existingRows)
  const planTimeSlots = parseMealPlanTimeSlots(mealPlanRow.timeSlots)
  const existingByPlanSlot = indexExistingByPlanSlotOrder(rowsByDate, planTimeSlots)
  const existingByTimeSlot = indexExistingByDateTimeSlot(rowsByDate)
  const activeByDate = new Map<string, number>()
  let activeCount = 0
  for (const row of existingRows) {
    if (!isActiveRow(row)) continue
    activeCount++
    const ymd = mealPlanDateYmd(row.date)
    activeByDate.set(ymd, (activeByDate.get(ymd) ?? 0) + 1)
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
            throw new Error(
              `${ymd} is after the plan end date (${planEnd}).`
            )
          }

          const slotIndex = data.slotIndex
          const timeSlot = data.timeSlot.trim()
          let existingRow = resolveExistingRow(
            ymd,
            slotIndex,
            timeSlot,
            existingByPlanSlot,
            existingByTimeSlot,
            rowsByDate,
            usedExistingRowIds
          )

          if (totalMealsCap > 0 && !existingRow) {
            const overCap = activeCount + 1 > totalMealsCap
            const allowWhenAtCapButContractLeft =
              mealPlanRow.remainingMeals != null &&
              mealPlanRow.remainingMeals > 0 &&
              activeCount <= totalMealsCap
            if (overCap && !allowWhenAtCapButContractLeft) {
              throw new Error(
                `Plan allows at most ${totalMealsCap} active meals.`
              )
            }
          }

          if (mealPlanRow.mealsPerDay > 0 && !existingRow) {
            const onDate = activeByDate.get(ymd) ?? 0
            if (onDate >= mealPlanRow.mealsPerDay) {
              existingRow = (rowsByDate.get(ymd) ?? []).find(
                (r) => !usedExistingRowIds.has(r.id)
              )
              if (!existingRow) {
                throw new Error(
                  `${ymd} already has ${mealPlanRow.mealsPerDay} active meal(s).`
                )
              }
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
            const row = await tx.mealPlanItem.update({
              where: { id: existingRow.id },
              data: rowPayload,
            })
            const nowActive = isActiveRow(row)
            if (!wasActive && nowActive) {
              activeCount += 1
              activeByDate.set(ymd, (activeByDate.get(ymd) ?? 0) + 1)
            } else if (wasActive && !nowActive) {
              activeCount -= 1
              activeByDate.set(ymd, Math.max(0, (activeByDate.get(ymd) ?? 1) - 1))
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
            activeByDate.set(ymd, (activeByDate.get(ymd) ?? 0) + 1)
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
