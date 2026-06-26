import { detectCasualMessage } from './casual-messages'
import { dateHintFromYmd } from './conversation-target-date'
import { isVagueDishPhrase } from './meal-phrases'
import { hasNumberedMealFormat } from './parse-meal-message'
import { significantTokens } from './string-similarity'
import type { PendingBatchContext } from './types'

/** Customer agreed to change a meal — waiting for which meal / what to swap to. */
export function isAwaitingMealUpdate(ctx: PendingBatchContext): boolean {
  return ctx.awaitingMealUpdate != null
}

export function isAffirmativeReply(body: string): boolean {
  return /^(yes|yep|yeah|y|ok|okay|sure)\.?$/i.test(body.trim())
}

/** Pending state that cannot be resolved via numbered dish choice (legacy / vague parse). */
export function isBrokenPendingContext(ctx: PendingBatchContext): boolean {
  if (ctx.awaitingNextMeal) return false
  if (ctx.awaitingMealUpdate) return false

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
  if (ctx.awaitingMealUpdate) {
    return { dateYmd: ctx.awaitingMealUpdate.dateYmd }
  }
  const slot = ctx.meals.find((m) => m.status === 'waiting_dish') ?? ctx.meals[0]
  if (!slot) return null
  return { dateYmd: slot.dateYmd }
}

/** Customer is listing dishes (newline, comma, or "and"), not picking from a numbered list. */
export function looksLikeMultiDishList(body: string): boolean {
  const trimmed = body.trim()
  if (!looksLikeFreshDishInput(trimmed)) return false
  if (/\band\b|,/.test(trimmed)) return true
  if (hasNumberedMealFormat(trimmed)) return true

  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.replace(/^meal\s+\d+\s*[:\-]\s*/i, '').trim())
    .filter((l) => l.length > 1 && looksLikeFreshDishInput(l))

  return lines.length >= 2
}

/** Bot asked for dish names on a date; pending has no dish-choice slot yet. */
export function isAwaitingMealNames(ctx: PendingBatchContext): boolean {
  if (!ctx.awaitingNextMeal) return false
  return !ctx.meals.some((m) => m.status === 'waiting_dish')
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
