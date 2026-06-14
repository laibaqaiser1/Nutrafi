'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { useNotification } from '@/components/notifications/NotificationContext'

type InboxView = 'inbox' | 'support'

interface ConversationRow {
  id: number
  phoneE164: string
  phoneDisplay: string
  contactName: string | null
  customer: { id: number; fullName: string; phone: string } | null
  lastMessageAt: string
  lastMessagePreview: string | null
  unreadCount: number
}

interface Summary {
  totalConversations: number
  totalUnread: number
  matchedCustomers: number
  unknownNumbers: number
}

interface MessageRow {
  id: number
  direction: 'INBOUND' | 'OUTBOUND'
  body: string | null
  messageType: string
  status: string
  timestamp: string
}

interface SupportQueueItem {
  runId: number
  conversationId: number | null
  phoneE164: string | null
  phoneDisplay: string | null
  contactName: string | null
  customer: { id: number; fullName: string; phone: string } | null
  customerMessage: string | null
  agentReplyPreview: string | null
  reason: string
  reasonLabel: string
  runStatus: string
  createdAt: string
}

interface SupportQueueSummary {
  total: number
  last24h: number
  days: number
}

function reasonBadgeClass(reason: string): string {
  switch (reason) {
    case 'NOT_MEAL':
    case 'SUPPORT_DURING_PENDING':
      return 'bg-amber-100 text-amber-900'
    case 'NO_CUSTOMER':
    case 'NO_MEAL_PLAN':
      return 'bg-red-100 text-red-800'
    case 'AMBIGUOUS':
      return 'bg-gray-100 text-gray-700'
    default:
      return 'bg-orange-100 text-orange-900'
  }
}

function displayName(row: {
  customer: ConversationRow['customer']
  contactName: string | null
  phoneDisplay: string | null
}): string {
  return row.customer?.fullName ?? row.contactName ?? row.phoneDisplay ?? 'Unknown'
}

