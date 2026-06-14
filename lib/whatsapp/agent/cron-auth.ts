import type { NextRequest } from 'next/server'
import { whatsappAgentConfig } from './config'

function expectedCronSecrets(): string[] {
  const { cronSecret } = whatsappAgentConfig()
  const vercelCron = process.env.CRON_SECRET?.trim()
  const set = new Set<string>()
  if (cronSecret) set.add(cronSecret)
  if (vercelCron) set.add(vercelCron)
  return [...set]
}

/** Validates cron invocation (Bearer token, x-cron-secret, or ?secret=). */
export function verifyCronRequest(request: NextRequest): boolean {
  const allowed = expectedCronSecrets()
  if (allowed.length === 0) return false

  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim()
    if (allowed.includes(token)) return true
  }

  const headerSecret = request.headers.get('x-cron-secret')?.trim()
  if (headerSecret && allowed.includes(headerSecret)) return true

  const querySecret = request.nextUrl.searchParams.get('secret')?.trim()
  if (querySecret && allowed.includes(querySecret)) return true

  return false
}

export function cronAuthConfigured(): boolean {
  return expectedCronSecrets().length > 0
}
