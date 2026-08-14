import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { syncMealPlanRemainingMeals } from '@/lib/meal-plan-balance'
import { deliverySnapshotsForItem } from '@/lib/customer-location'
import {
  countChangeFields,
  logMealPlanError,
  logMealPlanEvent,
  snapshotMealPlanCounts,
} from '@/lib/meal-plan-logger'
import { MealPlanHistoryAction } from '@/lib/meal-plan-history-actions'
import {
  queueMealPlanHistory,
  sessionActorUserId,
} from '@/lib/meal-plan-history'
import { runWithRequestContext } from '@/lib/request-context'

const DELIVER_TX_OPTIONS = { timeout: 60_000 } as const

function queueDeliverLog(params: {
  planId: number
  itemId: number
  remainingMeals: number | null
  event: 'meal_plan_item.delivered' | 'meal_plan_item.undelivered'
  action: string
}): void {
  void (async () => {
    const after = await snapshotMealPlanCounts(prisma, params.planId)
    logMealPlanEvent({
      event: params.event,
      ...countChangeFields(null, after, {
        itemId: params.itemId,
        remainingMeals: params.remainingMeals,
        action: params.action,
      }),
    })
  })().catch((error) => {
    logMealPlanError(`${params.event}_log_failed`, error, {
      planId: params.planId,
      itemId: params.itemId,
    })
  })
}

// POST - Mark meal plan item as delivered
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  return runWithRequestContext(request, async () => {
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
    }, DELIVER_TX_OPTIONS)

    queueMealPlanHistory({
      mealPlanId: id,
      action: MealPlanHistoryAction.delivered,
      itemId,
      actorUserId: sessionActorUserId(session),
      summary: `Meal delivered · remaining ${remainingMeals ?? '—'}`,
    })

    queueDeliverLog({
      planId: id,
      itemId,
      remainingMeals,
      event: 'meal_plan_item.delivered',
      action: 'mark_delivered',
    })

    return NextResponse.json({
      mealPlanItem,
      remainingMeals,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Meal item not found' }, { status: 404 })
    }
    logMealPlanError('meal_plan_item.deliver_failed', error)
    return NextResponse.json({ error: 'Failed to mark meal as delivered' }, { status: 500 })
  }
  })
}

// DELETE - Unmark meal plan item as delivered
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  return runWithRequestContext(request, async () => {
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
    }, DELIVER_TX_OPTIONS)

    queueMealPlanHistory({
      mealPlanId: id,
      action: MealPlanHistoryAction.undelivered,
      itemId,
      actorUserId: sessionActorUserId(session),
      summary: `Meal undelivered · remaining ${remainingMeals ?? '—'}`,
    })

    queueDeliverLog({
      planId: id,
      itemId,
      remainingMeals,
      event: 'meal_plan_item.undelivered',
      action: 'unmark_delivered',
    })

    return NextResponse.json({
      mealPlanItem,
      remainingMeals,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Meal item not found' }, { status: 404 })
    }
    logMealPlanError('meal_plan_item.undeliver_failed', error)
    return NextResponse.json({ error: 'Failed to unmark meal as delivered' }, { status: 500 })
  }
  })
}
