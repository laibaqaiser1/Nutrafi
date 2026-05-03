import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/lib/generated/prisma/client'
import { parseMealPlanTimeSlots } from '@/lib/meal-plan-time-slots'
import { applyMealPlanTimeSlotsToFutureItems } from '@/lib/meal-plan-propagate-times'
import { applyWeeklySkipPatternToExistingItems } from '@/lib/meal-plan-apply-weekly-skips'
import { syncMealPlanRemainingMeals } from '@/lib/meal-plan-balance'
import { normalizeWeeklySkipDays, parseWeeklySkipDaysByWeekJson } from '@/lib/meal-plan-skip-days'
import { z } from 'zod'

/** Never cache: UI must show DB `remainingMeals` as stored (not a stale or recomputed value). */
export const dynamic = 'force-dynamic'

const mealPlanUpdateSchema = z.object({
  planId: z.union([z.string(), z.number()]).transform((v) => {
    if (v === '' || v === null || v === undefined) return null
    const n = typeof v === 'number' ? v : parseInt(String(v), 10)
    return Number.isNaN(n) ? null : n
  }).optional().nullable(),
  planType: z.enum(['WEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
  startDate: z.string().transform((str) => str ? new Date(str) : null).optional().nullable(),
  endDate: z.string().transform((str) => str ? new Date(str) : null).optional().nullable(),
  mealsPerDay: z.number().int().min(1).max(5).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED']).optional(),
  notes: z.string().optional(),
  /** null/NaN (from bad clients) must not clear DB — only a real number updates the contract total */
  totalMeals: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.number().int().min(0).optional()
  ),
  /** Manual balance correction; same rule: never persist null from accidental JSON */
  remainingMeals: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.number().int().min(0).optional()
  ),
  /** Default delivery times for new items; null or [] clears */
  timeSlots: z.array(z.string()).optional().nullable(),
  /** When true (with changed non-empty timeSlots), reassign future non-delivered item times from today */
  propagateTimeSlotsToFutureItems: z.boolean().optional(),
  updateItemDatesFromStartDate: z.boolean().optional(),
  /** Weekday skip list: Mon=1 … Sun=7 (legacy 0=Sun accepted, normalized to 7) */
  weeklySkipDays: z
    .array(z.number().int().min(0).max(7))
    .transform((arr) => normalizeWeeklySkipDays(arr))
    .optional(),
  /** When true with `weeklySkipDays`, mark matching weekdays skipped on all non-delivered items */
  applyWeeklySkipsToExistingItems: z.boolean().optional(),
  /** When true with `applyWeeklySkipsToExistingItems`, also mark delivered matching rows skipped (clears delivery) */
  applyWeeklySkipsToDeliveredItems: z.boolean().optional(),
  /** Plan week index (string) → weekdays to skip (Mon=1 … Sun=7; legacy 0=Sun ok) */
  weeklySkipDaysByWeek: z
    .record(z.string(), z.array(z.number().int().min(0).max(7)))
    .optional()
    .transform((rec) => {
      if (rec === undefined) return undefined
      const out: Record<string, number[]> = {}
      for (const [k, arr] of Object.entries(rec)) {
        if (!/^\d+$/.test(k)) continue
        out[k] = normalizeWeeklySkipDays(arr)
      }
      return out
    }),
})

// GET - Get meal plan with items
export async function GET(
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
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id },
      include: {
        customer: true,
        plan: true,
        mealPlanItems: {
          orderBy: [
            { date: 'asc' },
            { timeSlot: 'asc' },
          ],
        },
        payments: {
          orderBy: {
            paymentDate: 'desc',
          },
        },
      },
    })

    if (!mealPlan) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }

    return NextResponse.json(mealPlan, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Error fetching meal plan:', error)
    return NextResponse.json({ error: 'Failed to fetch meal plan' }, { status: 500 })
  }
}

