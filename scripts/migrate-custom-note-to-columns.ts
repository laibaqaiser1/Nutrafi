/**
 * Migrate existing MealPlanItem.customNote (JSON) into:
 * - deliveryType column
 * - deliveryLocation column
 * - customNote as plain note text only
 *
 * Run: npm run db:migrate-custom-note
 * Or: npx tsx scripts/migrate-custom-note-to-columns.ts
 */
import * as dotenv from 'dotenv'
dotenv.config()

import { prisma } from '../lib/prisma'

function parseNoteText(customNote: string): string {
  let raw = customNote.trim()
  let depth = 0
  const maxDepth = 5
  while (depth < maxDepth) {
    try {
      if (!raw.startsWith('{')) return raw
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const value = parsed.note ?? parsed.instructions
      if (value == null) return ''
      if (typeof value !== 'string') return ''
      raw = value.trim()
      if (!raw) return ''
      depth++
    } catch {
      return raw.startsWith('{') ? '' : raw
    }
  }
  return raw
}

function extractDeliveryAndNote(customNote: string): {
  deliveryType: string | null
  deliveryLocation: string | null
  noteText: string
} {
  const raw = customNote.trim()
  if (!raw.startsWith('{')) {
    return { deliveryType: null, deliveryLocation: null, noteText: raw }
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const deliveryType =
      typeof parsed.deliveryType === 'string' && parsed.deliveryType.trim()
        ? parsed.deliveryType.trim()
        : null
    const deliveryLocation =
      typeof parsed.location === 'string'
        ? parsed.location.trim()
        : typeof parsed.deliveryLocation === 'string'
          ? parsed.deliveryLocation.trim()
          : null
    const noteText = parseNoteText(raw)
    return { deliveryType, deliveryLocation, noteText }
  } catch {
    return { deliveryType: null, deliveryLocation: null, noteText: raw }
  }
}

async function main() {
  console.log('Fetching meal plan items with non-empty customNote...\n')
  const items = await prisma.mealPlanItem.findMany({
    where: { customNote: { not: null } },
    select: { id: true, customNote: true },
  })
  console.log(`Found ${items.length} items with customNote.\n`)

  let updated = 0
  let skipped = 0
  for (const item of items) {
    const cn = item.customNote
    if (!cn || !cn.trim()) {
      skipped++
      continue
    }
    if (!cn.trim().startsWith('{')) {
      skipped++
      continue
    }
    const { deliveryType, deliveryLocation, noteText } = extractDeliveryAndNote(cn)
    const updates: { deliveryType?: string | null; deliveryLocation?: string | null; customNote?: string | null } = {}
    if (deliveryType != null) updates.deliveryType = deliveryType
    if (deliveryLocation != null) updates.deliveryLocation = deliveryLocation
    updates.customNote = noteText || null
    await prisma.mealPlanItem.update({
      where: { id: item.id },
      data: updates,
    })
    updated++
    if (updated % 50 === 0) console.log(`  Updated ${updated} items...`)
  }

  console.log(`\nDone. Updated ${updated} items, skipped ${skipped} (already plain or empty).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
