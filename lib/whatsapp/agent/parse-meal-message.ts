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

const MEAL_PARSE_SYSTEM_PROMPT = (today: string, timezone: string) =>
  `You extract structured meal orders from WhatsApp messages for a meal delivery service (Nutrafi).
Today is ${today} (${timezone}).

Return ONLY valid JSON:
{
  "kind": "ADD" | "UPDATE",
  "meals": [
    {
      "dateYmd": "yyyy-MM-dd",
      "dateSource": "tomorrow|today|Tuesday|12/06|…",
      "slotIndex": 0,
      "customerPhrase": "dish name as customer wrote it",
      "customNote": "optional e.g. without onions"
    }
  ],
  "replace": {
    "dateYmd": "yyyy-MM-dd",
    "dateSource": "string",
    "removePhrase": "old dish",
    "addPhrase": "new dish",
    "customNote": "optional"
  }
}

Rules:
- Resolve "tomorrow", "today", weekdays, and DD/MM dates to dateYmd.
- slotIndex 0 = first meal of the day, 1 = second, 2 = third.
- Split multi-day messages into separate meals per day.
- For "don't want X want Y tomorrow" use kind UPDATE with replace filled.
- customerPhrase = the dish wording only (not the date).
- Ignore greetings/thanks; extract meals only.
- If no meals found, return { "kind": "ADD", "meals": [] }.`

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

function resolveRelativeDate(source: string, base: Date): string | null {
  const s = source.toLowerCase()
  if (s.includes('tomorrow')) return ymdFromDate(addDays(base, 1))
  if (s.includes('today')) return ymdFromDate(base)
  return null
}

function resolveWeekday(name: string, base: Date): string {
  const key = name.toLowerCase().replace(/[^a-z]/g, '')
  const target = WEEKDAYS[key]
  if (target === undefined) return ymdFromDate(base)
  const dayIndex = base.getDay()
  let diff = target - dayIndex
  if (diff <= 0) diff += 7
  return ymdFromDate(addDays(base, diff))
}

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

function parseSimpleAdd(body: string, base: Date): ParsedMealSlot[] {
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
    const ddmm = parseDdMm(body, base)
    if (ddmm) {
      dateYmd = ddmm
      dateSource = 'date in message'
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
    meals.push({ dateYmd, dateSource, slotIndex, customerPhrase: phrase })
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
      if (phrase.length < 2) continue
      let dateYmd = sanitizeYmd(m.dateYmd, base)
      if (!dateYmd && m.dateSource) {
        dateYmd =
          resolveRelativeDate(String(m.dateSource), base) ??
          parseDdMm(String(m.dateSource), base) ??
          resolveWeekday(String(m.dateSource), base)
      }
      if (!dateYmd) dateYmd = ymdFromDate(addDays(base, 1))
      meals.push({
        dateYmd,
        dateSource: String(m.dateSource ?? 'openai'),
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
    const dateYmd =
      sanitizeYmd(r.dateYmd, base) ??
      resolveRelativeDate(String(r.dateSource ?? 'tomorrow'), base) ??
      ymdFromDate(addDays(base, 1))
    const removePhrase = String(r.removePhrase ?? '').trim()
    const addPhrase = String(r.addPhrase ?? '').trim()
    if (removePhrase && addPhrase) {
      replace = {
        dateYmd,
        dateSource: String(r.dateSource ?? 'openai'),
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
  if (meals.length === 0) return null
  return { kind: 'ADD', meals }
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
  if (meals.length === 0) meals = parseSimpleAdd(body, base)

  if (meals.length === 0) return null

  return {
    kind: intent === 'UPDATE_MEAL' ? 'UPDATE' : 'ADD',
    meals,
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
  const today = ymdFromDate(base)
  const result = await openAiJsonCompletion<MealMessageExtraction>({
    apiKey,
    model,
    system: MEAL_PARSE_SYSTEM_PROMPT(today, timezone),
    user: `Intent hint: ${intent}\n\nMessage:\n${body}`,
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
 * Production: OpenAI first (required when WHATSAPP_AGENT_REQUIRE_OPENAI=true).
 * Rules used only as fallback if OpenAI fails.
 */
export async function parseMealMessage(
  body: string,
  intent: 'ADD_MEALS' | 'UPDATE_MEAL'
): Promise<ParseMealResult | null> {
  const base = todayInTz()
  const trimmed = body.trim()
  if (!trimmed) return null

  const cfg = whatsappAgentConfig()

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

  const rules = parseWithRules(trimmed, intent, base)
  if (!rules) return null

  return {
    extraction: rules,
    source: 'rules',
  }
}

export { todayInTz, ymdFromDate }
