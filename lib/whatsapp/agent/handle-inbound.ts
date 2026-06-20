import { prisma } from '@/lib/prisma'
import { whatsappAgentConfig } from './config'
import {
  inboundMessageAlreadyHandled,
  createAgentRun,
  logAgentAction,
  updateAgentRun,
} from './audit-log'
import { classifyMealIntent } from './classify-intent'
import { findCustomerByPhoneExact } from './find-customer'
import { handleCancelPending, handleFollowUpMessage } from './handle-follow-up'
import { parseMealMessage, inferMealDateFromMessage } from './parse-meal-message'
import { isVagueDishPhrase } from './meal-phrases'
import { resolveDishFromPhrase, candidateIdsForDisplay, loadCandidatesInOrder, suggestDishesForPhrase } from './dish-matcher'
import {
  createPendingAction,
  getOpenPendingAction,
  parsePendingContext,
  setPendingStatus,
} from './pending-actions'
import {
  augmentBodyWithPendingDate,
  isBrokenPendingContext,
  looksLikeFreshDishInput,
} from './pending-health'
import { resolveActiveMealPlanForCustomer } from './resolve-meal-plan'
import {
  applyAgentMealItems,
  findMealItemForReplace,
  type AgentMealApplyItem,
} from './apply-meal-changes'
import {
  ambiguousReply,
  askWhichMealsReply,
  dishChoiceQuestion,
  errorReply,
  farewellReply,
  greetingReply,
  mealsAddedConfirmation,
  noCustomerReply,
  noMealPlanReply,
  openAiUnavailableReply,
  parseFailedReply,
  partialApplyReply,
  supportOnlyReply,
} from './replies'
import { sendAgentReply } from './record-outbound'
import type {
  AgentProcessResult,
  IntentClassification,
  PendingBatchContext,
  PendingMealSlot,
} from './types'
import { detectCasualMessage } from './casual-messages'

export interface InboundAgentParams {
  conversationId: number
  inboundMessageId: number
  phoneE164: string
  body: string
}

function nonMealReply(body: string, classification: IntentClassification): string {
  const casual = detectCasualMessage(body)
  if (casual === 'greeting' || classification.reason === 'greeting') {
    return greetingReply()
  }
  if (casual === 'farewell' || classification.reason === 'farewell') {
    return farewellReply()
  }
  if (classification.intent === 'AMBIGUOUS') {
    return ambiguousReply()
  }
  return supportOnlyReply()
}

