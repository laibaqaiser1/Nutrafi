import { prisma } from '@/lib/prisma'
import { whatsappAgentConfig } from './config'
import { significantTokens, stringSimilarity } from './string-similarity'
import type { DishCandidate, DishResolution } from './types'

interface MenuDish {
  id: number
  name: string
  status: string
}

let menuCache: { loadedAt: number; dishes: MenuDish[] } | null = null
const CACHE_MS = 5 * 60 * 1000

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

function shortlistDishes(phrase: string, dishes: MenuDish[]): DishCandidate[] {
  const tokens = significantTokens(phrase)
  const scored: DishCandidate[] = []

  for (const dish of dishes) {
    const score = stringSimilarity(phrase, dish.name)
    const nameLower = dish.name.toLowerCase()
    const tokenHit = tokens.some((t) => nameLower.includes(t))
    if (score >= 0.35 || tokenHit) {
      scored.push({ dishId: dish.id, name: dish.name, score })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 10)
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

function isAmbiguousTop(candidates: DishCandidate[]): boolean {
  if (candidates.length < 2) return false
  return candidates[0]!.score - candidates[1]!.score < 0.05
}

export async function resolveDishFromPhrase(
  customerPhrase: string
): Promise<DishResolution> {
  const cfg = whatsappAgentConfig()
  const dishes = await loadActiveDishes()
  const candidates = shortlistDishes(customerPhrase, dishes)

  if (candidates.length === 0) {
    return {
      customerPhrase,
      status: 'no_match',
      confidence: 0,
      candidates: [],
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

  const ambiguous = isAmbiguousTop(candidates)
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

  const num = trimmed.match(/^(\d{1,2})$/)
  if (num) {
    const idx = parseInt(num[1]!, 10) - 1
    if (idx >= 0 && idx < candidateDishIds.length) {
      const dish = await prisma.dish.findUnique({
        where: { id: candidateDishIds[idx]! },
        select: { id: true, name: true },
      })
      if (dish) {
        return {
          customerPhrase: trimmed,
          status: 'resolved',
          confidence: 1,
          dishId: dish.id,
          dishName: dish.name,
          candidates: [],
        }
      }
    }
  }

  const dishes = await prisma.dish.findMany({
    where: { id: { in: candidateDishIds } },
    select: { id: true, name: true },
  })

  let best: { id: number; name: string; score: number } | null = null
  for (const d of dishes) {
    const score = stringSimilarity(trimmed, d.name)
    if (!best || score > best.score) {
      best = { id: d.id, name: d.name, score }
    }
  }

  if (!best) return null
  const cfg = whatsappAgentConfig()
  if (best.score >= cfg.dishAutoConfidence) {
    return {
      customerPhrase: trimmed,
      status: 'resolved',
      confidence: best.score,
      dishId: best.id,
      dishName: best.name,
      candidates: [],
    }
  }

  return {
    customerPhrase: trimmed,
    status: 'needs_confirm',
    confidence: best.score,
    dishId: best.id,
    dishName: best.name,
    candidates: dishes.map((d) => ({
      dishId: d.id,
      name: d.name,
      score: stringSimilarity(trimmed, d.name),
    })),
  }
}

export function invalidateMenuCache(): void {
  menuCache = null
}
