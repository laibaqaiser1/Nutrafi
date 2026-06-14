import { digitsOnlyPhone, normalizeWhatsAppPhone } from '@/lib/whatsapp/normalize-phone'

/**
 * All exact digit forms used for matching — with country code, local 0-prefix,
 * and bare national number (no fuzzy / substring matching).
 */
export function exactPhoneKeys(input: string): Set<string> {
  const keys = new Set<string>()
  const raw = digitsOnlyPhone(input)
  if (!raw) return keys

  keys.add(raw)

  const international = normalizeWhatsAppPhone(input)
  if (international) {
    keys.add(international)
    if (international.startsWith('971') && international.length > 3) {
      const national = international.slice(3)
      keys.add(national)
      keys.add(`0${national}`)
    }
  }

  if (raw.startsWith('0') && raw.length > 1) {
    const withoutLeadingZero = raw.slice(1)
    keys.add(withoutLeadingZero)
    keys.add(`971${withoutLeadingZero}`)
  }

  if (raw.length === 9 && raw.startsWith('5')) {
    keys.add(`971${raw}`)
    keys.add(`0${raw}`)
  }

  return keys
}

/** True when both numbers share at least one exact canonical key. */
export function phonesMatchExact(a: string, b: string): boolean {
  const ka = exactPhoneKeys(a)
  const kb = exactPhoneKeys(b)
  if (ka.size === 0 || kb.size === 0) return false
  for (const key of ka) {
    if (kb.has(key)) return true
  }
  return false
}

export function primaryPhoneDisplayKey(input: string): string {
  const norm = normalizeWhatsAppPhone(input)
  return norm || digitsOnlyPhone(input)
}
