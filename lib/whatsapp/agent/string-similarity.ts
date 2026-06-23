/** Token overlap + normalized Levenshtein ratio in [0, 1]. */
export function stringSimilarity(a: string, b: string): number {
  const na = normalizeForCompare(a)
  const nb = normalizeForCompare(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const tokenScore = tokenOverlapScore(na, nb)
  const levScore = 1 - levenshteinRatio(na, nb)
  const subsetScore = phraseContainedInNameScore(na, nb)
  return Math.max(
    0.5 * tokenScore + 0.5 * levScore,
    subsetScore
  )
}

export function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "beef pasta" inside "beef pasta red sauce" → high score */
export function phraseContainedInNameScore(phrase: string, dishName: string): number {
  const p = normalizeForCompare(phrase)
  const d = normalizeForCompare(dishName)
  if (!p || !d) return 0
  if (d.includes(p)) return 0.95
  const tokens = significantTokens(phrase)
  if (tokens.length === 0) return 0
  const matched = tokens.filter((t) => d.includes(t)).length
  return matched / tokens.length
}

export function allSignificantTokensInName(phrase: string, dishName: string): boolean {
  const tokens = significantTokens(phrase)
  if (tokens.length === 0) return false
  const d = normalizeForCompare(dishName)
  return tokens.every((t) => d.includes(t))
}

function tokenOverlapScore(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter((t) => t.length > 1))
  const tb = new Set(b.split(' ').filter((t) => t.length > 1))
  if (ta.size === 0 || tb.size === 0) return 0
  let overlap = 0
  for (const t of ta) {
    if (tb.has(t)) overlap++
  }
  return overlap / Math.max(ta.size, tb.size)
}

function levenshteinRatio(a: string, b: string): number {
  const dist = levenshtein(a, b)
  return dist / Math.max(a.length, b.length, 1)
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  )
  for (let i = 0; i <= m; i++) dp[i]![0] = i
  for (let j = 0; j <= n; j++) dp[0]![j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      )
    }
  }
  return dp[m]![n]!
}

const TOKEN_STOP = new Set([
  'with',
  'and',
  'the',
  'for',
  'please',
  'no',
  'without',
  'tomorrow',
  'tommorow',
  'tomorow',
  'today',
  'meal',
  'meals',
  'my',
  'add',
])

/** Food-type words — secondary filter only; never drop distinctive tokens like bbq, salmon. */
const FOOD_TYPE_TOKENS = new Set([
  'rice',
  'pasta',
  'pizza',
  'biryani',
  'burger',
  'kofta',
  'salad',
  'wrap',
  'potato',
  'mince',
  'sauce',
  'soup',
  'steak',
  'fish',
  'salmon',
  'wraps',
])

export function isFoodTypeToken(token: string): boolean {
  return FOOD_TYPE_TOKENS.has(token)
}

export function splitPhraseTokens(phrase: string): {
  distinctive: string[]
  foodTypes: string[]
} {
  const tokens = mustContainTokens(phrase)
  return {
    distinctive: tokens.filter((t) => !FOOD_TYPE_TOKENS.has(t)),
    foodTypes: tokens.filter((t) => FOOD_TYPE_TOKENS.has(t)),
  }
}

export function significantTokens(phrase: string): string[] {
  return normalizeForCompare(phrase)
    .split(' ')
    .filter((t) => t.length > 2 && !TOKEN_STOP.has(t))
}

/** All meaningful tokens from the customer phrase (includes rice, pasta, beef, …). */
export function mustContainTokens(phrase: string): string[] {
  return normalizeForCompare(phrase)
    .split(' ')
    .filter((t) => t.length > 1 && !TOKEN_STOP.has(t))
}
