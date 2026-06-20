import {
  applyAgentMealItems,
  type AgentMealApplyItem,
} from './apply-meal-changes'
import { logAgentAction, updateAgentRun } from './audit-log'
import {
  loadCandidatesInOrder,
  resolveDishFromReply,
  resolveDishFromPhrase,
  candidateIdsForDisplay,
  suggestDishesForPhrase,
} from './dish-matcher'
import {
  getOpenPendingAction,
  parsePendingContext,
  setPendingStatus,
  updatePendingContext,
} from './pending-actions'
import { isSupportQuestion } from './classify-intent'
import {
  dishChoiceQuestion,
  mealsAddedConfirmation,
  partialApplyReply,
  askWhichMealsReply,
  supportOnlyReply,
} from './replies'
import { isVagueDishPhrase } from './meal-phrases'
import {
  isBrokenPendingContext,
  looksLikeFreshDishInput,
} from './pending-health'
import { replyAfterMealsApplied } from './meal-update-reply'
import { sendAgentReply } from './record-outbound'
import type { AgentProcessResult } from './types'

export async function handleFollowUpMessage(params: {
  runId: number
  conversationId: number
  phoneE164: string
  body: string
}): Promise<AgentProcessResult> {
  const pending = await getOpenPendingAction(params.conversationId)

  if (!pending || pending.status !== 'OPEN') {
    await updateAgentRun(params.runId, {
      status: 'SKIPPED',
      errorMessage: 'No open pending action',
    })
    return { runId: params.runId, status: 'SKIPPED' }
  }

  const ctx = parsePendingContext(pending.context)
  if (!ctx) {
    await setPendingStatus(pending.id, 'CANCELLED')
    await updateAgentRun(params.runId, {
      status: 'FAILED',
      errorMessage: 'Invalid pending context',
    })
    return { runId: params.runId, status: 'FAILED' }
  }

  const idx = ctx.currentQuestionIndex
  const slot = ctx.meals[idx]
  if (!slot || slot.status !== 'waiting_dish') {
    await updateAgentRun(params.runId, {
      status: 'FAILED',
      errorMessage: 'No waiting slot',
    })
    return { runId: params.runId, status: 'FAILED' }
  }

  const candidateIds = slot.candidateDishIds ?? []
  const loadedCandidates = await loadCandidatesInOrder(candidateIds)
  const broken =
    isBrokenPendingContext(ctx) ||
    (candidateIds.length > 0 && loadedCandidates.length === 0)

  if (broken && looksLikeFreshDishInput(params.body)) {
    await setPendingStatus(pending.id, 'CANCELLED')
    const direct = await resolveDishFromPhrase(params.body.trim())
    if (direct.status === 'resolved' && direct.dishId && pending.mealPlanId) {
      slot.status = 'resolved'
      slot.resolvedDishId = direct.dishId
      slot.resolvedDishName = direct.dishName
      slot.customerPhrase = params.body.trim()

      const applyItems: AgentMealApplyItem[] = [
        {
          dateYmd: slot.dateYmd,
          slotIndex: slot.slotIndex,
          timeSlot: slot.timeSlot,
          dishId: direct.dishId,
          dishName: direct.dishName,
          customNote: slot.customNote,
        },
      ]

      try {
        await applyAgentMealItems(pending.mealPlanId, applyItems)
        await logAgentAction({
          runId: params.runId,
          actionType: 'APPLY_MEAL',
          status: 'OK',
          input: applyItems[0],
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Apply failed'
        await updateAgentRun(params.runId, { status: 'FAILED', errorMessage: msg })
        return { runId: params.runId, status: 'FAILED' }
      }

      await setPendingStatus(pending.id, 'COMPLETED')
      return replyAfterMealsApplied({
        runId: params.runId,
        conversationId: params.conversationId,
        phoneE164: params.phoneE164,
        mealPlanId: pending.mealPlanId,
        customerId: pending.customerId ?? undefined,
        touchedDateYmds: [slot.dateYmd],
      })
    }
  }

  let resolution = candidateIds.length > 0
    ? await resolveDishFromReply(params.body, candidateIds)
    : null

  if (
    (!resolution || resolution.status !== 'resolved' || !resolution.dishId) &&
    (candidateIds.length === 0 || loadedCandidates.length === 0 || broken) &&
    looksLikeFreshDishInput(params.body)
  ) {
    const direct = await resolveDishFromPhrase(params.body)
    if (direct.status === 'resolved' && direct.dishId) {
      resolution = direct
    } else if (direct.status === 'needs_confirm' && direct.candidates.length > 0) {
      slot.candidateDishIds = candidateIdsForDisplay(direct.candidates)
      slot.customerPhrase = params.body.trim()
      await updatePendingContext(pending.id, ctx)
      resolution = null
    }
  }

  await logAgentAction({
    runId: params.runId,
    actionType: 'MATCH_DISH_FOLLOWUP',
    status: resolution?.status === 'resolved' ? 'OK' : 'PENDING_CONFIRM',
    input: { reply: params.body, candidateIds },
    output: resolution ?? undefined,
    confidence: resolution?.confidence,
  })

  if (!resolution || resolution.status !== 'resolved' || !resolution.dishId) {
    if (isSupportQuestion(params.body)) {
      const replyBody = supportOnlyReply()
      await sendAgentReply({
        runId: params.runId,
        phoneE164: params.phoneE164,
        conversationId: params.conversationId,
        body: replyBody,
      })
      await updateAgentRun(params.runId, {
        status: 'SKIPPED',
        payload: { reason: 'support_question_during_pending' },
      })
      return { runId: params.runId, status: 'SKIPPED', replyBody }
    }

    const candidates =
      slot.candidateDishIds && slot.candidateDishIds.length > 0
        ? await loadCandidatesInOrder(slot.candidateDishIds)
        : await suggestDishesForPhrase(params.body.trim())

    if (
      candidates.length > 0 &&
      !isVagueDishPhrase(slot.customerPhrase) &&
      looksLikeFreshDishInput(params.body)
    ) {
      slot.candidateDishIds = candidateIdsForDisplay(candidates)
      slot.customerPhrase = params.body.trim()
      await updatePendingContext(pending.id, ctx)
      const question = dishChoiceQuestion(slot, candidates, ctx.meals.length || 2)
      await sendAgentReply({
        runId: params.runId,
        phoneE164: params.phoneE164,
        conversationId: params.conversationId,
        body: question,
      })
      await updateAgentRun(params.runId, {
        status: 'NEEDS_CONFIRMATION',
        payload: { followUp: resolution, reason: 'dish_suggestions' },
      })
      return { runId: params.runId, status: 'NEEDS_CONFIRMATION', replyBody: question }
    }

    const question =
      candidates.length === 0 || isVagueDishPhrase(slot.customerPhrase)
        ? askWhichMealsReply(slot.dateYmd, ctx.meals.length || 2)
        : dishChoiceQuestion(slot, candidates, ctx.meals.length || 2)
    const replyBody =
      candidates.length === 0 || isVagueDishPhrase(slot.customerPhrase)
        ? question
        : partialApplyReply(0, question)
    await sendAgentReply({
      runId: params.runId,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(params.runId, {
      status: 'NEEDS_CONFIRMATION',
      payload: { followUp: resolution },
    })
    return { runId: params.runId, status: 'NEEDS_CONFIRMATION', replyBody }
  }

  slot.status = 'resolved'
  slot.resolvedDishId = resolution.dishId
  slot.resolvedDishName = resolution.dishName

  const mealPlanId = pending.mealPlanId
  if (!mealPlanId) {
    await updateAgentRun(params.runId, {
      status: 'FAILED',
      errorMessage: 'No meal plan on pending',
    })
    return { runId: params.runId, status: 'FAILED' }
  }

  const applyItems: AgentMealApplyItem[] = [
    {
      dateYmd: slot.dateYmd,
      slotIndex: slot.slotIndex,
      timeSlot: slot.timeSlot,
      dishId: resolution.dishId,
      dishName: resolution.dishName,
      customNote: slot.customNote,
    },
  ]

  try {
    const applied = await applyAgentMealItems(mealPlanId, applyItems)
    for (const row of applied) {
      slot.status = 'applied'
      slot.mealPlanItemId = row.mealPlanItemId
      await logAgentAction({
        runId: params.runId,
        actionType: 'APPLY_MEAL',
        status: 'OK',
        input: applyItems[0],
        beforeSnapshot: row.before,
        afterSnapshot: row.after,
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Apply failed'
    await updateAgentRun(params.runId, { status: 'FAILED', errorMessage: msg })
    return { runId: params.runId, status: 'FAILED' }
  }

  const nextIdx = ctx.meals.findIndex((m) => m.status === 'waiting_dish')
  ctx.currentQuestionIndex = nextIdx >= 0 ? nextIdx : idx
  await updatePendingContext(pending.id, ctx)

  if (nextIdx >= 0) {
    const nextSlot = ctx.meals[nextIdx]!
    const candidates = await loadCandidatesInOrder(
      nextSlot.candidateDishIds ?? []
    )
    const question = dishChoiceQuestion(nextSlot, candidates, ctx.meals.length || 2)
    const replyBody = partialApplyReply(1, question)
    await sendAgentReply({
      runId: params.runId,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(params.runId, {
      status: 'PARTIAL',
      payload: { pendingId: pending.id, ctx },
    })
    return { runId: params.runId, status: 'PARTIAL', replyBody }
  }

  await setPendingStatus(pending.id, 'COMPLETED')
  return replyAfterMealsApplied({
    runId: params.runId,
    conversationId: params.conversationId,
    phoneE164: params.phoneE164,
    mealPlanId,
    customerId: pending.customerId ?? undefined,
    touchedDateYmds: [...new Set(ctx.meals.map((m) => m.dateYmd))],
  })
}

export async function handleCancelPending(params: {
  runId: number
  conversationId: number
  phoneE164: string
}): Promise<AgentProcessResult> {
  const pending = await getOpenPendingAction(params.conversationId)
  if (pending) {
    await setPendingStatus(pending.id, 'CANCELLED')
  }
  const { cancelReply } = await import('./replies')
  const replyBody = cancelReply()
  await sendAgentReply({
    runId: params.runId,
    phoneE164: params.phoneE164,
    conversationId: params.conversationId,
    body: replyBody,
  })
  await updateAgentRun(params.runId, {
    status: 'SKIPPED',
    payload: { cancelled: true },
  })
  return { runId: params.runId, status: 'SKIPPED', replyBody }
}
