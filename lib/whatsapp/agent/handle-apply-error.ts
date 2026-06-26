import {
  countFillableEmptySlotsOnDate,
  getActiveMealsSummaryForDate,
} from './apply-meal-changes'
import { updateAgentRun } from './audit-log'
import { getOpenPendingAction, setPendingStatus } from './pending-actions'
import {
  dayAlreadyHasMealsReply,
  emptySlotApplyFailedReply,
  errorReply,
} from './replies'
import { sendAgentReply } from './record-outbound'
import type { AgentProcessResult } from './types'

export function parseMealDayFullError(
  message: string
): { dateYmd: string; mealsPerDay: number } | null {
  const match = message.match(/^(\d{4}-\d{2}-\d{2}) already has (\d+) active meal\(s\)\./)
  if (!match) return null
  return {
    dateYmd: match[1]!,
    mealsPerDay: parseInt(match[2]!, 10),
  }
}

export function parsePlanCapError(message: string): number | null {
  const match = message.match(/^Plan allows at most (\d+) active meals\./)
  if (!match) return null
  return parseInt(match[1]!, 10)
}

export function isMealDayFullError(message: string): boolean {
  return parseMealDayFullError(message) != null
}

async function cancelOpenPending(conversationId: number): Promise<void> {
  const openPending = await getOpenPendingAction(conversationId)
  if (openPending) {
    await setPendingStatus(openPending.id, 'CANCELLED')
  }
}

/** Friendly reply when the day already has the max number of chosen meals. */
export async function handleMealDayFullError(params: {
  runId: number
  conversationId: number
  phoneE164: string
  mealPlanId: number
  errorMessage: string
  fallbackDateYmd?: string
}): Promise<AgentProcessResult | null> {
  const parsed = parseMealDayFullError(params.errorMessage)
  if (!parsed) return null

  const existing = await getActiveMealsSummaryForDate(
    params.mealPlanId,
    parsed.dateYmd
  )

  await cancelOpenPending(params.conversationId)

  const replyBody = dayAlreadyHasMealsReply(
    parsed.dateYmd,
    existing,
    parsed.mealsPerDay
  )
  await sendAgentReply({
    runId: params.runId,
    phoneE164: params.phoneE164,
    conversationId: params.conversationId,
    body: replyBody,
  })
  await updateAgentRun(params.runId, {
    status: 'NEEDS_CONFIRMATION',
    payload: { reason: 'day_already_full', dateYmd: parsed.dateYmd },
  })
  return { runId: params.runId, status: 'NEEDS_CONFIRMATION', replyBody }
}

/** Route apply failures to the right customer-facing reply. */
export async function handleApplyFailure(params: {
  runId: number
  conversationId: number
  phoneE164: string
  mealPlanId: number
  errorMessage: string
  fallbackDateYmd?: string
}): Promise<AgentProcessResult | null> {
  const dayFull = await handleMealDayFullError(params)
  if (dayFull) return dayFull

  const dateYmd = params.fallbackDateYmd
  const planCap = parsePlanCapError(params.errorMessage)

  if (planCap != null && dateYmd) {
    const emptySlots = await countFillableEmptySlotsOnDate(
      params.mealPlanId,
      dateYmd
    )
    await cancelOpenPending(params.conversationId)
    const replyBody =
      emptySlots > 0
        ? emptySlotApplyFailedReply(dateYmd, emptySlots)
        : errorReply(
            `Your plan is at its limit of ${planCap} active meals. Skip unused days or add meals from the dashboard.`
          )
    await sendAgentReply({
      runId: params.runId,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(params.runId, {
      status: 'NEEDS_CONFIRMATION',
      payload: { reason: 'plan_cap', dateYmd, planCap },
    })
    return { runId: params.runId, status: 'NEEDS_CONFIRMATION', replyBody }
  }

  return null
}
