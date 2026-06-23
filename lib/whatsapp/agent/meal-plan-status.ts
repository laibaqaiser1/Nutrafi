import { addDays } from 'date-fns'
import { getActiveMealsSummaryForDate } from './apply-meal-changes'
import { inferMealDateFromMessage, todayInTz, ymdFromDate } from './parse-meal-message'
import { createPendingAction } from './pending-actions'
import { logAgentAction, updateAgentRun } from './audit-log'
import { mealPlanStatusReply } from './replies'
import type { AgentMealPlanContext } from './resolve-meal-plan'
import { sendAgentReply } from './record-outbound'
import type { AgentProcessResult } from './types'

const MEAL_PLAN_STATUS_RE =
  /\b(how many|what'?s left|whats left|remaining|left on (?:my )?plan|meals left|meals remaining|meals do i have|how many meals|any meals left|meals i have left)\b/i

/** Customer asking about plan or day meal counts — not a support redirect. */
export function isMealPlanStatusQuestion(body: string): boolean {
  const trimmed = body.trim()
  if (!trimmed) return false

  const lower = trimmed.toLowerCase()
  if (MEAL_PLAN_STATUS_RE.test(lower) && /\bmeal/.test(lower)) return true
  if (/\bmeals?\s+(remaining|left)\b/i.test(trimmed)) return true
  if (/\bremaining\s+meals?\b/i.test(trimmed)) return true
  if (/\bhow many\b/i.test(trimmed) && /\bmeal/.test(lower)) return true

  return false
}

function defaultStatusDateYmd(body: string): string {
  const inferred = inferMealDateFromMessage(body)
  if (inferred) return inferred.dateYmd
  const today = todayInTz()
  return ymdFromDate(addDays(today, 1))
}

export async function handleMealPlanStatusQuery(params: {
  runId: number
  conversationId: number
  phoneE164: string
  body: string
  customerId: number
  mealPlan: AgentMealPlanContext
}): Promise<AgentProcessResult> {
  const dateYmd = defaultStatusDateYmd(params.body)
  const activeMeals = await getActiveMealsSummaryForDate(
    params.mealPlan.id,
    dateYmd
  )

  await logAgentAction({
    runId: params.runId,
    actionType: 'MEAL_PLAN_STATUS',
    status: 'OK',
    input: { body: params.body, dateYmd },
    output: {
      mealsPerDay: params.mealPlan.mealsPerDay,
      planRemainingMeals: params.mealPlan.remainingMeals,
      activeMeals,
    },
  })

  const replyBody = mealPlanStatusReply({
    dateYmd,
    mealsPerDay: params.mealPlan.mealsPerDay,
    activeMeals,
    planRemainingMeals: params.mealPlan.remainingMeals,
  })

  const slotsOpen = activeMeals.length < params.mealPlan.mealsPerDay

  if (slotsOpen) {
    await createPendingAction({
      conversationId: params.conversationId,
      customerId: params.customerId,
      mealPlanId: params.mealPlan.id,
      createdFromRunId: params.runId,
      type: 'MEAL_BATCH',
      context: {
        intent: 'ADD_MEALS',
        meals: [],
        currentQuestionIndex: 0,
        targetDateYmd: dateYmd,
        mealsPerDay: params.mealPlan.mealsPerDay,
        awaitingNextMeal: {
          dateYmd,
          mealsPerDay: params.mealPlan.mealsPerDay,
        },
      },
    })
  }

  await sendAgentReply({
    runId: params.runId,
    phoneE164: params.phoneE164,
    conversationId: params.conversationId,
    body: replyBody,
  })

  await updateAgentRun(params.runId, {
    status: slotsOpen ? 'NEEDS_CONFIRMATION' : 'SUCCESS',
    payload: {
      reason: 'meal_plan_status',
      dateYmd,
      mealsSet: activeMeals.length,
      mealsPerDay: params.mealPlan.mealsPerDay,
    },
  })

  return {
    runId: params.runId,
    status: slotsOpen ? 'NEEDS_CONFIRMATION' : 'SUCCESS',
    replyBody,
  }
}
