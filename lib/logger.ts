/**
 * Lightweight structured JSON logger for Vercel / Axiom.
 * One JSON object per line on stdout; optionally ships to Axiom when
 * AXIOM_TOKEN + AXIOM_DATASET are set.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function configuredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || '').toLowerCase().trim()
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

function appEnv(): string {
  return (
    process.env.APP_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    'development'
  )
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[configuredLevel()]
}

/** Safe error fields for structured logs (no tokens). */
export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    }
  }
  if (error == null) return {}
  return { errorMessage: String(error) }
}

/**
 * Fire-and-forget ship to Axiom ingest API.
 * Missing env → no-op. Failures never throw into the request path.
 *
 * Env:
 * - AXIOM_TOKEN (required) — API token with ingest permission
 * - AXIOM_DATASET (required) — dataset name
 * - AXIOM_ORG_ID (optional) — required for personal tokens
 * - AXIOM_URL (optional) — default https://api.axiom.co
 *   EU example: https://eu-central-1.aws.edge.axiom.co
 */
function shipToAxiom(payload: Record<string, unknown>): void {
  const token = process.env.AXIOM_TOKEN?.trim()
  const dataset = process.env.AXIOM_DATASET?.trim()
  if (!token || !dataset) return

  const base = (process.env.AXIOM_URL || 'https://api.axiom.co').replace(/\/$/, '')
  const orgId = process.env.AXIOM_ORG_ID?.trim()

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'nutrafi-logger/1.0',
  }
  if (orgId) {
    headers['X-Axiom-Org-Id'] = orgId
  }

  // Tell Axiom our event time lives in `timestamp` (ISO-8601).
  const url = `${base}/v1/ingest/${encodeURIComponent(dataset)}?timestamp-field=timestamp`

  void fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify([payload]),
  }).catch(() => {
    // Swallow — logging must not break the app
  })
}

function emit(level: LogLevel, fields: LogFields): void {
  if (!shouldLog(level)) return

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    env: appEnv(),
    service: 'nutrafi',
    ...fields,
  }

  const line = JSON.stringify(payload)
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }

  shipToAxiom(payload)
}

export const logger = {
  debug(fields: LogFields): void {
    emit('debug', fields)
  },
  info(fields: LogFields): void {
    emit('info', fields)
  },
  warn(fields: LogFields): void {
    emit('warn', fields)
  },
  error(fields: LogFields): void {
    emit('error', fields)
  },
}
