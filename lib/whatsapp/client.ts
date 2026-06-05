import { whatsappConfig, whatsappGraphUrl } from './config'
import { normalizeWhatsAppPhone } from './normalize-phone'

export interface SendTextResult {
  ok: boolean
  messageId?: string
  error?: string
}

export async function sendWhatsAppText(to: string, body: string): Promise<SendTextResult> {
  const { accessToken, phoneNumberId, isConfigured } = whatsappConfig()
  if (!isConfigured || !accessToken || !phoneNumberId) {
    return { ok: false, error: 'WhatsApp is not configured' }
  }

  const toNorm = normalizeWhatsAppPhone(to)
  if (!toNorm) {
    return { ok: false, error: 'Invalid recipient phone' }
  }

  const res = await fetch(whatsappGraphUrl(`${phoneNumberId}/messages`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toNorm,
      type: 'text',
      text: { body },
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err =
      typeof data.error?.message === 'string'
        ? data.error.message
        : `HTTP ${res.status}`
    return { ok: false, error: err }
  }

  const messageId = data.messages?.[0]?.id as string | undefined
  return { ok: true, messageId }
}
