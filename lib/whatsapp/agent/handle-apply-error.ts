import {
  countFillableEmptySlotsOnDate,
  getActiveMealsSummaryForDate,
} from './apply-meal-changes'
import { updateAgentRun } from './audit-log'
import { getOpenPendingAction, setPendingStatus } from './pending-actions'
import { dayAlreadyHasMealsReply, emptySlotApplyFailedReply } from './replies'
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

export function isMealDayFullError(message: string): boolean {
  return parseMealDayFullError(message) != null
}

/** Friendly reply when the day already has the max number of meals. */
export async function handleMealDayFullError(params: {
  runId: number
  conversationId: number
  phoneE164: string
  mealPlanId: number
  errorMessage: string
  fallbackDateYmd?: string
}): Promise<AgentProcessResult | null> {
  const parsed = parseMealDayFullError(params.errorMessage)
  const dateYmd = parsed?.dateYmd ?? params.fallbackDateYmd
  if (!dateYmd) return null

  const existing = await getActiveMealsSummaryForDate(params.mealPlanId, dateYmd)
  const mealsPerDay = parsed?.mealsPerDay ?? Math.max(existing.length, 1)

  const openPending = await getOpenPendingAction(params.conversationId)
  if (openPending) {
    await setPendingStatus(openPending.id, 'CANCELLED')
  }

  let replyBody: string
  if (existing.length === 0) {
    const emptySlots = await countFillableEmptySlotsOnDate(
      params.mealPlanId,
      dateYmd
    )
    replyBody = emptySlotApplyFailedReply(dateYmd, emptySlots)
  } else {
    replyBody = dayAlreadyHasMealsReply(dateYmd, existing, mealsPerDay)
  }
  await sendAgentReply({
    runId: params.runId,
    phoneE164: params.phoneE164,
    conversationId: params.conversationId,
    body: replyBody,
  })
  await updateAgentRun(params.runId, {
    status: 'NEEDS_CONFIRMATION',
    payload: { reason: 'day_already_full', dateYmd },
  })
  return { runId: params.runId, status: 'NEEDS_CONFIRMATION', replyBody }
}
