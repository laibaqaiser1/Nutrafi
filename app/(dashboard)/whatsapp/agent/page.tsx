'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { useNotification } from '@/components/notifications/NotificationContext'

type RunStatus =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILED'
  | 'NEEDS_CONFIRMATION'
  | 'SKIPPED'

interface RunRow {
  id: number
  status: RunStatus
  trigger: string
  rawMessageBody: string | null
  parsedIntent: unknown
  errorMessage: string | null
  payload: unknown
  createdAt: string
  customer: { id: number; fullName: string; phone: string } | null
  conversation: { id: number; phoneE164: string } | null
  mealPlan: { id: number; planType: string } | null
  actionCount: number
}

interface RunSummary {
  total: number
  openPending: number
  byStatus: Record<string, number>
}

interface AgentAction {
  id: number
  actionType: string
  status: string
  input: unknown
  output: unknown
  confidence: number | null
  beforeSnapshot: unknown
  afterSnapshot: unknown
  createdAt: string
}

interface RunDetail {
  id: number
  status: RunStatus
  trigger: string
  rawMessageBody: string | null
  parsedIntent: unknown
  model: string | null
  modelRawResponse: unknown
  errorMessage: string | null
  payload: unknown
  createdAt: string
  customer: RunRow['customer']
  conversation: { id: number; phoneE164: string; contactName: string | null } | null
  mealPlan: { id: number; planType: string; mealsPerDay: number } | null
  inboundMessage: { id: number; body: string | null; timestamp: string } | null
  parentRun: { id: number; status: string; rawMessageBody: string | null } | null
  followUpRuns: Array<{
    id: number
    status: string
    rawMessageBody: string | null
    createdAt: string
  }>
  pendingAction: unknown
  actions: AgentAction[]
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'NEEDS_CONFIRMATION', label: 'Needs confirmation' },
  { value: 'SKIPPED', label: 'Skipped' },
]

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'SUCCESS':
    case 'OK':
      return 'bg-green-100 text-green-800'
    case 'FAILED':
      return 'bg-red-100 text-red-800'
    case 'NEEDS_CONFIRMATION':
    case 'PARTIAL':
      return 'bg-amber-100 text-amber-900'
    case 'SKIPPED':
      return 'bg-gray-100 text-gray-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

