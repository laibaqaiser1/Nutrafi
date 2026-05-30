const PREFIX = 'import-draft-'

export function importDraftItemId(dateYmd: string, slotIndex: number): string {
  return `${PREFIX}${dateYmd}-${slotIndex}`
}

export function isImportDraftItemId(id: string | number | undefined | null): boolean {
  return typeof id === 'string' && id.startsWith(PREFIX)
}

export function parseImportDraftItemId(id: string): { date: string; slotIndex: number } | null {
  if (!isImportDraftItemId(id)) return null
  const rest = id.slice(PREFIX.length)
  const lastDash = rest.lastIndexOf('-')
  if (lastDash < 0) return null
  const date = rest.slice(0, lastDash)
  const slotIndex = parseInt(rest.slice(lastDash + 1), 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(slotIndex)) return null
  return { date, slotIndex }
}
