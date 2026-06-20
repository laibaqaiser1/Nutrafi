import type { WhatsAppAgentRunStatus } from '@/lib/generated/prisma/client'

export interface AgentMessageStatusRow {
  runId: number
  status: WhatsAppAgentRunStatus
  errorMessage: string | null
  reason: string | null
  label: string
  detail: string | null
}

function reasonFromRun(parsedIntent: unknown, payload: unknown): string | null {
  if (parsedIntent && typeof parsedIntent === 'object' && !Array.isArray(parsedIntent)) {
    const reason = (parsedIntent as { reason?: unknown }).reason
    if (typeof reason === 'string' && reason.trim()) return reason.trim()
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const reason = (payload as { reason?: unknown }).reason
    if (typeof reason === 'string' && reason.trim()) return reason.trim()
  }
  return null
}

export function agentStatusLabel(
  status: WhatsAppAgentRunStatus,
  reason: string | null,
  errorMessage: string | null
): { label: string; detail: string | null } {
  switch (status) {
    case 'SUCCESS':
      return { label: 'Meals applied', detail: null }
    case 'PARTIAL':
      return { label: 'Partially applied', detail: errorMessage }
    case 'NEEDS_CONFIRMATION':
      return { label: 'Waiting for dish choice', detail: reason }
    case 'FAILED':
      return {
        label: 'Failed',
        detail: errorMessage ?? reason ?? 'Unknown error',
      }
    case 'SKIPPED':
      if (reason === 'NOT_MEAL' || reason === 'support question') {
        return { label: 'Sent support redirect', detail: reason }
      }
      if (reason === 'AMBIGUOUS') {
        return { label: 'Unclear message', detail: 'Ask customer to rephrase with date + meals' }
      }
      return { label: 'Skipped', detail: reason ?? errorMessage }
    default:
      return { label: status, detail: errorMessage ?? reason }
  }
}

export function buildAgentMessageStatus(params: {
  runId: number
  status: WhatsAppAgentRunStatus
  errorMessage: string | null
  parsedIntent: unknown
  payload: unknown
}): AgentMessageStatusRow {
  const reason = reasonFromRun(params.parsedIntent, params.payload)
  const { label, detail } = agentStatusLabel(params.status, reason, params.errorMessage)
  return {
    runId: params.runId,
    status: params.status,
    errorMessage: params.errorMessage,
    reason,
    label,
    detail,
  }
}
