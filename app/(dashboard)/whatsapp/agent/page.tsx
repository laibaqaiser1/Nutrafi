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

interface PhoneRow {
  conversationId: number
  phoneE164: string
  phoneDisplay: string
  contactName: string | null
  customer: { id: number; fullName: string; phone: string } | null
  runCount: number
  lastMessageAt: string
  lastRun: {
    id: number
    status: RunStatus
    rawMessageBody: string | null
    createdAt: string
  } | null
}

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

interface MessageRow {
  id: number
  direction: 'INBOUND' | 'OUTBOUND'
  body: string | null
  timestamp: string
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

function phoneLabel(row: PhoneRow): string {
  return row.customer?.fullName ?? row.contactName ?? row.phoneDisplay
}

export default function WhatsAppAgentHistoryPage() {
  const toast = useNotification()
  const [phonesLoading, setPhonesLoading] = useState(true)
  const [phones, setPhones] = useState<PhoneRow[]>([])
  const [selectedPhone, setSelectedPhone] = useState<PhoneRow | null>(null)

  const [runsLoading, setRunsLoading] = useState(false)
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [statusFilter, setStatusFilter] = useState('')

  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [showMessages, setShowMessages] = useState(true)

  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadPhones = useCallback(async () => {
    setPhonesLoading(true)
    try {
      const res = await fetch('/api/whatsapp/agent/runs/phones', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setPhones(data.phones)
    } catch {
      toast.error('Failed to load phone list')
    } finally {
      setPhonesLoading(false)
    }
  }, [toast])

  const loadRunsForPhone = useCallback(async () => {
    if (!selectedPhone) {
      setRuns([])
      setSummary(null)
      return
    }
    setRunsLoading(true)
    try {
      const params = new URLSearchParams({ phoneE164: selectedPhone.phoneE164, limit: '100' })
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/whatsapp/agent/runs?${params}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setSummary(data.summary)
      setRuns(data.runs)
    } catch {
      toast.error('Failed to load runs for this number')
    } finally {
      setRunsLoading(false)
    }
  }, [selectedPhone, statusFilter, toast])

  const loadMessagesForPhone = useCallback(async () => {
    if (!selectedPhone) {
      setMessages([])
      return
    }
    setMessagesLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/conversations/${selectedPhone.conversationId}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setMessages(
        (data.messages as MessageRow[]).map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          timestamp: m.timestamp,
        }))
      )
    } catch {
      toast.error('Failed to load message thread')
      setMessages([])
    } finally {
      setMessagesLoading(false)
    }
  }, [selectedPhone, toast])

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
    void loadPhones()
  }, [loadPhones])

  useEffect(() => {
    setSelectedRunId(null)
    setDetail(null)
    void loadRunsForPhone()
    void loadMessagesForPhone()
  }, [loadRunsForPhone, loadMessagesForPhone])

  useEffect(() => {
    if (selectedRunId != null) void loadDetail(selectedRunId)
    else setDetail(null)
  }, [selectedRunId, loadDetail])

  const refreshAll = () => {
    void loadPhones()
    void loadRunsForPhone()
    void loadMessagesForPhone()
    if (selectedRunId != null) void loadDetail(selectedRunId)
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-lg lg:text-2xl font-bold text-gray-900">WhatsApp AI History</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Pick a number, then drill into each message run to see what the agent did step by step.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/whatsapp" className="text-nutrafi-primary hover:underline">
            Inbox
          </Link>
          <button type="button" onClick={refreshAll} className="text-nutrafi-primary hover:underline">
            Refresh
          </button>
        </div>
      </div>

      {summary && selectedPhone && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Runs (this number)</p>
            <p className="text-lg font-semibold text-gray-900">{runs.length}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Success</p>
            <p className="text-lg font-semibold text-green-700">
              {runs.filter((r) => r.status === 'SUCCESS').length}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Failed</p>
            <p className="text-lg font-semibold text-red-700">
              {runs.filter((r) => r.status === 'FAILED').length}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Needs confirmation</p>
            <p className="text-lg font-semibold text-amber-700">
              {runs.filter((r) => r.status === 'NEEDS_CONFIRMATION').length}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Open pending (all)</p>
            <p className="text-lg font-semibold text-nutrafi-dark">{summary.openPending}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-4 min-h-[520px]">
        {/* Column 1: phones */}
        <div className="xl:w-64 shrink-0 bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden max-h-[280px] xl:max-h-none">
          <div className="p-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
              Numbers
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {phonesLoading ? (
              <p className="p-4 text-sm text-gray-500">Loading…</p>
            ) : phones.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">
                No AI runs yet. Runs appear when customers message and the agent processes their
                meal requests.
              </p>
            ) : (
              phones.map((p) => (
                <button
                  key={p.phoneE164}
                  type="button"
                  onClick={() => setSelectedPhone(p)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 ${
                    selectedPhone?.phoneE164 === p.phoneE164 ? 'bg-[#f0f4e8]' : ''
                  }`}
                >
                  <div className="flex justify-between gap-2 items-start">
                    <span className="font-medium text-sm text-gray-900 truncate">{phoneLabel(p)}</span>
                    <span className="shrink-0 text-xs text-gray-400">{p.runCount}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{p.phoneDisplay}</p>
                  {p.lastRun && (
                    <p className="text-xs text-gray-600 truncate mt-1">
                      {p.lastRun.rawMessageBody || '—'}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {format(new Date(p.lastMessageAt), 'MMM d, HH:mm')}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Column 2: runs for selected phone */}
        <div className="xl:w-80 shrink-0 bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-gray-100 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
              {selectedPhone ? `Runs · ${phoneLabel(selectedPhone)}` : 'Runs'}
            </p>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={!selectedPhone}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto min-h-[200px]">
            {!selectedPhone ? (
              <p className="p-4 text-sm text-gray-500">Select a number to see its AI runs</p>
            ) : runsLoading ? (
              <p className="p-4 text-sm text-gray-500">Loading runs…</p>
            ) : runs.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No runs for this number</p>
            ) : (
              runs.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRunId(r.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 ${
                    selectedRunId === r.id ? 'bg-[#f0f4e8]' : ''
                  }`}
                >
                  <div className="flex justify-between gap-2 items-start">
                    <span className="text-sm text-gray-900 truncate">
                      {r.rawMessageBody || `Run #${r.id}`}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusBadgeClass(r.status)}`}
                    >
                      {r.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-gray-400">
                    <span>{r.actionCount} action(s)</span>
                    <span>{format(new Date(r.createdAt), 'MMM d, HH:mm')}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {selectedPhone && (
            <div className="border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowMessages((v) => !v)}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-50"
              >
                Messages ({messages.length}) {showMessages ? '▾' : '▸'}
              </button>
              {showMessages && (
                <div className="max-h-48 overflow-y-auto px-3 pb-3 space-y-2">
                  {messagesLoading ? (
                    <p className="text-xs text-gray-500">Loading thread…</p>
                  ) : messages.length === 0 ? (
                    <p className="text-xs text-gray-500">No messages</p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`text-xs rounded-md px-2 py-1.5 ${
                          m.direction === 'INBOUND'
                            ? 'bg-gray-100 text-gray-800 mr-6'
                            : 'bg-[#e8f0d8] text-gray-800 ml-6'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body || '—'}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {m.direction === 'INBOUND' ? 'In' : 'Out'} ·{' '}
                          {format(new Date(m.timestamp), 'MMM d, HH:mm')}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Column 3: run detail */}
        <div className="flex-1 bg-white rounded-lg border border-gray-200 flex flex-col min-h-[360px] overflow-hidden">
          {!selectedPhone ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6">
              Select a number to start debugging
            </div>
          ) : !selectedRunId ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6">
              Select a run to see what the AI did at each step
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
                    {format(new Date(detail.createdAt), 'PPpp')} ·{' '}
                    {detail.trigger.replace(/_/g, ' ')}
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
                      Inbox
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
                          onClick={() => setSelectedRunId(f.id)}
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
    </div>
  )
}
