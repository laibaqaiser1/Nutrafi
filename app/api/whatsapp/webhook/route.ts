import { NextRequest, NextResponse } from 'next/server'
import { whatsappConfig } from '@/lib/whatsapp/config'
import { logWhatsAppError, logWhatsAppInfo, logWhatsAppWarn, serializeError } from '@/lib/whatsapp/log'
import { processWhatsAppWebhook } from '@/lib/whatsapp/process-webhook'

export const dynamic = 'force-dynamic'

/** Meta webhook verification (GET). */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const { webhookVerifyToken } = whatsappConfig()

  if (
    mode === 'subscribe' &&
    token &&
    webhookVerifyToken &&
    token === webhookVerifyToken &&
    challenge
  ) {
    logWhatsAppInfo('webhook_verified')
    return new NextResponse(challenge, { status: 200 })
  }

  logWhatsAppWarn('webhook_verify_failed', {
    mode,
    tokenPresent: Boolean(token),
    verifyTokenConfigured: Boolean(webhookVerifyToken),
  })
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/** Incoming messages and status updates (POST). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (body && typeof body === 'object') {
      const root = body as { object?: string; entry?: unknown[] }
      let messageCount = 0
      let statusCount = 0
      if (Array.isArray(root.entry)) {
        for (const entry of root.entry) {
          const changes = (entry as { changes?: unknown[] })?.changes
          if (!Array.isArray(changes)) continue
          for (const change of changes) {
            const value = (change as { value?: Record<string, unknown> })?.value
            if (!value) continue
            if (Array.isArray(value.messages)) messageCount += value.messages.length
            if (Array.isArray(value.statuses)) statusCount += value.statuses.length
          }
        }
      }
      const wabaIds = Array.isArray(root.entry)
        ? root.entry.map((e) => (e as { id?: string })?.id).filter(Boolean)
        : []
      logWhatsAppInfo('webhook_received', {
        object: root.object,
        entries: root.entry?.length ?? 0,
        wabaIds,
        messages: messageCount,
        statuses: statusCount,
      })
    }
    await processWhatsAppWebhook(body)
    return NextResponse.json({ ok: true })
  } catch (error) {
    logWhatsAppError('webhook_processing_failed', serializeError(error))
    // Meta retries on non-200; still return 200 if we logged error to avoid retry storms
    return NextResponse.json({ ok: true })
  }
}
