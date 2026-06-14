import {
  addDays,
  format,
  parse,
  isValid,
} from 'date-fns'
import { whatsappAgentConfig } from './config'
import type { MealMessageExtraction, ParsedMealSlot, ParsedReplaceMeal } from './types'

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

export async function parseMealMessage(
  body: string,
  intent: 'ADD_MEALS' | 'UPDATE_MEAL'
): Promise<MealMessageExtraction | null> {
  const base = todayInTz()
  const trimmed = body.trim()
  if (!trimmed) return null

  const cfg = whatsappAgentConfig()
  if (cfg.openAiKey) {
    const ai = await parseWithOpenAi(trimmed, intent, base, cfg.openAiKey, cfg.openAiModel)
    if (ai) return ai
  }

  if (intent === 'UPDATE_MEAL') {
    const replace = parseReplacePattern(trimmed, base)
    if (replace) {
      return { kind: 'UPDATE', meals: [], replace }
    }
  }

  let meals = parseWeekdayLines(trimmed, base)
  if (meals.length === 0) meals = parseDatedBlocks(trimmed, base)
  if (meals.length === 0) meals = parseSimpleAdd(trimmed, base)

  if (meals.length === 0) return null

  return {
    kind: intent === 'UPDATE_MEAL' ? 'UPDATE' : 'ADD',
    meals,
  }
}

async function parseWithOpenAi(
  body: string,
  intent: string,
  base: Date,
  apiKey: string,
  model: string
): Promise<MealMessageExtraction | null> {
  try {
    const today = ymdFromDate(base)
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Parse meal plan WhatsApp messages. Today is ${today}.
Return JSON: { "kind": "ADD"|"UPDATE", "meals": [{ "dateYmd": "yyyy-MM-dd", "dateSource": string, "slotIndex": number, "customerPhrase": string, "customNote"?: string }], "replace"?: { "dateYmd", "dateSource", "removePhrase", "addPhrase", "customNote"?: string } }
Intent hint: ${intent}. Resolve tomorrow/today/weekdays to dates.`,
          },
          { role: 'user', content: body },
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null
    return JSON.parse(content) as MealMessageExtraction
  } catch {
    return null
  }
}

export { todayInTz, ymdFromDate }
