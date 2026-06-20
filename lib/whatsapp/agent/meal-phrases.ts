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
