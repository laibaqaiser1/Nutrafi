import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const mealPlanUpdateSchema = z.object({
  planId: z.string().optional(),
  planType: z.enum(['WEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
  startDate: z.string().transform((str) => str ? new Date(str) : null).optional().nullable(),
  endDate: z.string().transform((str) => str ? new Date(str) : null).optional().nullable(),
  mealsPerDay: z.number().int().min(1).max(5).optional(),
  timeSlots: z.string().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']).optional(),
  notes: z.string().optional(),
})

// GET - Get meal plan with items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    const { id } = await params
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

    // Recalculate remaining meals: total meals minus delivered meals
    if (mealPlan.totalMeals !== null && mealPlan.totalMeals > 0) {
      const deliveredCount = await prisma.mealPlanItem.count({
        where: {
          mealPlanId: id,
          isDelivered: true,
          isSkipped: false,
        },
      })
      
      const remainingMeals = Math.max(0, mealPlan.totalMeals - deliveredCount)
      
      // Update if different from stored value
      if (remainingMeals !== mealPlan.remainingMeals) {
        const updatedMealPlan = await prisma.mealPlan.update({
          where: { id },
          data: { remainingMeals },
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
        return NextResponse.json(updatedMealPlan)
      }
    }

    return NextResponse.json(mealPlan)
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
    const { id } = await params
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = mealPlanUpdateSchema.parse(body)

    // Use UncheckedUpdateInput to allow setting planId directly
    const updateData: {
      planId?: string | null
      planType?: 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
      startDate?: Date | null
      endDate?: Date | null
      mealsPerDay?: number
      timeSlots?: string
      status?: string
      notes?: string | null
    } = {}
    
    if (data.planId !== undefined) {
      // planId can be set directly - empty string or null means custom plan (no predefined plan)
      updateData.planId = data.planId === '' || data.planId === null ? null : data.planId
    }
    if (data.planType !== undefined) updateData.planType = data.planType
    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate === null ? null : data.startDate
    }
    if (data.endDate !== undefined) {
      updateData.endDate = data.endDate === null ? null : data.endDate
    }
    if (data.mealsPerDay !== undefined) updateData.mealsPerDay = data.mealsPerDay
    if (data.timeSlots !== undefined) updateData.timeSlots = data.timeSlots
    if (data.status !== undefined) updateData.status = data.status
    if (data.notes !== undefined) updateData.notes = data.notes

    const mealPlan = await prisma.mealPlan.update({
      where: { id },
      data: updateData as any, // Type assertion to allow UncheckedUpdateInput
      include: {
        customer: true,
        plan: true,
      },
    })

    return NextResponse.json(mealPlan)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error updating meal plan:', error)
    return NextResponse.json({ error: 'Failed to update meal plan' }, { status: 500 })
  }
}

