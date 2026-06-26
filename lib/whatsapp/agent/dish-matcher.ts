import { prisma } from '@/lib/prisma'
import { whatsappAgentConfig } from './config'
import {
  isFoodTypeToken,
  mustContainTokens,
  normalizeForCompare,
  phraseContainedInNameScore,
  significantTokens,
  splitPhraseTokens,
  stringSimilarity,
} from './string-similarity'
import type { DishCandidate, DishResolution } from './types'
import { isVagueDishPhrase, normalizeCustomerPhrase } from './meal-phrases'
import { parseQuantityPhrase, stripOrderingIntent } from './meal-quantities'

interface MenuDish {
  id: number
  name: string
  status: string
}

let menuCache: { loadedAt: number; dishes: MenuDish[] } | null = null
const CACHE_MS = 5 * 60 * 1000

const FOLLOW_UP_MATCH_THRESHOLD = 0.55
const DISPLAY_CANDIDATE_LIMIT = 6

async function loadActiveDishes(): Promise<MenuDish[]> {
  const now = Date.now()
  if (menuCache && now - menuCache.loadedAt < CACHE_MS) {
    return menuCache.dishes
  }
  const dishes = await prisma.dish.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, status: true },
    orderBy: { name: 'asc' },
  })
  menuCache = { loadedAt: now, dishes }
  return dishes
}

/** Preserve exact list order — used for numbered replies and stable WhatsApp lists. */
export async function loadCandidatesInOrder(
  dishIds: number[]
): Promise<DishCandidate[]> {
  if (dishIds.length === 0) return []
  const dishes = await prisma.dish.findMany({
    where: { id: { in: dishIds } },
    select: { id: true, name: true },
  })
  const byId = new Map(dishes.map((d) => [d.id, d.name]))
  return dishIds.map((id, i) => ({
    dishId: id,
    name: byId.get(id) ?? `Option ${i + 1}`,
    score: 0,
  }))
}

function dishNameNorm(name: string): string {
  return name.toLowerCase()
}

/** Narrow menu to dishes compatible with what the customer actually said. */
function filterDishesByPhraseConstraints(
  phrase: string,
  dishes: MenuDish[]
): MenuDish[] {
  const { distinctive, foodTypes } = splitPhraseTokens(phrase)

  const nameHasAll = (d: MenuDish, required: string[]) => {
    const n = dishNameNorm(d.name)
    return required.every((t) => n.includes(t))
  }

  // Distinctive words (bbq, cream, beef, …) always win over generic food types (rice, pasta).
  if (distinctive.length > 0) {
    const withDistinctive = dishes.filter((d) => nameHasAll(d, distinctive))
    if (withDistinctive.length > 0) {
      if (foodTypes.length > 0) {
        const withBoth = withDistinctive.filter((d) => nameHasAll(d, foodTypes))
        if (withBoth.length > 0) return withBoth
      }
      return withDistinctive
    }
    return []
  }

  const tokens = mustContainTokens(phrase)
  if (tokens.length === 0) return dishes

  // "beef rice" → must contain both beef AND rice
  if (tokens.length >= 2) {
    const strict = dishes.filter((d) => nameHasAll(d, tokens))
    if (strict.length > 0) return strict

    if (foodTypes.length > 0) {
      const typed = dishes.filter((d) => nameHasAll(d, foodTypes))
      if (typed.length > 0) {
        const proteins = tokens.filter((t) => !isFoodTypeToken(t))
        if (proteins.length > 0) {
          const typedAndProtein = typed.filter((d) => nameHasAll(d, proteins))
          if (typedAndProtein.length > 0) return typedAndProtein
        }
        return typed
      }
    }
  }

  if (tokens.length === 1) {
    const narrowed = dishes.filter((d) => dishNameNorm(d.name).includes(tokens[0]!))
    if (narrowed.length > 0) return narrowed
  }

  return dishes
}