export async function processInboundAgentMessage(
  params: InboundAgentParams
): Promise<AgentProcessResult | null> {
  const trimmed = params.body.trim()
  if (!trimmed) return null

  const cfg = whatsappAgentConfig()
  if (!cfg.enabled) {
    await createAgentRun({
      conversationId: params.conversationId,
      inboundMessageId: params.inboundMessageId,
      trigger: 'INBOUND_MESSAGE',
      status: 'SKIPPED',
      rawMessageBody: trimmed,
      errorMessage: 'WhatsApp agent is disabled',
      payload: { reason: 'agent_disabled' },
    })
    return null
  }

  if (await inboundMessageAlreadyHandled(params.inboundMessageId)) {
    return null
  }

  const startedAt = Date.now()
  const timing = (step: string) => {
    if (process.env.WHATSAPP_AGENT_DEBUG_TIMING === 'true') {
      console.info(
        `[whatsapp agent] ${step} +${Date.now() - startedAt}ms msg=${params.inboundMessageId}`
      )
    }
  }

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: params.conversationId },
    select: { agentMode: true },
  })
  if (conversation?.agentMode === 'MANUAL') {
    await createAgentRun({
      conversationId: params.conversationId,
      inboundMessageId: params.inboundMessageId,
      trigger: 'INBOUND_MESSAGE',
      status: 'SKIPPED',
      rawMessageBody: trimmed,
      errorMessage: 'Conversation is in MANUAL mode',
      payload: { reason: 'manual_mode' },
    })
    return null
  }

  if (cfg.requireOpenAi && !cfg.openAiKey) {
    const run = await createAgentRun({
      conversationId: params.conversationId,
      inboundMessageId: params.inboundMessageId,
      trigger: 'INBOUND_MESSAGE',
      status: 'FAILED',
      rawMessageBody: trimmed,
      errorMessage: 'OPENAI_API_KEY required but not configured',
    })
    const replyBody = openAiUnavailableReply()
    await sendAgentReply({
      runId: run.id,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    return { runId: run.id, status: 'FAILED', replyBody }
  }

  const openPending = await getOpenPendingAction(params.conversationId)
  const hasOpenPending = openPending != null

  const intentResult = await classifyMealIntent(trimmed, hasOpenPending)
  timing('classify')
  let classification = intentResult.classification

  const run = await createAgentRun({
    conversationId: params.conversationId,
    inboundMessageId: params.inboundMessageId,
    trigger: 'INBOUND_MESSAGE',
    status: 'SKIPPED',
    rawMessageBody: trimmed,
    parsedIntent: { ...classification, _source: intentResult.source },
    model: intentResult.model,
    modelRawResponse: intentResult.openAiRaw as object | undefined,
    parentRunId: openPending?.createdFromRunId ?? undefined,
    pendingActionId: openPending?.id,
  })

  await logAgentAction({
    runId: run.id,
    actionType: 'CLASSIFY_INTENT',
    status: 'OK',
    input: { body: trimmed, hasOpenPending },
    output: intentResult,
    confidence: classification.confidence,
  })

  let parseBody = trimmed
  let skipFollowUp = false
  let pendingStillOpen = hasOpenPending

  if (hasOpenPending && openPending && looksLikeFreshDishInput(trimmed)) {
    const pendingCtx = parsePendingContext(openPending.context)
    if (pendingCtx) {
      let broken = isBrokenPendingContext(pendingCtx)
      if (!broken) {
        const slot = pendingCtx.meals.find((m) => m.status === 'waiting_dish')
        const ids = slot?.candidateDishIds ?? []
        if (ids.length > 0) {
          const loaded = await loadCandidatesInOrder(ids)
          if (loaded.length === 0) broken = true
        }
      }

      if (broken) {
        await setPendingStatus(openPending.id, 'CANCELLED')
        pendingStillOpen = false
        parseBody = augmentBodyWithPendingDate(trimmed, pendingCtx)
        const reclassified = await classifyMealIntent(parseBody, false)
        classification = reclassified.classification
        await updateAgentRun(run.id, {
          parsedIntent: {
            ...classification,
            _source: reclassified.source,
            _recoveredFromBrokenPending: true,
          },
        })
        skipFollowUp = true
      }
    }
  }

  if (pendingStillOpen && classification.intent === 'CONFIRM' && !skipFollowUp) {
    return handleFollowUpMessage({
      runId: run.id,
      conversationId: params.conversationId,
      phoneE164: params.phoneE164,
      body: trimmed,
    })
  }

  if (classification.intent === 'CANCEL') {
    return handleCancelPending({
      runId: run.id,
      conversationId: params.conversationId,
      phoneE164: params.phoneE164,
    })
  }

  if (pendingStillOpen && !classification.isMealPlanRelated) {
    const { pendingOpenReply } = await import('./replies')
    const replyBody = pendingOpenReply()
    await sendAgentReply({
      runId: run.id,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(run.id, { status: 'NEEDS_CONFIRMATION' })
    return { runId: run.id, status: 'NEEDS_CONFIRMATION', replyBody }
  }

  if (
    !classification.isMealPlanRelated ||
    classification.intent === 'NOT_MEAL' ||
    classification.intent === 'AMBIGUOUS'
  ) {
    const replyBody = nonMealReply(trimmed, classification)
    await sendAgentReply({
      runId: run.id,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(run.id, {
      status: 'SKIPPED',
      payload: { reason: classification.reason ?? classification.intent },
    })
    return { runId: run.id, status: 'SKIPPED', replyBody }
  }

  const customer = await findCustomerByPhoneExact(params.phoneE164)
  if (!customer) {
    const replyBody = noCustomerReply()
    await sendAgentReply({
      runId: run.id,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(run.id, { status: 'FAILED', errorMessage: 'Customer not found' })
    return { runId: run.id, status: 'FAILED', replyBody }
  }

  await updateAgentRun(run.id, { customerId: customer.id })

  await prisma.whatsAppConversation.update({
    where: { id: params.conversationId },
    data: { customerId: customer.id },
  })

  const mealPlan = await resolveActiveMealPlanForCustomer(customer.id)
  if (!mealPlan) {
    const replyBody = noMealPlanReply(customer.fullName)
    await sendAgentReply({
      runId: run.id,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(run.id, { status: 'FAILED', errorMessage: 'No active meal plan' })
    return { runId: run.id, status: 'FAILED', replyBody }
  }

  await updateAgentRun(run.id, { mealPlanId: mealPlan.id })

  const intent =
    classification.intent === 'UPDATE_MEAL' ? 'UPDATE_MEAL' : 'ADD_MEALS'
  const parseResult = await parseMealMessage(parseBody, intent)
  timing('parse')

  await logAgentAction({
    runId: run.id,
    actionType: 'PARSE_MESSAGE',
    status: parseResult ? 'OK' : 'FAILED',
    input: { body: trimmed, intent },
    output: parseResult ?? undefined,
  })

  if (parseResult?.model) {
    await updateAgentRun(run.id, {
      model: parseResult.model,
      modelRawResponse: parseResult.openAiRaw as object | undefined,
    })
  }

  if (!parseResult) {
    const dateHint = inferMealDateFromMessage(trimmed)
    if (dateHint) {
      const replyBody = askWhichMealsReply(dateHint.dateYmd, mealPlan.mealsPerDay)
      await sendAgentReply({
        runId: run.id,
        phoneE164: params.phoneE164,
        conversationId: params.conversationId,
        body: replyBody,
      })
      await updateAgentRun(run.id, {
        status: 'NEEDS_CONFIRMATION',
        payload: { reason: 'missing_dish_names', dateYmd: dateHint.dateYmd },
      })
      return { runId: run.id, status: 'NEEDS_CONFIRMATION', replyBody }
    }

    const replyBody = parseFailedReply()
    await sendAgentReply({
      runId: run.id,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(run.id, {
      status: 'FAILED',
      errorMessage:
        cfg.openAiKey && cfg.requireOpenAi
          ? 'OpenAI parse failed'
          : 'Parse failed',
    })
    return { runId: run.id, status: 'FAILED', replyBody }
  }

  const extraction = parseResult.extraction

  if (extraction.kind === 'ADD' && extraction.meals.length === 0) {
    const dateHint = inferMealDateFromMessage(trimmed)
    if (dateHint) {
      const replyBody = askWhichMealsReply(dateHint.dateYmd, mealPlan.mealsPerDay)
      await sendAgentReply({
        runId: run.id,
        phoneE164: params.phoneE164,
        conversationId: params.conversationId,
        body: replyBody,
      })
      await updateAgentRun(run.id, {
        status: 'NEEDS_CONFIRMATION',
        payload: { reason: 'missing_dish_names', dateYmd: dateHint.dateYmd },
      })
      return { runId: run.id, status: 'NEEDS_CONFIRMATION', replyBody }
    }
  }

  if (extraction.kind === 'UPDATE' && extraction.replace) {
    return processReplaceMeal({
      runId: run.id,
      conversationId: params.conversationId,
      phoneE164: params.phoneE164,
      mealPlanId: mealPlan.id,
      timeSlots: mealPlan.timeSlots,
      replace: extraction.replace,
    })
  }

  return processAddMeals({
    runId: run.id,
    conversationId: params.conversationId,
    phoneE164: params.phoneE164,
    customerId: customer.id,
    mealPlanId: mealPlan.id,
    mealsPerDay: mealPlan.mealsPerDay,
    timeSlots: mealPlan.timeSlots,
    parsedMeals: extraction.meals,
  })
}

async function processAddMeals(params: {
  runId: number
  conversationId: number
  phoneE164: string
  customerId: number
  mealPlanId: number
  mealsPerDay: number
  timeSlots: string[]
  parsedMeals: Array<{
    dateYmd: string
    dateSource: string
    slotIndex: number
    customerPhrase: string
    customNote?: string
  }>
}): Promise<AgentProcessResult> {
  const pendingSlots: PendingMealSlot[] = []
  const toApply: AgentMealApplyItem[] = []
  const appliedSummary: Array<{
    dateYmd: string
    dishName: string | null
    slotIndex: number
  }> = []

  const defaultTimeSlot = params.timeSlots[0] ?? '12:00'

  const matchResults = await Promise.all(
    params.parsedMeals.map(async (meal) => ({
      meal,
      slotIndex: meal.slotIndex,
      timeSlot: defaultTimeSlot,
      resolution: await resolveDishFromPhrase(meal.customerPhrase),
    }))
  )

  await Promise.all(
    matchResults.map(({ meal, slotIndex, resolution }) =>
      logAgentAction({
        runId: params.runId,
        actionType: 'MATCH_DISH',
        status:
          resolution.status === 'resolved'
            ? 'OK'
            : resolution.status === 'needs_confirm'
              ? 'PENDING_CONFIRM'
              : 'FAILED',
        input: { phrase: meal.customerPhrase, dateYmd: meal.dateYmd, slotIndex },
        output: resolution,
        confidence: resolution.confidence,
      })
    )
  )

  for (const { meal, slotIndex, timeSlot, resolution } of matchResults) {
    if (resolution.status === 'resolved' && resolution.dishId) {
      toApply.push({
        dateYmd: meal.dateYmd,
        slotIndex,
        timeSlot,
        dishId: resolution.dishId,
        dishName: resolution.dishName,
        customNote: meal.customNote,
      })
      pendingSlots.push({
        dateYmd: meal.dateYmd,
        slotIndex,
        timeSlot,
        customerPhrase: meal.customerPhrase,
        customNote: meal.customNote,
        status: 'resolved',
        resolvedDishId: resolution.dishId,
        resolvedDishName: resolution.dishName,
      })
    } else if (resolution.status === 'needs_confirm') {
      pendingSlots.push({
        dateYmd: meal.dateYmd,
        slotIndex,
        timeSlot,
        customerPhrase: meal.customerPhrase,
        customNote: meal.customNote,
        status: 'waiting_dish',
        candidateDishIds: candidateIdsForDisplay(resolution.candidates),
      })
    } else {
      pendingSlots.push({
        dateYmd: meal.dateYmd,
        slotIndex,
        timeSlot,
        customerPhrase: meal.customerPhrase,
        customNote: meal.customNote,
        status: 'waiting_dish',
        candidateDishIds: candidateIdsForDisplay(resolution.candidates),
      })
    }
  }

  if (toApply.length > 0) {
    try {
      const applied = await applyAgentMealItems(params.mealPlanId, toApply)
      for (const row of applied) {
        appliedSummary.push({
          dateYmd: row.dateYmd,
          dishName: row.dishName,
          slotIndex: row.slotIndex,
        })
        const slot = pendingSlots.find(
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
          input: toApply.find(
            (t) => t.dateYmd === row.dateYmd && t.slotIndex === row.slotIndex
          ),
          beforeSnapshot: row.before,
          afterSnapshot: row.after,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Apply failed'
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

  const waitingIdx = pendingSlots.findIndex((s) => s.status === 'waiting_dish')

  if (waitingIdx >= 0) {
    const slot = pendingSlots[waitingIdx]!
    const candidates = await loadCandidatesInOrder(slot.candidateDishIds ?? [])

    if (candidates.length === 0 || isVagueDishPhrase(slot.customerPhrase)) {
      if (!isVagueDishPhrase(slot.customerPhrase)) {
        const suggestions = await suggestDishesForPhrase(slot.customerPhrase)
        if (suggestions.length > 0) {
          const ctx: PendingBatchContext = {
            intent: 'ADD_MEALS',
            meals: [
              {
                ...slot,
                status: 'waiting_dish',
                customerPhrase: slot.customerPhrase,
                candidateDishIds: candidateIdsForDisplay(suggestions),
              },
            ],
            currentQuestionIndex: 0,
          }
          await createPendingAction({
            conversationId: params.conversationId,
            customerId: params.customerId,
            mealPlanId: params.mealPlanId,
            createdFromRunId: params.runId,
            type: 'MEAL_BATCH',
            context: ctx,
          })
          const question = dishChoiceQuestion(
            ctx.meals[0]!,
            suggestions,
            params.mealsPerDay
          )
          await sendAgentReply({
            runId: params.runId,
            phoneE164: params.phoneE164,
            conversationId: params.conversationId,
            body: question,
          })
          await updateAgentRun(params.runId, {
            status: 'NEEDS_CONFIRMATION',
            payload: { reason: 'dish_suggestions', dateYmd: slot.dateYmd },
          })
          return { runId: params.runId, status: 'NEEDS_CONFIRMATION', replyBody: question }
        }
      }

      const replyBody = askWhichMealsReply(slot.dateYmd, params.mealsPerDay)
      await sendAgentReply({
        runId: params.runId,
        phoneE164: params.phoneE164,
        conversationId: params.conversationId,
        body: replyBody,
      })
      await updateAgentRun(params.runId, {
        status: 'NEEDS_CONFIRMATION',
        payload: { reason: 'missing_dish_names', dateYmd: slot.dateYmd },
      })
      return { runId: params.runId, status: 'NEEDS_CONFIRMATION', replyBody }
    }

    const ctx: PendingBatchContext = {
      intent: 'ADD_MEALS',
      meals: pendingSlots,
      currentQuestionIndex: waitingIdx,
    }
    const pending = await createPendingAction({
      conversationId: params.conversationId,
      customerId: params.customerId,
      mealPlanId: params.mealPlanId,
      createdFromRunId: params.runId,
      type: 'MEAL_BATCH',
      context: ctx,
    })

    const question = dishChoiceQuestion(slot, candidates, params.mealsPerDay)
    const replyBody =
      appliedSummary.length > 0
        ? partialApplyReply(appliedSummary.length, question)
        : question

    await sendAgentReply({
      runId: params.runId,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(params.runId, {
      status: appliedSummary.length > 0 ? 'PARTIAL' : 'NEEDS_CONFIRMATION',
      payload: { pendingId: pending.id, extraction: pendingSlots },
    })
    return {
      runId: params.runId,
      status: appliedSummary.length > 0 ? 'PARTIAL' : 'NEEDS_CONFIRMATION',
      replyBody,
    }
  }

  const replyBody = mealsAddedConfirmation(appliedSummary)
  await sendAgentReply({
    runId: params.runId,
    phoneE164: params.phoneE164,
    conversationId: params.conversationId,
    body: replyBody,
  })
  await prisma.whatsAppPendingAction.updateMany({
    where: { conversationId: params.conversationId, status: 'OPEN' },
    data: { status: 'CANCELLED' },
  })
  await updateAgentRun(params.runId, { status: 'SUCCESS', payload: { applied: appliedSummary } })
  return { runId: params.runId, status: 'SUCCESS', replyBody }
}

async function processReplaceMeal(params: {
  runId: number
  conversationId: number
  phoneE164: string
  mealPlanId: number
  timeSlots: string[]
  replace: {
    dateYmd: string
    dateSource: string
    removePhrase: string
    addPhrase: string
    customNote?: string
  }
}): Promise<AgentProcessResult> {
  const existing = await findMealItemForReplace(
    params.mealPlanId,
    params.replace.dateYmd,
    params.replace.removePhrase
  )

  if (!existing) {
    const replyBody = errorReply(
      `Could not find "${params.replace.removePhrase}" on ${params.replace.dateYmd}. Send your meals again with the correct date.`
    )
    await sendAgentReply({
      runId: params.runId,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(params.runId, { status: 'FAILED', errorMessage: 'Replace target not found' })
    return { runId: params.runId, status: 'FAILED', replyBody }
  }

  const resolution = await resolveDishFromPhrase(params.replace.addPhrase)

  await logAgentAction({
    runId: params.runId,
    actionType: 'MATCH_DISH',
    status: resolution.status === 'resolved' ? 'OK' : 'PENDING_CONFIRM',
    input: params.replace,
    output: resolution,
    confidence: resolution.confidence,
  })

  if (resolution.status !== 'resolved' || !resolution.dishId) {
    const displayCandidates = resolution.candidates.slice(0, 6)
    if (isVagueDishPhrase(params.replace.addPhrase) || displayCandidates.length === 0) {
      const replyBody = askWhichMealsReply(params.replace.dateYmd, 1)
      await sendAgentReply({
        runId: params.runId,
        phoneE164: params.phoneE164,
        conversationId: params.conversationId,
        body: replyBody,
      })
      await updateAgentRun(params.runId, {
        status: 'NEEDS_CONFIRMATION',
        payload: { reason: 'missing_dish_names', dateYmd: params.replace.dateYmd },
      })
      return { runId: params.runId, status: 'NEEDS_CONFIRMATION', replyBody }
    }

    const slotIndex = params.timeSlots.findIndex(
      (ts) => ts === existing.timeSlot
    )
    const ctx: PendingBatchContext = {
      intent: 'UPDATE_MEAL',
      meals: [
        {
          dateYmd: params.replace.dateYmd,
          slotIndex: slotIndex >= 0 ? slotIndex : 0,
          timeSlot: existing.timeSlot,
          customerPhrase: params.replace.addPhrase,
          customNote: params.replace.customNote,
          status: 'waiting_dish',
          candidateDishIds: candidateIdsForDisplay(resolution.candidates),
        },
      ],
      currentQuestionIndex: 0,
      replace: {
        ...params.replace,
        targetItemId: existing.id,
      },
    }
    await createPendingAction({
      conversationId: params.conversationId,
      mealPlanId: params.mealPlanId,
      createdFromRunId: params.runId,
      type: 'REPLACE_MEAL',
      context: ctx,
    })
    const question = dishChoiceQuestion(ctx.meals[0]!, displayCandidates, 1)
    await sendAgentReply({
      runId: params.runId,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: question,
    })
    await updateAgentRun(params.runId, { status: 'NEEDS_CONFIRMATION' })
    return { runId: params.runId, status: 'NEEDS_CONFIRMATION', replyBody: question }
  }

  const slotIndex = params.timeSlots.findIndex((ts) => ts === existing.timeSlot)
  try {
    const applied = await applyAgentMealItems(params.mealPlanId, [
      {
        dateYmd: params.replace.dateYmd,
        slotIndex: slotIndex >= 0 ? slotIndex : 0,
        timeSlot: existing.timeSlot,
        dishId: resolution.dishId,
        dishName: resolution.dishName,
        customNote: params.replace.customNote,
        replaceItemId: existing.id,
      },
    ])
    for (const row of applied) {
      await logAgentAction({
        runId: params.runId,
        actionType: 'APPLY_MEAL',
        status: 'OK',
        input: params.replace,
        beforeSnapshot: row.before,
        afterSnapshot: row.after,
      })
    }
    const replyBody = mealsAddedConfirmation([
      {
        dateYmd: params.replace.dateYmd,
        dishName: resolution.dishName ?? params.replace.addPhrase,
        slotIndex: slotIndex >= 0 ? slotIndex : 0,
      },
    ])
    await sendAgentReply({
      runId: params.runId,
      phoneE164: params.phoneE164,
      conversationId: params.conversationId,
      body: replyBody,
    })
    await updateAgentRun(params.runId, { status: 'SUCCESS' })
    return { runId: params.runId, status: 'SUCCESS', replyBody }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Replace failed'
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
