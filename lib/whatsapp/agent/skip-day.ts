import { prisma, withRetry } from '@/lib/prisma'
import { mealPlanDateFromYmd, mealPlanDateYmd } from '@/lib/meal-plan-calendar-date'
import { parseMealPlanTimeSlots } from '@/lib/meal-plan-time-slots'
import { syncMealPlanRemainingMeals } from '@/lib/meal-plan-balance'
import { getDefaultCustomerLocationId } from '@/lib/customer-location'
import { applyConversationTargetDate, resolveConversationTargetDate } from './conversation-target-date'
import { logAgentAction, updateAgentRun } from './audit-log'
import { inferMealDateFromMessage } from './parse-meal-message'
import { setPendingStatus, getOpenPendingAction } from './pending-actions'
import { skipDayConfirmationReply, skipDayNeedsDateReply, skipDayAlreadyDeliveredReply } from './replies'
import type { AgentMealPlanContext } from './resolve-meal-plan'
import { sendAgentReply } from './record-outbound'
import type { AgentProcessResult } from './types'
import {
  SkipDayAlreadyDeliveredError,
  skipAgentMealsForDay,
} from './apply-meal-changes'

const DATE_IN_MESSAGE =
  /\b(tomorrow|today|tommorow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|\d{1,2}[\/\-]\d{1,2})\b/i

/** Customer wants to skip / cancel meals for a specific day (not cancel pending dish choice). */
export function isSkipDayRequest(body: string): boolean {
  const trimmed = body.trim()
  if (!trimmed || !DATE_IN_MESSAGE.test(trimmed)) return false

  if (/\bno meals?\b/i.test(trimmed)) return true
  if (/\bdon'?t want meals?\b/i.test(trimmed)) return true
  if (/\bdo not want meals?\b/i.test(trimmed)) return true

  if (/\bskip\b/i.test(trimmed)) return true

  if (/\bcancel\b/i.test(trimmed)) {
    if (!/^(cancel|never mind|nevermind|stop|forget it)\.?\s*$/i.test(trimmed)) {
      return true
    }
  }

  if (/\b(won'?t|will not|not) be available\b/i.test(trimmed)) return true
  if (/\bnot in (?:the )?office\b/i.test(trimmed)) return true
  if (/\b(unavailable|out of office|away)\b/i.test(trimmed)) return true
  if (/\bcan'?t receive\b/i.test(trimmed)) return true

  return false
}

/** Skip requests with a replacement dish are updates, not full-day skips. */
export function isSkipDayRequestNotUpdate(body: string): boolean {
  if (!isSkipDayRequest(body)) return false
  if (/\b(instead|rather|replace with|change to|swap for|want)\s+[a-z]/i.test(body)) {
    if (!/\bno meals?\b/i.test(body) && !/\bdon'?t want meals?\b/i.test(body)) {
      return false
    }
  }
  return true
}

async function resolveSkipDateYmd(
  conversationId: number,
  body: string
): Promise<string | null> {
  const augmented = await applyConversationTargetDate(conversationId, body)
  const inferred = inferMealDateFromMessage(augmented)
  if (inferred) return inferred.dateYmd

  const target = await resolveConversationTargetDate(conversationId)
  return target?.dateYmd ?? null
}

export async function handleSkipDayRequest(params: {
  runId: number
  conversationId: number
  phoneE164: string
  body: string
  mealPlan: AgentMealPlanContext
}): Promise<AgentProcessResult> {
  const pending = await getOpenPendingAction(params.conversationId)
  if (pending) {
    await setPendingStatus(pending.id, 'CANCELLED')
  }

  const dateYmd = await resolveSkipDateYmd(params.conversationId, params.body)
  if (!dateYmd) {
    const replyBody = skipDayNeedsDateReply()
    await sendAgentReply({
      runId: params.runId,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(params.runId, {
      status: 'NEEDS_CONFIRMATION',
      payload: { reason: 'skip_day_missing_date' },
    })
    return { runId: params.runId, status: 'NEEDS_CONFIRMATION', replyBody }
  }

  try {
    const result = await skipAgentMealsForDay(params.mealPlan.id, dateYmd)

    await logAgentAction({
      runId: params.runId,
      actionType: 'SKIP_DAY',
      status: 'OK',
      input: { body: params.body, dateYmd },
      output: result,
    })

    const replyBody = skipDayConfirmationReply(
      dateYmd,
      params.mealPlan.mealsPerDay,
      result.alreadyFullySkipped
    )

    await sendAgentReply({
      runId: params.runId,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })

    await updateAgentRun(params.runId, {
      status: 'SUCCESS',
      payload: { reason: 'skip_day', ...result },
    })

    return { runId: params.runId, status: 'SUCCESS', replyBody }
  } catch (err) {
    if (err instanceof SkipDayAlreadyDeliveredError) {
      const replyBody = skipDayAlreadyDeliveredReply(
        err.dateYmd,
        err.deliveredCount
      )
      await logAgentAction({
        runId: params.runId,
        actionType: 'SKIP_DAY',
        status: 'FAILED',
        input: { body: params.body, dateYmd: err.dateYmd },
        output: { reason: 'already_delivered', deliveredCount: err.deliveredCount },
      })
      await sendAgentReply({
        runId: params.runId,
        phoneE164: params.phoneE164,
        conversationId: params.conversationId,
        body: replyBody,
      })
      await updateAgentRun(params.runId, {
        status: 'SKIPPED',
        payload: {
          reason: 'skip_day_already_delivered',
          dateYmd: err.dateYmd,
          deliveredCount: err.deliveredCount,
        },
      })
      return { runId: params.runId, status: 'SKIPPED', replyBody }
    }

    const msg = err instanceof Error ? err.message : 'Skip day failed'
    const { errorReply } = await import('./replies')
    const replyBody = errorReply(msg)
    await sendAgentReply({
      runId: params.runId,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(params.runId, { status: 'FAILED', errorMessage: msg })
    return { runId: params.runId, status: 'FAILED', replyBody }
  }
}
