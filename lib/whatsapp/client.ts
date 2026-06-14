import { whatsappConfig, whatsappGraphUrl } from './config'
import {
  logWhatsAppError,
  logWhatsAppInfo,
  metaGraphErrorFields,
  serializeError,
} from './log'
import { normalizeWhatsAppPhone } from './normalize-phone'
import { WHATSAPP_TEMPLATES } from './templates'

export interface SendTextResult {
  ok: boolean
  messageId?: string
  error?: string
  errorCode?: number
  fbtraceId?: string
}

export interface SendTemplateParams {
  to: string
  templateName: string
  languageCode?: string
  /** Body variable values in order: {{1}}, {{2}}, … */
  bodyParameters?: string[]
}

async function postWhatsAppMessage(
  toNorm: string,
  payload: Record<string, unknown>
): Promise<SendTextResult> {
  const { accessToken, phoneNumberId, isConfigured } = whatsappConfig()
  if (!isConfigured || !accessToken || !phoneNumberId) {
    logWhatsAppError('send_not_configured', {
      hasAccessToken: Boolean(accessToken),
      hasPhoneNumberId: Boolean(phoneNumberId),
    })
    return { ok: false, error: 'WhatsApp is not configured' }
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
        ...payload,
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
      payloadType: payload.type,
      templateName:
        payload.type === 'template'
          ? (payload.template as { name?: string } | undefined)?.name
          : undefined,
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
    payloadType: payload.type,
    templateName:
      payload.type === 'template'
        ? (payload.template as { name?: string } | undefined)?.name
        : undefined,
  })
  return { ok: true, messageId }
}

export async function sendWhatsAppTemplate(params: SendTemplateParams): Promise<SendTextResult> {
  const toNorm = normalizeWhatsAppPhone(params.to)
  if (!toNorm) {
    logWhatsAppError('send_invalid_recipient', { to: params.to })
    return { ok: false, error: 'Invalid recipient phone' }
  }

  const languageCode = params.languageCode ?? 'en'
  const bodyParams = params.bodyParameters ?? []
  const components =
    bodyParams.length > 0
      ? [
          {
            type: 'body',
            parameters: bodyParams.map((text) => ({ type: 'text', text })),
          },
        ]
      : undefined

  return postWhatsAppMessage(toNorm, {
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  })
}

/** Send the approved add-meals-for-tomorrow reminder template. */
export async function sendAddMealsReminder(
  to: string,
  customerName: string,
  tomorrowDate: string
): Promise<SendTextResult> {
  return sendWhatsAppTemplate({
    to,
    templateName: WHATSAPP_TEMPLATES.daily_meals_reminder,
    languageCode: 'en',
    bodyParameters: [customerName, tomorrowDate],
  })
}

export async function sendWhatsAppText(to: string, body: string): Promise<SendTextResult> {
  const toNorm = normalizeWhatsAppPhone(to)
  if (!toNorm) {
    logWhatsAppError('send_invalid_recipient', { to })
    return { ok: false, error: 'Invalid recipient phone' }
  }

  return postWhatsAppMessage(toNorm, {
    type: 'text',
    text: { body },
  })
}
