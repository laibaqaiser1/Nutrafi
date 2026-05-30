/** Sunday=0 … Saturday=6 — matches `Date.getDay()`. */
export const IMPORT_DAY_COLORS = [
  { header: '#be185d', dayGradient: 'linear-gradient(180deg, #fce7f3 0%, #ffffff 100%)' },
  { header: '#1d4ed8', dayGradient: 'linear-gradient(180deg, #dbeafe 0%, #ffffff 100%)' },
  { header: '#15803d', dayGradient: 'linear-gradient(180deg, #dcfce7 0%, #ffffff 100%)' },
  { header: '#b91c1c', dayGradient: 'linear-gradient(180deg, #fee2e2 0%, #ffffff 100%)' },
  { header: '#0d9488', dayGradient: 'linear-gradient(180deg, #ccfbf1 0%, #ffffff 100%)' },
  { header: '#c2410c', dayGradient: 'linear-gradient(180deg, #ffedd5 0%, #ffffff 100%)' },
  { header: '#6d28d9', dayGradient: 'linear-gradient(180deg, #ede9fe 0%, #ffffff 100%)' },
]

export function importDayColorIndex(dateYmd: string): number {
  return new Date(dateYmd).getDay()
}
