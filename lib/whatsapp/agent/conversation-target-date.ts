import { prisma } from '@/lib/prisma'
import { createPendingAction, getOpenPendingAction, parsePendingContext } from './pending-actions'
import { todayInTz, ymdFromDate } from './parse-meal-message'
import type { MealMessageExtraction } from './types'
import { addDays, format, parseISO } from 'date-fns'

export function messageHasExplicitDate(body: string): boolean {
  const lower = body.toLowerCase()
  return (
    lower.includes('tomorrow') ||
    lower.includes('tommorow') ||
    lower.includes('today') ||
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.test(
      body
    ) ||
    /\d{1,2}[\/\-]\d{1,2}/.test(body)
  )
}

export function dateHintFromYmd(dateYmd: string): string {
  const baseYmd = ymdFromDate(todayInTz())
  const tomorrowYmd = format(addDays(parseISO(baseYmd), 1), 'yyyy-MM-dd')
  if (dateYmd === baseYmd) return 'today'
  if (dateYmd === tomorrowYmd) return 'tomorrow'
  return format(parseISO(dateYmd), 'EEEE').toLowerCase()
}

export function augmentBodyWithDateYmd(body: string, dateYmd: string): string {
  if (messageHasExplicitDate(body)) return body
  return `${body.trim()} for ${dateHintFromYmd(dateYmd)}`
}

function dateYmdFromRunPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const dateYmd = (payload as { dateYmd?: unknown }).dateYmd
  return typeof dateYmd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd) ? dateYmd : null
}

/** Remember which day the customer is ordering for (e.g. after "add meals for Monday"). */
export async function rememberTargetDateForConversation(params: {
  conversationId: number
  customerId?: number
  mealPlanId?: number
  createdFromRunId?: number
  dateYmd: string
  mealsPerDay: number
}): Promise<void> {
  await createPendingAction({
    conversationId: params.conversationId,
    customerId: params.customerId,
    mealPlanId: params.mealPlanId,
    createdFromRunId: params.createdFromRunId,
    type: 'MEAL_BATCH',
    context: {
      intent: 'ADD_MEALS',
      meals: [],
      currentQuestionIndex: 0,
      targetDateYmd: params.dateYmd,
      mealsPerDay: params.mealsPerDay,
      awaitingNextMeal: {
        dateYmd: params.dateYmd,
        mealsPerDay: params.mealsPerDay,
      },
    },
  })
}

export async function resolveConversationTargetDate(
  conversationId: number,
  openPending?: Awaited<ReturnType<typeof getOpenPendingAction>>
): Promise<{ dateYmd: string; mealsPerDay?: number } | null> {
  const pending = openPending ?? (await getOpenPendingAction(conversationId))
  if (pending) {
    const ctx = parsePendingContext(pending.context)
    if (ctx?.targetDateYmd) {
      return {
        dateYmd: ctx.targetDateYmd,
        mealsPerDay: ctx.mealsPerDay ?? ctx.awaitingNextMeal?.mealsPerDay,
      }
    }
    if (ctx?.awaitingNextMeal) {
      return {
        dateYmd: ctx.awaitingNextMeal.dateYmd,
        mealsPerDay: ctx.awaitingNextMeal.mealsPerDay,
      }
    }
    const slot =
      ctx?.meals.find((m) => m.status === 'waiting_dish') ?? ctx?.meals[0]
    if (slot?.dateYmd) {
      return { dateYmd: slot.dateYmd, mealsPerDay: ctx?.mealsPerDay }
    }
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentRuns = await prisma.whatsAppAgentRun.findMany({
    where: {
      conversationId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { payload: true },
  })

  for (const run of recentRuns) {
    const dateYmd = dateYmdFromRunPayload(run.payload)
    if (dateYmd) return { dateYmd }
  }

  return null
}

export async function applyConversationTargetDate(
  conversationId: number,
  body: string,
  openPending?: Awaited<ReturnType<typeof getOpenPendingAction>>
): Promise<string> {
  if (messageHasExplicitDate(body)) return body
  const target = await resolveConversationTargetDate(conversationId, openPending)
  if (!target) return body
  return augmentBodyWithDateYmd(body, target.dateYmd)
}

/** Force all parsed meals onto the conversation target date when the customer did not name a new date. */
export async function enforceTargetDateOnExtraction(
  conversationId: number,
  extraction: MealMessageExtraction,
  originalBody: string,
  openPending?: Awaited<ReturnType<typeof getOpenPendingAction>>
): Promise<void> {
  if (extraction.kind !== 'ADD' || extraction.meals.length === 0) return
  if (messageHasExplicitDate(originalBody)) return

  const target = await resolveConversationTargetDate(conversationId, openPending)
  if (!target) return

  const hint = dateHintFromYmd(target.dateYmd)
  for (const meal of extraction.meals) {
    meal.dateYmd = target.dateYmd
    meal.dateSource = hint
  }
}
