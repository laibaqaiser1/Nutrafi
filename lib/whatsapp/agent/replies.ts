import { formatPhoneDisplay } from '@/lib/whatsapp/normalize-phone'
import { whatsappAgentConfig } from './config'
import type { DishCandidate, PendingMealSlot } from './types'
import { isVagueDishPhrase, sanitizeDisplayPhrase } from './meal-phrases'
import { format, parseISO } from 'date-fns'

export const MENU_URL = 'https://nutrafikitchen.com/#menu'

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
  lines.push('')
  lines.push(`View our full menu: ${MENU_URL}`)
  return lines.join('\n')
}

export function menuHelpReply(params: {
  suggestions: DishCandidate[]
  dateYmd?: string
  pendingReminder?: boolean
  includesPdf?: boolean
}): string {
  const lines: string[] = []

  if (params.includesPdf) {
    lines.push('See the menu PDF attached in this chat.')
  } else {
    lines.push('You can view our full menu here:', MENU_URL)
  }

  if (params.suggestions.length > 0) {
    lines.push('')
    lines.push('Some popular choices:')
    params.suggestions.slice(0, 6).forEach((dish, index) => {
      lines.push(`${index + 1}. ${dish.name}`)
    })
  }

  lines.push('')
  if (params.dateYmd) {
    const dateLabel = formatDateLabel(params.dateYmd)
    lines.push(`Reply with the dish name(s) for ${dateLabel}, for example:`)
  } else {
    lines.push('Reply with dish names, for example:')
  }
  lines.push('Meal 1: Chicken Biryani')
  lines.push('Meal 2: Beef Kofta with Rice')

  if (params.pendingReminder) {
    lines.push('')
    lines.push('Or reply CANCEL to start over.')
  }

  return lines.join('\n')
}

export function mealUpdateHowReply(params: {
  dateYmd: string
  existingMeals: Array<{ dishName: string | null }>
}): string {
  const dateLabel = formatDateLabel(params.dateYmd)
  const lines = [
    `Sure! Which meal on ${dateLabel} would you like to change?`,
    '',
  ]
  params.existingMeals.forEach((meal, index) => {
    lines.push(`Meal ${index + 1}: ${meal.dishName ?? 'Meal'}`)
  })
  lines.push('')
  lines.push('Reply for example:')
  lines.push(`"change meal 1 to chicken pasta for ${dateLabel}"`)
  lines.push('Or reply CANCEL to start over.')
  return lines.join('\n')
}

