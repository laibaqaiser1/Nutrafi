import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { parseIdParam } from '@/lib/parse-id'
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
import { resolveCustomerLocationIdForWrite } from '@/lib/customer-location'
import { z } from 'zod'

const bulkItemSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/)
    .transform((str) => str.slice(0, 10)),
  slotIndex: z.number().int().min(0).optional(),
  timeSlot: z.string().min(1),
  dishId: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10)
      return Number.isNaN(n) ? undefined : n
    })
    .optional(),
  dishName: z.string().optional(),
  dishDescription: z.string().optional(),
  dishCategory: z
    .enum(['BREAKFAST', 'LUNCH', 'DINNER', 'LUNCH_DINNER', 'SNACK', 'SMOOTHIE', 'JUICE'])
    .optional(),
  ingredients: z.string().optional(),
  allergens: z.string().optional(),
  calories: z.number().int().optional(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fats: z.number().optional(),
  price: z.number().optional(),
  deliveryTime: z.string().optional(),
  deliveryType: z.enum(['delivery', 'pickup']).optional(),
  customerLocationId: z
    .union([z.string(), z.number()])
    .transform((v) => {
      if (v === '' || v === null || v === undefined) return undefined
      const n = typeof v === 'number' ? v : parseInt(String(v), 10)
      return Number.isNaN(n) ? undefined : n
    })
    .optional(),
  isSkipped: z.boolean().optional(),
  customNote: z.string().optional(),
})

const bulkSchema = z.object({
  items: z.array(bulkItemSchema).min(1).max(500),
})

function isActiveRow(row: { isSkipped: boolean; wrongDelivery: boolean }): boolean {
  return !row.isSkipped && !row.wrongDelivery
}

function countActiveByDateYmd(
  rows: { date: Date; isSkipped: boolean; wrongDelivery: boolean }[]
): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    if (!isActiveRow(row)) continue
    const key = mealPlanDateYmd(row.date)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}

type ExistingItemRow = {
  id: number
  date: Date
  timeSlot: string
  isSkipped: boolean
  wrongDelivery: boolean
}

