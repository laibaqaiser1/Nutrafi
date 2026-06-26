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
import { isVagueDishPhrase, normalizeCustomerPhrase } from './meal-phrases'
import { MAX_MEAL_QUANTITY, parseQuantityPhrase } from './meal-quantities'
import {
  isAwaitingMealNames,
  isBrokenPendingContext,
  looksLikeFreshDishInput,
} from './pending-health'
import { replyAfterMealsApplied } from './meal-update-reply'
import { handleMealDayFullError } from './handle-apply-error'
import { sendAgentReply } from './record-outbound'
import type { AgentProcessResult, PendingBatchContext, PendingMealSlot } from './types'

function applyQuantityResolutionToPending(params: {
  ctx: PendingBatchContext
  slot: PendingMealSlot
  dishId: number
  dishName: string | null | undefined
  reply: string
}): void {
  const { count, phrase } = parseQuantityPhrase(params.reply)
  const normalizedPhrase = normalizeCustomerPhrase(
    phrase || params.reply.trim()
  )

  params.slot.status = 'resolved'
  params.slot.resolvedDishId = params.dishId
  params.slot.resolvedDishName = params.dishName ?? undefined
  params.slot.customerPhrase = normalizedPhrase

  for (const meal of params.ctx.meals) {
    if (meal === params.slot || meal.status !== 'waiting_dish') continue
    if (normalizeCustomerPhrase(meal.customerPhrase) === normalizedPhrase) {
      meal.status = 'resolved'
      meal.resolvedDishId = params.dishId
      meal.resolvedDishName = params.dishName ?? undefined
      meal.customerPhrase = normalizedPhrase
    }
  }

  let resolvedCount = params.ctx.meals.filter(
    (meal) =>
      meal.status === 'resolved' &&
      meal.resolvedDishId === params.dishId &&
      normalizeCustomerPhrase(meal.customerPhrase) === normalizedPhrase
  ).length

  const targetCount = Math.min(Math.max(count, 1), MAX_MEAL_QUANTITY)
  while (resolvedCount < targetCount) {
    const maxIdx = Math.max(...params.ctx.meals.map((meal) => meal.slotIndex), -1)
    params.ctx.meals.push({
      dateYmd: params.slot.dateYmd,
      slotIndex: maxIdx + 1,
      timeSlot: params.slot.timeSlot,
      customerPhrase: normalizedPhrase,
      status: 'resolved',
      resolvedDishId: params.dishId,
      resolvedDishName: params.dishName ?? undefined,
    })
    resolvedCount++
  }
}

function alignSlotsToTargetDate(ctx: PendingBatchContext): void {
  if (!ctx.targetDateYmd) return
  for (const slot of ctx.meals) {
    slot.dateYmd = ctx.targetDateYmd
  }
}

function resolvedSlotsForApply(ctx: PendingBatchContext): PendingMealSlot[] {
  return ctx.meals.filter(
    (m) =>
      m.status === 'resolved' &&
      m.resolvedDishId != null &&
      m.mealPlanItemId == null
  )
}

