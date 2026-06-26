import { whatsappAgentConfig } from './config'
import { detectCasualMessage } from './casual-messages'
import { isMealPlanStatusQuestion } from './meal-plan-status'
import { isSkipDayRequestNotUpdate } from './skip-day'
import { looksLikeMultiDishList, isAffirmativeReply, isAwaitingMealUpdate } from './pending-health'
import { openAiJsonCompletion } from './openai-client'
import type {
  IntentClassification,
  IntentClassificationResult,
  MealAgentIntent,
  PendingBatchContext,
} from './types'

const MEAL_SIGNALS =
  /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|meal|meals|breakfast|lunch|dinner|add|update|change|replace|instead|don't want|dont want|do not want|next week|\d{1,2}[\/\-]\d{1,2})\b/i

const UPDATE_SIGNALS =
  /\b(instead|replace|change|don't want|dont want|do not want|rather|swap)\b/i

const CANCEL_SIGNALS = /^(cancel|never mind|nevermind|stop|forget it)\.?$/i

const CONFIRM_SIGNALS =
  /^(yes|yep|yeah|ok|okay|confirm|correct|\d{1,2})\.?$/i

const NOT_MEAL_SIGNALS =
  /\b(payment|pay|bill|invoice|delivery|delivered|deliver|when will|what time|where is|track|refund|complaint|support|help me)\b/i

const MENU_QUESTION =
  /\b(menu|options|choices|recommend(?:ation)?s?|popular\s+(?:dishes|meals))\b/i

/** Customer asking what dishes are available or how to choose from the menu. */
export function isMenuQuestion(body: string): boolean {
  const trimmed = body.trim()
  if (!trimmed) return false

  if (MENU_QUESTION.test(trimmed)) return true

  return (
    /\b(what|which)\s+(?:are\s+)?(?:the\s+)?(?:options|choices|dishes|meals)\b/i.test(
      trimmed
    ) ||
    /\bwhat\s+(?:can|could|do)\s+i\s+(?:choose|select|order|pick|have)\b/i.test(
      trimmed
    ) ||
    /\bhow\s+(?:can|do)\s+i\s+(?:choose|select|pick|order)\b/i.test(trimmed) ||
    /\bshow\s+(?:me\s+)?(?:the\s+)?(?:menu|dishes|options|meals)\b/i.test(trimmed) ||
    /\bwhat\s+(?:do\s+)?you\s+have\b/i.test(trimmed) ||
    /\bwhat\s+.*\bavailable\b/i.test(trimmed) ||
    /\blist\s+(?:of\s+)?(?:dishes|meals|food|menu)\b/i.test(trimmed)
  )
}

const DELIVERY_QUESTION =
  /\b(when|what time|how long)\b[\s\S]{0,40}\b(deliver|delivered|delivery|arrive|arriving|coming|reach)\b/i

const VALID_INTENTS = new Set<MealAgentIntent>([
  'ADD_MEALS',
  'UPDATE_MEAL',
  'CONFIRM',
  'CANCEL',
  'NOT_MEAL',
  'AMBIGUOUS',
  'MEAL_PLAN_STATUS',
  'SKIP_DAY',
])

/** General support / delivery questions — not dish follow-up replies. */
export function isSupportQuestion(body: string): boolean {
  const trimmed = body.trim()
  if (!trimmed) return false

  if (DELIVERY_QUESTION.test(trimmed)) return true
  if (/\b(where is my|track my|order status|delivery status)\b/i.test(trimmed)) return true

  const isQuestion =
    trimmed.includes('?') ||
    /^(when|what|where|how|why|can|could|will|is|are|do)\b/i.test(trimmed)

  if (isQuestion && NOT_MEAL_SIGNALS.test(trimmed)) {
    const looksLikeMealList =
      /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|meal \d|meal 1|meal 2)\s*:/i.test(
        trimmed
      )
    if (!looksLikeMealList) return true
  }

  if (isQuestion && trimmed.length > 45 && !looksLikeDishFollowUpReply(trimmed)) {
    return true
  }

  return false
}

function looksLikeDishFollowUpReply(body: string): boolean {
  const trimmed = body.trim()
  if (!trimmed) return false
  if (CANCEL_SIGNALS.test(trimmed)) return false
  if (looksLikeMultiDishList(trimmed)) return false
  if (CONFIRM_SIGNALS.test(trimmed)) return true
  if (/^\d{1,2}$/.test(trimmed)) return true
  if (trimmed.includes('?')) return false
  if (DELIVERY_QUESTION.test(trimmed)) return false
  if (trimmed.length > 56) return false
  return true
}

