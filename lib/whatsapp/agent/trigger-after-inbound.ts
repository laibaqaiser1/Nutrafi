import { after } from 'next/server'
import { cronAuthConfigured } from './cron-auth'
import { whatsappAgentConfig } from './config'
import { processInboundAgentMessage } from './handle-inbound'

export interface AgentInboundPayload {
  conversationId: number
  inboundMessageId: number
  phoneE164: string
  body: string
}

function appBaseUrl(): string {
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) {
    return vercel.startsWith('http') ? vercel : `https://${vercel}`
  }
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (publicUrl) return publicUrl.replace(/\/$/, '')
  const appUrl = process.env.APP_URL?.trim()
  if (appUrl) return appUrl.replace(/\/$/, '')
  return 'http://127.0.0.1:3000'
}

function workerAuthToken(): string | null {
  const { cronSecret } = whatsappAgentConfig()
  const vercelCron = process.env.CRON_SECRET?.trim()
  return cronSecret ?? vercelCron ?? null
}

async function invokeAgentWorker(payload: AgentInboundPayload): Promise<boolean> {
  const token = workerAuthToken()
  if (!token) return false

  const res = await fetch(`${appBaseUrl()}/api/whatsapp/agent/worker`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[whatsapp agent] worker dispatch failed', res.status, text)
    return false
  }
  return true
}

async function runAgent(payload: AgentInboundPayload): Promise<void> {
  if (cronAuthConfigured()) {
    const dispatched = await invokeAgentWorker(payload)
    if (dispatched) return
  }

  await processInboundAgentMessage(payload)
}

/**
 * Called after webhook stores an inbound text message.
 * Uses Next.js `after()` so Vercel keeps the invocation alive, then dispatches
 * a dedicated worker route (fresh 60s budget) when cron secret is configured.
 */
export function scheduleAgentAfterInbound(params: {
  conversationId: number
  inboundMessageId: number
  phoneE164: string
  body: string
  messageType: string
  direction: 'INBOUND' | 'OUTBOUND'
}): void {
  if (params.direction !== 'INBOUND') return
  if (params.messageType !== 'text') return
  if (!params.body.trim()) return

  const payload: AgentInboundPayload = {
    conversationId: params.conversationId,
    inboundMessageId: params.inboundMessageId,
    phoneE164: params.phoneE164,
    body: params.body,
  }

  after(async () => {
    try {
      await runAgent(payload)
    } catch (error) {
      console.error('[whatsapp agent] process failed:', error)
    }
  })
}

/** @deprecated Use scheduleAgentAfterInbound — void fire-and-forget is killed on Vercel. */
export async function triggerAgentAfterInbound(params: {
  conversationId: number
  inboundMessageId: number
  phoneE164: string
  body: string
  messageType: string
  direction: 'INBOUND' | 'OUTBOUND'
}): Promise<void> {
  scheduleAgentAfterInbound(params)
}
