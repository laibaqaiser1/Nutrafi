const WORD_TO_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  a: 1,
  an: 1,
}

export const MAX_MEAL_QUANTITY = 6

/** Remove ordering intent prefixes, e.g. "I need two pasta" → "two pasta". */
export function stripOrderingIntent(text: string): string {
  return text
    .trim()
    .replace(
      /^(?:please\s+)?(?:i\s+)?(?:(?:would|'d)\s+like|need|want|like|get)\s+/i,
      ''
    )
    .trim()
}

/** Parse meal count + dish phrase from a segment like "two chicken pasta" or "pasta 2 items". */
export function parseQuantityPhrase(text: string): { count: number; phrase: string } {
  let remaining = stripOrderingIntent(text).trim()
  if (!remaining) return { count: 1, phrase: '' }

  const trailing = remaining.match(
    /^(.+?)\s+(?:(\d+)|(?:x|×)\s*(\d+))\s*(?:items?|meals?|portions?|pcs?|times?)?\s*$/i
  )
  if (trailing) {
    const count = parseInt(trailing[2] || trailing[3] || '1', 10)
    const phrase = trailing[1]!.trim()
    if (
      Number.isFinite(count) &&
      count >= 1 &&
      count <= MAX_MEAL_QUANTITY &&
      phrase.length >= 2
    ) {
      return { count, phrase }
    }
  }

  const leadingNum = remaining.match(/^(\d+)\s*(?:x\s*|×\s*)?(.+)$/i)
  if (leadingNum) {
    const count = parseInt(leadingNum[1]!, 10)
    const phrase = leadingNum[2]!.trim()
    if (
      Number.isFinite(count) &&
      count >= 1 &&
      count <= MAX_MEAL_QUANTITY &&
      phrase.length >= 2
    ) {
      return { count, phrase }
    }
  }

  const leadingWord = remaining.match(
    /^(one|two|three|four|five|six|a|an)\s+(.+)$/i
  )
  if (leadingWord) {
    const count = WORD_TO_NUM[leadingWord[1]!.toLowerCase()] ?? 1
    const phrase = leadingWord[2]!.trim()
    if (phrase.length >= 2) {
      return { count, phrase }
    }
  }

  return { count: 1, phrase: remaining }
}
