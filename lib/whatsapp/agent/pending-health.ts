import { detectCasualMessage } from './casual-messages'
import { dateHintFromYmd } from './conversation-target-date'
import { isVagueDishPhrase } from './meal-phrases'
import { significantTokens } from './string-similarity'
import type { PendingBatchContext } from './types'

/** Pending state that cannot be resolved via numbered dish choice (legacy / vague parse). */
export function isBrokenPendingContext(ctx: PendingBatchContext): boolean {
  if (ctx.awaitingNextMeal) return false

  const waiting = ctx.meals.filter((m) => m.status === 'waiting_dish')
  if (waiting.length === 0) return false

  return waiting.every(
    (slot) =>
      (slot.candidateDishIds?.length ?? 0) === 0 ||
      isVagueDishPhrase(slot.customerPhrase)
  )
}

export function pendingTargetDate(ctx: PendingBatchContext): { dateYmd: string } | null {
  if (ctx.targetDateYmd) {
    return { dateYmd: ctx.targetDateYmd }
  }
  if (ctx.awaitingNextMeal) {
    return { dateYmd: ctx.awaitingNextMeal.dateYmd }
  }
  const slot = ctx.meals.find((m) => m.status === 'waiting_dish') ?? ctx.meals[0]
  if (!slot) return null
  return { dateYmd: slot.dateYmd }
}

/** Customer sent an actual dish name, not a number/yes/no reply to a choice list. */
export function looksLikeFreshDishInput(body: string): boolean {
  const trimmed = body.trim()
  if (!trimmed || isVagueDishPhrase(trimmed)) return false
  if (detectCasualMessage(trimmed)) return false
  if (/^\d{1,2}$/.test(trimmed)) return false

  const tokens = significantTokens(trimmed)
  return tokens.length > 0
}

export function augmentBodyWithPendingDate(
  body: string,
  ctx: PendingBatchContext
): string {
  const target = pendingTargetDate(ctx)
  if (!target) return body

  const lower = body.toLowerCase()
  if (
    lower.includes('tomorrow') ||
    lower.includes('tommorow') ||
    lower.includes('today') ||
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(body)
  ) {
    return body
  }

  const dateHint = dateHintFromYmd(target.dateYmd)
  return `${body.trim()} for ${dateHint}`
}
