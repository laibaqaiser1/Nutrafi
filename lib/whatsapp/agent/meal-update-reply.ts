import { prisma } from '@/lib/prisma'
import {
  getActiveMealsSummaryForDate,
  getActiveMealsSummaryForDates,
} from './apply-meal-changes'
import { createPendingAction } from './pending-actions'
import { mealsAddedConfirmation, nextMealPrompt } from './replies'
import { sendAgentReply } from './record-outbound'
import { updateAgentRun } from './audit-log'
import type { AgentProcessResult } from './types'

/**
 * After applying meal(s), either ask for the next meal slot or confirm the full day.
 */
export async function replyAfterMealsApplied(params: {
  runId: number
  conversationId: number
  phoneE164: string
  mealPlanId: number
  customerId?: number
  mealsPerDay?: number
  touchedDateYmds: string[]
  /** When finishing a batch pending flow, confirm from slot state if DB summary lags. */
  batchAppliedMeals?: Array<{
    dateYmd: string
    dishName: string | null
    slotIndex: number
  }>
}): Promise<AgentProcessResult> {
  const uniqueDates = [...new Set(params.touchedDateYmds)]

  let mealsPerDay = params.mealsPerDay ?? 1
  if (params.mealsPerDay == null) {
    const plan = await prisma.mealPlan.findUnique({
      where: { id: params.mealPlanId },
      select: { mealsPerDay: true },
    })
    mealsPerDay = plan?.mealsPerDay ?? 1
  }

  if (
    params.batchAppliedMeals != null &&
    params.batchAppliedMeals.length >= mealsPerDay &&
    uniqueDates.length === 1
  ) {
    await prisma.whatsAppPendingAction.updateMany({
      where: { conversationId: params.conversationId, status: 'OPEN' },
      data: { status: 'CANCELLED' },
    })

    const fromDb = await getActiveMealsSummaryForDates(
      params.mealPlanId,
      uniqueDates
    )
    const allMeals = fromDb.length > 0 ? fromDb : params.batchAppliedMeals
    const replyBody = mealsAddedConfirmation(allMeals)

    await sendAgentReply({
      runId: params.runId,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(params.runId, {
      status: 'SUCCESS',
      payload: { applied: allMeals },
    })
    return { runId: params.runId, status: 'SUCCESS', replyBody }
  }

  for (const dateYmd of uniqueDates) {
    const onDate = await getActiveMealsSummaryForDate(params.mealPlanId, dateYmd)
    if (onDate.length < mealsPerDay) {
      await createPendingAction({
        conversationId: params.conversationId,
        customerId: params.customerId,
        mealPlanId: params.mealPlanId,
        createdFromRunId: params.runId,
        type: 'MEAL_BATCH',
        context: {
          intent: 'ADD_MEALS',
          meals: [],
          currentQuestionIndex: 0,
          awaitingNextMeal: {
            dateYmd,
            mealsPerDay,
          },
        },
      })

      const replyBody = nextMealPrompt(
        dateYmd,
        onDate.length,
        mealsPerDay,
        onDate.map((m) => m.dishName).filter((n): n is string => Boolean(n))
      )

      await sendAgentReply({
        runId: params.runId,
        phoneE164: params.phoneE164,
        conversationId: params.conversationId,
        body: replyBody,
      })
      await updateAgentRun(params.runId, {
        status: 'NEEDS_CONFIRMATION',
        payload: {
          reason: 'awaiting_next_meal',
          dateYmd,
          mealsSet: onDate.length,
          mealsPerDay,
        },
      })
      return { runId: params.runId, status: 'NEEDS_CONFIRMATION', replyBody }
    }
  }

  await prisma.whatsAppPendingAction.updateMany({
    where: { conversationId: params.conversationId, status: 'OPEN' },
    data: { status: 'CANCELLED' },
  })

  const allMeals = await getActiveMealsSummaryForDates(
    params.mealPlanId,
    uniqueDates
  )
  const replyBody = mealsAddedConfirmation(allMeals)

  await sendAgentReply({
    runId: params.runId,
    phoneE164: params.phoneE164,
    conversationId: params.conversationId,
    body: replyBody,
  })
  await updateAgentRun(params.runId, {
    status: 'SUCCESS',
    payload: { applied: allMeals },
  })
  return { runId: params.runId, status: 'SUCCESS', replyBody }
}
