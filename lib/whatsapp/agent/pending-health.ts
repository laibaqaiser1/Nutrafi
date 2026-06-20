import { addDays, format, parseISO } from 'date-fns'
import { detectCasualMessage } from './casual-messages'
import { isVagueDishPhrase } from './meal-phrases'
import { todayInTz, ymdFromDate } from './parse-meal-message'
import { significantTokens } from './string-similarity'
import type { PendingBatchContext } from './types'

/** Pending state that cannot be resolved via numbered dish choice (legacy / vague parse). */
export function isBrokenPendingContext(ctx: PendingBatchContext): boolean {
  const waiting = ctx.meals.filter((m) => m.status === 'waiting_dish')
  if (waiting.length === 0) return false

  return waiting.every(
    (slot) =>
      (slot.candidateDishIds?.length ?? 0) === 0 ||
      isVagueDishPhrase(slot.customerPhrase)
  )
}

export function pendingTargetDate(ctx: PendingBatchContext): { dateYmd: string } | null {
  const slot = ctx.meals.find((m) => m.status === 'waiting_dish') ?? ctx.meals[0]
  if (!slot) return null
  return { dateYmd: slot.dateYmd }
}

function dateHintFromYmd(dateYmd: string): string {
  const baseYmd = ymdFromDate(todayInTz())
  const tomorrowYmd = format(addDays(parseISO(baseYmd), 1), 'yyyy-MM-dd')
  if (dateYmd === baseYmd) return 'today'
  if (dateYmd === tomorrowYmd) return 'tomorrow'
  return format(parseISO(dateYmd), 'EEEE').toLowerCase()
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
