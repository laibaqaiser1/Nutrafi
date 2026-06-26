import { parseQuantityPhrase } from './meal-quantities'
import { normalizeForCompare, significantTokens } from './string-similarity'

const TOMORROW_WORDS = /(?:tomorrow|tommorow|tomorow)/i

const DATE_SIGNAL =
  /\b(today|tomorrow|tommorow|tomorow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i

/** Customer text that names a day/request but not an actual dish. */
const VAGUE_PHRASE_PATTERNS = [
  /^(my\s+)?meals?(\s+(for|on|to))?\s*(tomorrow|tommorow|tomorow|today|\w+day)?\.?$/i,
  /^(please\s+)?(add|update)\s+(my\s+)?meals?(\s+(for|on))?\s*(tomorrow|tommorow|tomorow|today|\w+day)?\.?$/i,
  /^(please\s+)?(add|update)\s+(my\s+)?(tomorrow|tommorow|tomorow|today|\w+day)(?:\s+meals?)?\.?$/i,
  /^(tomorrow|tommorow|tomorow|today|\w+day)(\s+meals?)?\.?$/i,
  /^(add|update)\s+(for\s+)?(tomorrow|tommorow|tomorow|today|\w+day)\.?$/i,
  /^(tomorrow|tommorow|tomorow)$/i,
]

export function mentionsTomorrow(text: string): boolean {
  return TOMORROW_WORDS.test(text)
}

/** Message asks to add/update meals for a date but names no dishes, e.g. "Please update my tomorow meals". */
export function isIntentOnlyMealRequest(body: string): boolean {
  const trimmed = body.trim()
  if (!trimmed || /\bmeal\s*\d+\s*[:.]?\s*/i.test(trimmed)) return false
  const lower = trimmed.toLowerCase()
  if (!DATE_SIGNAL.test(lower)) return false

  const hasMealIntent =
    /\b(add|update|change|set|choose|pick|select)\b/i.test(lower) ||
    /\bmeals?\b/i.test(lower)
  if (!hasMealIntent) return false

  const remainder = lower
    .replace(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi,
      ' '
    )
    .replace(TOMORROW_WORDS, ' ')
    .replace(/\btoday\b/gi, ' ')
    .replace(
      /\b(please|add|update|change|set|choose|pick|select|my|the|a|an|for|on|to|meal|meals|some|new)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()

  if (remainder.length < 2) return true
  return isVagueDishPhrase(remainder)
}

export function isVagueDishPhrase(phrase: string): boolean {
  const trimmed = phrase.trim()
  if (!trimmed || trimmed.length < 2) return true

  const normalized = normalizeForCompare(trimmed)
  if (!normalized) return true

  for (const pattern of VAGUE_PHRASE_PATTERNS) {
    if (pattern.test(normalized)) return true
  }

  // No meaningful food words left after removing meta words (my, meals, tomorrow, …)
  return significantTokens(trimmed).length === 0
}

export function filterActionableMealPhrases<T extends { customerPhrase: string }>(
  meals: T[]
): T[] {
  return meals.filter((m) => !isVagueDishPhrase(m.customerPhrase))
}

const PHRASE_META_WORDS =
  /\b(my|the|a|an|for|on|to|please|add|update|meal|meals|tomorrow|tommorow|tomorow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi

/** Strip date/meta words so UI shows "chicken pasta" not "chicken pasta my tommorow meal". */
export function sanitizeDisplayPhrase(phrase: string): string {
  const cleaned = phrase
    .replace(/^\s*and\s+/i, '')
    .replace(PHRASE_META_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length >= 2 ? cleaned : phrase.trim()
}

/** Normalize parsed customerPhrase before dish matching. */
export function normalizeCustomerPhrase(phrase: string): string {
  const sanitized = sanitizeDisplayPhrase(phrase)
  const { phrase: withoutQuantity } = parseQuantityPhrase(sanitized)
  return withoutQuantity.length >= 2 ? withoutQuantity : sanitized
}
