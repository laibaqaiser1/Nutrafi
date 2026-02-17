import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { eachDayOfInterval, format } from 'date-fns'

const mealPlanSchema = z.object({
  customerId: z.string(),
  planId: z.string().optional(),
  planType: z.enum(['WEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
  startDate: z.string().transform((str) => str ? new Date(str) : null).optional().nullable(),
  endDate: z.string().transform((str) => str ? new Date(str) : null).optional().nullable(),
  days: z.number().int().min(1).optional(),
  mealsPerDay: z.number().int().min(1).max(5),
  // timeSlots removed - not stored in meal plan, only used in UI to set deliveryTime
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']).default('ACTIVE'),
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
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const skip = (page - 1) * limit

    const where: any = {}
    if (customerId) where.customerId = customerId
    // Default to showing only ACTIVE meal plans if no status filter is provided
    if (status) {
      where.status = status
    } else {
      where.status = 'ACTIVE' // Only show active meal plans by default
    }

    // Get total count
    const total = await prisma.mealPlan.count({ where })

    // Get paginated meal plans with distinct results
    const mealPlans = await prisma.mealPlan.findMany({
      where,
      include: {
        customer: true,
        plan: true,
        _count: {
          select: { mealPlanItems: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      distinct: ['id'], // Ensure no duplicates
    })

    // Recalculate remaining meals for each meal plan
    const mealPlansWithRecalculatedRemaining = await Promise.all(
      mealPlans.map(async (plan) => {
        if (plan.totalMeals !== null && plan.totalMeals > 0) {
          const deliveredCount = await prisma.mealPlanItem.count({
            where: {
              mealPlanId: plan.id,
              isDelivered: true,
              isSkipped: false,
            },
          })
          
          const remainingMeals = Math.max(0, plan.totalMeals - deliveredCount)
          
          // Update if different from stored value
          if (remainingMeals !== plan.remainingMeals) {
            await prisma.mealPlan.update({
              where: { id: plan.id },
              data: { remainingMeals },
            })
            return { ...plan, remainingMeals }
          }
        }
        return plan
      })
    )

    return NextResponse.json({
      mealPlans: mealPlansWithRecalculatedRemaining,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
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

    // timeSlots are not used here - meal items are created separately when dishes are assigned

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

    // Calculate total meals based on plan configuration (days * mealsPerDay)
    // Use provided totalMeals if given, otherwise calculate from days * mealsPerDay
    const totalMeals = data.totalMeals || (days > 0 ? days * data.mealsPerDay : 0)

    // Calculate remaining meals (initially equals total meals since none are delivered yet)
    const remainingMeals = totalMeals

    // Create meal plan (timeSlots not stored - meal items are created separately when dishes are assigned)
    const mealPlanData: any = {
      customerId: data.customerId,
      planId: data.planId,
      planType: planType,
      days: days,
      mealsPerDay: data.mealsPerDay,
      // timeSlots is NOT stored in meal plan - it's only used in the UI to set deliveryTime when creating meal items
      status: data.status,
      notes: data.notes,
      totalMeals: totalMeals,
      remainingMeals: remainingMeals,
    }
    
    // Only include dates if provided
    if (data.startDate) {
      mealPlanData.startDate = data.startDate
    }
    if (data.endDate) {
      mealPlanData.endDate = data.endDate
    }
    
    const mealPlan = await prisma.mealPlan.create({
      data: mealPlanData,
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

