'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { useNotification } from '@/components/notifications/NotificationContext'

const BATCH_DELIVER_PAGE_SIZE = 12

interface MealPlanItem {
  id: string
  date: string
  timeSlot: string
  deliveryTime: string | null
  dishName: string | null
  ingredients: string | null
  allergens: string | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fats: number | null
  customNote: string | null
  isSkipped: boolean
  isDelivered: boolean
  mealPlan: {
    id: string
    status?: string
    customer: {
      id: string
      fullName: string
      phone: string | null
      deliveryArea: string | null
    }
  }
  dish: {
    name: string
    calories: number
    protein: number
    carbs: number
    fats: number
    allergens: string | null
  } | null
}

/** Dish column when meal plan is paused — do not show real dish names. */
const KITCHEN_DISH_CUSTOMER_UNAVAILABLE = 'Customer not available'

function isKitchenMealPlanPaused(mealPlan: MealPlanItem['mealPlan']): boolean {
  return String(mealPlan.status || '').toUpperCase() === 'PAUSED'
}

function kitchenDishLabel(item: MealPlanItem): string {
  if (isKitchenMealPlanPaused(item.mealPlan)) return KITCHEN_DISH_CUSTOMER_UNAVAILABLE
  return item.dishName || item.dish?.name || 'Not Assigned'
}

interface AggregatedDish {
  dishName: string
  dishCategory: string | null
  totalPortions: number
  customerCount: number
  deliveryAreas: string[]
}

interface KitchenPlanningData {
  items: MealPlanItem[]
  aggregated: AggregatedDish[]
  total: number
  date: string | null
  startTime: string | null
  endTime: string | null
  skippedDayRows?: Array<{
    customerId: string
    customerName: string
    phone: string | null
    deliveryArea: string | null
    address: string | null
    timeSlot?: string
    deliveryTime?: string | null
  }>
}

interface UnscheduledKitchenRow {
  customerId: string
  customerName: string
  phone: string | null
  defaultTimeSlots: string[]
  mealPlanId: number
  mealsPerDay: number
  scheduledWithDishCount: number
}

