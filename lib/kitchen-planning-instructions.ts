/** Parse meal item customNote (plain text or legacy JSON). */
export function parseMealItemCustomNote(customNote: string | null | undefined): string {
  if (!customNote?.trim()) return ''
  const raw = customNote.trim()
  if (!raw.startsWith('{')) return raw
  try {
    const parsed = JSON.parse(customNote) as Record<string, string>
    return (parsed.note ?? parsed.instructions ?? '').trim()
  } catch {
    return raw
  }
}

export interface KitchenInstructionSources {
  customerInstructions?: string | null
  mealPlanNotes?: string | null
  itemCustomNotes?: (string | null | undefined)[]
}

/** Customer instructions, then meal plan notes, then unique item notes — one line each. */
export function kitchenInstructionLines(input: KitchenInstructionSources): string[] {
  const seen = new Set<string>()
  const lines: string[] = []

  const push = (text: string | null | undefined) => {
    const trimmed = typeof text === 'string' ? text.trim() : ''
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    lines.push(trimmed)
  }

  push(input.customerInstructions)
  push(input.mealPlanNotes)
  for (const note of input.itemCustomNotes ?? []) {
    push(parseMealItemCustomNote(note))
  }

  return lines
}

export function kitchenInstructionLinesForItems(
  items: Array<{
    customNote: string | null
    mealPlan: {
      notes?: string | null
      customer: { instructions?: string | null }
    }
  }>
): string[] {
  const first = items[0]
  if (!first) return []
  return kitchenInstructionLines({
    customerInstructions: first.mealPlan.customer.instructions,
    mealPlanNotes: first.mealPlan.notes,
    itemCustomNotes: items.map((i) => i.customNote),
  })
}

/** Excel cell text: each instruction source on its own line. */
export function kitchenInstructionsExportText(
  items: Parameters<typeof kitchenInstructionLinesForItems>[0]
): string {
  return kitchenInstructionLinesForItems(items).join('\n')
}
