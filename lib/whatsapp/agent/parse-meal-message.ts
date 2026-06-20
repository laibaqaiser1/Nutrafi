import {
  addDays,
  format,
  parse,
  isValid,
} from 'date-fns'
import { whatsappAgentConfig } from './config'
import { openAiJsonCompletion } from './openai-client'
import type {
  MealMessageExtraction,
  ParseMealResult,
  ParsedMealSlot,
  ParsedReplaceMeal,
} from './types'
import { filterActionableMealPhrases, isVagueDishPhrase } from './meal-phrases'

const WEEKDAYS: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 0,
  sun: 0,
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

function weekdayNameFromYmd(ymd: string): string {
  return WEEKDAY_NAMES[weekdayIndexFromYmd(ymd)] ?? 'Unknown'
}

/** Reference calendar injected into OpenAI prompt so dates are unambiguous. */
function formatDateContextForPrompt(base: Date, timezone: string): string {
  const todayYmd = ymdFromDate(base)
  const todayName = weekdayNameFromYmd(todayYmd)
  const lines = [
    `REFERENCE CALENDAR (${timezone}) — use these exact yyyy-MM-dd values:`,
    `TODAY = ${todayYmd} (${todayName})`,
    `TOMORROW = ${addDaysToYmd(todayYmd, 1)} (${weekdayNameFromYmd(addDaysToYmd(todayYmd, 1))})`,
    'Next 7 days:',
  ]
  for (let i = 0; i < 7; i++) {
    const ymd = addDaysToYmd(todayYmd, i)
    lines.push(`  ${weekdayNameFromYmd(ymd)} → ${ymd}`)
  }
  return lines.join('\n')
}

const MEAL_PARSE_SYSTEM_PROMPT = (dateContext: string, timezone: string) =>
  `You extract structured meal orders from WhatsApp messages for Nutrafi (meal delivery).

${dateContext}

Return ONLY valid JSON:
{
  "kind": "ADD" | "UPDATE",
  "meals": [
    {
      "dateYmd": "yyyy-MM-dd",
      "dateSource": "exact words customer used for the date, e.g. monday|tomorrow|today|15/06",
      "slotIndex": 0,
      "customerPhrase": "dish name only",
      "customNote": "optional"
    }
  ],
  "replace": { "dateYmd", "dateSource", "removePhrase", "addPhrase", "customNote" }
}

DATE RULES (critical — double-check dateYmd against the reference calendar above):
1. Copy dateYmd exactly from the reference calendar. Do NOT guess or compute dates yourself.
2. Weekday names → nearest matching day on or AFTER today. If today IS that weekday, use TODAY's date.
3. "today" → TODAY. "tomorrow" → TOMORROW.
4. dateYmd must match the weekday: if dateSource is "monday", dateYmd MUST be a Monday from the list above.
5. Never return a past date. Never return a date whose weekday does not match dateSource.

EXAMPLES (adapt dates to the reference calendar above):
- Today Monday, "add pasta and beef rice to my monday meal" → two meals, BOTH dateYmd = TODAY (Monday), slotIndex 0 and 1, phrases "pasta" and "beef rice".
- Today Sunday, "monday chicken biryani" → dateYmd = the Monday on or after today (usually tomorrow), NOT Saturday or any other day.
- "tomorrow: meal 1 beef, meal 2 chicken" → dateYmd = TOMORROW, two meals slotIndex 0 and 1.

OTHER RULES:
- slotIndex 0 = first meal of the day, 1 = second, 2 = third.
- Split multi-day messages into separate meals per day.
- UPDATE kind only for "don't want X want Y" / replace requests.
- customerPhrase = dish wording only (no date, no "meal 1").
- Ignore greetings; extract meals only.
- If no meals found: { "kind": "ADD", "meals": [] }.
- Timezone for all dates: ${timezone}.`

function todayInTz(): Date {
  const { timezone } = whatsappAgentConfig()
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  return parse(`${y}-${m}-${d}`, 'yyyy-MM-dd', new Date())
}

function ymdFromDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** Day of week (0=Sun … 6=Sat) from yyyy-MM-dd — timezone-safe. */
function weekdayIndexFromYmd(ymd: string): number {
  const [y, mo, d] = ymd.slice(0, 10).split('-').map((n) => parseInt(n, 10))
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
}

