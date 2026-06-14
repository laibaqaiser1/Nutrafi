import { whatsappAgentConfig } from './config'
import { openAiJsonCompletion } from './openai-client'
import type {
  IntentClassification,
  IntentClassificationResult,
  MealAgentIntent,
} from './types'

const MEAL_SIGNALS =
  /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|meal|meals|breakfast|lunch|dinner|add|update|change|replace|instead|don't want|dont want|do not want|next week|\d{1,2}[\/\-]\d{1,2})\b/i

const UPDATE_SIGNALS =
  /\b(instead|replace|change|don't want|dont want|do not want|rather|swap)\b/i

const CANCEL_SIGNALS = /^(cancel|never mind|nevermind|stop|forget it)\.?$/i

const CONFIRM_SIGNALS =
  /^(yes|yep|yeah|ok|okay|confirm|correct|\d{1,2})\.?$/i

const NOT_MEAL_SIGNALS =
  /\b(payment|pay|bill|invoice|delivery status|where is|track|refund|complaint|support|help me|hello|hi there|good morning|thanks|thank you)\b/i

const VALID_INTENTS = new Set<MealAgentIntent>([
  'ADD_MEALS',
  'UPDATE_MEAL',
  'CONFIRM',
  'CANCEL',
  'NOT_MEAL',
  'AMBIGUOUS',
])

export async function classifyMealIntent(
  body: string,
  hasOpenPending: boolean
): Promise<IntentClassificationResult> {
  const trimmed = body.trim()
  if (!trimmed) {
    return {
      classification: {
        intent: 'AMBIGUOUS',
        isMealPlanRelated: false,
        confidence: 1,
        reason: 'empty',
      },
      source: 'rules',
    }
  }

  if (hasOpenPending) {
    if (CANCEL_SIGNALS.test(trimmed)) {
      return {
        classification: {
          intent: 'CANCEL',
          isMealPlanRelated: true,
          confidence: 0.95,
          reason: 'cancel while pending',
        },
        source: 'rules',
      }
    }
    return {
      classification: {
        intent: 'CONFIRM',
        isMealPlanRelated: true,
        confidence: 0.9,
        reason: 'follow-up to pending action',
      },
      source: 'rules',
    }
  }

  if (CANCEL_SIGNALS.test(trimmed)) {
    return {
      classification: {
        intent: 'CANCEL',
        isMealPlanRelated: true,
        confidence: 0.9,
        reason: 'cancel keyword',
      },
      source: 'rules',
    }
  }

  const cfg = whatsappAgentConfig()
  if (cfg.openAiKey) {
    const ai = await classifyWithOpenAi(trimmed, cfg.openAiKey, cfg.openAiModel)
    if (ai) return ai
  }

  return {
    classification: classifyWithRules(trimmed),
    source: 'rules',
  }
}

function classifyWithRules(body: string): IntentClassification {
  if (CONFIRM_SIGNALS.test(body.trim()) && !MEAL_SIGNALS.test(body)) {
    return {
      intent: 'AMBIGUOUS',
      isMealPlanRelated: false,
      confidence: 0.6,
      reason: 'bare confirm without pending',
    }
  }

  const hasMealSignal = MEAL_SIGNALS.test(body)
  const hasUpdate = UPDATE_SIGNALS.test(body)
  const looksNotMeal =
    NOT_MEAL_SIGNALS.test(body) && !hasMealSignal && !hasUpdate

  if (looksNotMeal) {
    return {
      intent: 'NOT_MEAL',
      isMealPlanRelated: false,
      confidence: 0.85,
      reason: 'non-meal keywords',
    }
  }

  if (hasUpdate && hasMealSignal) {
    return {
      intent: 'UPDATE_MEAL',
      isMealPlanRelated: true,
      confidence: 0.88,
      reason: 'update + meal signals',
    }
  }

  if (hasMealSignal) {
    const intent: MealAgentIntent = hasUpdate ? 'UPDATE_MEAL' : 'ADD_MEALS'
    return {
      intent,
      isMealPlanRelated: true,
      confidence: 0.82,
      reason: 'meal plan signals',
    }
  }

  const lower = body.toLowerCase()
  if (
    lower.includes('burger') ||
    lower.includes('chicken') ||
    lower.includes('beef') ||
    lower.includes('rice') ||
    lower.includes('wrap') ||
    lower.includes('salad') ||
    lower.includes('pasta')
  ) {
    return {
      intent: 'ADD_MEALS',
      isMealPlanRelated: true,
      confidence: 0.7,
      reason: 'food terms',
    }
  }

  return {
    intent: 'NOT_MEAL',
    isMealPlanRelated: false,
    confidence: 0.75,
    reason: 'no meal signals',
  }
}

async function classifyWithOpenAi(
  body: string,
  apiKey: string,
  model: string
): Promise<IntentClassificationResult | null> {
  const result = await openAiJsonCompletion<IntentClassification>({
    apiKey,
    model,
    system: `Classify WhatsApp messages for a meal delivery service (Nutrafi).
Return JSON: { "intent": "ADD_MEALS"|"UPDATE_MEAL"|"CONFIRM"|"CANCEL"|"NOT_MEAL"|"AMBIGUOUS", "isMealPlanRelated": boolean, "confidence": number, "reason": string }

ADD_MEALS = customer listing meals or days to add.
UPDATE_MEAL = swap/change/remove a meal ("don't want X, want Y").
NOT_MEAL = delivery tracking, payment, general support, greetings only.
CONFIRM/CANCEL = only when clearly confirming or cancelling (not used for new meal lists).`,
    user: body,
  })

  if (!result.ok || !result.data) return null
  if (!VALID_INTENTS.has(result.data.intent)) return null

  return {
    classification: result.data,
    source: 'openai',
    model: result.model,
    openAiRaw: result.raw,
  }
}
