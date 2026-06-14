import { prisma } from '@/lib/prisma'
import {
  applyAgentMealItems,
  type AgentMealApplyItem,
} from './apply-meal-changes'
import { logAgentAction, updateAgentRun } from './audit-log'
import { resolveDishFromReply } from './dish-matcher'
import {
  getOpenPendingAction,
  parsePendingContext,
  setPendingStatus,
  updatePendingContext,
} from './pending-actions'
import {
  dishChoiceQuestion,
  mealsAddedConfirmation,
  partialApplyReply,
} from './replies'
import { sendAgentReply } from './record-outbound'
import type { AgentProcessResult, DishCandidate } from './types'

async function loadCandidates(ids: number[]): Promise<DishCandidate[]> {
  if (ids.length === 0) return []
  const dishes = await prisma.dish.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  })
  const byId = new Map(dishes.map((d) => [d.id, d.name]))
  return ids.map((id, i) => ({
    dishId: id,
    name: byId.get(id) ?? `Option ${i + 1}`,
    score: 0,
  }))
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
  const resolution = await resolveDishFromReply(params.body, candidateIds)

  await logAgentAction({
    runId: params.runId,
    actionType: 'MATCH_DISH_FOLLOWUP',
    status: resolution?.status === 'resolved' ? 'OK' : 'PENDING_CONFIRM',
    input: { reply: params.body, candidateIds },
    output: resolution ?? undefined,
    confidence: resolution?.confidence,
  })

  if (!resolution || resolution.status !== 'resolved' || !resolution.dishId) {
    const candidates = await loadCandidates(candidateIds)
    const question = dishChoiceQuestion(slot, resolution?.candidates ?? candidates)
    const replyBody = partialApplyReply(0, question)
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

  if (nextIdx >= 0) {
    await updatePendingContext(pending.id, ctx)
    const nextSlot = ctx.meals[nextIdx]!
    const candidates = await loadCandidates(nextSlot.candidateDishIds ?? [])
    const question = dishChoiceQuestion(nextSlot, candidates)
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
  const allApplied = ctx.meals
    .filter((m) => m.status === 'applied' || m.status === 'resolved')
    .map((m) => ({
      dateYmd: m.dateYmd,
      dishName: m.resolvedDishName ?? m.customerPhrase,
      slotIndex: m.slotIndex,
    }))
  const replyBody = mealsAddedConfirmation(allApplied)
  await sendAgentReply({
    runId: params.runId,
    phoneE164: params.phoneE164,
    conversationId: params.conversationId,
    body: replyBody,
  })
  await updateAgentRun(params.runId, { status: 'SUCCESS', payload: { ctx } })
  return { runId: params.runId, status: 'SUCCESS', replyBody }
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
