/** Outbound reply bodies that redirect the customer to human support. */
export const SUPPORT_ESCALATION_REPLY_MARKERS = [
  'This number is only for adding or updating your meals.',
  "We couldn't find your phone number in our customer records.",
  "don't have an active meal plan right now.",
  "I didn't understand that.",
] as const

export type SupportEscalationReason =
  | 'NOT_MEAL'
  | 'AMBIGUOUS'
  | 'SUPPORT_DURING_PENDING'
  | 'NO_CUSTOMER'
  | 'NO_MEAL_PLAN'
  | 'OTHER'

export function inferSupportEscalationReason(
  parsedIntent: unknown,
  payload: unknown,
  replyBody: string | null
): SupportEscalationReason {
  const intent =
    parsedIntent && typeof parsedIntent === 'object' && 'intent' in parsedIntent
      ? String((parsedIntent as { intent: unknown }).intent)
      : null

  const payloadReason =
    payload && typeof payload === 'object' && 'reason' in payload
      ? String((payload as { reason: unknown }).reason)
      : null

  if (payloadReason === 'support_question_during_pending') return 'SUPPORT_DURING_PENDING'
  if (intent === 'NOT_MEAL') return 'NOT_MEAL'
  if (intent === 'AMBIGUOUS') return 'AMBIGUOUS'

  if (replyBody?.includes("couldn't find your phone number")) return 'NO_CUSTOMER'
  if (replyBody?.includes("don't have an active meal plan")) return 'NO_MEAL_PLAN'
  if (replyBody?.includes("I didn't understand that")) return 'AMBIGUOUS'
  if (replyBody?.includes('This number is only for adding or updating')) return 'NOT_MEAL'

  return 'OTHER'
}

export function supportEscalationReasonLabel(reason: SupportEscalationReason): string {
  switch (reason) {
    case 'NOT_MEAL':
      return 'Non-meal question'
    case 'AMBIGUOUS':
      return 'Could not understand'
    case 'SUPPORT_DURING_PENDING':
      return 'Support question during meal choice'
    case 'NO_CUSTOMER':
      return 'Phone not in customer records'
    case 'NO_MEAL_PLAN':
      return 'No active meal plan'
    default:
      return 'Redirected to support'
  }
}