function shortlistDishes(phrase: string, dishes: MenuDish[]): DishCandidate[] {
  const pool = filterDishesByPhraseConstraints(phrase, dishes)
  const tokens = significantTokens(phrase)
  const { distinctive } = splitPhraseTokens(phrase)
  const required = mustContainTokens(phrase)
  const scored: DishCandidate[] = []

  for (const dish of pool) {
    const nameNorm = normalizeForCompare(dish.name)
    const nameLower = dish.name.toLowerCase()

    let score = Math.max(
      stringSimilarity(phrase, dish.name),
      phraseContainedInNameScore(phrase, dish.name)
    )
    const tokenHit = tokens.some((t) => nameLower.includes(t))
    const requiredMatches = required.filter((t) => nameNorm.includes(t)).length
    const requiredRatio = required.length > 0 ? requiredMatches / required.length : 0

    if (distinctive.length > 0) {
      const distinctiveHits = distinctive.filter((t) => nameLower.includes(t)).length
      const distinctiveRatio = distinctiveHits / distinctive.length
      score = Math.max(score, distinctiveRatio * 0.92)
    }

    const passes =
      score >= 0.42 ||
      tokenHit ||
      requiredRatio >= 0.5 ||
      (requiredMatches >= 1 && score >= 0.38)

    if (passes) {
      scored.push({
        dishId: dish.id,
        name: dish.name,
        score: Math.max(score, requiredRatio * 0.85, tokenHit ? 0.55 : 0),
      })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 10)
}

/** Last resort when token rules exclude everything — pick closest menu name. */
function findFuzzyBestMatch(phrase: string, dishes: MenuDish[]): DishCandidate | null {
  let best: DishCandidate | null = null
  for (const dish of dishes) {
    const score = Math.max(
      stringSimilarity(phrase, dish.name),
      phraseContainedInNameScore(phrase, dish.name)
    )
    if (!best || score > best.score) {
      best = { dishId: dish.id, name: dish.name, score }
    }
  }
  if (best && best.score >= 0.52) return best
  return null
}

export async function suggestFallbackMenuDishes(limit = 6): Promise<DishCandidate[]> {
  const dishes = await loadActiveDishes()
  return dishes.slice(0, limit).map((d) => ({
    dishId: d.id,
    name: d.name,
    score: 0,
  }))
}

/** Most-ordered active dishes; falls back to alphabetical menu sample. */
export async function suggestPopularMenuDishes(limit = 6): Promise<DishCandidate[]> {
  const popular = await prisma.mealPlanItem.groupBy({
    by: ['dishId'],
    where: { dishId: { not: null }, isSkipped: false },
    _count: { dishId: true },
    orderBy: { _count: { dishId: 'desc' } },
    take: limit * 3,
  })

  const dishIds = popular
    .map((row) => row.dishId)
    .filter((id): id is number => id != null)

  const result: DishCandidate[] = []
  if (dishIds.length > 0) {
    const dishes = await prisma.dish.findMany({
      where: { id: { in: dishIds }, status: 'ACTIVE' },
      select: { id: true, name: true },
    })
    const byId = new Map(dishes.map((d) => [d.id, d]))

    for (const row of popular) {
      if (!row.dishId) continue
      const dish = byId.get(row.dishId)
      if (!dish) continue
      result.push({
        dishId: dish.id,
        name: dish.name,
        score: row._count.dishId,
      })
      if (result.length >= limit) return result
    }
  }

  const fallback = await suggestFallbackMenuDishes(limit)
  const seen = new Set(result.map((d) => d.dishId))
  for (const dish of fallback) {
    if (seen.has(dish.dishId)) continue
    result.push(dish)
    if (result.length >= limit) break
  }
  return result
}

export async function suggestDishesForPhrase(
  phrase: string,
  limit = 6
): Promise<DishCandidate[]> {
  const dishes = await loadActiveDishes()
  const shortlist = shortlistDishes(phrase, dishes)
  if (shortlist.length > 0) return shortlist.slice(0, limit)
  const fuzzy = findFuzzyBestMatch(phrase, dishes)
  return fuzzy ? [fuzzy] : []
}

/** Customer phrase matches menu name exactly (ignoring case/punctuation). */
function findExactMenuMatch(phrase: string, dishes: MenuDish[]): MenuDish | null {
  const p = normalizeForCompare(phrase)
  if (!p || p.length < 4) return null

  const exact = dishes.filter((d) => normalizeForCompare(d.name) === p)
  if (exact.length === 1) return exact[0]!
  if (exact.length > 1) return null

  const contained = dishes.filter((d) => normalizeForCompare(d.name).includes(p))
  if (contained.length === 1) return contained[0]!

  return null
}

/** One menu item contains all customer tokens (e.g. "beef rice" → Beef Kofta with Rice). */
function findUniqueMenuMatchByTokens(
  phrase: string,
  dishes: MenuDish[]
): MenuDish | null {
  const pool = filterDishesByPhraseConstraints(phrase, dishes)
  const tokens = mustContainTokens(phrase)
  if (tokens.length === 0) return null
  const matches = pool.filter((d) => {
    const n = dishNameNorm(d.name)
    return tokens.every((t) => n.includes(t))
  })
  if (matches.length === 1) return matches[0]!
  return null
}

/** Among a fixed candidate list, pick the only dish that contains all reply tokens. */
function findUniqueCandidateByTokens(
  phrase: string,
  candidates: DishCandidate[]
): DishCandidate | null {
  const tokens = mustContainTokens(phrase)
  if (tokens.length === 0) return null
  const matches = candidates.filter((c) => {
    const n = normalizeForCompare(c.name)
    return tokens.every((t) => n.includes(t))
  })
  if (matches.length === 1) return matches[0]!
  return null
}

function scoreReplyAgainstCandidates(
  phrase: string,
  candidates: DishCandidate[]
): DishCandidate | null {
  let best: DishCandidate | null = null
  for (const c of candidates) {
    const score = Math.max(
      stringSimilarity(phrase, c.name),
      phraseContainedInNameScore(phrase, c.name)
    )
    const scored = { ...c, score }
    if (!best || scored.score > best.score) best = scored
  }
  return best
}

async function pickWithOpenAi(
  phrase: string,
  candidates: DishCandidate[],
  apiKey: string,
  model: string
): Promise<{ dishId: number | null; confidence: number } | null> {
  if (candidates.length === 0) return null
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
            content: `Pick the best menu dish for the customer phrase. Must pick from candidates only or null.
If the phrase names a food type (rice, pasta, pizza, burger, …), NEVER pick a dish that contradicts it (e.g. phrase "beef rice" → only dishes with rice, not pizza).
Prefer dishes that contain ALL words from the phrase in the dish name.
Return JSON: { "dishId": number|null, "confidence": number }`,
          },
          {
            role: 'user',
            content: JSON.stringify({ phrase, candidates }),
          },
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as {
      dishId: number | null
      confidence: number
    }
    if (parsed.dishId != null) {
      const allowed = candidates.some((c) => c.dishId === parsed.dishId)
      if (!allowed) return { dishId: null, confidence: 0 }
    }
    return parsed
  } catch {
    return null
  }
}

