'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { formatCategory } from '@/lib/utils'

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
}

export default function KitchenPlanningPage() {
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

  useEffect(() => {
    fetchKitchenPlanningData()
  }, [filters.date, filters.startTime, filters.endTime, filters.status])

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
    if (!customNote) return ''
    try {
      const parsed = JSON.parse(customNote)
      return parsed.instructions || ''
    } catch {
      return ''
    }
  }

  const handleMarkAsDelivered = async (item: MealPlanItem) => {
    if (!item.mealPlan?.id) {
      alert('Unable to mark meal as delivered: Meal plan ID missing')
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
        alert('Failed to mark meal as delivered: ' + (error.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error marking meal as delivered:', error)
      alert('Failed to mark meal as delivered')
    } finally {
      setMarkingDelivered(false)
    }
  }

  const handleUnmarkAsDelivered = async (item: MealPlanItem) => {
    if (!item.mealPlan?.id) {
      alert('Unable to unmark meal: Meal plan ID missing')
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
        alert('Failed to unmark meal: ' + (error.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error unmarking meal:', error)
      alert('Failed to unmark meal')
    } finally {
      setMarkingDelivered(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kitchen Planning</h1>
          <p className="text-sm text-gray-600 mt-1">
            Plan and manage meals by date and time range
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => handleExport('chef')}
            disabled={loading || !data || data.items.length === 0}
            className="px-4 py-2 bg-nutrafi-primary text-white rounded-lg hover:bg-nutrafi-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
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
            disabled={loading || !data || data.items.length === 0}
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
          >
            <svg
              className="w-5 h-5"
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
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date
            </label>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters({ ...filters, date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nutrafi-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Time
            </label>
            <input
              type="time"
              value={filters.startTime}
              onChange={(e) => setFilters({ ...filters, startTime: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nutrafi-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Time
            </label>
            <input
              type="time"
              value={filters.endTime}
              onChange={(e) => setFilters({ ...filters, endTime: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nutrafi-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as 'active' | 'delivered' | 'all' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nutrafi-primary focus:border-transparent"
            >
              <option value="active">Active</option>
              <option value="delivered">Delivered</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
        {(filters.startTime || filters.endTime) && (
          <div className="mt-4">
            <button
              onClick={() => setFilters({ ...filters, startTime: '', endTime: '' })}
              className="text-sm text-nutrafi-primary hover:text-nutrafi-dark"
            >
              Clear time range
            </button>
          </div>
        )}
      </div>

      {/* Summary */}
      {data && (
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-2">Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <p>Total Meals: <strong>{data.total}</strong></p>
            <p>Date: <strong>{data.date ? format(new Date(data.date), 'MMM dd, yyyy') : 'All'}</strong></p>
          </div>
        </div>
      )}

      {/* Aggregated Dish Table */}
      {data && data.aggregated && data.aggregated.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Dish Summary</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead style={{ backgroundColor: '#D9F2D0' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">Dish Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">Total Portions</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">Customers</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">Delivery Areas</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.aggregated.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.dishName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.dishCategory ? formatCategory(item.dishCategory) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">{item.totalPortions}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.customerCount}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.deliveryAreas.join(', ') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-nutrafi-primary"></div>
          <p className="mt-4 text-gray-600">Loading kitchen planning data...</p>
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">
                Meal Plans ({data.total} items)
              </h2>
              <div className="text-sm text-gray-600">
                {format(new Date(filters.date), 'EEEE, MMMM dd, yyyy')}
                {filters.startTime && filters.endTime && (
                  <span className="ml-2">
                    • {filters.startTime} - {filters.endTime}
                  </span>
                )}
                {filters.startTime && !filters.endTime && (
                  <span className="ml-2">• From {filters.startTime}</span>
                )}
                {!filters.startTime && filters.endTime && (
                  <span className="ml-2">• Until {filters.endTime}</span>
                )}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead style={{ backgroundColor: '#D9F2D0' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Dish
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Delivery Area
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Calories
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Macros
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Allergens
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.items.map((item) => {
                  const instructions = getInstructions(item.customNote)
                  const calories = item.calories || item.dish?.calories || 0
                  const protein = item.protein || item.dish?.protein || 0
                  const carbs = item.carbs || item.dish?.carbs || 0
                  const fats = item.fats || item.dish?.fats || 0
                  const allergens = item.allergens || item.dish?.allergens || 'None'
                  const dishName = item.dishName || item.dish?.name || 'Not Assigned'

                  return (
                    <tr 
                      key={item.id} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedMeal(item)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="font-medium">{item.timeSlot}</div>
                        {item.deliveryTime && (
                          <div className="text-xs text-gray-500">
                            Delivery: {item.deliveryTime}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {item.mealPlan.customer.fullName}
                        </div>
                        {item.mealPlan.customer.phone && (
                          <div className="text-xs text-gray-500">
                            {item.mealPlan.customer.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {dishName}
                        </div>
                        {instructions && (
                          <div className="text-xs text-gray-500 mt-1">
                            <span className="font-medium">Note:</span> {instructions}
                          </div>
                        )}
                        {item.ingredients && (
                          <div className="text-xs text-gray-500 mt-1">
                            {item.ingredients}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.mealPlan.customer.deliveryArea || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {calories} kcal
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="text-xs">
                          <div>P: {protein.toFixed(1)}g</div>
                          <div>C: {carbs.toFixed(1)}g</div>
                          <div>F: {fats.toFixed(1)}g</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="text-xs max-w-xs">
                          {allergens}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {item.isDelivered ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            Delivered
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
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
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
      )}

      {/* Meal Detail Modal */}
      {selectedMeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Blurred Background */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>
          
          {/* Modal Box */}
          <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Meal Details</h2>
                <button
                  onClick={() => setSelectedMeal(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Customer Info */}
                <div className="border-b pb-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Customer</h3>
                  <p className="text-lg font-semibold text-gray-900">{selectedMeal.mealPlan.customer.fullName}</p>
                  {selectedMeal.mealPlan.customer.phone && (
                    <p className="text-sm text-gray-600">{selectedMeal.mealPlan.customer.phone}</p>
                  )}
                  {selectedMeal.mealPlan.customer.deliveryArea && (
                    <p className="text-sm text-gray-600">{selectedMeal.mealPlan.customer.deliveryArea}</p>
                  )}
                </div>

                {/* Meal Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Date</h3>
                    <p className="text-sm text-gray-900">{format(new Date(selectedMeal.date), 'EEEE, MMMM dd, yyyy')}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Time Slot</h3>
                    <p className="text-sm text-gray-900">{selectedMeal.timeSlot}</p>
                  </div>
                  {selectedMeal.deliveryTime && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">Delivery Time</h3>
                      <p className="text-sm text-gray-900">{selectedMeal.deliveryTime}</p>
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Status</h3>
                    {selectedMeal.isDelivered ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        Delivered
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
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Dish</h3>
                  <p className="text-lg font-semibold text-gray-900">
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

                  {/* Nutrition Info */}
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
                </div>

                {/* Actions */}
                <div className="border-t pt-4 flex gap-3">
                  {!selectedMeal.isDelivered && !selectedMeal.isSkipped && (
                    <button
                      onClick={() => handleMarkAsDelivered(selectedMeal)}
                      disabled={markingDelivered}
                      className="flex-1 px-4 py-2 bg-nutrafi-primary text-white rounded-lg hover:bg-nutrafi-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                      className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