// PUT - Update meal plan
export async function PUT(
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
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = mealPlanUpdateSchema.parse(body)

    // Fetch current meal plan to get current values
    const currentMealPlan = await prisma.mealPlan.findUnique({
      where: { id },
    })

    if (!currentMealPlan) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }

    // Relational MealPlanUpdateInput (no scalar planId — use plan connect/disconnect)
    const updateData: Prisma.MealPlanUpdateInput = {}

    if (data.planId !== undefined) {
      updateData.plan =
        data.planId === null ? { disconnect: true } : { connect: { id: data.planId } }
    }
    if (data.planType !== undefined) updateData.planType = data.planType
    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate === null ? null : data.startDate
    }
    if (data.endDate !== undefined) {
      updateData.endDate = data.endDate === null ? null : data.endDate
    }

    if (data.startDate !== undefined && data.endDate !== undefined) {
      if (data.startDate && data.endDate) {
        updateData.days =
          Math.ceil(
            (data.endDate.getTime() - data.startDate.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1
      }
    }

    if (data.mealsPerDay !== undefined) updateData.mealsPerDay = data.mealsPerDay
    if (data.status !== undefined) updateData.status = data.status
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.timeSlots !== undefined) {
      const cleared =
        data.timeSlots === null ||
        (Array.isArray(data.timeSlots) && data.timeSlots.length === 0)
      updateData.timeSlots = cleared ? Prisma.DbNull : (data.timeSlots as string[])
    }
    // remainingMeals / totalMeals: only real numbers (never null — avoids JSON NaN→null wiping the row)
    if (typeof data.remainingMeals === 'number') {
      updateData.remainingMeals = data.remainingMeals
    }

    // Contract total: only when the client sends a finite int; item CRUD and other routes never touch this
    if (typeof data.totalMeals === 'number') {
      updateData.totalMeals = data.totalMeals
    }

    if (data.weeklySkipDays !== undefined) {
      updateData.weeklySkipDays = data.weeklySkipDays
    }
    if (data.weeklySkipDaysByWeek !== undefined) {
      updateData.weeklySkipDaysByWeek = data.weeklySkipDaysByWeek as Prisma.InputJsonValue
    }

    const normalizedNewSlots: string[] | null =
      data.timeSlots === undefined
        ? null
        : data.timeSlots === null ||
            (Array.isArray(data.timeSlots) && data.timeSlots.length === 0)
          ? []
          : (data.timeSlots as string[]).map((s) => String(s).trim()).filter(Boolean)

    const oldSlots = parseMealPlanTimeSlots(currentMealPlan.timeSlots)
    const timeSlotsScheduleChanged =
      normalizedNewSlots !== null &&
      JSON.stringify(oldSlots) !== JSON.stringify(normalizedNewSlots)

    const shouldPropagateFutureTimes =
      data.propagateTimeSlotsToFutureItems === true &&
      normalizedNewSlots !== null &&
      normalizedNewSlots.length > 0 &&
      timeSlotsScheduleChanged

    let propagatedTimeSlotsCount = 0
    let appliedWeeklySkipsCount = 0
    let appliedWeeklySkipsDeliveredCount = 0
    const mealPlan = await prisma.$transaction(async (tx) => {
      const m = await tx.mealPlan.update({
        where: { id },
        data: updateData,
        include: {
          customer: true,
          plan: true,
        },
      })
      if (shouldPropagateFutureTimes) {
        propagatedTimeSlotsCount = await applyMealPlanTimeSlotsToFutureItems(
          tx,
          id,
          normalizedNewSlots
        )
      }
      if (data.applyWeeklySkipsToExistingItems === true) {
        const global = normalizeWeeklySkipDays((m.weeklySkipDays as number[]) ?? [])
        const byWeekParsed = parseWeeklySkipDaysByWeekJson(m.weeklySkipDaysByWeek)
        const hasPattern =
          global.length > 0 ||
          Object.values(byWeekParsed).some((a) => Array.isArray(a) && a.length > 0)
        if (hasPattern) {
          const includeDelivered = data.applyWeeklySkipsToDeliveredItems === true
          const result = await applyWeeklySkipPatternToExistingItems(
            tx,
            id,
            m.startDate,
            global,
            m.weeklySkipDaysByWeek,
            { includeDelivered }
          )
          appliedWeeklySkipsCount = result.markedUndelivered + result.markedDelivered
          appliedWeeklySkipsDeliveredCount = result.markedDelivered
          if (result.markedDelivered > 0) {
            await syncMealPlanRemainingMeals(tx, id)
          }
        }
      }
      return m
    })

    // If start date was changed and client asked to align item dates: shift each item by day offset from old start to new start
    if (data.updateItemDatesFromStartDate && data.startDate != null && currentMealPlan.startDate) {
      const oldStart = new Date(currentMealPlan.startDate)
      const newStart = data.startDate
      const dayMs = 24 * 60 * 60 * 1000

      const items = await prisma.mealPlanItem.findMany({
        where: { mealPlanId: id },
      })

      for (const item of items) {
        const itemDate = new Date(item.date)
        const dayOffset = Math.floor((itemDate.getTime() - oldStart.getTime()) / dayMs)
        const newDate = new Date(newStart.getTime() + dayOffset * dayMs)
        await prisma.mealPlanItem.update({
          where: { id: item.id },
          data: { date: newDate },
        })
      }
    }

    return NextResponse.json({
      ...mealPlan,
      propagatedTimeSlotsCount,
      appliedWeeklySkipsCount,
      appliedWeeklySkipsDeliveredCount,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error updating meal plan:', error)
    return NextResponse.json({ error: 'Failed to update meal plan' }, { status: 500 })
  }
}

// DELETE - Remove meal plan (items cascade; payments unlinked so history is kept)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid meal plan ID' }, { status: 400 })
    }
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existing = await prisma.mealPlan.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { mealPlanId: id },
        data: { mealPlanId: null },
      })
      await tx.mealPlan.delete({ where: { id } })
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting meal plan:', error)
    return NextResponse.json({ error: 'Failed to delete meal plan' }, { status: 500 })
  }
}