async function applyResolvedPendingMeals(params: {
  runId: number
  conversationId: number
  phoneE164: string
  mealPlanId: number
  ctx: PendingBatchContext
}): Promise<AgentProcessResult | null> {
  const slots = resolvedSlotsForApply(params.ctx)
  if (slots.length === 0) return null

  const applyItems: AgentMealApplyItem[] = slots.map((slot) => ({
    dateYmd: slot.dateYmd,
    slotIndex: slot.slotIndex,
    timeSlot: slot.timeSlot,
    dishId: slot.resolvedDishId!,
    dishName: slot.resolvedDishName,
    customNote: slot.customNote,
  }))

  try {
    const applied = await applyAgentMealItems(params.mealPlanId, applyItems)
    for (const row of applied) {
      const slot = params.ctx.meals.find(
        (s) => s.dateYmd === row.dateYmd && s.slotIndex === row.slotIndex
      )
      if (slot) {
        slot.status = 'applied'
        slot.mealPlanItemId = row.mealPlanItemId
      }
      await logAgentAction({
        runId: params.runId,
        actionType: 'APPLY_MEAL',
        status: 'OK',
        input: applyItems.find(
          (t) => t.dateYmd === row.dateYmd && t.slotIndex === row.slotIndex
        ),
        beforeSnapshot: row.before,
        afterSnapshot: row.after,
      })
    }
    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Apply failed'
    return handleMealDayFullError({
      runId: params.runId,
      conversationId: params.conversationId,
      phoneE164: params.phoneE164,
      mealPlanId: params.mealPlanId,
      errorMessage: msg,
      fallbackDateYmd: slots[0]?.dateYmd,
    })
  }
}

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

  alignSlotsToTargetDate(ctx)

  const idx = ctx.currentQuestionIndex
  const slot = ctx.meals[idx]
  if (!slot || slot.status !== 'waiting_dish') {
    if (isAwaitingMealNames(ctx)) {
      await setPendingStatus(pending.id, 'CANCELLED')
      await updateAgentRun(params.runId, {
        status: 'FAILED',
        errorMessage: 'Expected meal names, not dish choice reply',
      })
      return { runId: params.runId, status: 'FAILED' }
    }
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
      applyQuantityResolutionToPending({
        ctx,
        slot,
        dishId: direct.dishId,
        dishName: direct.dishName,
        reply: params.body.trim(),
      })

      alignSlotsToTargetDate(ctx)
      const applyError = await applyResolvedPendingMeals({
        runId: params.runId,
        conversationId: params.conversationId,
        phoneE164: params.phoneE164,
        mealPlanId: pending.mealPlanId,
        ctx,
      })
      if (applyError) return applyError

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

  const trimmedReply = params.body.trim()
  const replyIsNumber = /^\d{1,2}$/.test(trimmedReply)
  const replyLooksFresh = looksLikeFreshDishInput(trimmedReply)
  const staleCandidateList =
    !replyIsNumber &&
    replyLooksFresh &&
    candidateIds.length > 0 &&
    (!resolution ||
      resolution.status !== 'resolved' ||
      (resolution.confidence ?? 0) < 0.65)

  if (
    staleCandidateList ||
    ((!resolution || resolution.status !== 'resolved' || !resolution.dishId) &&
      (candidateIds.length === 0 || loadedCandidates.length === 0 || broken) &&
      replyLooksFresh)
  ) {
    const direct = await resolveDishFromPhrase(trimmedReply)
    if (direct.status === 'resolved' && direct.dishId) {
      resolution = direct
    } else if (direct.status === 'needs_confirm' && direct.candidates.length > 0) {
      slot.candidateDishIds = candidateIdsForDisplay(direct.candidates)
      slot.customerPhrase = trimmedReply
      await updatePendingContext(pending.id, ctx)
      const question = dishChoiceQuestion(
        slot,
        direct.candidates,
        ctx.mealsPerDay ?? (ctx.meals.length || 2)
      )
      await sendAgentReply({
        runId: params.runId,
        phoneE164: params.phoneE164,
        conversationId: params.conversationId,
        body: question,
      })
      await updateAgentRun(params.runId, {
        status: 'NEEDS_CONFIRMATION',
        payload: { followUp: direct, reason: 'refreshed_dish_search' },
      })
      return { runId: params.runId, status: 'NEEDS_CONFIRMATION', replyBody: question }
    } else if (direct.candidates.length > 0) {
      slot.candidateDishIds = candidateIdsForDisplay(direct.candidates)
      slot.customerPhrase = trimmedReply
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
      replyLooksFresh && !replyIsNumber
        ? (await resolveDishFromPhrase(trimmedReply)).candidates
        : slot.candidateDishIds && slot.candidateDishIds.length > 0
          ? await loadCandidatesInOrder(slot.candidateDishIds)
          : await suggestDishesForPhrase(trimmedReply)

    if (
      candidates.length > 0 &&
      !isVagueDishPhrase(slot.customerPhrase) &&
      replyLooksFresh
    ) {
      slot.candidateDishIds = candidateIdsForDisplay(candidates)
      slot.customerPhrase = trimmedReply
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

  applyQuantityResolutionToPending({
    ctx,
    slot,
    dishId: resolution.dishId,
    dishName: resolution.dishName,
    reply: trimmedReply,
  })

  const mealPlanId = pending.mealPlanId
  if (!mealPlanId) {
    await updateAgentRun(params.runId, {
      status: 'FAILED',
      errorMessage: 'No meal plan on pending',
    })
    return { runId: params.runId, status: 'FAILED' }
  }

  alignSlotsToTargetDate(ctx)
  const applyError = await applyResolvedPendingMeals({
    runId: params.runId,
    conversationId: params.conversationId,
    phoneE164: params.phoneE164,
    mealPlanId,
    ctx,
  })
  if (applyError) return applyError

  const nextIdx = ctx.meals.findIndex((m) => m.status === 'waiting_dish')
  ctx.currentQuestionIndex = nextIdx >= 0 ? nextIdx : idx
  await updatePendingContext(pending.id, ctx)

  if (nextIdx >= 0) {
    const nextSlot = ctx.meals[nextIdx]!
    const candidates = await loadCandidatesInOrder(
      nextSlot.candidateDishIds ?? []
    )
    const question = dishChoiceQuestion(nextSlot, candidates, ctx.meals.length || 2)
    const appliedCount = ctx.meals.filter((m) => m.status === 'applied').length
    const replyBody = partialApplyReply(appliedCount, question)
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
