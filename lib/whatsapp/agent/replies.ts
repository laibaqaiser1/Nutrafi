import { formatPhoneDisplay } from '@/lib/whatsapp/normalize-phone'
import { whatsappAgentConfig } from './config'
import type { DishCandidate, PendingMealSlot } from './types'
import { isVagueDishPhrase, sanitizeDisplayPhrase } from './meal-phrases'
import { format, parseISO } from 'date-fns'

function supportLine(): string {
  const { supportPhone } = whatsappAgentConfig()
  return `For delivery, payments, or other questions, contact customer support: ${formatPhoneDisplay(supportPhone)}`
}

export function supportOnlyReply(): string {
  return [
    'This number is only for adding or updating your meals.',
    '',
    supportLine(),
    '',
    'To add meals, send for example:',
    'DATE: tomorrow',
    'Meal 1: Chicken Biryani',
    'Meal 2: Beef Kofta with Rice',
  ].join('\n')
}

export function greetingReply(): string {
  return 'Hi there! How can I help you?'
}

export function farewellReply(): string {
  return 'Thanks for contacting Nutrafi! If you need to add or update meals later, just message us anytime.'
}

/** Detect our standard closing WhatsApp reply (for ignoring ok → sure duplicates). */
export function isFarewellReplyBody(body: string | null | undefined): boolean {
  if (!body?.trim()) return false
  return (
    body.includes('Thanks for contacting Nutrafi') ||
    body.includes('just message us anytime')
  )
}

export function noCustomerReply(): string {
  return [
    "We couldn't find your phone number in our customer records.",
    supportLine(),
  ].join('\n\n')
}

export function noMealPlanReply(customerName: string): string {
  return [
    `Hi ${customerName}, you don't have an active meal plan right now.`,
    supportLine(),
  ].join('\n\n')
}

export function cancelReply(): string {
  return 'Okay, your pending meal request was cancelled. Send a new message anytime to add or update meals.'
}

export function expiredPendingReply(): string {
  return [
    'Your previous meal request has expired.',
    'Please send your meal choices again.',
    supportLine(),
  ].join('\n\n')
}

export function ambiguousReply(): string {
  return [
    "I didn't understand that.",
    'Send your meals (e.g. "tomorrow: chicken biryani, beef kofta") or reply CANCEL.',
    supportLine(),
  ].join('\n\n')
}

export function formatDateLabel(dateYmd: string): string {
  try {
    return format(parseISO(dateYmd), 'EEE d MMM')
  } catch {
    return dateYmd
  }
}

export function dishChoiceQuestion(
  slot: PendingMealSlot,
  candidates: DishCandidate[],
  mealsPerDay = 2
): string {
  if (candidates.length === 0 || isVagueDishPhrase(slot.customerPhrase)) {
    return askWhichMealsReply(slot.dateYmd, mealsPerDay)
  }

  const dateLabel = formatDateLabel(slot.dateYmd)
  const displayPhrase = sanitizeDisplayPhrase(slot.customerPhrase)
  const lines = [
    `For ${dateLabel}, I found a few options for "${displayPhrase}":`,
    '',
  ]
  candidates.slice(0, 6).forEach((c, i) => {
    lines.push(`${i + 1}. ${c.name}`)
  })
  lines.push('')
  lines.push('Which one would you like? Reply with the number (e.g. 1) or the dish name.')
  return lines.join('\n')
}

export function askWhichMealsReply(dateYmd: string, mealsPerDay: number): string {
  const dateLabel = formatDateLabel(dateYmd)
  const lines = [
    `Sure! What would you like for ${dateLabel}?`,
    '',
    'Please send the dish names, for example:',
  ]

  if (mealsPerDay <= 1) {
    lines.push('Chicken Biryani')
  } else {
    lines.push('Meal 1: Chicken Biryani')
    lines.push('Meal 2: Beef Kofta with Rice')
  }

  lines.push('')
  lines.push('Or in one line: chicken biryani and beef kofta for tomorrow')
  return lines.join('\n')
}

export function dayAlreadyHasMealsReply(
  dateYmd: string,
  existingMeals: Array<{ dishName: string | null }>,
  mealsPerDay: number
): string {
  const dateLabel = formatDateLabel(dateYmd)
  const lines = [
    `You already have ${mealsPerDay} meal(s) set for ${dateLabel}:`,
    '',
  ]
  for (const meal of existingMeals) {
    lines.push(`• ${meal.dishName ?? 'Meal'}`)
  }
  lines.push('')
  lines.push('Would you like to change one? Reply with what to update, for example:')
  lines.push(`"change meal 1 to chicken pasta for ${dateLabel}"`)
  lines.push('Or reply CANCEL to start over.')
  return lines.join('\n')
}

export function nextMealPrompt(
  dateYmd: string,
  mealsSetCount: number,
  mealsPerDay: number,
  setMealNames: string[]
): string {
  const dateLabel = formatDateLabel(dateYmd)
  const ordinals = ['first', 'second', 'third']
  const lines: string[] = []

  const lastName = setMealNames[setMealNames.length - 1]
  if (lastName && mealsSetCount > 0) {
    const setLabel = ordinals[mealsSetCount - 1] ?? `#${mealsSetCount}`
    lines.push(`✅ Your ${setLabel} meal is set: ${lastName}`)
    lines.push('')
  }

  if (mealsSetCount >= mealsPerDay) {
    return lines.join('\n')
  }

  const nextLabel = ordinals[mealsSetCount] ?? `meal ${mealsSetCount + 1}`
  lines.push(`What would you like for your ${nextLabel} meal on ${dateLabel}?`)
  lines.push('Just send the dish name (e.g. beef burger).')
  return lines.join('\n')
}

export function mealsAddedConfirmation(
  applied: Array<{ dateYmd: string; dishName: string | null; slotIndex: number }>
): string {
  const byDate = new Map<string, string[]>()
  for (const row of applied) {
    const list = byDate.get(row.dateYmd) ?? []
    list.push(row.dishName ?? 'Meal')
    byDate.set(row.dateYmd, list)
  }

  const lines = ['✅ Your meals are updated!', '']
  for (const [ymd, names] of byDate) {
    lines.push(formatDateLabel(ymd))
    for (const n of names) lines.push(`• ${n}`)
    lines.push('')
  }
  lines.push('Need changes? Reply anytime.')
  lines.push(supportLine())
  return lines.join('\n')
}

export function partialApplyReply(
  appliedCount: number,
  pendingQuestion: string
): string {
  return [
    appliedCount > 0
      ? `✅ Added ${appliedCount} meal(s). Still need your help with one choice:`
      : 'I need your help to finish adding meals:',
    '',
    pendingQuestion,
  ].join('\n')
}

export function pendingOpenReply(): string {
  return [
    'You still have a pending meal choice.',
    'Please answer the question above, or reply CANCEL to start over.',
  ].join('\n')
}

export function agentDisabledReply(): string {
  return supportOnlyReply()
}

export function openAiUnavailableReply(): string {
  return [
    'Our meal assistant is temporarily unavailable.',
    'Please try again shortly or contact customer support to add your meals.',
    supportLine(),
  ].join('\n\n')
}

export function parseFailedReply(): string {
  return [
    "I couldn't read your meal request.",
    'Try:',
    'Tomorrow: Chicken Biryani, Beef Kofta with Rice',
    '',
    supportLine(),
  ].join('\n')
}

export function errorReply(message: string): string {
  return [`⚠️ ${message}`, '', supportLine()].join('\n')
}
