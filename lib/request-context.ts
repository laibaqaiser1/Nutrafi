import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

type RequestStore = {
  requestId: string
}

const als = new AsyncLocalStorage<RequestStore>()

const REQUEST_ID_HEADERS = ['x-request-id', 'x-correlation-id'] as const

function looksLikeRequestId(value: string): boolean {
  // Keep inbound IDs if reasonably short and printable (Better Stack search-friendly)
  return value.length > 0 && value.length <= 128 && /^[\w.:-]+$/.test(value)
}

/** Prefer inbound correlation header; otherwise generate a UUID. */
export function resolveRequestId(request: NextRequest | Request): string {
  for (const name of REQUEST_ID_HEADERS) {
    const raw = request.headers.get(name)?.trim()
    if (raw && looksLikeRequestId(raw)) return raw
  }
  return randomUUID()
}

export function getRequestId(): string | undefined {
  return als.getStore()?.requestId
}

/**
 * Run work with a requestId bound so logger helpers can pick it up.
 * Does not change business behavior — only adds correlation context.
 */
export function runWithRequestId<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ requestId }, fn)
}

export function runWithRequestContext<T>(
  request: NextRequest | Request,
  fn: () => Promise<T>
): Promise<T> {
  return runWithRequestId(resolveRequestId(request), fn)
}
