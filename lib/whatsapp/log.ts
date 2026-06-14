type LogFields = Record<string, unknown>

/** Structured logs for Vercel — filter by `[whatsapp]`. */
export function logWhatsAppError(event: string, fields: LogFields = {}): void {
  console.error(`[whatsapp] ${event}`, fields)
}

export function logWhatsAppInfo(event: string, fields: LogFields = {}): void {
  console.info(`[whatsapp] ${event}`, fields)
}

export function logWhatsAppWarn(event: string, fields: LogFields = {}): void {
  console.warn(`[whatsapp] ${event}`, fields)
}

/** Extract Meta Graph API error fields without leaking tokens. */
export function metaGraphErrorFields(error: unknown): LogFields {
  if (!error || typeof error !== 'object') return {}
  const e = error as Record<string, unknown>
  return {
    message: e.message,
    type: e.type,
    code: e.code,
    errorSubcode: e.error_subcode,
    fbtraceId: e.fbtrace_id,
    errorUserTitle: e.error_user_title,
    errorUserMsg: e.error_user_msg,
  }
}

export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { error: String(error) }
}