function looksLikeNewMealRequest(body: string): boolean {
  if (isSupportQuestion(body)) return false
  if (isSkipDayRequestNotUpdate(body)) return false
  const hasMealSignal = MEAL_SIGNALS.test(body)
  const hasUpdate = UPDATE_SIGNALS.test(body)
  if (!hasMealSignal && !hasUpdate) return false
  return (
    /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.test(
      body
    ) || /\bmeal \d|meal 1|meal 2\b/i.test(body)
  )
}

export async function classifyMealIntent(
  body: string,
  hasOpenPending: boolean,
  pendingContext?: PendingBatchContext | null
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
    if (pendingContext && isAwaitingMealUpdate(pendingContext)) {
      if (CANCEL_SIGNALS.test(trimmed)) {
        return {
          classification: {
            intent: 'CANCEL',
            isMealPlanRelated: true,
            confidence: 0.95,
            reason: 'cancel meal update offer',
          },
          source: 'rules',
        }
      }

      if (isAffirmativeReply(trimmed)) {
        return {
          classification: {
            intent: 'UPDATE_MEAL',
            isMealPlanRelated: true,
            confidence: 0.94,
            reason: 'accepted meal update offer',
          },
          source: 'rules',
        }
      }

      if (UPDATE_SIGNALS.test(trimmed) || looksLikeMultiDishList(trimmed)) {
        return {
          classification: {
            intent: 'UPDATE_MEAL',
            isMealPlanRelated: true,
            confidence: 0.9,
            reason: 'meal update instruction',
          },
          source: 'rules',
        }
      }

      if (looksLikeDishFollowUpReply(trimmed) && !isAffirmativeReply(trimmed)) {
        return {
          classification: {
            intent: 'UPDATE_MEAL',
            isMealPlanRelated: true,
            confidence: 0.85,
            reason: 'dish name for meal update',
          },
          source: 'rules',
        }
      }
    }

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

    if (isMenuQuestion(trimmed)) {
      return {
        classification: {
          intent: 'NOT_MEAL',
          isMealPlanRelated: true,
          confidence: 0.95,
          reason: 'menu question during pending',
        },
        source: 'rules',
      }
    }

    if (isSupportQuestion(trimmed)) {
      return {
        classification: {
          intent: 'NOT_MEAL',
          isMealPlanRelated: false,
          confidence: 0.92,
          reason: 'support question during pending',
        },
        source: 'rules',
      }
    }

    if (isMealPlanStatusQuestion(trimmed)) {
      return {
        classification: {
          intent: 'MEAL_PLAN_STATUS',
          isMealPlanRelated: true,
          confidence: 0.93,
          reason: 'meal plan status during pending',
        },
        source: 'rules',
      }
    }

    if (isSkipDayRequestNotUpdate(trimmed)) {
      return {
        classification: {
          intent: 'SKIP_DAY',
          isMealPlanRelated: true,
          confidence: 0.94,
          reason: 'skip day during pending',
        },
        source: 'rules',
      }
    }

    if (looksLikeNewMealRequest(trimmed)) {
      return {
        classification: {
          intent: 'ADD_MEALS',
          isMealPlanRelated: true,
          confidence: 0.85,
          reason: 'new meal request replaces pending',
        },
        source: 'rules',
      }
    }

    if (looksLikeMultiDishList(trimmed)) {
      return {
        classification: {
          intent: 'ADD_MEALS',
          isMealPlanRelated: true,
          confidence: 0.9,
          reason: 'dish list while pending',
        },
        source: 'rules',
      }
    }

    if (looksLikeDishFollowUpReply(trimmed)) {
      return {
        classification: {
          intent: 'CONFIRM',
          isMealPlanRelated: true,
          confidence: 0.88,
          reason: 'dish follow-up reply',
        },
        source: 'rules',
      }
    }

    const cfg = whatsappAgentConfig()
    if (cfg.openAiKey) {
      const ai = await classifyWithOpenAi(trimmed, cfg.openAiKey, cfg.openAiModel, true)
      if (ai) return ai
    }

    return {
      classification: {
        intent: 'NOT_MEAL',
        isMealPlanRelated: false,
        confidence: 0.8,
        reason: 'not a dish reply while pending',
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
  const rulesResult = classifyWithRules(trimmed)
  const rulesConfident =
    rulesResult.intent !== 'AMBIGUOUS' && rulesResult.confidence >= 0.8

  if (rulesConfident || !cfg.openAiKey) {
    return {
      classification: rulesResult,
      source: 'rules',
    }
  }

  const ai = await classifyWithOpenAi(trimmed, cfg.openAiKey!, cfg.openAiModel)
  if (ai) return ai

  return {
    classification: rulesResult,
    source: 'rules',
  }
}

function classifyWithRules(body: string): IntentClassification {
  const trimmed = body.trim()
  if (/^[.\?!…]+$/.test(trimmed)) {
    return {
      intent: 'AMBIGUOUS',
      isMealPlanRelated: false,
      confidence: 0.9,
      reason: 'punctuation only',
    }
  }

  const casual = detectCasualMessage(trimmed)
  if (casual === 'greeting') {
    return {
      intent: 'NOT_MEAL',
      isMealPlanRelated: false,
      confidence: 0.95,
      reason: 'greeting',
    }
  }
  if (casual === 'farewell') {
    return {
      intent: 'NOT_MEAL',
      isMealPlanRelated: false,
      confidence: 0.95,
      reason: 'farewell',
    }
  }

  if (isSupportQuestion(body)) {
    return {
      intent: 'NOT_MEAL',
      isMealPlanRelated: false,
      confidence: 0.9,
      reason: 'support question',
    }
  }

  if (isMealPlanStatusQuestion(body)) {
    return {
      intent: 'MEAL_PLAN_STATUS',
      isMealPlanRelated: true,
      confidence: 0.93,
      reason: 'meals remaining question',
    }
  }

  if (isSkipDayRequestNotUpdate(body)) {
    return {
      intent: 'SKIP_DAY',
      isMealPlanRelated: true,
      confidence: 0.94,
      reason: 'skip meals for a day',
    }
  }

  if (CONFIRM_SIGNALS.test(body.trim()) && !MEAL_SIGNALS.test(body)) {
    if (detectCasualMessage(body.trim()) === 'farewell') {
      return {
        intent: 'NOT_MEAL',
        isMealPlanRelated: false,
        confidence: 0.92,
        reason: 'farewell',
      }
    }
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

  if (hasUpdate && /\b(for|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|tomorrow|today)\b/i.test(body)) {
    return {
      intent: 'UPDATE_MEAL',
      isMealPlanRelated: true,
      confidence: 0.86,
      reason: 'update with date',
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
    lower.includes('pasta') ||
    lower.includes('fish') ||
    lower.includes('soup')
  ) {
    return {
      intent: 'ADD_MEALS',
      isMealPlanRelated: true,
      confidence: 0.85,
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
  model: string,
  hasOpenPending = false
): Promise<IntentClassificationResult | null> {
  const pendingNote = hasOpenPending
    ? ` The customer has an OPEN pending dish choice (waiting for a number or dish name reply).`
    : ''

  const result = await openAiJsonCompletion<IntentClassification>({
    apiKey,
    model,
    system: `Classify WhatsApp messages for a meal delivery service (Nutrafi).${pendingNote}
Return JSON: { "intent": "ADD_MEALS"|"UPDATE_MEAL"|"CONFIRM"|"CANCEL"|"NOT_MEAL"|"AMBIGUOUS"|"MEAL_PLAN_STATUS"|"SKIP_DAY", "isMealPlanRelated": boolean, "confidence": number, "reason": string }

ADD_MEALS = customer listing meals or days to add.
UPDATE_MEAL = swap/change/remove a meal ("don't want X, want Y").
MEAL_PLAN_STATUS = asking how many meals are left, remaining on plan, or what's set for a day (e.g. "how many meals remaining?", "what meals do I have for tomorrow?").
SKIP_DAY = skip/cancel/no meals for a specific day — customer unavailable, not in office, "cancel for Tuesday", "no meals on Tuesday" (NOT bare "cancel" which clears pending choice).
NOT_MEAL = delivery timing, tracking, payment, general support questions — NOT short greetings (hi/hello) or thanks/ok/bye (those are still NOT_MEAL but casual).
CONFIRM = only when replying to a pending dish choice (number, yes, or short dish name).
CANCEL = only when clearly cancelling.`,
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
