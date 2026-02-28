/**
 * Parse a route param (string) to integer ID.
 * Returns null if the value is not a valid positive integer.
 */
export function parseIdParam(value: string | undefined): number | null {
  if (value == null || value === '') return null
  const n = parseInt(value, 10)
  if (Number.isNaN(n) || n < 1 || !Number.isInteger(n)) return null
  return n
}
