/** Digits only — Meta `wa_id` / API `to` format. */
export function digitsOnlyPhone(input: string): string {
  return input.replace(/\D/g, '')
}

/**
 * Normalize to Meta-style recipient id (no +).
 * UAE: 050… → 97150…, 567790733 → 971567790733 when 9 digits starting with 5.
 */
export function normalizeWhatsAppPhone(input: string): string {
  let d = digitsOnlyPhone(input)
  if (!d) return ''

  if (d.startsWith('00')) d = d.slice(2)

  // UAE local mobile: 05xxxxxxxx → 9715xxxxxxxx
  if (d.startsWith('0') && d.length >= 9) {
    d = `971${d.slice(1)}`
  }

  // 9-digit UAE mobile without country code
  if (d.length === 9 && d.startsWith('5')) {
    d = `971${d}`
  }

  return d
}

/** Variants to match Customer.phone in DB (stored formats vary). */
export function phoneMatchVariants(input: string): string[] {
  const norm = normalizeWhatsAppPhone(input)
  const raw = digitsOnlyPhone(input)
  const set = new Set<string>()
  if (norm) set.add(norm)
  if (raw) set.add(raw)
  if (norm.startsWith('971')) {
    set.add(`0${norm.slice(3)}`)
    set.add(`+${norm}`)
  }
  return [...set]
}

export function formatPhoneDisplay(digits: string): string {
  const n = normalizeWhatsAppPhone(digits)
  if (n.startsWith('971') && n.length >= 11) {
    return `+${n.slice(0, 3)} ${n.slice(3)}`
  }
  return n ? `+${n}` : digits
}
