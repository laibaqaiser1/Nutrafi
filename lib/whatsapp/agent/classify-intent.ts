import { whatsappAgentConfig } from './config'
import type { IntentClassification, MealAgentIntent } from './types'

const MEAL_SIGNALS =
  /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|meal|meals|breakfast|lunch|dinner|add|update|change|replace|instead|don't want|dont want|do not want|next week|\d{1,2}[\/\-]\d{1,2})\b/i

const UPDATE_SIGNALS =
  /\b(instead|replace|change|don't want|dont want|do not want|rather|swap)\b/i

const CANCEL_SIGNALS = /^(cancel|never mind|nevermind|stop|forget it)\.?$/i

const CONFIRM_SIGNALS =
  /^(yes|yep|yeah|ok|okay|confirm|correct|\d{1,2})\.?$/i

const NOT_MEAL_SIGNALS =
  /\b(payment|pay|bill|invoice|delivery status|where is|track|refund|complaint|support|help me|hello|hi there|good morning|thanks|thank you)\b/i

export async function classifyMealIntent(
  body: string,
  hasOpenPending: boolean
): Promise<IntentClassification> {
  const trimmed = body.trim()
  if (!trimmed) {
    return {
      intent: 'AMBIGUOUS',
      isMealPlanRelated: false,
      confidence: 1,
      reason: 'empty',
    }
  }

  if (hasOpenPending) {
    if (CANCEL_SIGNALS.test(trimmed)) {
      return {
        intent: 'CANCEL',
        isMealPlanRelated: true,
        confidence: 0.95,
        reason: 'cancel while pending',
      }
    }
    return {
      intent: 'CONFIRM',
      isMealPlanRelated: true,
      confidence: 0.9,
      reason: 'follow-up to pending action',
    }
  }

  if (CANCEL_SIGNALS.test(trimmed)) {
    return {
      intent: 'CANCEL',
      isMealPlanRelated: true,
      confidence: 0.9,
      reason: 'cancel keyword',
    }
  }

  const cfg = whatsappAgentConfig()
  if (cfg.openAiKey) {
    const ai = await classifyWithOpenAi(trimmed, cfg.openAiKey, cfg.openAiModel)
    if (ai) return ai
  }

  return classifyWithRules(trimmed)
}

function classifyWithRules(body: string): IntentClassification {
  const lower = body.toLowerCase()

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

  if (
    lower.includes('burger') ||
    lower.includes('chicken') ||
    lower.includes('beef') ||
    lower.includes('rice') ||
    lower.includes('wrap') ||
    lower.includes('salad')
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
): Promise<IntentClassification | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Classify WhatsApp messages for a meal delivery service.
Return JSON: { "intent": "ADD_MEALS"|"UPDATE_MEAL"|"CONFIRM"|"CANCEL"|"NOT_MEAL"|"AMBIGUOUS", "isMealPlanRelated": boolean, "confidence": number, "reason": string }
NOT_MEAL = payments, delivery tracking, greetings, general support.
ADD_MEALS / UPDATE_MEAL = choosing or changing meals only.`,
          },
          { role: 'user', content: body },
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as IntentClassification
    if (!parsed.intent) return null
    return parsed
  } catch {
    return null
  }
}
