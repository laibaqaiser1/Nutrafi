import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'
import { syncMealPlanRemainingMeals } from '@/lib/meal-plan-balance'
import { deliverySnapshotsForItem } from '@/lib/customer-location'

// POST - Mark multiple meal plan items as delivered (batch)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleKitchenPlanning)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const rawIds = Array.isArray(body.itemIds) ? body.itemIds : []
    const itemIds = rawIds
      .map((id: unknown) => (typeof id === 'number' ? id : typeof id === 'string' ? parseInt(String(id), 10) : null))
      .filter((id: number | null): id is number => id != null && !Number.isNaN(id) && id >= 1)

    if (itemIds.length === 0) {
      return NextResponse.json({ error: 'No valid item IDs provided' }, { status: 400 })
    }

    const items = await prisma.mealPlanItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, mealPlanId: true, isSkipped: true, isDelivered: true },
    })

    if (items.length === 0) {
      return NextResponse.json({ error: 'No matching items found' }, { status: 404 })
    }

    const idsToUpdate = items.map((i) => i.id)

    await prisma.$transaction(async (tx) => {
      const deliveredAt = new Date()
      for (const itemId of idsToUpdate) {
        const snapshots = await deliverySnapshotsForItem(tx, itemId)
        await tx.mealPlanItem.update({
          where: { id: itemId },
          data: {
            isDelivered: true,
            deliveredAt,
            ...snapshots,
          },
        })
      }

      const planIds = [...new Set(items.map((i) => i.mealPlanId))]
      for (const mealPlanId of planIds) {
        await syncMealPlanRemainingMeals(tx, mealPlanId)
      }
    })

    const affectedMealPlanIds = [...new Set(items.map((i) => i.mealPlanId))]

    return NextResponse.json({
      updated: idsToUpdate.length,
      mealPlansUpdated: affectedMealPlanIds.length,
    })
  } catch (error) {
    console.error('Error in batch deliver:', error)
    return NextResponse.json({ error: 'Failed to mark meals as delivered' }, { status: 500 })
  }
}