function blendConfidence(
  candidateScore: number,
  aiConfidence?: number
): number {
  if (aiConfidence == null) return candidateScore
  return 0.4 * candidateScore + 0.6 * aiConfidence
}

function isAmbiguousTop(candidates: DishCandidate[], phrase: string): boolean {
  if (candidates.length < 2) return false
  const p = normalizeForCompare(phrase)
  const topNorm = normalizeForCompare(candidates[0]!.name)
  if (p && topNorm === p) return false
  return candidates[0]!.score - candidates[1]!.score < 0.05
}

/** Stable id list for pending state — order never changes after first ask. */
export function candidateIdsForDisplay(candidates: DishCandidate[]): number[] {
  return candidates.slice(0, DISPLAY_CANDIDATE_LIMIT).map((c) => c.dishId)
}

export async function resolveDishFromPhrase(
  customerPhrase: string
): Promise<DishResolution> {
  const searchPhrase = normalizeCustomerPhrase(
    stripOrderingIntent(customerPhrase)
  )

  if (isVagueDishPhrase(searchPhrase)) {
    return {
      customerPhrase: searchPhrase,
      status: 'no_match',
      confidence: 0,
      candidates: [],
    }
  }

  const cfg = whatsappAgentConfig()
  const dishes = await loadActiveDishes()

  const exactMatch = findExactMenuMatch(searchPhrase, dishes)
  if (exactMatch) {
    return {
      customerPhrase: searchPhrase,
      status: 'resolved',
      confidence: 0.98,
      dishId: exactMatch.id,
      dishName: exactMatch.name,
      candidates: [
        {
          dishId: exactMatch.id,
          name: exactMatch.name,
          score: 1,
        },
      ],
    }
  }

  const uniqueTokenMatch = findUniqueMenuMatchByTokens(searchPhrase, dishes)
  if (uniqueTokenMatch) {
    return {
      customerPhrase: searchPhrase,
      status: 'resolved',
      confidence: 0.92,
      dishId: uniqueTokenMatch.id,
      dishName: uniqueTokenMatch.name,
      candidates: [
        {
          dishId: uniqueTokenMatch.id,
          name: uniqueTokenMatch.name,
          score: 0.92,
        },
      ],
    }
  }

  const candidates = shortlistDishes(searchPhrase, dishes)

  if (candidates.length === 0) {
    const fuzzy = findFuzzyBestMatch(searchPhrase, dishes)
    if (fuzzy && fuzzy.score >= 0.72) {
      return {
        customerPhrase: searchPhrase,
        status: 'resolved',
        confidence: fuzzy.score,
        dishId: fuzzy.dishId,
        dishName: fuzzy.name,
        candidates: [fuzzy],
      }
    }
    if (fuzzy) {
      return {
        customerPhrase: searchPhrase,
        status: 'needs_confirm',
        confidence: fuzzy.score,
        dishId: fuzzy.dishId,
        dishName: fuzzy.name,
        candidates: [fuzzy],
      }
    }
    return {
      customerPhrase: searchPhrase,
      status: 'no_match',
      confidence: 0,
      candidates: [],
    }
  }

  if (candidates.length === 1) {
    const only = candidates[0]!
    return {
      customerPhrase: searchPhrase,
      status: 'resolved',
      confidence: Math.max(only.score, 0.85),
      dishId: only.dishId,
      dishName: only.name,
      candidates,
    }
  }

  const uniqueAmongShortlist = findUniqueCandidateByTokens(
    searchPhrase,
    candidates
  )
  if (uniqueAmongShortlist) {
    return {
      customerPhrase: searchPhrase,
      status: 'resolved',
      confidence: 0.9,
      dishId: uniqueAmongShortlist.dishId,
      dishName: uniqueAmongShortlist.name,
      candidates,
    }
  }

  let top = candidates[0]!
  let confidence = top.score

  const ambiguous = isAmbiguousTop(candidates, searchPhrase)
  const autoThreshold = cfg.dishAutoConfidence

  if (
    cfg.openAiKey &&
    cfg.openAiDishPick &&
    candidates.length > 0 &&
    (ambiguous || confidence < autoThreshold)
  ) {
    const ai = await pickWithOpenAi(
      searchPhrase,
      candidates,
      cfg.openAiKey,
      cfg.openAiModel
    )
    if (ai?.dishId != null) {
      const picked = candidates.find((c) => c.dishId === ai.dishId)
      if (picked) {
        top = picked
        confidence = blendConfidence(picked.score, ai.confidence)
      }
    }
  }

  if (confidence >= autoThreshold && !ambiguous) {
    return {
      customerPhrase: searchPhrase,
      status: 'resolved',
      confidence,
      dishId: top.dishId,
      dishName: top.name,
      candidates,
    }
  }

  if (confidence >= cfg.dishMinConfidence || candidates.length > 0) {
    return {
      customerPhrase: searchPhrase,
      status: 'needs_confirm',
      confidence,
      dishId: top.dishId,
      dishName: top.name,
      candidates,
    }
  }

  return {
    customerPhrase: searchPhrase,
    status: 'no_match',
    confidence,
    candidates,
  }
}

