'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { formatCategory } from '@/lib/utils'

interface ProductionData {
  aggregated: Array<{
    dish: {
      id: string
      name: string
      category: string
    }
    totalPortions: number
    customerCount: number
    deliveryAreas: string[]
  }>
  byTimeSlot: Record<string, any[]>
  totalMeals: number
  date: string | null
  timeSlot: string | null
}

export default function ProductionPage() {
  const [data, setData] = useState<ProductionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    timeSlot: '',
    deliveryArea: '',
    dishId: '',
  })

  useEffect(() => {
    fetchProductionData()
  }, [filters.date, filters.timeSlot])

  const fetchProductionData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.date) params.append('date', filters.date)
      if (filters.timeSlot) params.append('timeSlot', filters.timeSlot)
      if (filters.deliveryArea) params.append('deliveryArea', filters.deliveryArea)
      if (filters.dishId) params.append('dishId', filters.dishId)

      const response = await fetch(`/api/production?${params.toString()}`)
      if (response.ok) {
        const result = await response.json()
        setData(result)
      }
    } catch (error) {
      console.error('Error fetching production data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      if (filters.date) params.append('date', filters.date)
      if (filters.timeSlot) params.append('timeSlot', filters.timeSlot)

      const response = await fetch(`/api/production/export?${params.toString()}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `production-${filters.date}-${filters.timeSlot || 'all'}.xlsx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Error exporting production data:', error)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Production Dashboard</h1>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
        >
          Export to Excel
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="date"
            value={filters.date}
            onChange={(e) => setFilters({ ...filters, date: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
          />
          <input
            type="time"
            value={filters.timeSlot}
            onChange={(e) => setFilters({ ...filters, timeSlot: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Time Slot (e.g., 08:00)"
          />
          <input
            type="text"
            placeholder="Delivery Area"
            value={filters.deliveryArea}
            onChange={(e) => setFilters({ ...filters, deliveryArea: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
          />
          <button
            onClick={fetchProductionData}
            className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
          >
            Apply Filters
          </button>
        </div>
      </div>

      {/* Summary */}
      {data && (
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-2">Summary</h2>
          <p>Total Meals: <strong>{data.totalMeals}</strong></p>
          <p>Date: <strong>{filters.date ? format(new Date(filters.date), 'MMM dd, yyyy') : 'All'}</strong></p>
          {filters.timeSlot && <p>Time Slot: <strong>{filters.timeSlot}</strong></p>}
        </div>
      )}

      {/* Aggregated View */}
      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : data && data.aggregated.length > 0 ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dish Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Portions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customers</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery Areas</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.aggregated.map((item) => (
                <tr key={item.dish.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.dish.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCategory(item.dish.category)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">{item.totalPortions}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.customerCount}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.deliveryAreas.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">No production data found for the selected filters</div>
      )}
    </div>
  )
}

