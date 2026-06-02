import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { syncMealPlanRemainingMeals } from '@/lib/meal-plan-balance'
import { deliverySnapshotsForItem } from '@/lib/customer-location'

// POST - Mark meal plan item as delivered
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleMealPlans)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam, itemId: itemIdParam } = await params
    const id = parseIdParam(idParam)
    const itemId = parseIdParam(itemIdParam)
    if (id === null || itemId === null) {
      return NextResponse.json({ error: 'Invalid meal plan or item ID' }, { status: 400 })
    }

    const { mealPlanItem, remainingMeals } = await prisma.$transaction(async (tx) => {
      const existing = await tx.mealPlanItem.findFirst({
        where: { id: itemId, mealPlanId: id },
        include: { mealPlan: true },
      })
      if (!existing) {
        throw new Error('NOT_FOUND')
      }

      const snapshots = await deliverySnapshotsForItem(tx, itemId)

      const updated = await tx.mealPlanItem.update({
        where: { id: itemId },
        data: {
          isDelivered: true,
          deliveredAt: new Date(),
          wrongDelivery: false,
          ...snapshots,
        },
        include: {
          mealPlan: true,
        },
      })

      const nextRemaining = (await syncMealPlanRemainingMeals(tx, id)) ?? updated.mealPlan.remainingMeals

      return { mealPlanItem: updated, remainingMeals: nextRemaining }
    })

    return NextResponse.json({
      mealPlanItem,
      remainingMeals,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Meal item not found' }, { status: 404 })
    }
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
    if (!session || !sessionHasPermission(session, PK.moduleMealPlans)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam, itemId: itemIdParam } = await params
    const id = parseIdParam(idParam)
    const itemId = parseIdParam(itemIdParam)
    if (id === null || itemId === null) {
      return NextResponse.json({ error: 'Invalid meal plan or item ID' }, { status: 400 })
    }

    const { mealPlanItem, remainingMeals } = await prisma.$transaction(async (tx) => {
      const existing = await tx.mealPlanItem.findFirst({
        where: { id: itemId, mealPlanId: id },
        include: { mealPlan: true },
      })
      if (!existing) {
        throw new Error('NOT_FOUND')
      }

      const updated = await tx.mealPlanItem.update({
        where: { id: itemId },
        data: {
          isDelivered: false,
          deliveredAt: null,
          wrongDelivery: false,
          deliveredLocation: null,
          deliveredAddress: null,
        },
        include: {
          mealPlan: true,
        },
      })

      const nextRemaining = (await syncMealPlanRemainingMeals(tx, id)) ?? updated.mealPlan.remainingMeals

      return { mealPlanItem: updated, remainingMeals: nextRemaining }
    })

    return NextResponse.json({
      mealPlanItem,
      remainingMeals,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Meal item not found' }, { status: 404 })
    }
    console.error('Error unmarking meal as delivered:', error)
    return NextResponse.json({ error: 'Failed to unmark meal as delivered' }, { status: 500 })
  }
}
