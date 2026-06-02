/** Stored on `CustomerLocation.icon` — rendered as emoji in the UI. */

export const LOCATION_ICON_OPTIONS = [
  { key: 'home', emoji: '🏠', label: 'Home' },
  { key: 'work', emoji: '💼', label: 'Work' },
  { key: 'pin', emoji: '📍', label: 'Other' },
  { key: 'building', emoji: '🏢', label: 'Office' },
  { key: 'gym', emoji: '🏋️', label: 'Gym' },
  { key: 'hospital', emoji: '🏥', label: 'Clinic' },
  { key: 'school', emoji: '🏫', label: 'School' },
  { key: 'shop', emoji: '🏪', label: 'Shop' },
  { key: 'beach', emoji: '🏖️', label: 'Beach' },
  { key: 'car', emoji: '🚗', label: 'Pickup' },
] as const

export type LocationIconKey = (typeof LOCATION_ICON_OPTIONS)[number]['key']

export const LOCATION_LABEL_PRESETS = [
  { label: 'Home', icon: 'home' as LocationIconKey },
  { label: 'Work', icon: 'work' as LocationIconKey },
  { label: 'Other', icon: 'pin' as LocationIconKey },
] as const

const ICON_KEYS = new Set<string>(LOCATION_ICON_OPTIONS.map((o) => o.key))

export function isLocationIconKey(value: string): value is LocationIconKey {
  return ICON_KEYS.has(value)
}

export function defaultIconForLabel(label: string): LocationIconKey {
  const normalized = label.trim().toLowerCase()
  if (normalized === 'home') return 'home'
  if (normalized === 'work' || normalized === 'office') return 'work'
  if (normalized === 'other') return 'pin'
  return 'pin'
}

export function locationIconEmoji(iconKey: string | null | undefined, label?: string): string {
  const key = normalizeLocationIcon(iconKey, label)
  const found = LOCATION_ICON_OPTIONS.find((o) => o.key === key)
  return found?.emoji ?? '📍'
}

export function normalizeLocationIcon(icon: string | null | undefined, label?: string): LocationIconKey {
  if (icon && isLocationIconKey(icon)) return icon
  if (label) return defaultIconForLabel(label)
  return 'pin'
}
