import { prisma } from '@/lib/prisma'
import { whatsappAgentConfig } from './config'
import {
  mustContainTokens,
  normalizeForCompare,
  phraseContainedInNameScore,
  significantTokens,
  stringSimilarity,
} from './string-similarity'
import type { DishCandidate, DishResolution } from './types'

interface MenuDish {
  id: number
  name: string
  status: string
}

let menuCache: { loadedAt: number; dishes: MenuDish[] } | null = null
const CACHE_MS = 5 * 60 * 1000

const FOLLOW_UP_MATCH_THRESHOLD = 0.55
const DISPLAY_CANDIDATE_LIMIT = 6

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
])

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
  const tokens = mustContainTokens(phrase)
  if (tokens.length === 0) return dishes

  const nameHasAll = (d: MenuDish, required: string[]) => {
    const n = dishNameNorm(d.name)
    return required.every((t) => n.includes(t))
  }

  // "beef rice" → must contain both beef AND rice
  if (tokens.length >= 2) {
    const strict = dishes.filter((d) => nameHasAll(d, tokens))
    if (strict.length > 0) return strict

    // Fall back: require food-type tokens (rice, pasta, …) if customer named them
    const foodTypes = tokens.filter((t) => FOOD_TYPE_TOKENS.has(t))
    if (foodTypes.length > 0) {
      const typed = dishes.filter((d) => nameHasAll(d, foodTypes))
      if (typed.length > 0) {
        const proteins = tokens.filter((t) => !FOOD_TYPE_TOKENS.has(t))
        if (proteins.length > 0) {
          const typedAndProtein = typed.filter((d) => nameHasAll(d, proteins))
          if (typedAndProtein.length > 0) return typedAndProtein
        }
        return typed
      }
    }
  }

  // Single token e.g. "pasta"
  if (tokens.length === 1) {
    const narrowed = dishes.filter((d) => dishNameNorm(d.name).includes(tokens[0]!))
    if (narrowed.length > 0) return narrowed
  }

  return dishes
}

function shortlistDishes(phrase: string, dishes: MenuDish[]): DishCandidate[] {
  const pool = filterDishesByPhraseConstraints(phrase, dishes)
  const tokens = significantTokens(phrase)
  const required = mustContainTokens(phrase)
  const scored: DishCandidate[] = []

  for (const dish of pool) {
    const nameNorm = normalizeForCompare(dish.name)
    if (required.length >= 2 && !required.every((t) => nameNorm.includes(t))) {
      continue
    }

    const score = Math.max(
      stringSimilarity(phrase, dish.name),
      phraseContainedInNameScore(phrase, dish.name)
    )
    const nameLower = dish.name.toLowerCase()
    const tokenHit = tokens.some((t) => nameLower.includes(t))
    if (score >= 0.35 || tokenHit) {
      scored.push({ dishId: dish.id, name: dish.name, score })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 10)
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
  const cfg = whatsappAgentConfig()
  const dishes = await loadActiveDishes()

  const exactMatch = findExactMenuMatch(customerPhrase, dishes)
  if (exactMatch) {
    return {
      customerPhrase,
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

  const uniqueTokenMatch = findUniqueMenuMatchByTokens(customerPhrase, dishes)
  if (uniqueTokenMatch) {
    return {
      customerPhrase,
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

  const candidates = shortlistDishes(customerPhrase, dishes)

  if (candidates.length === 0) {
    return {
      customerPhrase,
      status: 'no_match',
      confidence: 0,
      candidates: [],
    }
  }

  if (candidates.length === 1) {
    const only = candidates[0]!
    return {
      customerPhrase,
      status: 'resolved',
      confidence: Math.max(only.score, 0.85),
      dishId: only.dishId,
      dishName: only.name,
      candidates,
    }
  }

  const uniqueAmongShortlist = findUniqueCandidateByTokens(
    customerPhrase,
    candidates
  )
  if (uniqueAmongShortlist) {
    return {
      customerPhrase,
      status: 'resolved',
      confidence: 0.9,
      dishId: uniqueAmongShortlist.dishId,
      dishName: uniqueAmongShortlist.name,
      candidates,
    }
  }

  let top = candidates[0]!
  let confidence = top.score

  if (cfg.openAiKey && candidates.length > 0) {
    const ai = await pickWithOpenAi(
      customerPhrase,
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

  const ambiguous = isAmbiguousTop(candidates, customerPhrase)
  const autoThreshold = cfg.dishAutoConfidence

  if (confidence >= autoThreshold && !ambiguous) {
    return {
      customerPhrase,
      status: 'resolved',
      confidence,
      dishId: top.dishId,
      dishName: top.name,
      candidates,
    }
  }

  if (confidence >= cfg.dishMinConfidence || candidates.length > 0) {
    return {
      customerPhrase,
      status: 'needs_confirm',
      confidence,
      dishId: top.dishId,
      dishName: top.name,
      candidates,
    }
  }

  return {
    customerPhrase,
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

  const displayIds = candidateDishIds.slice(0, DISPLAY_CANDIDATE_LIMIT)
  const candidates = await loadCandidatesInOrder(displayIds)

  const num = trimmed.match(/^(\d{1,2})$/)
  if (num) {
    const idx = parseInt(num[1]!, 10) - 1
    if (idx >= 0 && idx < candidates.length) {
      const picked = candidates[idx]!
      return {
        customerPhrase: trimmed,
        status: 'resolved',
        confidence: 1,
        dishId: picked.dishId,
        dishName: picked.name,
        candidates,
      }
    }
  }

  const uniqueToken = findUniqueCandidateByTokens(trimmed, candidates)
  if (uniqueToken) {
    return {
      customerPhrase: trimmed,
      status: 'resolved',
      confidence: 0.95,
      dishId: uniqueToken.dishId,
      dishName: uniqueToken.name,
      candidates,
    }
  }

  const best = scoreReplyAgainstCandidates(trimmed, candidates)
  if (!best) return null

  const cfg = whatsappAgentConfig()
  const threshold = Math.min(cfg.dishAutoConfidence, FOLLOW_UP_MATCH_THRESHOLD)

  if (best.score >= threshold) {
    return {
      customerPhrase: trimmed,
      status: 'resolved',
      confidence: best.score,
      dishId: best.dishId,
      dishName: best.name,
      candidates,
    }
  }

  return {
    customerPhrase: trimmed,
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