export async function resolveDishFromReply(
  reply: string,
  candidateDishIds: number[]
): Promise<DishResolution | null> {
  const trimmed = reply.trim()
  if (!trimmed || candidateDishIds.length === 0) return null

  const { phrase } = parseQuantityPhrase(trimmed)
  const matchText = normalizeCustomerPhrase(phrase || trimmed)

  const displayIds = candidateDishIds.slice(0, DISPLAY_CANDIDATE_LIMIT)
  const candidates = await loadCandidatesInOrder(displayIds)

  const num = trimmed.match(/^(\d{1,2})$/)
  if (num) {
    const idx = parseInt(num[1]!, 10) - 1
    if (idx >= 0 && idx < candidates.length) {
      const picked = candidates[idx]!
      return {
        customerPhrase: matchText,
        status: 'resolved',
        confidence: 1,
        dishId: picked.dishId,
        dishName: picked.name,
        candidates,
      }
    }
  }

  const uniqueToken = findUniqueCandidateByTokens(matchText, candidates)
  if (uniqueToken) {
    return {
      customerPhrase: matchText,
      status: 'resolved',
      confidence: 0.95,
      dishId: uniqueToken.dishId,
      dishName: uniqueToken.name,
      candidates,
    }
  }

  const best = scoreReplyAgainstCandidates(matchText, candidates)
  if (!best) return null

  const cfg = whatsappAgentConfig()
  const threshold = Math.min(cfg.dishAutoConfidence, FOLLOW_UP_MATCH_THRESHOLD)

  if (best.score >= threshold) {
    return {
      customerPhrase: matchText,
      status: 'resolved',
      confidence: best.score,
      dishId: best.dishId,
      dishName: best.name,
      candidates,
    }
  }

  return {
    customerPhrase: matchText,
    status: 'needs_confirm',
    confidence: best.score,
    dishId: best.dishId,
    dishName: best.name,
    candidates,
  }
}

export function invalidateMenuCache(): void {
  menuCache = null
}