export function dayAlreadyHasMealsReply(
  dateYmd: string,
  existingMeals: Array<{ dishName: string | null }>,
  _mealsPerDay: number
): string {
  const dateLabel = formatDateLabel(dateYmd)
  const lines = [
    `You already have ${existingMeals.length} meal(s) set for ${dateLabel}:`,
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

export function emptySlotApplyFailedReply(
  dateYmd: string,
  emptySlotCount: number
): string {
  const dateLabel = formatDateLabel(dateYmd)
  if (emptySlotCount > 0) {
    return [
      `Sorry — I matched your dish but couldn't save it to ${dateLabel}.`,
      `There ${emptySlotCount === 1 ? 'is' : 'are'} ${emptySlotCount} open slot${emptySlotCount === 1 ? '' : 's'} on that day in your plan.`,
      '',
      'Please try sending the dish name again, or reply CANCEL to start over.',
    ].join('\n')
  }
  return [
    `Sorry — I couldn't add that meal to ${dateLabel} because the day is full on your plan.`,
    '',
    'Reply with what to change, for example:',
    `"change meal 1 to chicken pasta for ${dateLabel}"`,
    'Or reply CANCEL to start over.',
  ].join('\n')
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

export function mealPlanStatusReply(params: {
  dateYmd: string
  mealsPerDay: number
  activeMeals: Array<{ dishName: string | null; slotIndex: number }>
  planRemainingMeals: number | null
}): string {
  const { dateYmd, mealsPerDay, activeMeals, planRemainingMeals } = params
  const dateLabel = formatDateLabel(dateYmd)
  const ordinals = ['first', 'second', 'third']
  const lines: string[] = []

  lines.push(`Your plan includes ${mealsPerDay} meal${mealsPerDay === 1 ? '' : 's'} per day.`)

  if (planRemainingMeals != null) {
    lines.push(
      `You have ${planRemainingMeals} meal${planRemainingMeals === 1 ? '' : 's'} remaining on your plan overall.`
    )
  }

  lines.push('')
  lines.push(`For ${dateLabel}:`)

  if (activeMeals.length === 0) {
    lines.push(`No meals chosen yet (0 of ${mealsPerDay}).`)
  } else {
    for (let i = 0; i < mealsPerDay; i++) {
      const meal = activeMeals[i]
      const label = ordinals[i] ?? `Meal ${i + 1}`
      if (meal?.dishName) {
        lines.push(`✅ ${label.charAt(0).toUpperCase()}${label.slice(1)} meal: ${meal.dishName}`)
      } else {
        lines.push(`⏳ ${label.charAt(0).toUpperCase()}${label.slice(1)} meal: not chosen yet`)
      }
    }
  }

  const slotsOpen = activeMeals.length < mealsPerDay
  lines.push('')

  if (slotsOpen) {
    const nextIndex = activeMeals.length
    const nextLabel = ordinals[nextIndex] ?? `meal ${nextIndex + 1}`
    lines.push(
      `What would you like for your ${nextLabel} meal? Just send the dish name (e.g. beef kofta with rice).`
    )
  } else {
    lines.push('Your meals for this day are complete. Reply anytime if you want to change something.')
  }

  return lines.join('\n')
}

export function skipDayConfirmationReply(
  dateYmd: string,
  mealsPerDay: number,
  alreadySkipped: boolean
): string {
  const dateLabel = formatDateLabel(dateYmd)
  if (alreadySkipped) {
    return `${dateLabel} is already marked as skipped — no meals will be delivered that day.`
  }
  return [
    `✅ ${dateLabel} is marked as skipped.`,
    `No meals will be delivered that day (${mealsPerDay} meal${mealsPerDay === 1 ? '' : 's'} on your plan).`,
    '',
    'Need meals on a different day? Just send your choices anytime.',
  ].join('\n')
}

export function skipDayNeedsDateReply(): string {
  return [
    'Which day should we skip?',
    'For example: "No meals on Tuesday" or "Cancel tomorrow — I am away".',
  ].join('\n')
}

export function skipDayAlreadyDeliveredReply(
  dateYmd: string,
  deliveredCount = 1
): string {
  const dateLabel = formatDateLabel(dateYmd)
  const plural = deliveredCount > 1
  return [
    'Sorry for the inconvenience.',
    plural
      ? `Your meals for ${dateLabel} have already been delivered.`
      : `Your meal for ${dateLabel} has already been delivered.`,
    'We cannot skip or cancel through this chat.',
    '',
    supportLine(),
  ].join('\n')
}

export function dishesNotOnMenuReply(params: {
  dateYmd: string
  unavailablePhrases: string[]
  suggestions: DishCandidate[]
  appliedCount?: number
}): string {
  const dateLabel = formatDateLabel(params.dateYmd)
  const lines: string[] = []

  if ((params.appliedCount ?? 0) > 0) {
    lines.push(`✅ Added ${params.appliedCount} meal(s) from your message.`, '')
  }

  lines.push(`Sorry, these items are not on our menu for ${dateLabel}:`)
  lines.push('')
  for (const phrase of params.unavailablePhrases) {
    lines.push(`• ${sanitizeDisplayPhrase(phrase)}`)
  }
  lines.push('')

  if (params.suggestions.length > 0) {
    lines.push('You might like one of these from our menu instead:')
    params.suggestions.slice(0, 6).forEach((s, i) => {
      lines.push(`${i + 1}. ${s.name}`)
    })
    lines.push('')
    lines.push(`View our full menu: ${MENU_URL}`)
    lines.push('')
    lines.push('Reply with a dish name, or send for example:')
    lines.push('Meal 1: Chicken Biryani')
    lines.push('Meal 2: Beef Kofta with Rice')
  } else {
    lines.push('Please contact customer support and we can help you choose from our menu.')
    lines.push('')
    lines.push(supportLine())
  }

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
