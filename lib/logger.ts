/**
 * Structured JSON logger — console + optional Axiom via @axiomhq/js.
 * See https://axiom.co/docs/guides/javascript
 *
 * Env:
 * - AXIOM_TOKEN (required to ship) — API token with ingest (`xaat-...`)
 * - AXIOM_DATASET (required to ship)
 * - AXIOM_ORG_ID (optional) — for personal tokens only
 * - AXIOM_EDGE (optional) — region host without scheme, e.g. eu-central-1.aws.edge.axiom.co
 */

import { Axiom } from '@axiomhq/js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

let axiomClient: Axiom | null | undefined

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

function getAxiom(): Axiom | null {
  if (axiomClient !== undefined) return axiomClient

  const token = process.env.AXIOM_TOKEN?.trim()
  if (!token) {
    axiomClient = null
    return null
  }

  const orgId = process.env.AXIOM_ORG_ID?.trim()
  // Prefer AXIOM_EDGE (official). Also accept full URL in AXIOM_URL → strip scheme for `edge`.
  let edge = process.env.AXIOM_EDGE?.trim()
  if (!edge) {
    const url = process.env.AXIOM_URL?.trim()
    if (url) {
      edge = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
    }
  }

  axiomClient = new Axiom({
    token,
    ...(orgId ? { orgId } : {}),
    ...(edge ? { edge } : {}),
    onError: () => {
      // Never break the request path if Axiom is down
    },
  })
  return axiomClient
}

/**
 * Ship one event to Axiom (batched SDK + flush for Vercel serverless).
 * No-op if AXIOM_TOKEN / AXIOM_DATASET missing.
 */
function shipToAxiom(payload: Record<string, unknown>): void {
  const dataset = process.env.AXIOM_DATASET?.trim()
  const axiom = getAxiom()
  if (!axiom || !dataset) return

  try {
    axiom.ingest(dataset, [payload])
    // Flush so serverless invocations don't drop the batch when the request ends
    void axiom.flush()
  } catch {
    // Swallow — logging must not break the app
  }
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
