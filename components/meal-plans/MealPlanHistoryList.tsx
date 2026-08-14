'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'

export type MealPlanHistoryRow = {
  id: number
  createdAt: string
  action: string
  summary: string | null
  itemId: number | null
  details: unknown
  totalMeals: number | null
  remainingMeals: number | null
  remainingAfter: number | null
  deliveredAfter: number | null
  activeAfter: number | null
  inactiveAfter: number | null
  activeCount: number
  inactiveCount: number
  deliveredCount: number
  skippedCount: number
  scheduledCount: number
  days: number | null
  mealsPerDay: number | null
}

type PlanEditChange = {
  field: string
  label: string
  from: string | number | null
  to: string | number | null
}

function parsePlanEditChanges(details: unknown): PlanEditChange[] {
  if (!details || typeof details !== 'object') return []
  const changes = (details as { changes?: unknown }).changes
  if (!Array.isArray(changes)) return []
  return changes.filter(
    (c): c is PlanEditChange =>
      !!c &&
      typeof c === 'object' &&
      typeof (c as PlanEditChange).label === 'string' &&
      'from' in (c as object) &&
      'to' in (c as object)
  )
}

function formatChangeValue(value: string | number | null): string {
  if (value == null || value === '') return '—'
  return String(value)
}

const ACTION_LABEL: Record<string, string> = {
  plan_created: 'Plan created',
  plan_edited: 'Plan edited',
  item_added: 'Meal added',
  item_updated: 'Meal updated',
  item_deleted: 'Meal deleted',
  day_removed: 'Day removed',
  delivered: 'Delivered',
  undelivered: 'Undelivered',
  skipped: 'Skipped',
  unskipped: 'Unskipped',
  wrong_delivery: 'Wrong delivery',
  bulk_saved: 'Bulk save',
}

function CountCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-[7rem]">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-gray-900">
        {value == null ? '—' : value}
      </p>
    </div>
  )
}

export function MealPlanHistoryList({
  mealPlanId,
  autoLoad = true,
}: {
  mealPlanId: number
  autoLoad?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<MealPlanHistoryRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meal-plans/${mealPlanId}/history`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to load history')
      }
      const data = await res.json()
      setRows(Array.isArray(data.history) ? data.history : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [mealPlanId])

  useEffect(() => {
    if (autoLoad) void load()
  }, [autoLoad, load])

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {loading && rows.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">Loading history…</p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">
          No history yet. Deliver, add, or edit meals and refresh.
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row) => {
            const remaining = row.remainingAfter ?? row.remainingMeals
            const delivered = row.deliveredAfter ?? row.deliveredCount
            const active = row.activeAfter ?? row.activeCount
            const inactive = row.inactiveAfter ?? row.inactiveCount
            const editChanges =
              row.action === 'plan_edited' ? parsePlanEditChanges(row.details) : []
            return (
              <article
                key={row.id}
                className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden"
              >
                <header className="flex flex-wrap items-start justify-between gap-2 bg-[#f0f4e8] border-b border-[#dce5c8] px-4 py-3">
                  <div>
                    <h3 className="text-base font-semibold text-nutrafi-dark">
                      {ACTION_LABEL[row.action] ?? row.action}
                    </h3>
                    {row.summary && (
                      <p className="text-sm text-gray-600 mt-0.5">{row.summary}</p>
                    )}
                  </div>
                  <time className="text-xs text-gray-600 whitespace-nowrap">
                    {format(new Date(row.createdAt), 'MMM d, yyyy · HH:mm:ss')}
                  </time>
                </header>

                <div className="p-4">
                  {editChanges.length > 0 && (
                    <div className="mb-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">
                        What changed
                      </p>
                      <ul className="space-y-1">
                        {editChanges.map((change) => (
                          <li
                            key={change.field}
                            className="text-sm text-gray-800 flex flex-wrap gap-x-2"
                          >
                            <span className="font-medium text-gray-700">{change.label}:</span>
                            <span className="tabular-nums text-gray-600">
                              {formatChangeValue(change.from)}
                            </span>
                            <span className="text-gray-400">→</span>
                            <span className="tabular-nums font-semibold text-nutrafi-dark">
                              {formatChangeValue(change.to)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <CountCell label="Remaining" value={remaining} />
                    <CountCell label="Delivered" value={delivered} />
                    <CountCell label="Active" value={active} />
                    <CountCell label="Inactive" value={inactive} />
                  </div>

                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-xs text-gray-600 border-t border-gray-100 pt-3">
                    <div>
                      <dt className="text-gray-500">Total meals</dt>
                      <dd className="font-medium text-gray-800 tabular-nums">
                        {row.totalMeals ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Scheduled</dt>
                      <dd className="font-medium text-gray-800 tabular-nums">{row.scheduledCount}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Skipped</dt>
                      <dd className="font-medium text-gray-800 tabular-nums">{row.skippedCount}</dd>
                    </div>
                    <div aria-hidden="true" />
                  </dl>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