function formatActionType(type: string): string {
  return type
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function JsonBlock({ value, label }: { value: unknown; label: string }) {
  if (value == null) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <pre className="text-xs bg-gray-50 border border-gray-200 rounded-md p-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

export default function WhatsAppAgentHistoryPage() {
  const toast = useNotification()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadRuns = useCallback(async () => {
    setLoading(true)
    try {
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ''
      const res = await fetch(`/api/whatsapp/agent/runs${q}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setSummary(data.summary)
      setRuns(data.runs)
    } catch {
      toast.error('Failed to load AI history')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, toast])

  const loadDetail = useCallback(
    async (id: number) => {
      setDetailLoading(true)
      try {
        const res = await fetch(`/api/whatsapp/agent/runs/${id}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load run')
        const data = await res.json()
        setDetail(data.run)
      } catch {
        toast.error('Failed to load run details')
        setDetail(null)
      } finally {
        setDetailLoading(false)
      }
    },
    [toast]
  )

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  useEffect(() => {
    if (selectedId != null) void loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  const selected = runs.find((r) => r.id === selectedId)

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-lg lg:text-2xl font-bold text-gray-900">WhatsApp AI History</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            What the meal agent processed, decided, and applied on customer messages.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/whatsapp" className="text-nutrafi-primary hover:underline">
            Inbox
          </Link>
          <button
            type="button"
            onClick={() => void loadRuns()}
            className="text-nutrafi-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Total runs</p>
            <p className="text-lg font-semibold text-gray-900">{summary.total}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Success</p>
            <p className="text-lg font-semibold text-green-700">
              {summary.byStatus.SUCCESS ?? 0}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Failed</p>
            <p className="text-lg font-semibold text-red-700">{summary.byStatus.FAILED ?? 0}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Needs confirmation</p>
            <p className="text-lg font-semibold text-amber-700">
              {summary.byStatus.NEEDS_CONFIRMATION ?? 0}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Open pending</p>
            <p className="text-lg font-semibold text-nutrafi-dark">{summary.openPending}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 min-h-[520px]">
        <div className="lg:w-96 shrink-0 bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-gray-500">Loading…</p>
            ) : runs.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">
                No AI runs yet. Runs appear when customers message and the agent processes their
                meal requests.
              </p>
            ) : (
              runs.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 ${
                    selectedId === r.id ? 'bg-[#f0f4e8]' : ''
                  }`}
                >
                  <div className="flex justify-between gap-2 items-start">
                    <span className="font-medium text-sm text-gray-900 truncate">
                      {r.customer?.fullName ?? r.conversation?.phoneE164 ?? `Run #${r.id}`}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusBadgeClass(r.status)}`}
                    >
                      {r.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 truncate mt-1">
                    {r.rawMessageBody || '—'}
                  </p>
                  <div className="flex justify-between mt-1 text-xs text-gray-400">
                    <span>{r.trigger.replace(/_/g, ' ').toLowerCase()}</span>
                    <span>{format(new Date(r.createdAt), 'MMM d, HH:mm')}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{r.actionCount} action(s)</p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 bg-white rounded-lg border border-gray-200 flex flex-col min-h-[360px] overflow-hidden">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6">
              Select a run to see what the AI did
            </div>
          ) : detailLoading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6">
              Loading run details…
            </div>
          ) : !detail ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6">
              Could not load run details
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex flex-wrap gap-2 items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <p className="font-semibold text-gray-900">
                    Run #{detail.id}
                    <span
                      className={`ml-2 text-xs font-semibold uppercase px-2 py-0.5 rounded ${statusBadgeClass(detail.status)}`}
                    >
                      {detail.status.replace(/_/g, ' ')}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {format(new Date(detail.createdAt), 'PPpp')} · {detail.trigger.replace(/_/g, ' ')}
                    {detail.model ? ` · ${detail.model}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {detail.customer && (
                    <Link
                      href={`/customers/${detail.customer.id}`}
                      className="text-nutrafi-primary hover:underline"
                    >
                      Customer
                    </Link>
                  )}
                  {detail.mealPlan && (
                    <Link
                      href={`/meal-plans/${detail.mealPlan.id}`}
                      className="text-nutrafi-primary hover:underline"
                    >
                      Meal plan #{detail.mealPlan.id}
                    </Link>
                  )}
                  {detail.conversation && (
                    <Link href="/whatsapp" className="text-nutrafi-primary hover:underline">
                      Conversation
                    </Link>
                  )}
                </div>
              </div>

              {(detail.inboundMessage?.body || detail.rawMessageBody) && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Customer message
                  </p>
                  <p className="text-sm bg-gray-50 border border-gray-200 rounded-md p-3 whitespace-pre-wrap">
                    {detail.inboundMessage?.body ?? detail.rawMessageBody}
                  </p>
                </div>
              )}

              {detail.errorMessage && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-semibold text-red-800 mb-1">Error</p>
                  <p className="text-sm text-red-900">{detail.errorMessage}</p>
                </div>
              )}

              <JsonBlock value={detail.parsedIntent} label="Parsed intent" />
              <JsonBlock value={detail.payload} label="Run payload" />

              {detail.actions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Actions ({detail.actions.length})
                  </p>
                  <div className="space-y-3">
                    {detail.actions.map((action, idx) => (
                      <div
                        key={action.id}
                        className="border border-gray-200 rounded-lg p-3 bg-gray-50/50"
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-xs font-bold text-nutrafi-dark">
                            {idx + 1}. {formatActionType(action.actionType)}
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusBadgeClass(action.status)}`}
                          >
                            {action.status}
                          </span>
                          {action.confidence != null && (
                            <span className="text-xs text-gray-500">
                              confidence {(action.confidence * 100).toFixed(0)}%
                            </span>
                          )}
                          <span className="text-xs text-gray-400 ml-auto">
                            {format(new Date(action.createdAt), 'HH:mm:ss')}
                          </span>
                        </div>
                        <JsonBlock value={action.input} label="Input" />
                        <JsonBlock value={action.output} label="Output" />
                        {action.beforeSnapshot != null || action.afterSnapshot != null ? (
                          <div className="grid md:grid-cols-2 gap-2 mt-2">
                            <JsonBlock value={action.beforeSnapshot} label="Before" />
                            <JsonBlock value={action.afterSnapshot} label="After" />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.followUpRuns.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Follow-up runs
                  </p>
                  <ul className="space-y-1 text-sm">
                    {detail.followUpRuns.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(f.id)}
                          className="text-nutrafi-primary hover:underline text-left"
                        >
                          Run #{f.id} · {f.status} · {f.rawMessageBody?.slice(0, 40) ?? '—'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-nutrafi-primary">
                  Raw model response
                </summary>
                <pre className="mt-2 bg-gray-50 border border-gray-200 rounded-md p-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(detail.modelRawResponse, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>

      {selected && !detailLoading && detail && (
        <p className="mt-2 text-xs text-gray-400 lg:hidden">
          Viewing run #{selected.id} — use a wider screen for the full timeline.
        </p>
      )}
    </div>
  )
}
