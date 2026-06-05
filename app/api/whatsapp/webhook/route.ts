import { NextRequest, NextResponse } from 'next/server'
import { whatsappConfig } from '@/lib/whatsapp/config'
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
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/** Incoming messages and status updates (POST). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    await processWhatsAppWebhook(body)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('WhatsApp webhook error:', error)
    // Meta retries on non-200; still return 200 if we logged error to avoid retry storms
    return NextResponse.json({ ok: true })
  }
}
