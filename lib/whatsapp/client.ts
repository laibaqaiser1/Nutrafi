import { whatsappConfig, whatsappGraphUrl } from './config'
import {
  logWhatsAppError,
  logWhatsAppInfo,
  metaGraphErrorFields,
  serializeError,
} from './log'
import { normalizeWhatsAppPhone } from './normalize-phone'

export interface SendTextResult {
  ok: boolean
  messageId?: string
  error?: string
  errorCode?: number
  fbtraceId?: string
}

export async function sendWhatsAppText(to: string, body: string): Promise<SendTextResult> {
  const { accessToken, phoneNumberId, isConfigured } = whatsappConfig()
  if (!isConfigured || !accessToken || !phoneNumberId) {
    logWhatsAppError('send_not_configured', {
      hasAccessToken: Boolean(accessToken),
      hasPhoneNumberId: Boolean(phoneNumberId),
    })
    return { ok: false, error: 'WhatsApp is not configured' }
  }

  const toNorm = normalizeWhatsAppPhone(to)
  if (!toNorm) {
    logWhatsAppError('send_invalid_recipient', { to })
    return { ok: false, error: 'Invalid recipient phone' }
  }

  const url = whatsappGraphUrl(`${phoneNumberId}/messages`)
  let res: Response
  try {
    res = await fetch(url, {
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
  } catch (error) {
    logWhatsAppError('send_network_error', {
      to: toNorm,
      phoneNumberId,
      ...serializeError(error),
    })
    return { ok: false, error: 'Network error contacting Meta WhatsApp API' }
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: Record<string, unknown>
    messages?: Array<{ id?: string }>
  }

  if (!res.ok) {
    const metaError = data.error
    const errMessage =
      typeof metaError?.message === 'string' ? metaError.message : `HTTP ${res.status}`
    logWhatsAppError('send_api_failed', {
      to: toNorm,
      phoneNumberId,
      httpStatus: res.status,
      bodyLength: body.length,
      ...metaGraphErrorFields(metaError),
    })
    return {
      ok: false,
      error: errMessage,
      errorCode: typeof metaError?.code === 'number' ? metaError.code : undefined,
      fbtraceId: typeof metaError?.fbtrace_id === 'string' ? metaError.fbtrace_id : undefined,
    }
  }

  const messageId = data.messages?.[0]?.id
  logWhatsAppInfo('send_api_ok', {
    to: toNorm,
    phoneNumberId,
    messageId,
    bodyLength: body.length,
  })
  return { ok: true, messageId }
}
