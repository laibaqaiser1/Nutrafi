import { normalizeForCompare, significantTokens } from './string-similarity'

/** Customer text that names a day/request but not an actual dish. */
const VAGUE_PHRASE_PATTERNS = [
  /^(my\s+)?meals?(\s+(for|on|to))?\s*(tomorrow|tommorow|today|\w+day)?\.?$/i,
  /^(please\s+)?(add|update)\s+(my\s+)?meals?(\s+(for|on))?\s*(tomorrow|tommorow|today|\w+day)?\.?$/i,
  /^(tomorrow|tommorow|today|\w+day)(\s+meals?)?\.?$/i,
  /^(add|update)\s+(for\s+)?(tomorrow|tommorow|today|\w+day)\.?$/i,
]

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
  /\b(my|the|a|an|for|on|to|please|add|update|meal|meals|tomorrow|tommorow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi

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
  return sanitizeDisplayPhrase(phrase)
}
