import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'

// POST - Mark meal plan item as delivered
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam, itemId: itemIdParam } = await params
    const id = parseIdParam(idParam)
    const itemId = parseIdParam(itemIdParam)
    if (id === null || itemId === null) {
      return NextResponse.json({ error: 'Invalid meal plan or item ID' }, { status: 400 })
    }

    // Update meal plan item to mark as delivered
    const mealPlanItem = await prisma.mealPlanItem.update({
      where: { id: itemId },
      data: {
        isDelivered: true,
        deliveredAt: new Date(),
      },
      include: {
        mealPlan: true,
      },
    })

    // Recalculate remaining meals for the meal plan
    const totalMeals = mealPlanItem.mealPlan.totalMeals || 0
    const deliveredCount = await prisma.mealPlanItem.count({
      where: {
        mealPlanId: id,
        isDelivered: true,
        isSkipped: false,
      },
    })
    
    const remainingMeals = Math.max(0, totalMeals - deliveredCount)

    // Update meal plan with new remaining meals count
    await prisma.mealPlan.update({
      where: { id },
      data: {
        remainingMeals: remainingMeals,
      },
    })

    return NextResponse.json({
      mealPlanItem,
      remainingMeals,
    })
  } catch (error) {
    console.error('Error marking meal as delivered:', error)
    return NextResponse.json({ error: 'Failed to mark meal as delivered' }, { status: 500 })
  }
}

// DELETE - Unmark meal plan item as delivered
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam, itemId: itemIdParam } = await params
    const id = parseIdParam(idParam)
    const itemId = parseIdParam(itemIdParam)
    if (id === null || itemId === null) {
      return NextResponse.json({ error: 'Invalid meal plan or item ID' }, { status: 400 })
    }

    // Update meal plan item to unmark as delivered
    const mealPlanItem = await prisma.mealPlanItem.update({
      where: { id: itemId },
      data: {
        isDelivered: false,
        deliveredAt: null,
      },
      include: {
        mealPlan: true,
      },
    })

    // Recalculate remaining meals for the meal plan
    const totalMeals = mealPlanItem.mealPlan.totalMeals
    if (totalMeals !== null && totalMeals > 0) {
      const deliveredCount = await prisma.mealPlanItem.count({
        where: {
          mealPlanId: id,
          isDelivered: true,
          isSkipped: false,
        },
      })
      
      const remainingMeals = Math.max(0, totalMeals - deliveredCount)

      // Update meal plan with new remaining meals count
      await prisma.mealPlan.update({
        where: { id },
        data: {
          remainingMeals: remainingMeals,
        },
      })

      return NextResponse.json({
        mealPlanItem,
        remainingMeals,
      })
    }

    return NextResponse.json({
      mealPlanItem,
      remainingMeals: mealPlanItem.mealPlan.remainingMeals,
    })
  } catch (error) {
    console.error('Error unmarking meal as delivered:', error)
    return NextResponse.json({ error: 'Failed to unmark meal as delivered' }, { status: 500 })
  }
}

