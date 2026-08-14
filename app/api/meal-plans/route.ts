import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'
import { normalizeWeeklySkipDays } from '@/lib/meal-plan-skip-days'
import { logMealPlanError, logMealPlanEvent } from '@/lib/meal-plan-logger'
import { MealPlanHistoryAction } from '@/lib/meal-plan-history-actions'
import { queueMealPlanHistory, sessionActorUserId } from '@/lib/meal-plan-history'
import { runWithRequestContext } from '@/lib/request-context'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const mealPlanSchema = z.object({
  customerId: z.union([z.string(), z.number()]).transform((v) => {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10)
    if (Number.isNaN(n) || n < 1) throw new z.ZodError([{ code: 'custom', path: ['customerId'], message: 'Invalid customer ID' }])
    return n
  }),
  planId: z.union([z.string(), z.number()]).transform((v) => {
    if (v === '' || v === null || v === undefined) return undefined
    const n = typeof v === 'number' ? v : parseInt(String(v), 10)
    return Number.isNaN(n) ? undefined : n
  }).optional(),
  planType: z.enum(['WEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
  startDate: z.string().transform((str) => str ? new Date(str) : null).optional().nullable(),
  endDate: z.string().transform((str) => str ? new Date(str) : null).optional().nullable(),
  days: z.number().int().min(1).optional(),
  mealsPerDay: z.number().int().min(1).max(5),
  /** Stored on MealPlan; new items use these when timeSlot is omitted */
  timeSlots: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED']).default('ACTIVE'),
  notes: z.string().optional(),
  totalAmount: z.number().optional(),
  /** Contract meal count (e.g. after skipped days). On create, `remainingMeals` is always set equal to this — not read from the client. */
  totalMeals: z.number().int().optional(),
  /** Plan default skip weekdays Mon=1 … Sun=7 (legacy 0=Sun normalized) */
  weeklySkipDays: z
    .array(z.number().int().min(0).max(7))
    .transform((arr) => normalizeWeeklySkipDays(arr))
    .optional(),
})

// GET - List meal plans
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')
    const customerName = searchParams.get('customer')?.trim() || searchParams.get('customerName')?.trim() || ''
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const skip = (page - 1) * limit

    const where: any = {}
    if (customerId) {
      const cid = parseInt(customerId, 10)
      if (!Number.isNaN(cid)) where.customerId = cid
    }
    if (customerName) {
      where.customer = {
        fullName: { contains: customerName, mode: 'insensitive' },
      }
    }
    // Only filter by status when a specific status is requested; otherwise show all
    if (status && ['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED'].includes(status)) {
      where.status = status
    }

    // Get total count
    const total = await prisma.mealPlan.count({ where })

    // Get paginated meal plans with distinct results
    const mealPlans = await prisma.mealPlan.findMany({
      where,
      include: {
        customer: true,
        payments: { select: { amount: true, status: true } },
        _count: {
          select: { mealPlanItems: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      distinct: ['id'], // Ensure no duplicates
    })

    // remainingMeals is stored on each plan and adjusted when deliveries are recorded (not recomputed on list)

    return NextResponse.json(
      {
        mealPlans,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        },
      }
    )
  } catch (error) {
    console.error('Error fetching meal plans:', error)
    return NextResponse.json({ error: 'Failed to fetch meal plans' }, { status: 500 })
  }
}

// POST - Create meal plan and generate meal slots
export async function POST(request: NextRequest) {
  return runWithRequestContext(request, async () => {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleMealPlans)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = mealPlanSchema.parse(body)

    const validDate = (d: Date | null | undefined): d is Date =>
      d instanceof Date && !Number.isNaN(d.getTime())
    const startDate = validDate(data.startDate) ? data.startDate : null
    const endDate = validDate(data.endDate) ? data.endDate : null

    // Calculate days if not provided
    let days = data.days
    if (!days && startDate && endDate) {
      days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    } else if (!days) {
      days = 0 // Default if no dates provided
    }
    
    // Determine plan type if not provided
    let planType: 'WEEKLY' | 'MONTHLY' | 'CUSTOM' = data.planType || 'WEEKLY'
    if (!data.planType) {
      if (days >= 20 && days <= 30) {
        planType = 'MONTHLY'
      } else if (days >= 5 && days <= 7) {
        planType = 'WEEKLY'
      } else {
        planType = 'CUSTOM'
      }
    }

    // One contract total for a new plan: prefer client count (skipped days/weeks); else full grid.
    const gridTotalMeals = days > 0 ? days * data.mealsPerDay : 0
    const clientTotal =
      typeof data.totalMeals === 'number' && Number.isFinite(data.totalMeals) && data.totalMeals >= 0
        ? data.totalMeals
        : null
    const initialContractMeals = Math.max(0, Math.floor(clientTotal ?? gridTotalMeals))

    // Always persist the same value for both — never take remainingMeals from the request body.
    const mealPlan = await prisma.mealPlan.create({
      data: {
        planType,
        days,
        mealsPerDay: data.mealsPerDay,
        status: data.status,
        notes: data.notes ?? undefined,
        totalMeals: initialContractMeals,
        remainingMeals: initialContractMeals,
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(data.timeSlots && data.timeSlots.length > 0 ? { timeSlots: data.timeSlots } : {}),
        ...(data.weeklySkipDays !== undefined ? { weeklySkipDays: data.weeklySkipDays } : {}),
        customer: { connect: { id: data.customerId } },
        ...(data.planId != null ? { plan: { connect: { id: data.planId } } } : {}),
      },
    })

    // DO NOT create empty meal items here - meal items are created only when dishes are assigned
    // in step 4 of the form via the /api/meal-plans/[id]/items endpoint

    logMealPlanEvent({
      event: 'meal_plan.created',
      planId: mealPlan.id,
      customerId: mealPlan.customerId,
      days: mealPlan.days,
      mealsPerDay: mealPlan.mealsPerDay,
      totalMeals: mealPlan.totalMeals,
      remainingMeals: mealPlan.remainingMeals,
      expectedMealCount: initialContractMeals,
      gridTotalMeals,
    })

    queueMealPlanHistory({
      mealPlanId: mealPlan.id,
      action: MealPlanHistoryAction.planCreated,
      actorUserId: sessionActorUserId(session),
      summary: `Plan created · total ${initialContractMeals} · remaining ${initialContractMeals} · ${days} days × ${data.mealsPerDay} meals/day`,
    })

    return NextResponse.json(mealPlan, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    logMealPlanError('meal_plan.create_failed', error)
    return NextResponse.json({ error: 'Failed to create meal plan' }, { status: 500 })
  }
  })
}

