/** Short greetings at the start of a chat — not meal requests or support escalations. */
const GREETING_RE =
  /^(hi|hello|hey|hiya|howdy|yo|good\s+(morning|afternoon|evening|day)|salam|assalamu?\s*alaikum|marhaba)(\s+there|\s+everyone|\s*[!.?,]*)?$/i

/** Thanks, ok, bye — conversation wrap-up when not confirming a meal choice. */
const FAREWELL_THANKS_RE =
  /^(thanks?|thank\s*you|thx|ty|cheers|much\s+appreciated|appreciate\s+it)(\s+so\s+much|\s+a\s+lot|.*)?[!.?]*$/i

const FAREWELL_SHORT_RE =
  /^(ok|okay|k|cool|got\s*it|perfect|great|lovely|nice|sounds\s+good|alright|all\s+good|bye|goodbye|see\s+you|take\s+care|have\s+a\s+(good|nice)\s+(day|one))[!.?]*$/i

export type CasualMessageKind = 'greeting' | 'farewell'

export function detectCasualMessage(body: string): CasualMessageKind | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  if (GREETING_RE.test(trimmed)) return 'greeting'
  if (FAREWELL_THANKS_RE.test(trimmed)) return 'farewell'
  if (FAREWELL_SHORT_RE.test(trimmed)) return 'farewell'
  return null
}

export function isCasualGreeting(body: string): boolean {
  return detectCasualMessage(body) === 'greeting'
}

export function isCasualFarewell(body: string): boolean {
  return detectCasualMessage(body) === 'farewell'
}