export default function KitchenPlanningPage() {
  const toast = useNotification()
  const [data, setData] = useState<KitchenPlanningData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedMeal, setSelectedMeal] = useState<MealPlanItem | null>(null)
  const [markingDelivered, setMarkingDelivered] = useState(false)
  const [filters, setFilters] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '',
    endTime: '',
    status: 'active' as 'active' | 'delivered' | 'all', // Default to 'active'
  })
  /** Avoid naming state `page` in `page.tsx` (can confuse tooling / hydration). */
  const [tablePage, setTablePage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
  const [batchDeliverOpen, setBatchDeliverOpen] = useState(false)
  const [batchDeliverItems, setBatchDeliverItems] = useState<MealPlanItem[]>([])
  const [batchDeliverSelected, setBatchDeliverSelected] = useState<Set<string>>(new Set())
  const [batchDeliverSearch, setBatchDeliverSearch] = useState('')
  const [batchDeliverVisibleCount, setBatchDeliverVisibleCount] = useState(BATCH_DELIVER_PAGE_SIZE)
  const [batchDeliverSubmitting, setBatchDeliverSubmitting] = useState(false)
  const [batchDeliverLoading, setBatchDeliverLoading] = useState(false)
  const batchDeliverListRef = useRef<HTMLDivElement>(null)
  const batchDeliverFilteredLengthRef = useRef(0)

  const [kitchenTab, setKitchenTab] = useState<'scheduled' | 'needs'>('scheduled')
  const [needsRows, setNeedsRows] = useState<UnscheduledKitchenRow[]>([])
  const [needsLoading, setNeedsLoading] = useState(false)

  useEffect(() => {
    fetchKitchenPlanningData()
  }, [filters.date, filters.startTime, filters.endTime, filters.status])

  const fetchUnscheduledRows = useCallback(async () => {
    if (!filters.date) return
    setNeedsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('date', filters.date)
      const res = await fetch(`/api/kitchen-planning/unscheduled?${params}`)
      if (res.ok) {
        const json = await res.json()
        const raw = Array.isArray(json.rows) ? json.rows : []
        setNeedsRows(
          raw.map((r: UnscheduledKitchenRow & { deliveryArea?: string }) => ({
            customerId: r.customerId,
            customerName: r.customerName,
            phone: r.phone,
            defaultTimeSlots: Array.isArray(r.defaultTimeSlots) ? r.defaultTimeSlots : [],
            mealPlanId: r.mealPlanId,
            mealsPerDay: r.mealsPerDay,
            scheduledWithDishCount: r.scheduledWithDishCount,
          }))
        )
      } else {
        setNeedsRows([])
      }
    } catch {
      setNeedsRows([])
    } finally {
      setNeedsLoading(false)
    }
  }, [filters.date])

  useEffect(() => {
    if (kitchenTab === 'needs') {
      void fetchUnscheduledRows()
    }
  }, [kitchenTab, fetchUnscheduledRows])

  // Reset to first page when filters change
  useEffect(() => {
    setTablePage(1)
  }, [filters.date, filters.startTime, filters.endTime, filters.status])

  // Clamp page when data shrinks (e.g. fewer results)
  useEffect(() => {
    if (!data) return
    const totalRows = data.items.length + (data.skippedDayRows?.length ?? 0)
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
    setTablePage((p) => Math.min(p, totalPages))
  }, [data, pageSize])

  const fetchKitchenPlanningData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.date) params.append('date', filters.date)
      if (filters.startTime) params.append('startTime', filters.startTime)
      if (filters.endTime) params.append('endTime', filters.endTime)
      if (filters.status) params.append('status', filters.status)

      const response = await fetch(`/api/kitchen-planning?${params.toString()}`)
      if (response.ok) {
        const result = await response.json()
        setData(result)
      } else {
        console.error('Failed to fetch kitchen planning data')
      }
    } catch (error) {
      console.error('Error fetching kitchen planning data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (sheetType: 'chef' | 'rider') => {
    try {
      const params = new URLSearchParams()
      if (filters.date) params.append('date', filters.date)
      if (filters.startTime) params.append('startTime', filters.startTime)
      if (filters.endTime) params.append('endTime', filters.endTime)
      if (filters.status) params.append('status', filters.status)
      params.append('sheet', sheetType)

      // Export actual data using template
      const response = await fetch(`/api/kitchen-planning/export?${params.toString()}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        
        const timeRange = filters.startTime && filters.endTime 
          ? `${filters.startTime}-${filters.endTime}` 
          : filters.startTime 
            ? `from-${filters.startTime}` 
            : filters.endTime 
              ? `until-${filters.endTime}` 
              : 'all-times'
        a.download = `kitchen-planning-${sheetType}-${filters.date}-${timeRange}.xlsx`
        
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        console.error('Failed to export kitchen planning data')
      }
    } catch (error) {
      console.error('Error exporting kitchen planning data:', error)
    }
  }

  const getInstructions = (customNote: string | null): string => {
    if (!customNote || !customNote.trim()) return ''
    const raw = customNote.trim()
    if (!raw.startsWith('{')) return raw
    try {
      const parsed = JSON.parse(customNote) as Record<string, string>
      return parsed.note ?? parsed.instructions ?? ''
    } catch {
      return ''
    }
  }

  // Format time string (HH:MM or HH:MM:SS) to 12-hour with AM/PM
  const formatTime12h = (timeStr: string | null): string => {
    if (!timeStr || typeof timeStr !== 'string') return ''
    const trimmed = timeStr.trim()
    if (!trimmed) return ''
    const parts = trimmed.split(':')
    const h = parseInt(parts[0], 10)
    const m = parts[1] ? parseInt(parts[1], 10) : 0
    if (Number.isNaN(h)) return trimmed
    const hour12 = h % 12 || 12
    const ampm = h < 12 ? 'AM' : 'PM'
    const min = Number.isNaN(m) ? '00' : m.toString().padStart(2, '0')
    return `${hour12}:${min} ${ampm}`
  }

  const handleMarkAsDelivered = async (item: MealPlanItem) => {
    if (!item.mealPlan?.id) {
      toast.warning('Unable to mark meal as delivered: Meal plan ID missing')
      return
    }

    setMarkingDelivered(true)
    try {
      const response = await fetch(
        `/api/meal-plans/${item.mealPlan.id}/items/${item.id}/deliver`,
        {
          method: 'POST',
        }
      )

      if (response.ok) {
        // Refresh the data
        await fetchKitchenPlanningData()
        // Close the modal
        setSelectedMeal(null)
      } else {
        const error = await response.json()
        toast.error('Failed to mark meal as delivered: ' + (error.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error marking meal as delivered:', error)
      toast.error('Failed to mark meal as delivered')
    } finally {
      setMarkingDelivered(false)
    }
  }

  const handleUnmarkAsDelivered = async (item: MealPlanItem) => {
    if (!item.mealPlan?.id) {
      toast.warning('Unable to unmark meal: Meal plan ID missing')
      return
    }

    setMarkingDelivered(true)
    try {
      const response = await fetch(
        `/api/meal-plans/${item.mealPlan.id}/items/${item.id}/deliver`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        // Refresh the data
        await fetchKitchenPlanningData()
        // Close the modal
        setSelectedMeal(null)
      } else {
        const error = await response.json()
        toast.error('Failed to unmark meal: ' + (error.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error unmarking meal:', error)
      toast.error('Failed to unmark meal')
    } finally {
      setMarkingDelivered(false)
    }
  }

  const openBatchDeliverModal = async () => {
    setBatchDeliverOpen(true)
    setBatchDeliverSearch('')
    setBatchDeliverVisibleCount(BATCH_DELIVER_PAGE_SIZE)
    setBatchDeliverLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('date', filters.date)
      params.append('status', 'active')
      if (filters.startTime) params.append('startTime', filters.startTime)
      if (filters.endTime) params.append('endTime', filters.endTime)
      const response = await fetch(`/api/kitchen-planning?${params.toString()}`)
      if (response.ok) {
        const result = await response.json()
        const items = result.items || []
        setBatchDeliverItems(items)
        setBatchDeliverSelected(new Set(items.map((i: MealPlanItem) => String(i.id))))
      } else {
        toast.error('Failed to load meals')
        setBatchDeliverItems([])
        setBatchDeliverSelected(new Set())
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to load meals')
      setBatchDeliverItems([])
      setBatchDeliverSelected(new Set())
    } finally {
      setBatchDeliverLoading(false)
    }
  }

  // Reset visible count when search changes so user sees first page of search results
  useEffect(() => {
    if (batchDeliverOpen) setBatchDeliverVisibleCount(BATCH_DELIVER_PAGE_SIZE)
  }, [batchDeliverSearch, batchDeliverOpen])

  const handleBatchDeliverScroll = useCallback(() => {
    const el = batchDeliverListRef.current
    if (!el) return
    const { scrollTop, clientHeight, scrollHeight } = el
    const nearBottom = scrollTop + clientHeight >= scrollHeight - 80
    if (!nearBottom) return
    const filteredLen = batchDeliverFilteredLengthRef.current
    setBatchDeliverVisibleCount((prev) => (prev >= filteredLen ? prev : prev + BATCH_DELIVER_PAGE_SIZE))
  }, [])

  const toggleBatchDeliverItem = (id: string) => {
    setBatchDeliverSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBatchDeliverSubmit = async () => {
    const selectedIds = batchDeliverItems
      .filter((i) => batchDeliverSelected.has(String(i.id)))
      .map((i) => (typeof i.id === 'number' ? i.id : parseInt(String(i.id), 10)))
      .filter((n) => !Number.isNaN(n))
    if (selectedIds.length === 0) {
      toast.warning('Select at least one meal to mark as delivered')
      return
    }
    setBatchDeliverSubmitting(true)
    try {
      const response = await fetch('/api/kitchen-planning/deliver-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: selectedIds }),
      })
      if (response.ok) {
        toast.success(`Marked ${selectedIds.length} meal(s) as delivered`)
        setBatchDeliverOpen(false)
        await fetchKitchenPlanningData()
      } else {
        const err = await response.json()
        toast.error(err.error || 'Failed to mark meals as delivered')
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to mark meals as delivered')
    } finally {
      setBatchDeliverSubmitting(false)
    }
  }

  return (
    <div className="p-2 lg:p-6">
      <div className="flex justify-between items-center mb-3 lg:mb-6">
        <div>
          <h1 className="text-lg lg:text-2xl font-bold text-gray-900">Kitchen Planning</h1>
          <p className="text-xs lg:text-sm text-gray-600 mt-0.5 lg:mt-1">
            Plan and manage meals by date and time range
          </p>
        </div>
        <div className="flex gap-2 lg:gap-3">
          {kitchenTab === 'scheduled' && (
            <>
          <button
            onClick={() => handleExport('chef')}
            disabled={loading || !data || (data.items.length === 0 && (!data.skippedDayRows || data.skippedDayRows.length === 0))}
            className="px-3 py-1.5 lg:px-4 lg:py-2 text-sm bg-nutrafi-primary text-white rounded lg:rounded-lg hover:bg-nutrafi-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 lg:gap-2"
          >
            <svg
              className="w-4 h-4 lg:w-5 lg:h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download Chef Sheet
          </button>
          <button
            onClick={() => handleExport('rider')}
            disabled={loading || !data || (data.items.length === 0 && (!data.skippedDayRows || data.skippedDayRows.length === 0))}
            className="px-3 py-1.5 lg:px-4 lg:py-2 text-sm bg-black text-white rounded lg:rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 lg:gap-2 font-medium"
          >
            <svg
              className="w-4 h-4 lg:w-5 lg:h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download Rider Sheet
          </button>
          <button
            onClick={openBatchDeliverModal}
            disabled={loading || !filters.date}
            className="px-3 py-1.5 lg:px-4 lg:py-2 text-sm bg-nutrafi-dark text-white rounded lg:rounded-lg hover:bg-nutrafi-dark/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 lg:gap-2"
          >
            <svg className="w-4 h-4 lg:w-5 lg:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Mark all as delivered
          </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded shadow lg:rounded-lg p-2 lg:p-4 mb-3 lg:mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 lg:gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters({ ...filters, date: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-nutrafi-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Start Time
            </label>
            <input
              type="time"
              value={filters.startTime}
              onChange={(e) => setFilters({ ...filters, startTime: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-nutrafi-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              End Time
            </label>
            <input
              type="time"
              value={filters.endTime}
              onChange={(e) => setFilters({ ...filters, endTime: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-nutrafi-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as 'active' | 'delivered' | 'all' })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-nutrafi-primary focus:border-transparent"
            >
              <option value="active">Active</option>
              <option value="delivered">Delivered</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
        {(filters.startTime || filters.endTime) && (
          <div className="mt-2">
            <button
              onClick={() => setFilters({ ...filters, startTime: '', endTime: '' })}
              className="text-xs text-nutrafi-primary hover:text-nutrafi-dark"
            >
              Clear time range
            </button>
          </div>
        )}
      </div>

      {/* Summary (above tabs) */}
      {kitchenTab === 'scheduled' && data && (
        <div className="bg-white p-2 lg:p-4 rounded shadow lg:rounded-lg mb-3 lg:mb-6">
          <h2 className="text-base lg:text-lg font-semibold mb-1 lg:mb-2">Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 lg:gap-4 text-sm">
            <p>Total Meals: <strong>{data.total}</strong></p>
            <p>Date: <strong>{data.date ? format(new Date(data.date), 'MMM dd, yyyy') : 'All'}</strong></p>
          </div>
        </div>
      )}
      {kitchenTab === 'needs' && (
        <div className="bg-white p-2 lg:p-4 rounded shadow lg:rounded-lg mb-3 lg:mb-6">
          <h2 className="text-base lg:text-lg font-semibold mb-1 lg:mb-2">Summary</h2>
          {needsLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <p className="text-sm text-gray-700">
              <strong>{needsRows.length}</strong> customer{needsRows.length === 1 ? '' : 's'} with an active meal plan on{' '}
              <strong>{format(new Date(filters.date), 'MMM dd, yyyy')}</strong> still need meals added (or more dishes assigned) for this day.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-1 mb-3 lg:mb-4 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setKitchenTab('scheduled')}
          className={`px-3 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
            kitchenTab === 'scheduled'
              ? 'border-nutrafi-primary bg-[#f0f4e8] text-nutrafi-dark'
              : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-800'
          }`}
        >
          Scheduled meals
        </button>
        <button
          type="button"
          onClick={() => setKitchenTab('needs')}
          className={`px-3 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
            kitchenTab === 'needs'
              ? 'border-nutrafi-primary bg-[#f0f4e8] text-nutrafi-dark'
              : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-800'
          }`}
        >
          Unscheduled meals
        </button>
      </div>

      {/* Results — scheduled */}
      {kitchenTab === 'scheduled' && loading ? (
        <div className="bg-white rounded shadow p-6 text-center">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-nutrafi-primary"></div>
          <p className="mt-2 text-sm text-gray-600">Loading kitchen planning data...</p>
        </div>
      ) : kitchenTab === 'scheduled' && data && (data.items.length > 0 || (data.skippedDayRows && data.skippedDayRows.length > 0)) ? (
        (() => {
          type SkippedDayRowItem = {
            customerId: string
            customerName: string
            phone: string | null
            deliveryArea: string | null
            address: string | null
            timeSlot?: string
            deliveryTime?: string | null
          }
          type RowItem = { type: 'item'; data: MealPlanItem } | { type: 'skipped'; data: SkippedDayRowItem }
          const allRows: RowItem[] = [
            ...data.items.map((item): RowItem => ({ type: 'item', data: item })),
            ...(data.skippedDayRows ?? []).map((row): RowItem => ({ type: 'skipped', data: row })),
          ]
          const totalRows = allRows.length
          const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
          const currentPage = Math.min(tablePage, totalPages)
          const start = (currentPage - 1) * pageSize
          const paginatedRows = allRows.slice(start, start + pageSize)

          return (
        <div className="bg-white rounded shadow lg:rounded-lg overflow-hidden">
            <div className="px-2 lg:px-6 py-2 lg:py-4 border-b border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base lg:text-lg font-semibold text-gray-900">
                Meal Plans ({data.total + (data.skippedDayRows?.length ?? 0)} items)
              </h2>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-xs lg:text-sm text-gray-600">
                  {format(new Date(filters.date), 'EEEE, MMMM dd, yyyy')}
                  {filters.startTime && filters.endTime && (
                    <span className="ml-2">• {filters.startTime} - {filters.endTime}</span>
                  )}
                  {filters.startTime && !filters.endTime && (
                    <span className="ml-2">• From {filters.startTime}</span>
                  )}
                  {!filters.startTime && filters.endTime && (
                    <span className="ml-2">• Until {filters.endTime}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <label htmlFor="kitchen-page-size" className="text-gray-600 whitespace-nowrap">Rows per page</label>
                  <select
                    id="kitchen-page-size"
                    value={String(pageSize)}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10)
                      if (!Number.isNaN(next) && next > 0) {
                        setPageSize(next)
                        setTablePage(1)
                      }
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-gray-900 focus:ring-2 focus:ring-nutrafi-primary focus:border-transparent"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-nutrafi-primary">
                <tr>
                  <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                    Dish
                  </th>
                  <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                    Delivery Area
                  </th>
                  <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedRows.map((row) => {
                  if (row.type === 'item') {
                    const item = row.data
                    const instructions = getInstructions(item.customNote)
                    const isPaused = isKitchenMealPlanPaused(item.mealPlan)

                    return (
                      <tr 
                        key={item.id} 
                        className={isPaused ? 'bg-red-100 hover:bg-red-200 cursor-pointer' : 'hover:bg-gray-50 cursor-pointer'}
                        onClick={() => setSelectedMeal(item)}
                      >
                        <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="font-medium">{formatTime12h(item.timeSlot) || item.timeSlot}</div>
                          {item.deliveryTime && (
                            <div className="text-xs text-gray-500">
                              Delivery: {formatTime12h(item.deliveryTime)}
                            </div>
                          )}
                        </td>
                        <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {item.mealPlan.customer.fullName}
                          </div>
                          {item.mealPlan.customer.phone && (
                            <div className="text-xs text-gray-500">
                              {item.mealPlan.customer.phone}
                            </div>
                          )}
                        </td>
                        <td className="px-2 lg:px-6 py-2 lg:py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {kitchenDishLabel(item)}
                          </div>
                          {instructions && !isPaused && (
                            <div className="text-xs text-gray-500 mt-1">
                              <span className="font-medium">Note:</span> {instructions}
                            </div>
                          )}
                        </td>
                        <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.mealPlan.customer.deliveryArea || '-'}
                        </td>
                        <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap">
                          {item.isDelivered ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                              Delivered
                            </span>
                          ) : isPaused ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-200 text-red-900">
                              Customer not available
                            </span>
                          ) : item.isSkipped ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                              Skipped
                            </span>
                          ) : (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-[#f0f4e8] text-nutrafi-dark">
                              Active
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  }
                  const sk = row.data
                  const skTime = formatTime12h(sk.timeSlot || sk.deliveryTime || '') || '—'
                  const skDelivery = sk.deliveryTime ? formatTime12h(sk.deliveryTime) : null
                  return (
                    <tr
                      key={`skipped-${sk.customerId}`}
                      className="bg-yellow-100 hover:bg-yellow-200"
                    >
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-sm text-gray-700">
                        <div className="font-medium">{skTime}</div>
                        {skDelivery && (
                          <div className="text-xs text-gray-500">
                            Delivery: {skDelivery}
                          </div>
                        )}
                      </td>
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{sk.customerName}</div>
                        {sk.phone && (
                          <div className="text-xs text-gray-600">{sk.phone}</div>
                        )}
                      </td>
                      <td className="px-2 lg:px-6 py-2 lg:py-4">
                        <span className="text-sm font-medium text-yellow-900">No meal for today</span>
                      </td>
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-sm text-gray-600">
                        {sk.deliveryArea || '—'}
                      </td>
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-200 text-yellow-900">
                          No meal
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination + row range (always show when there are rows so page size changes are visible) */}
          <div className="px-2 lg:px-6 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              Showing <span className="font-medium">{totalRows === 0 ? 0 : start + 1}</span> to{' '}
              <span className="font-medium">{Math.min(start + pageSize, totalRows)}</span> of{' '}
              <span className="font-medium">{totalRows}</span> rows
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-2 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                >
                  Previous
                </button>
                <span className="px-2 py-1.5 text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-2 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
          )
        })()
      ) : kitchenTab === 'scheduled' ? (
        <div className="bg-white rounded shadow p-6 text-center">
          <svg
            className="mx-auto h-8 w-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No meal plans found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filters.date
              ? `No meal plans scheduled for ${format(new Date(filters.date), 'MMMM dd, yyyy')}`
              : 'Select a date to view meal plans'}
            {filters.startTime || filters.endTime
              ? ` in the selected time range`
              : ''}
          </p>
        </div>
      ) : null}

      {/* Unscheduled meals — active plans missing same-day meals (one row per customer) */}
      {kitchenTab === 'needs' && needsLoading && (
        <div className="bg-white rounded shadow lg:rounded-lg p-6 text-center">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-nutrafi-primary" />
          <p className="mt-2 text-sm text-gray-600">Loading…</p>
        </div>
      )}
      {kitchenTab === 'needs' && !needsLoading && needsRows.length > 0 && (
        <div className="bg-white rounded shadow lg:rounded-lg overflow-hidden">
          <div className="px-2 lg:px-6 py-3 border-b border-gray-200">
            <h2 className="text-base lg:text-lg font-semibold text-gray-900">Add meals for this date</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Open the meal plan view to assign or adjust dishes for {format(new Date(filters.date), 'EEEE, MMMM dd, yyyy')}.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-nutrafi-primary">
                <tr>
                  <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                    Time slot
                  </th>
                  <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                    Meals for this day
                  </th>
                  <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {needsRows.map((row) => (
                  <tr key={row.customerId} className="hover:bg-gray-50">
                    <td className="px-2 lg:px-6 py-3 text-sm font-medium text-gray-900">{row.customerName}</td>
                    <td className="px-2 lg:px-6 py-3 text-sm text-gray-600">{row.phone || '—'}</td>
                    <td className="px-2 lg:px-6 py-3 text-sm text-gray-700">
                      {row.defaultTimeSlots.length > 0
                        ? row.defaultTimeSlots.map((s) => formatTime12h(s) || s).join(', ')
                        : '—'}
                    </td>
                    <td className="px-2 lg:px-6 py-3 text-sm text-gray-700">
                      {row.scheduledWithDishCount} / {row.mealsPerDay} with dish
                    </td>
                    <td className="px-2 lg:px-6 py-3 whitespace-nowrap">
                      <Link
                        href={`/meal-plans/${row.mealPlanId}`}
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-nutrafi-primary rounded-md hover:bg-nutrafi-dark"
                      >
                        View meal plan
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {kitchenTab === 'needs' && !needsLoading && needsRows.length === 0 && (
        <div className="bg-white rounded shadow lg:rounded-lg p-6 text-center">
          <h3 className="text-sm font-medium text-gray-900">Everyone is covered</h3>
          <p className="mt-1 text-sm text-gray-500">
            No active customers on this date are missing scheduled meals (or they are fully skipped for the day).
          </p>
        </div>
      )}

      {/* Meal Detail Modal */}
      {selectedMeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
          {/* Blurred Background */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>
          
          {/* Modal Box */}
          <div className="relative bg-white rounded shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-3">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-lg font-bold text-gray-900">Meal Details</h2>
                <button
                  onClick={() => setSelectedMeal(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-2">
                {/* Customer Info */}
                <div className="border-b pb-2">
                  <h3 className="text-xs font-medium text-gray-500 mb-1">Customer</h3>
                  <p className="text-base font-semibold text-gray-900">{selectedMeal.mealPlan.customer.fullName}</p>
                  {selectedMeal.mealPlan.customer.phone && (
                    <p className="text-sm text-gray-600">{selectedMeal.mealPlan.customer.phone}</p>
                  )}
                  {selectedMeal.mealPlan.customer.deliveryArea && (
                    <p className="text-sm text-gray-600">{selectedMeal.mealPlan.customer.deliveryArea}</p>
                  )}
                </div>

                {/* Meal Info */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 mb-0.5">Date</h3>
                    <p className="text-sm text-gray-900">{format(new Date(selectedMeal.date), 'EEEE, MMMM dd, yyyy')}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Time Slot</h3>
                    <p className="text-sm text-gray-900">{formatTime12h(selectedMeal.timeSlot) || selectedMeal.timeSlot}</p>
                  </div>
                  {selectedMeal.deliveryTime && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">Delivery Time</h3>
                      <p className="text-sm text-gray-900">{formatTime12h(selectedMeal.deliveryTime)}</p>
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Status</h3>
                    {selectedMeal.isDelivered ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        Delivered
                      </span>
                    ) : isKitchenMealPlanPaused(selectedMeal.mealPlan) ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-200 text-red-900">
                        {KITCHEN_DISH_CUSTOMER_UNAVAILABLE}
                      </span>
                    ) : selectedMeal.isSkipped ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        Skipped
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-[#f0f4e8] text-nutrafi-dark">
                        Active
                      </span>
                    )}
                  </div>
                </div>

                {/* Dish Info */}
                <div className="border-t pt-2">
                  <h3 className="text-xs font-medium text-gray-500 mb-1">Dish</h3>
                  {isKitchenMealPlanPaused(selectedMeal.mealPlan) ? (
                    <p className="text-base font-semibold text-gray-900">{KITCHEN_DISH_CUSTOMER_UNAVAILABLE}</p>
                  ) : (
                    <>
                      <p className="text-base font-semibold text-gray-900">
                        {selectedMeal.dishName || selectedMeal.dish?.name || 'Not Assigned'}
                      </p>

                      {selectedMeal.ingredients && (
                        <div className="mt-2">
                          <h4 className="text-xs font-medium text-gray-500 mb-1">Ingredients</h4>
                          <p className="text-sm text-gray-700">{selectedMeal.ingredients}</p>
                        </div>
                      )}

                      {selectedMeal.allergens && (
                        <div className="mt-2">
                          <h4 className="text-xs font-medium text-gray-500 mb-1">Allergens</h4>
                          <p className="text-sm text-gray-700">{selectedMeal.allergens}</p>
                        </div>
                      )}

                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 mb-1">Calories</h4>
                          <p className="text-sm font-semibold text-gray-900">
                            {selectedMeal.calories || selectedMeal.dish?.calories || 0} kcal
                          </p>
                        </div>
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 mb-1">Macros</h4>
                          <div className="text-xs text-gray-700">
                            <div>Protein: {(selectedMeal.protein || selectedMeal.dish?.protein || 0).toFixed(1)}g</div>
                            <div>Carbs: {(selectedMeal.carbs || selectedMeal.dish?.carbs || 0).toFixed(1)}g</div>
                            <div>Fats: {(selectedMeal.fats || selectedMeal.dish?.fats || 0).toFixed(1)}g</div>
                          </div>
                        </div>
                      </div>

                      {getInstructions(selectedMeal.customNote) && (
                        <div className="mt-4">
                          <h4 className="text-xs font-medium text-gray-500 mb-1">Special Instructions</h4>
                          <p className="text-sm text-gray-700">{getInstructions(selectedMeal.customNote)}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="border-t pt-2 flex gap-2">
                  {!selectedMeal.isDelivered &&
                    !selectedMeal.isSkipped &&
                    !isKitchenMealPlanPaused(selectedMeal.mealPlan) && (
                    <button
                      onClick={() => handleMarkAsDelivered(selectedMeal)}
                      disabled={markingDelivered}
                      className="flex-1 px-3 py-1.5 text-sm bg-nutrafi-primary text-white rounded hover:bg-nutrafi-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {markingDelivered ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Marking...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Mark as Delivered</span>
                        </>
                      )}
                    </button>
                  )}
                  {selectedMeal.isDelivered && (
                    <button
                      onClick={() => handleUnmarkAsDelivered(selectedMeal)}
                      disabled={markingDelivered}
                      className="flex-1 px-3 py-1.5 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {markingDelivered ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span>Unmark as Delivered</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedMeal(null)}
                    className="px-3 py-1.5 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Mark as Delivered Modal */}
      {batchDeliverOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !batchDeliverSubmitting && setBatchDeliverOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col border border-gray-200">
            {/* Header */}
            <div className="flex-shrink-0 bg-gray-50 border-b border-gray-200 px-4 py-4">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Mark meals as delivered</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {format(new Date(filters.date), 'EEEE, MMMM dd, yyyy')}
                    {filters.startTime || filters.endTime ? ` · ${filters.startTime || '—'} – ${filters.endTime || '—'}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !batchDeliverSubmitting && setBatchDeliverOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="search"
                  placeholder="Search by customer or dish..."
                  value={batchDeliverSearch}
                  onChange={(e) => setBatchDeliverSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-nutrafi-primary focus:border-nutrafi-primary bg-white placeholder:text-gray-400"
                />
              </div>
            </div>
            {/* List: search runs over all meals for the day; only 12 load at a time, more on scroll */}
            <div
              ref={batchDeliverListRef}
              onScroll={handleBatchDeliverScroll}
              className="flex-1 overflow-y-auto p-4 min-h-0"
            >
              {batchDeliverLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="animate-spin rounded-full h-9 w-9 border-2 border-nutrafi-primary border-t-transparent" />
                  <p className="text-sm text-gray-500">Loading meals...</p>
                </div>
              ) : batchDeliverItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-gray-500">No undelivered meals for this date.</p>
                </div>
              ) : (
                (() => {
                  const q = batchDeliverSearch.trim().toLowerCase()
                  const filtered = q
                    ? batchDeliverItems.filter(
                        (i) =>
                          (i.mealPlan.customer.fullName || '').toLowerCase().includes(q) ||
                          kitchenDishLabel(i).toLowerCase().includes(q)
                      )
                    : batchDeliverItems
                  batchDeliverFilteredLengthRef.current = filtered.length
                  const visible = filtered.slice(0, batchDeliverVisibleCount)
                  const hasMore = visible.length < filtered.length
                  return (
                    <>
                      <ul className="space-y-2">
                        {visible.map((item) => {
                          const idStr = String(item.id)
                          const checked = batchDeliverSelected.has(idStr)
                          return (
                            <li
                              key={item.id}
                              className={`flex items-center gap-3 py-3 px-3 rounded-lg border transition-colors ${
                                checked
                                  ? 'border-nutrafi-primary/30 bg-nutrafi-primary/5'
                                  : 'border-gray-200 bg-gray-50/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                id={`batch-${idStr}`}
                                checked={checked}
                                onChange={() => toggleBatchDeliverItem(idStr)}
                                className="h-4 w-4 rounded border-gray-300 text-nutrafi-dark focus:ring-nutrafi-dark focus:ring-offset-0"
                              />
                              <label htmlFor={`batch-${idStr}`} className="flex-1 cursor-pointer text-sm min-w-0">
                                <span className="font-medium text-gray-900">{item.mealPlan.customer.fullName}</span>
                                <span className="text-gray-400 mx-1.5">·</span>
                                <span className="text-gray-700">{kitchenDishLabel(item)}</span>
                                <span className="text-gray-400 text-xs ml-1.5 whitespace-nowrap">
                                  {formatTime12h(item.timeSlot) || item.timeSlot}
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                      {hasMore && (
                        <p className="text-xs text-gray-400 text-center py-3">
                          Showing {visible.length} of {filtered.length} — scroll for more
                        </p>
                      )}
                    </>
                  )
                })()
              )}
            </div>
            {/* Footer */}
            <div className="flex-shrink-0 px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-gray-600 font-medium">
                {batchDeliverSelected.size} of {batchDeliverItems.length} selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => !batchDeliverSubmitting && setBatchDeliverOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBatchDeliverSubmit}
                  disabled={batchDeliverSubmitting || batchDeliverSelected.size === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-nutrafi-dark rounded-lg hover:bg-nutrafi-dark/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                  {batchDeliverSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Marking...
                    </>
                  ) : (
                    <>Mark selected as delivered</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

