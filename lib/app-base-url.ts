/** Canonical app origin for absolute URLs (webhooks, public assets, WhatsApp media links). */
export function appBaseUrl(): string {
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (publicUrl) return publicUrl.replace(/\/$/, '')

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (production) {
    return production.startsWith('http') ? production : `https://${production}`
  }

  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) {
    return vercel.startsWith('http') ? vercel : `https://${vercel}`
  }

  const appUrl = process.env.APP_URL?.trim()
  if (appUrl) return appUrl.replace(/\/$/, '')

  return 'http://127.0.0.1:3000'
}