export default function WhatsAppInboxPage() {
  const toast = useNotification()
  const [view, setView] = useState<InboxView>('inbox')

  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [threadMeta, setThreadMeta] = useState<{
    phoneDisplay: string
    customer: ConversationRow['customer']
    contactName: string | null
  } | null>(null)

  const [supportLoading, setSupportLoading] = useState(false)
  const [supportSummary, setSupportSummary] = useState<SupportQueueSummary | null>(null)
  const [supportItems, setSupportItems] = useState<SupportQueueItem[]>([])
  const [selectedSupportRunId, setSelectedSupportRunId] = useState<number | null>(null)

  const loadInbox = useCallback(async () => {
    setLoading(true)
    try {
      const q = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''
      const res = await fetch(`/api/whatsapp/conversations${q}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setSummary(data.summary)
      setConversations(data.conversations)
    } catch {
      toast.error('Failed to load WhatsApp inbox')
    } finally {
      setLoading(false)
    }
  }, [search, toast])

  const loadSupportQueue = useCallback(async () => {
    setSupportLoading(true)
    try {
      const res = await fetch('/api/whatsapp/support-queue', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setSupportSummary(data.summary)
      setSupportItems(data.items)
    } catch {
      toast.error('Failed to load support queue')
    } finally {
      setSupportLoading(false)
    }
  }, [toast])

  const loadThread = useCallback(async (id: number) => {
    setThreadLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/conversations/${id}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load thread')
      const data = await res.json()
      setMessages(data.messages)
      setThreadMeta({
        phoneDisplay: data.phoneDisplay,
        customer: data.customer,
        contactName: data.contactName,
      })
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
      )
    } catch {
      toast.error('Failed to load conversation')
    } finally {
      setThreadLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadInbox()
    void loadSupportQueue()
  }, [loadInbox, loadSupportQueue])

  useEffect(() => {
    if (selectedId != null) void loadThread(selectedId)
  }, [selectedId, loadThread])

  const selected = conversations.find((c) => c.id === selectedId)
  const selectedSupport = supportItems.find((i) => i.runId === selectedSupportRunId)

  const openSupportItem = (item: SupportQueueItem) => {
    setSelectedSupportRunId(item.runId)
    if (item.conversationId != null) {
      setSelectedId(item.conversationId)
    }
  }

  const handleSend = async () => {
    if (!selectedId || !reply.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/whatsapp/conversations/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err.error === 'string' ? err.error : 'Send failed')
      }
      setReply('')
      await loadThread(selectedId)
      await loadInbox()
      toast.success('Message sent')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const refreshAll = () => {
    void loadInbox()
    void loadSupportQueue()
    if (selectedId != null) void loadThread(selectedId)
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h1 className="text-lg lg:text-2xl font-bold text-gray-900">WhatsApp Inbox</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/whatsapp/agent" className="text-nutrafi-primary hover:underline">
            AI history
          </Link>
          <button
            type="button"
            onClick={refreshAll}
            className="text-nutrafi-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setView('inbox')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            view === 'inbox'
              ? 'border-nutrafi-primary text-nutrafi-dark'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Inbox
          {summary && summary.totalUnread > 0 && (
            <span className="ml-1.5 text-xs font-bold bg-amber-500 text-white rounded-full px-1.5">
              {summary.totalUnread}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setView('support')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            view === 'support'
              ? 'border-nutrafi-primary text-nutrafi-dark'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Support queue
          {supportSummary && supportSummary.total > 0 && (
            <span className="ml-1.5 text-xs font-bold bg-orange-500 text-white rounded-full px-1.5">
              {supportSummary.total}
            </span>
          )}
        </button>
      </div>

      {view === 'inbox' && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Conversations</p>
            <p className="text-lg font-semibold text-gray-900">{summary.totalConversations}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Unread</p>
            <p className="text-lg font-semibold text-amber-700">{summary.totalUnread}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Known customers</p>
            <p className="text-lg font-semibold text-nutrafi-dark">{summary.matchedCustomers}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Unknown numbers</p>
            <p className="text-lg font-semibold text-gray-700">{summary.unknownNumbers}</p>
          </div>
        </div>
      )}

      {view === 'support' && supportSummary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Needs review (last {supportSummary.days}d)</p>
            <p className="text-lg font-semibold text-orange-700">{supportSummary.total}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Last 24 hours</p>
            <p className="text-lg font-semibold text-gray-900">{supportSummary.last24h}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3 md:col-span-1 col-span-2">
            <p className="text-xs text-gray-500">What shows here</p>
            <p className="text-sm text-gray-700 mt-0.5">
              Messages where the AI sent the customer support redirect instead of handling the
              request.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 min-h-[480px]">
        {/* Left list: inbox or support queue */}
        <div className="lg:w-80 shrink-0 bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden">
          {view === 'inbox' ? (
            <>
              <div className="p-2 border-b border-gray-100">
                <input
                  type="search"
                  placeholder="Search name or phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void loadInbox()
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <p className="p-4 text-sm text-gray-500">Loading…</p>
                ) : conversations.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">
                    No messages yet. Configure the Meta webhook to receive customer messages here.
                  </p>
                ) : (
                  conversations.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(c.id)
                        setSelectedSupportRunId(null)
                      }}
                      className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 ${
                        selectedId === c.id && view === 'inbox' ? 'bg-[#f0f4e8]' : ''
                      }`}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-sm text-gray-900 truncate">
                          {c.customer?.fullName ?? c.contactName ?? c.phoneDisplay}
                        </span>
                        {c.unreadCount > 0 && (
                          <span className="shrink-0 text-xs font-bold bg-nutrafi-primary text-white rounded-full px-1.5 min-w-[1.25rem] text-center">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {c.lastMessagePreview || '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {format(new Date(c.lastMessageAt), 'MMM d, HH:mm')}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {supportLoading ? (
                <p className="p-4 text-sm text-gray-500">Loading…</p>
              ) : supportItems.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">
                  No support redirects in the last {supportSummary?.days ?? 30} days. When the AI
                  cannot handle a message, it appears here for your team to follow up.
                </p>
              ) : (
                supportItems.map((item) => (
                  <button
                    key={item.runId}
                    type="button"
                    onClick={() => openSupportItem(item)}
                    className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 ${
                      selectedSupportRunId === item.runId ? 'bg-[#f0f4e8]' : ''
                    }`}
                  >
                    <div className="flex justify-between gap-2 items-start">
                      <span className="font-medium text-sm text-gray-900 truncate">
                        {displayName(item)}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${reasonBadgeClass(item.reason)}`}
                      >
                        {item.reasonLabel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 truncate mt-1 font-medium">
                      {item.customerMessage || '—'}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5 italic">
                      → {item.agentReplyPreview || 'Support reply sent'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(item.createdAt), 'MMM d, HH:mm')}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Thread + detail */}
        <div className="flex-1 flex flex-col gap-4 min-h-[360px]">
          {view === 'support' && selectedSupport && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 shrink-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-orange-950">AI redirected to support</p>
                  <p className="text-xs text-orange-800 mt-0.5">{selectedSupport.reasonLabel}</p>
                </div>
                <Link href="/whatsapp/agent" className="text-xs text-nutrafi-primary hover:underline">
                  View in AI history (run #{selectedSupport.runId}) →
                </Link>
              </div>
              <div className="mt-3 grid md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-1">
                    Customer asked
                  </p>
                  <p className="bg-white/80 rounded-md p-2 text-gray-900 whitespace-pre-wrap">
                    {selectedSupport.customerMessage || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-1">
                    AI replied
                  </p>
                  <p className="bg-white/80 rounded-md p-2 text-gray-700 whitespace-pre-wrap text-xs">
                    {selectedSupport.agentReplyPreview || '—'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-orange-800 mt-2">
                Reply in the thread below if the customer still needs help.
              </p>
            </div>
          )}

          <div className="flex-1 bg-white rounded-lg border border-gray-200 flex flex-col min-h-[280px]">
            {!selectedId ? (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6 text-center">
                {view === 'support'
                  ? 'Select an item from the support queue to open the chat'
                  : 'Select a conversation'}
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="font-semibold text-gray-900">
                    {threadMeta?.customer?.fullName ??
                      threadMeta?.contactName ??
                      threadMeta?.phoneDisplay ??
                      selected?.phoneDisplay}
                  </p>
                  <p className="text-xs text-gray-500">{threadMeta?.phoneDisplay}</p>
                  {threadMeta?.customer && (
                    <Link
                      href={`/customers/${threadMeta.customer.id}`}
                      className="text-xs text-nutrafi-primary hover:underline mt-1 inline-block"
                    >
                      View customer →
                    </Link>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {threadLoading ? (
                    <p className="text-sm text-gray-500">Loading messages…</p>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-gray-500">No messages in this thread.</p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                            m.direction === 'OUTBOUND'
                              ? m.body?.includes('This number is only for adding or updating')
                                ? 'bg-orange-100 text-orange-950 border border-orange-200'
                                : 'bg-nutrafi-primary text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {m.body ?? `[${m.messageType}]`}
                          </p>
                          <p
                            className={`text-xs mt-1 ${
                              m.direction === 'OUTBOUND' &&
                              !m.body?.includes('This number is only for adding or updating')
                                ? 'text-white/80'
                                : 'text-gray-500'
                            }`}
                          >
                            {format(new Date(m.timestamp), 'MMM d, HH:mm')}
                            {m.direction === 'OUTBOUND' ? ` · ${m.status.toLowerCase()}` : ''}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-3 border-t border-gray-100 flex gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Reply to customer…"
                    rows={2}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md resize-none"
                  />
                  <button
                    type="button"
                    disabled={sending || !reply.trim()}
                    onClick={() => void handleSend()}
                    className="self-end px-4 py-2 text-sm bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50"
                  >
                    {sending ? '…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
