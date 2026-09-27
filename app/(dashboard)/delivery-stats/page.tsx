'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, startOfDay } from 'date-fns'
import { DateOrRangePicker } from '@/components/date-or-range-picker'
import type { DeliveryStatsSummary } from '@/lib/delivery-stats'

export default function DeliveryStatsPage() {
  const [startDate, setStartDate] = useState<Date | undefined>(() => startOfDay(new Date()))
  const [endDate, setEndDate] = useState<Date>(() => startOfDay(new Date()))
  const [stats, setStats] = useState<DeliveryStatsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    const from = startDate ?? startOfDay(new Date())
    params.set('from', format(from, 'yyyy-MM-dd'))
    params.set('to', format(endDate, 'yyyy-MM-dd'))
    try {
      const res = await fetch(`/api/delivery-stats?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to load delivery stats')
      }
      setStats((await res.json()) as DeliveryStatsSummary)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Failed to load delivery stats')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  const handleDateChange = useCallback((newStart: Date | undefined, newEnd: Date) => {
    setStartDate(newStart ? startOfDay(newStart) : startOfDay(new Date()))
    setEndDate(startOfDay(newEnd))
  }, [])

  const rangeLabel =
    stats?.from && stats?.to
      ? stats.from === stats.to
        ? format(new Date(stats.from + 'T12:00:00'), 'd MMM yyyy')
        : `${format(new Date(stats.from + 'T12:00:00'), 'd MMM yyyy')} → ${format(
            new Date(stats.to + 'T12:00:00'),
            'd MMM yyyy'
          )}`
      : '…'

  return (
    <div className="p-2 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 lg:mb-6">
        <div>
          <h1 className="text-lg lg:text-2xl font-bold text-gray-900">Delivery stats</h1>
        </div>
        <DateOrRangePicker
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
          initialPreset="today"
          clearToPreset="today"
          presets={[
            { value: 'today', label: 'Today' },
            { value: 'yesterday', label: 'Yesterday' },
            { value: 60 * 24 * 7, label: 'Last 7 days' },
            { value: 60 * 24 * 30, label: 'Last 30 days' },
          ]}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label={`Portal · ${rangeLabel}`} value={stats?.portal} loading={loading} accent="primary" />
        <StatCard label="Talabat (not configured)" value={stats?.talabat ?? 0} loading={loading} muted />
        <StatCard label="Total delivered" value={stats?.total} loading={loading} accent="dark" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow border border-nutrafi-primary/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-nutrafi-primary/40 flex items-center justify-between bg-white">
            <h2 className="text-sm font-semibold text-black">Per dish</h2>
            {loading && <span className="text-xs text-gray-500">Updating…</span>}
          </div>
          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-nutrafi-primary text-left text-white sticky top-0">
                <tr className="border-b border-nutrafi-dark/25">
                  <th className="px-4 py-2 font-semibold">Dish</th>
                  <th className="px-4 py-2 font-semibold text-right">Portal</th>
                  <th className="px-4 py-2 font-semibold text-right">Talabat</th>
                  <th className="px-4 py-2 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {!stats || stats.byDish.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      {loading ? 'Loading…' : 'No delivered dishes in this range'}
                    </td>
                  </tr>
                ) : (
                  stats.byDish.map((row) => (
                    <tr
                      key={row.dishId != null ? `id-${row.dishId}` : `name-${row.dishName}`}
                      className="border-t border-gray-100"
                    >
                      <td className="px-4 py-2 text-gray-900">{row.dishName}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.portal}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-400">{row.talabat}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{row.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow border border-nutrafi-primary/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-nutrafi-primary/40 flex items-center justify-between bg-white">
            <h2 className="text-sm font-semibold text-black">Daily breakdown</h2>
            {loading && <span className="text-xs text-gray-500">Updating…</span>}
          </div>
          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-nutrafi-primary text-left text-white sticky top-0">
                <tr className="border-b border-nutrafi-dark/25">
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold text-right">Portal</th>
                  <th className="px-4 py-2 font-semibold text-right">Talabat</th>
                  <th className="px-4 py-2 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {!stats || stats.byDay.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      {loading ? 'Loading…' : 'No delivered meals in this range'}
                    </td>
                  </tr>
                ) : (
                  stats.byDay.map((row) => (
                    <tr key={row.date} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-900">
                        {format(new Date(row.date + 'T12:00:00'), 'EEE, d MMM yyyy')}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.portal}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-400">{row.talabat}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{row.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  loading,
  accent,
  muted,
}: {
  label: string
  value?: number
  loading?: boolean
  accent?: 'primary' | 'dark'
  muted?: boolean
}) {
  const valueClass =
    accent === 'primary'
      ? 'text-nutrafi-primary'
      : accent === 'dark'
        ? 'text-nutrafi-dark'
        : muted
          ? 'text-gray-400'
          : 'text-gray-900'

  return (
    <div
      className={`rounded-lg border p-4 ${
        muted ? 'border-dashed border-gray-300 bg-gray-50' : 'border-gray-200 bg-white shadow-sm'
      }`}
    >
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueClass}`}>
        {loading && value == null ? '…' : value ?? 0}
      </p>
    </div>
  )
}