function addDaysToYmd(ymd: string, days: number): string {
  return ymdFromDate(addDays(parse(ymd, 'yyyy-MM-dd', new Date()), days))
}

function resolveRelativeDate(source: string, base: Date): string | null {
  const s = source.toLowerCase()
  const baseYmd = ymdFromDate(base)
  if (s.includes('tomorrow')) return addDaysToYmd(baseYmd, 1)
  if (s.includes('today')) return baseYmd
  return null
}

function resolveWeekday(name: string, base: Date): string {
  const key = name.toLowerCase().replace(/[^a-z]/g, '')
  const target = WEEKDAYS[key]
  const baseYmd = ymdFromDate(base)
  if (target === undefined) return baseYmd
  const dayIndex = weekdayIndexFromYmd(baseYmd)
  let diff = target - dayIndex
  // Same weekday as today → use today; otherwise next occurrence (never past)
  if (diff < 0) diff += 7
  return addDaysToYmd(baseYmd, diff)
}

function ensureNotPast(ymd: string, base: Date): string {
  const baseYmd = ymdFromDate(base)
  return ymd >= baseYmd ? ymd : baseYmd
}

/** Resolve date from dateSource text (today / tomorrow / weekday / DD/MM). */
function resolveDateFromSource(source: string, base: Date): string | null {
  const s = source.trim()
  if (!s) return null

  const relative = resolveRelativeDate(s, base)
  if (relative) return relative

  const ddmm = parseDdMm(s, base)
  if (ddmm) return ensureNotPast(ddmm, base)

  const key = s.toLowerCase().replace(/[^a-z]/g, '')
  if (WEEKDAYS[key] !== undefined) {
    return resolveWeekday(s, base)
  }

  return null
}

const WEEKDAY_NAME =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|fri|sat|sun)\b/i

