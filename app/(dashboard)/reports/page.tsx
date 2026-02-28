'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCategory } from '@/lib/utils'
import { format } from 'date-fns'
import { DateOrRangePicker } from '@/components/date-or-range-picker'

interface ReportSummary {
  activeCustomers: number
  totalDishes: number
  activeMealPlans: number
  totalPayments: number
  revenue: number
}

export default function ReportsPage() {
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [popularDishes, setPopularDishes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date>(() => new Date())

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (startDate && endDate) {
      params.set('from', format(startDate, 'yyyy-MM-dd'))
      params.set('to', format(endDate, 'yyyy-MM-dd'))
    }
    const query = params.toString()
    const suffix = query ? `&${query}` : ''
    try {
      const [summaryRes, popularRes] = await Promise.all([
        fetch(`/api/reports?type=summary${suffix}`),
        fetch(`/api/reports?type=popular-dishes${suffix}`),
      ])

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json()
        setSummary(summaryData)
      }

      if (popularRes.ok) {
        const popularData = await popularRes.json()
        setPopularDishes(popularData)
      }
    } catch (error) {
      console.error('Error fetching reports:', error)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const handleDateChange = useCallback((newStart: Date | undefined, newEnd: Date) => {
    setStartDate(newStart)
    setEndDate(newEnd)
  }, [])

  const handleExportExcel = useCallback(() => {
    const params = new URLSearchParams()
    if (startDate && endDate) {
      params.set('from', format(startDate, 'yyyy-MM-dd'))
      params.set('to', format(endDate, 'yyyy-MM-dd'))
    }
    const query = params.toString()
    window.open(`/api/reports/export${query ? `?${query}` : ''}`, '_blank')
  }, [startDate, endDate])

  if (loading && !summary) {
    return <div className="text-center py-4 text-sm">Loading...</div>
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 lg:mb-6">
        <h1 className="text-lg lg:text-2xl font-bold text-nutrafi-dark">Reports</h1>
        <div className="flex flex-wrap items-center gap-2 lg:gap-4">
          <span className="text-sm font-semibold text-nutrafi-dark">Date range:</span>
          <DateOrRangePicker
            startDate={startDate}
            endDate={endDate}
            onDateChange={handleDateChange}
            presets={[
              { value: 60 * 24 * 7, label: 'Last 7 days' },
              { value: 60 * 24 * 30, label: 'Last 30 days' },
              { value: 60 * 24 * 90, label: 'Last 90 days' },
              { value: 60 * 24 * 365, label: 'Last 365 days' },
            ]}
          />
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={loading}
            className="px-4 py-2 h-10 rounded-lg bg-nutrafi-primary text-white hover:bg-nutrafi-dark font-medium text-sm flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export to Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-2 lg:gap-5 sm:grid-cols-2 lg:grid-cols-5 mb-3 lg:mb-8">
          <div className="bg-white overflow-hidden shadow rounded lg:rounded-lg border-t-4 border-nutrafi-primary">
            <div className="p-3 lg:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 rounded-lg bg-[#f0f4e8] p-2">
                  <svg className="h-5 w-5 lg:h-6 lg:w-6 text-nutrafi-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="ml-3 lg:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-xs lg:text-sm font-medium text-gray-500 truncate">Active Customers</dt>
                    <dd className="text-base lg:text-lg font-semibold text-gray-900">{summary.activeCustomers}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded lg:rounded-lg border-t-4 border-nutrafi-primary">
            <div className="p-3 lg:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 rounded-lg bg-[#f0f4e8] p-2">
                  <svg className="h-5 w-5 lg:h-6 lg:w-6 text-nutrafi-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div className="ml-3 lg:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-xs lg:text-sm font-medium text-gray-500 truncate">Total Dishes</dt>
                    <dd className="text-base lg:text-lg font-semibold text-gray-900">{summary.totalDishes}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded lg:rounded-lg border-t-4 border-nutrafi-primary">
            <div className="p-3 lg:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 rounded-lg bg-[#f0f4e8] p-2">
                  <svg className="h-5 w-5 lg:h-6 lg:w-6 text-nutrafi-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="ml-3 lg:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-xs lg:text-sm font-medium text-gray-500 truncate">Active Meal Plans</dt>
                    <dd className="text-base lg:text-lg font-semibold text-gray-900">{summary.activeMealPlans}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded lg:rounded-lg border-t-4 border-nutrafi-primary">
            <div className="p-3 lg:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 rounded-lg bg-[#f0f4e8] p-2">
                  <svg className="h-5 w-5 lg:h-6 lg:w-6 text-nutrafi-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3 lg:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-xs lg:text-sm font-medium text-gray-500 truncate">Total Payments</dt>
                    <dd className="text-base lg:text-lg font-semibold text-gray-900">{summary.totalPayments}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded lg:rounded-lg border-t-4 border-nutrafi-primary">
            <div className="p-3 lg:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 rounded-lg bg-[#f0f4e8] p-2">
                  <svg className="h-5 w-5 lg:h-6 lg:w-6 text-nutrafi-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3 lg:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-xs lg:text-sm font-medium text-gray-500 truncate">Total Revenue</dt>
                    <dd className="text-base lg:text-lg font-semibold text-nutrafi-dark">AED {summary.revenue.toFixed(2)}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popular Dishes */}
      <div className="bg-white shadow rounded lg:rounded-lg overflow-hidden">
        <div className="bg-nutrafi-primary px-3 lg:px-6 py-2 lg:py-3">
          <h2 className="text-base lg:text-lg font-semibold text-white">Most Ordered Dishes</h2>
        </div>
        <div className="p-3 lg:p-6">
        {popularDishes.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="bg-nutrafi-primary">
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Dish Name</th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Category</th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Total Orders</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {popularDishes.map((item, index) => (
                <tr key={item.dish?.id || index} className="hover:bg-gray-50">
                  <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap font-medium text-gray-900">{item.dish?.name || 'N/A'}</td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-gray-600">{item.dish?.category ? formatCategory(item.dish.category) : 'N/A'}</td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-gray-600">{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No data available</p>
        )}
        </div>
      </div>
    </div>
  )
}

