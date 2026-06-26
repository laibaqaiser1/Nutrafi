import type { NextRequest } from 'next/server'
import { whatsappAgentConfig } from './config'

function expectedCronSecrets(): string[] {
  const { cronSecret } = whatsappAgentConfig()
  const vercelCron = process.env.CRON_SECRET?.trim()
  const agentCron = process.env.WHATSAPP_AGENT_CRON_SECRET?.trim()
  const set = new Set<string>()
  if (cronSecret) set.add(cronSecret)
  if (vercelCron) set.add(vercelCron)
  if (agentCron) set.add(agentCron)
  return [...set]
}

function tokenFromRequest(request: NextRequest): string | null {
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim()
  }
  return (
    request.headers.get('x-cron-secret')?.trim() ||
    request.nextUrl.searchParams.get('secret')?.trim() ||
    null
  )
}

/** Validates cron invocation (Bearer token, x-cron-secret, or ?secret=). */
export function verifyCronRequest(request: NextRequest): boolean {
  const allowed = expectedCronSecrets()
  if (allowed.length === 0) return false

  const token = tokenFromRequest(request)
  if (token && allowed.includes(token)) return true

  return false
}

export function cronAuthConfigured(): boolean {
  return expectedCronSecrets().length > 0
}

export function cronAuthFailureReason(request: NextRequest): string {
  if (!cronAuthConfigured()) {
    return 'Set WHATSAPP_AGENT_CRON_SECRET (or CRON_SECRET) in Vercel environment variables, then redeploy.'
  }
  const token = tokenFromRequest(request)
  if (!token) {
    return 'Missing Authorization: Bearer token. Vercel Cron sends CRON_SECRET automatically after deploy.'
  }
  return 'Invalid cron secret. Ensure WHATSAPP_AGENT_CRON_SECRET matches CRON_SECRET on Vercel.'
}

export function isVercelCronInvocation(request: NextRequest): boolean {
  return request.headers.get('x-vercel-cron') === '1'
}

/** Safe env flags for Vercel logs (never log secret values). */
export function cronAuthDiagnostics(): Record<string, boolean | number> {
  const cfg = whatsappAgentConfig()
  return {
    hasWhatsappAgentCronSecret: Boolean(process.env.WHATSAPP_AGENT_CRON_SECRET?.trim()),
    hasCronSecret: Boolean(process.env.CRON_SECRET?.trim()),
    cronAuthConfigured: cronAuthConfigured(),
    whatsappAgentEnabled: cfg.enabled,
    allowlistCustomerCount: cfg.cronReminderCustomerIds?.size ?? 0,
  }
}