function parseDdMm(text: string, base: Date): string | null {
  const m = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/)
  if (!m) return null
  const day = parseInt(m[1]!, 10)
  const month = parseInt(m[2]!, 10)
  let year = base.getFullYear()
  if (m[3]) {
    year = parseInt(m[3], 10)
    if (year < 100) year += 2000
  }
  const d = parse(
    `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
    'yyyy-MM-dd',
    new Date()
  )
  return isValid(d) ? ymdFromDate(d) : null
}

function splitMealPhrases(segment: string): string[] {
  return segment
    .split(/[,;]|(?:\s+and\s+)|(?:\s*&\s*)/i)
    .map((s) => s.replace(/^[\*\-\•]\s*/, '').trim())
    .filter((s) => s.length > 1)
}

function parseReplacePattern(body: string, base: Date): ParsedReplaceMeal | null {
  const patterns = [
    /(?:tomorrow|today|\w+day)[^.]*?(?:don't want|dont want|do not want|instead of)\s+(.+?)\s+(?:instead|want|i want)\s+(.+?)(?:\.|$)/i,
    /(?:tomorrow|today)[^.]*?(?:replace|change)\s+(.+?)\s+(?:with|to)\s+(.+?)(?:\.|$)/i,
  ]
  for (const re of patterns) {
    const m = body.match(re)
    if (m) {
      const dateSource = body.match(/\btomorrow\b/i)
        ? 'tomorrow'
        : body.match(/\btoday\b/i)
          ? 'today'
          : 'context'
      const dateYmd =
        resolveRelativeDate(dateSource, base) ?? ymdFromDate(addDays(base, 1))
      let customNote: string | undefined
      const addPhrase = m[2]!.trim()
      const noteMatch = addPhrase.match(/(.+?)\s+(?:without|no)\s+(.+)/i)
      let addClean = addPhrase
      if (noteMatch) {
        addClean = noteMatch[1]!.trim()
        customNote = `without ${noteMatch[2]!.trim()}`
      }
      return {
        dateYmd,
        dateSource,
        removePhrase: m[1]!.trim(),
        addPhrase: addClean,
        customNote,
      }
    }
  }
  return null
}

function parseWeekdayLines(body: string, base: Date): ParsedMealSlot[] {
  const lines = body.split(/\n+/)
  const meals: ParsedMealSlot[] = []
  const dayLine =
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\s*[:\-]?\s*(.+)$/i

  for (const line of lines) {
    const m = line.trim().match(dayLine)
    if (!m) continue
    const dateYmd = resolveWeekday(m[1]!, base)
    const phrases = splitMealPhrases(m[2]!)
    phrases.forEach((phrase, slotIndex) => {
      meals.push({
        dateYmd,
        dateSource: m[1]!,
        slotIndex,
        customerPhrase: phrase,
      })
    })
  }
  return meals
}

function parseDatedBlocks(body: string, base: Date): ParsedMealSlot[] {
  const meals: ParsedMealSlot[] = []
  const blocks = body.split(
    /(?=(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|\d{1,2}[\/\-]\d{1,2}))/gi
  )

  for (const block of blocks) {
    const header = block.match(
      /^((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)[^(\n]*(?:\(\s*\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\s*\))?|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i
    )
    if (!header) continue

    let dateYmd: string | null = null
    let dateSource = header[1]!
    const ddmm = parseDdMm(header[1]!, base)
    if (ddmm) {
      dateYmd = ddmm
    } else {
      const dayMatch = header[1]!.match(
        /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/i
      )
      if (dayMatch) dateYmd = resolveWeekday(dayMatch[1]!, base)
    }
    if (!dateYmd) continue

    const lines = block.split('\n').slice(1)
    const phrases: string[] = []
    for (const line of lines) {
      const bullet = line.replace(/^[\*\-\•]\s*/, '').trim()
      if (bullet.length > 1) phrases.push(bullet)
    }
    if (phrases.length === 0) {
      const inline = block.replace(header[0], '').trim()
      phrases.push(...splitMealPhrases(inline))
    }
    phrases.forEach((phrase, slotIndex) => {
      if (phrase.length > 1) {
        meals.push({ dateYmd, dateSource, slotIndex, customerPhrase: phrase })
      }
    })
  }
  return meals
}

function parseInlineWeekdayMeals(body: string, base: Date): ParsedMealSlot[] {
  const dayMatch = body.match(
    /\b(?:for|on|to)\s+(?:my\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|fri|sat|sun)(?:\s+meal[s]?)?\b/i
  ) ?? body.match(WEEKDAY_NAME)
  if (!dayMatch) return []

  const dateYmd = resolveWeekday(dayMatch[1]!, base)
  const dateSource = dayMatch[1]!

  const afterDay = body.slice(dayMatch.index! + dayMatch[0].length)
  const beforeDay = body.slice(0, dayMatch.index!)
  const dishText = `${beforeDay} ${afterDay}`
    .replace(/\b(hello|hi|please|add|my|meal|meals|for|on|to)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const phrases = splitMealPhrases(dishText).filter((p) => {
    const lower = p.toLowerCase()
    return !WEEKDAY_NAME.test(lower) && lower.length > 1
  })

  return phrases.map((phrase, slotIndex) => ({
    dateYmd,
    dateSource,
    slotIndex,
    customerPhrase: phrase,
  }))
}

function parseSimpleAdd(body: string, base: Date): ParsedMealSlot[] {
  const inlineWeekday = parseInlineWeekdayMeals(body, base)
  if (inlineWeekday.length > 0) return inlineWeekday

  const meals: ParsedMealSlot[] = []
  const lower = body.toLowerCase()

  let dateYmd = ymdFromDate(addDays(base, 1))
  let dateSource = 'tomorrow'
  if (lower.includes('today')) {
    dateYmd = ymdFromDate(base)
    dateSource = 'today'
  } else if (lower.includes('tomorrow')) {
    dateYmd = ymdFromDate(addDays(base, 1))
    dateSource = 'tomorrow'
  } else {
    const dayMatch = body.match(WEEKDAY_NAME)
    if (dayMatch) {
      dateYmd = resolveWeekday(dayMatch[1]!, base)
      dateSource = dayMatch[1]!
    } else {
      const ddmm = parseDdMm(body, base)
      if (ddmm) {
        dateYmd = ensureNotPast(ddmm, base)
        dateSource = 'date in message'
      }
    }
  }

  const addMatch = body.match(/\badd\s+(.+?)\s+for\s+(tomorrow|today)/i)
  const phrases: string[] = []
  if (addMatch) {
    phrases.push(...splitMealPhrases(addMatch[1]!))
  } else {
    const cleaned = body
      .replace(/\b(add|for|tomorrow|today|please|thanks|thank you)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleaned.length > 2) {
      const second = body.match(/(?:second one|2nd one|and second)\s+(.+)/i)
      if (second) {
        const first = cleaned.replace(second[0], '').trim()
        if (first) phrases.push(first)
        phrases.push(second[1]!.trim())
      } else {
        phrases.push(...splitMealPhrases(cleaned))
      }
    }
  }

  phrases.forEach((phrase, slotIndex) => {
    if (!isVagueDishPhrase(phrase)) {
      meals.push({ dateYmd, dateSource, slotIndex, customerPhrase: phrase })
    }
  })
  return meals
}

function sanitizeYmd(value: unknown, base: Date): string | null {
  if (typeof value !== 'string') return null
  const ymd = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = parse(ymd, 'yyyy-MM-dd', new Date())
  return isValid(d) ? ymd : null
}

/** Pick final date: prefer rules-based resolution from dateSource; validate AI dateYmd. */
function resolveMealDate(
  aiYmd: unknown,
  dateSource: string,
  base: Date
): { dateYmd: string; dateSource: string; aiCorrected: boolean } {
  const source = dateSource.trim()
  const fromSource = resolveDateFromSource(source, base)
  const aiSanitized = sanitizeYmd(aiYmd, base)
  const aiNormalized = aiSanitized ? ensureNotPast(aiSanitized, base) : null

  if (fromSource) {
    const aiCorrected = aiNormalized != null && aiNormalized !== fromSource
    return {
      dateYmd: fromSource,
      dateSource: aiCorrected
        ? `${source || 'date'} (AI had ${aiNormalized}, corrected to ${fromSource})`
        : source || weekdayNameFromYmd(fromSource).toLowerCase(),
      aiCorrected,
    }
  }

  if (aiNormalized) {
    return {
      dateYmd: aiNormalized,
      dateSource: source || 'openai',
      aiCorrected: false,
    }
  }

  const fallback = addDaysToYmd(ymdFromDate(base), 1)
  return {
    dateYmd: fallback,
    dateSource: source || 'tomorrow (fallback)',
    aiCorrected: true,
  }
}

function normalizeAiExtraction(
  raw: MealMessageExtraction,
  base: Date,
  intent: 'ADD_MEALS' | 'UPDATE_MEAL'
): MealMessageExtraction | null {
  const kind =
    raw.kind === 'UPDATE' || intent === 'UPDATE_MEAL' ? 'UPDATE' : 'ADD'

  const meals: ParsedMealSlot[] = []
  if (Array.isArray(raw.meals)) {
    for (const m of raw.meals) {
      if (!m || typeof m !== 'object') continue
      const phrase = String(m.customerPhrase ?? '').trim()
      if (phrase.length < 2 || isVagueDishPhrase(phrase)) continue
      const rawDateSource = String(m.dateSource ?? '').trim()
      const resolved = resolveMealDate(m.dateYmd, rawDateSource, base)
      meals.push({
        dateYmd: resolved.dateYmd,
        dateSource: resolved.dateSource,
        slotIndex:
          typeof m.slotIndex === 'number' && m.slotIndex >= 0
            ? m.slotIndex
            : 0,
        customerPhrase: phrase,
        customNote:
          m.customNote != null ? String(m.customNote).trim() : undefined,
      })
    }
  }

  let replace: ParsedReplaceMeal | undefined
  if (raw.replace && typeof raw.replace === 'object') {
    const r = raw.replace
    const replaceSource = String(r.dateSource ?? 'tomorrow').trim()
    const resolved = resolveMealDate(r.dateYmd, replaceSource, base)
    const dateYmd = resolved.dateYmd
    const removePhrase = String(r.removePhrase ?? '').trim()
    const addPhrase = String(r.addPhrase ?? '').trim()
    if (removePhrase && addPhrase) {
      replace = {
        dateYmd,
        dateSource: resolved.dateSource,
        removePhrase,
        addPhrase,
        customNote:
          r.customNote != null ? String(r.customNote).trim() : undefined,
      }
    }
  }

  if (kind === 'UPDATE' && replace) {
    return { kind: 'UPDATE', meals, replace }
  }
  const actionable = filterActionableMealPhrases(meals)
  if (actionable.length === 0) return null
  return { kind: 'ADD', meals: actionable }
}

function parseWithRules(
  body: string,
  intent: 'ADD_MEALS' | 'UPDATE_MEAL',
  base: Date
): MealMessageExtraction | null {
  if (intent === 'UPDATE_MEAL') {
    const replace = parseReplacePattern(body, base)
    if (replace) {
      return { kind: 'UPDATE', meals: [], replace }
    }
  }

  let meals = parseWeekdayLines(body, base)
  if (meals.length === 0) meals = parseDatedBlocks(body, base)
  if (meals.length === 0) meals = parseInlineWeekdayMeals(body, base)
  if (meals.length === 0) meals = parseSimpleAdd(body, base)

  if (meals.length === 0) return null

  const actionable = filterActionableMealPhrases(meals)
  if (actionable.length === 0) return null

  return {
    kind: intent === 'UPDATE_MEAL' ? 'UPDATE' : 'ADD',
    meals: actionable,
  }
}

async function parseWithOpenAi(
  body: string,
  intent: 'ADD_MEALS' | 'UPDATE_MEAL',
  base: Date,
  apiKey: string,
  model: string,
  timezone: string
): Promise<ParseMealResult | null> {
  const dateContext = formatDateContextForPrompt(base, timezone)
  const result = await openAiJsonCompletion<MealMessageExtraction>({
    apiKey,
    model,
    system: MEAL_PARSE_SYSTEM_PROMPT(dateContext, timezone),
    user: [
      `Intent hint: ${intent}`,
      '',
      dateContext,
      '',
      'Customer message:',
      body,
    ].join('\n'),
  })

  if (!result.ok || !result.data) {
    return null
  }

  const normalized = normalizeAiExtraction(result.data, base, intent)
  if (!normalized) {
    return null
  }

  return {
    extraction: normalized,
    source: 'openai',
    model: result.model,
    openAiRaw: result.raw,
  }
}

/**
 * Parse customer message into structured meals.
 * Rules first (fast); OpenAI when rules cannot extract meals.
 */
export async function parseMealMessage(
  body: string,
  intent: 'ADD_MEALS' | 'UPDATE_MEAL'
): Promise<ParseMealResult | null> {
  const base = todayInTz()
  const trimmed = body.trim()
  if (!trimmed) return null

  const cfg = whatsappAgentConfig()

  const rules = parseWithRules(trimmed, intent, base)
  if (rules) {
    const hasMeals = rules.meals.length > 0
    const hasReplace = rules.kind === 'UPDATE' && rules.replace != null
    if (hasMeals || hasReplace) {
      return {
        extraction: rules,
        source: 'rules',
      }
    }
  }

  if (cfg.openAiKey) {
    const ai = await parseWithOpenAi(
      trimmed,
      intent,
      base,
      cfg.openAiKey,
      cfg.openAiModel,
      cfg.timezone
    )
    if (ai) return ai
  }

  if (cfg.requireOpenAi && cfg.openAiKey) {
    return null
  }

  return rules ? { extraction: rules, source: 'rules' } : null
}

export { todayInTz, ymdFromDate }

/** Best-effort date from message text when no dish names were parsed. */
export function inferMealDateFromMessage(body: string, base?: Date): {
  dateYmd: string
  dateSource: string
} | null {
  const ref = base ?? todayInTz()
  const lower = body.toLowerCase()
  if (lower.includes('tomorrow') || lower.includes('tommorow')) {
    return {
      dateYmd: addDaysToYmd(ymdFromDate(ref), 1),
      dateSource: 'tomorrow',
    }
  }
  if (lower.includes('today')) {
    return { dateYmd: ymdFromDate(ref), dateSource: 'today' }
  }
  const dayMatch = body.match(WEEKDAY_NAME)
  if (dayMatch) {
    const dateYmd = resolveWeekday(dayMatch[1]!, ref)
    return { dateYmd, dateSource: dayMatch[1]! }
  }
  const ddmm = parseDdMm(body, ref)
  if (ddmm) {
    return { dateYmd: ensureNotPast(ddmm, ref), dateSource: 'date in message' }
  }
  return null
}
