import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { eachDayOfInterval, format } from 'date-fns'

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
  totalMeals: z.number().int().optional(),
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
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = mealPlanSchema.parse(body)

    // Generate dates only if both start and end dates are provided
    let dates: Date[] = []
    if (data.startDate && data.endDate) {
      dates = eachDayOfInterval({
        start: data.startDate,
        end: data.endDate,
      })
    }

    // Calculate days if not provided
    let days = data.days
    if (!days && data.startDate && data.endDate) {
      days = Math.ceil((data.endDate.getTime() - data.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
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

    // Prefer client total (includes skipped days/weeks); fallback = full grid only when omitted
    const gridTotal = days > 0 ? days * data.mealsPerDay : 0
    const totalMeals =
      typeof data.totalMeals === 'number' && Number.isFinite(data.totalMeals) && data.totalMeals >= 0
        ? data.totalMeals
        : gridTotal

    // Calculate remaining meals (initially equals total meals since none are delivered yet)
    const remainingMeals = totalMeals

    const mealPlan = await prisma.mealPlan.create({
      data: {
        planType,
        days,
        mealsPerDay: data.mealsPerDay,
        status: data.status,
        notes: data.notes ?? undefined,
        totalMeals,
        remainingMeals,
        ...(data.startDate ? { startDate: data.startDate } : {}),
        ...(data.endDate ? { endDate: data.endDate } : {}),
        ...(data.timeSlots && data.timeSlots.length > 0 ? { timeSlots: data.timeSlots } : {}),
        customer: { connect: { id: data.customerId } },
        ...(data.planId != null ? { plan: { connect: { id: data.planId } } } : {}),
      },
    })

    // DO NOT create empty meal items here - meal items are created only when dishes are assigned
    // in step 4 of the form via the /api/meal-plans/[id]/items endpoint

    return NextResponse.json(mealPlan, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error creating meal plan:', error)
    return NextResponse.json({ error: 'Failed to create meal plan' }, { status: 500 })
  }
}