function groupExistingRowsByDateYmd(rows: ExistingItemRow[]): Map<string, ExistingItemRow[]> {
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

/** Match import slot index to existing rows using plan time-slot order, then sorted leftovers. */
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid meal plan ID' }, { status: 400 })
    }
    if (!session || !sessionHasPermission(session, PK.moduleMealPlans)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { items } = bulkSchema.parse(body)

    const mealPlanRow = await prisma.mealPlan.findUnique({
      where: { id },
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
    if (!mealPlanRow) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }

    const defaultCustomerLocationId = await resolveCustomerLocationIdForWrite(
      prisma,
      mealPlanRow.customerId,
      undefined
    )

    const dishIds = items
      .map((i) => i.dishId)
      .filter((n): n is number => n != null && n > 0)
    const dishes =
      dishIds.length > 0
        ? await prisma.dish.findMany({ where: { id: { in: [...new Set(dishIds)] } } })
        : []
    const dishById = new Map(dishes.map((d) => [d.id, d]))

    const existingRows = await prisma.mealPlanItem.findMany({
      where: { mealPlanId: id },
      select: {
        id: true,
        date: true,
        timeSlot: true,
        isSkipped: true,
        wrongDelivery: true,
      },
      orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
    })
    const rowsByDate = groupExistingRowsByDateYmd(existingRows)
    const planTimeSlots = parseMealPlanTimeSlots(mealPlanRow.timeSlots)
    const existingByPlanSlot = indexExistingByPlanSlotOrder(rowsByDate, planTimeSlots)
    const existingByTimeSlot = indexExistingByDateTimeSlot(rowsByDate)
    const activeByDate = countActiveByDateYmd(existingRows)
    let activeCount = [...activeByDate.values()].reduce((sum, n) => sum + n, 0)
    const usedExistingRowIds = new Set<number>()
    const totalMealsCap =
      mealPlanRow.totalMeals ?? mealPlanRow.days * mealPlanRow.mealsPerDay
    const planStart = mealPlanRow.startDate
      ? mealPlanDateYmd(mealPlanRow.startDate)
      : ''
    const planEnd =
      planStart && mealPlanRow.days > 0
        ? planEndYmd(planStart, mealPlanRow.days)
        : null

    const result = await withRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const saved = []

          for (const data of items) {
            const ymd = data.date
            if (planEnd && ymd > planEnd) {
              throw new Error(
                `${ymd} is after the plan end date (${planEnd}). Extend plan days to add meals on that date.`
              )
            }
            const slotIndex = data.slotIndex ?? 0
            const creatingSkipped = data.isSkipped === true
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

            if (!creatingSkipped && totalMealsCap > 0 && !existingRow) {
              const overCap = activeCount + 1 > totalMealsCap
              const allowWhenAtCapButContractLeft =
                mealPlanRow.remainingMeals != null &&
                mealPlanRow.remainingMeals > 0 &&
                activeCount <= totalMealsCap
              if (overCap && !allowWhenAtCapButContractLeft) {
                throw new Error(
                  `This plan allows at most ${totalMealsCap} active (non-skipped) meals.`
                )
              }
            }

            if (!creatingSkipped && mealPlanRow.mealsPerDay > 0 && !existingRow) {
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

            const deliveryTime = deliveryTimeFromSlot(timeSlot, data.deliveryTime)
            const dish = data.dishId ? dishById.get(data.dishId) ?? null : null
            const dishData = resolveDishDataForItem(data as MealPlanItemCreateInput, dish)
            let itemLocationId = defaultCustomerLocationId
            if (data.customerLocationId != null) {
              try {
                itemLocationId = await resolveCustomerLocationIdForWrite(
                  tx,
                  mealPlanRow.customerId,
                  data.customerLocationId
                )
              } catch {
                throw new Error('Invalid delivery location for this customer')
              }
            }
            const itemDate = mealPlanDateFromYmd(ymd)
            const rowPayload = {
              date: itemDate,
              timeSlot,
              isSkipped: data.isSkipped ?? false,
              ...dishData,
              deliveryTime: deliveryTime ?? undefined,
              deliveryType: data.deliveryType ?? undefined,
              customerLocationId: itemLocationId,
              customNote:
                data.customNote != null && String(data.customNote).trim() !== ''
                  ? String(data.customNote).trim()
                  : undefined,
            }

            if (existingRow) {
              usedExistingRowIds.add(existingRow.id)
              const wasActive = isActiveRow(existingRow)
              const row = await tx.mealPlanItem.update({
                where: { id: existingRow.id },
                data: rowPayload,
              })
              saved.push(row)
              const nowActive = isActiveRow(row)
              if (!wasActive && nowActive) {
                activeCount += 1
                activeByDate.set(ymd, (activeByDate.get(ymd) ?? 0) + 1)
              } else if (wasActive && !nowActive) {
                activeCount -= 1
                activeByDate.set(ymd, Math.max(0, (activeByDate.get(ymd) ?? 1) - 1))
              }
              continue
            }

            const row = await tx.mealPlanItem.create({
              data: {
                mealPlanId: id,
                ...rowPayload,
              },
            })
            saved.push(row)
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
              })
              rowsByDate.set(ymd, list)
              existingByPlanSlot.set(
                ymd,
                indexExistingByPlanSlotOrder(
                  new Map([[ymd, list]]),
                  planTimeSlots
                ).get(ymd) ?? new Map()
              )
              const tsMap = existingByTimeSlot.get(ymd) ?? new Map()
              tsMap.set(normalizeMealPlanTimeSlotForKey(row.timeSlot), {
                id: row.id,
                date: row.date,
                timeSlot: row.timeSlot,
                isSkipped: row.isSkipped,
                wrongDelivery: row.wrongDelivery,
              })
              existingByTimeSlot.set(ymd, tsMap)
            }
          }

          const remainingMeals = await syncMealPlanRemainingMeals(tx, id)
          return { created: saved, remainingMeals }
        },
        { timeout: 60_000 }
      )
    )

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Failed to save items'
    console.error('Error bulk creating meal plan items:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
