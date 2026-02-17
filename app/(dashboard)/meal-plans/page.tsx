'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { formatCategory } from '@/lib/utils'

interface MealPlan {
  id: string
  customerId: string
  startDate: string
  endDate: string
  mealsPerDay: number
  status: string
  totalMeals: number | null
  remainingMeals: number | null
  customer: {
    fullName: string
  }
  _count: {
    mealPlanItems: number
  }
}

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

type TabType = 'meal-plans' | 'kitchen-planning'

export default function MealPlansPage() {
  const [activeTab, setActiveTab] = useState<TabType>('meal-plans')
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([])
  const [productionData, setProductionData] = useState<ProductionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [productionLoading, setProductionLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const itemsPerPage = 10
  const [filters, setFilters] = useState({
    status: '',
  })
  const [productionFilters, setProductionFilters] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    timeSlot: '',
    deliveryArea: '',
    dishId: '',
  })

  useEffect(() => {
    setCurrentPage(1) // Reset to first page when filters change
  }, [filters.status])

  useEffect(() => {
    if (activeTab === 'meal-plans') {
      fetchMealPlans()
    } else {
      fetchProductionData()
    }
  }, [currentPage, filters, productionFilters.date, productionFilters.timeSlot, activeTab])

  const fetchMealPlans = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.status) params.append('status', filters.status)
      params.append('page', currentPage.toString())
      params.append('limit', itemsPerPage.toString())

      const response = await fetch(`/api/meal-plans?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setMealPlans(data.mealPlans || data)
        setTotal(data.total || data.length || 0)
        setTotalPages(data.totalPages || Math.ceil((data.total || data.length || 0) / itemsPerPage))
      }
    } catch (error) {
      console.error('Error fetching meal plans:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchProductionData = async () => {
    setProductionLoading(true)
    try {
      const params = new URLSearchParams()
      if (productionFilters.date) params.append('date', productionFilters.date)
      if (productionFilters.timeSlot) params.append('timeSlot', productionFilters.timeSlot)
      if (productionFilters.deliveryArea) params.append('deliveryArea', productionFilters.deliveryArea)
      if (productionFilters.dishId) params.append('dishId', productionFilters.dishId)

      const response = await fetch(`/api/production?${params.toString()}`)
      if (response.ok) {
        const result = await response.json()
        setProductionData(result)
      }
    } catch (error) {
      console.error('Error fetching production data:', error)
    } finally {
      setProductionLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      if (productionFilters.date) params.append('date', productionFilters.date)
      if (productionFilters.timeSlot) params.append('timeSlot', productionFilters.timeSlot)

      const response = await fetch(`/api/production/export?${params.toString()}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `production-${productionFilters.date}-${productionFilters.timeSlot || 'all'}.xlsx`
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
        <h1 className="text-2xl font-bold text-gray-900">Meal Plans</h1>
        {activeTab === 'meal-plans' && (
          <Link
            href="/meal-plans/new"
            className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
          >
            Create New Meal Plan
          </Link>
        )}
        {activeTab === 'kitchen-planning' && (
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Export to Excel
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('meal-plans')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'meal-plans'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Meal Plans
          </button>
          <button
            onClick={() => setActiveTab('kitchen-planning')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'kitchen-planning'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Kitchen Planning
          </button>
        </nav>
      </div>

      {/* Meal Plans Tab */}
      {activeTab === 'meal-plans' && (
        <>
          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow mb-6">
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Meal Plans Table */}
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Meals/Day</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Meals</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remaining Meals</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {mealPlans.map((plan) => (
                    <tr key={plan.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{plan.customer.fullName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(new Date(plan.startDate), 'MMM dd, yyyy')}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(new Date(plan.endDate), 'MMM dd, yyyy')}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{plan.mealsPerDay}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {plan.totalMeals !== null ? plan.totalMeals : plan._count.mealPlanItems || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {plan.remainingMeals !== null ? (
                          <span className={plan.remainingMeals < 10 ? 'text-orange-600' : 'text-green-600'}>
                            {plan.remainingMeals}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          plan.status === 'ACTIVE' ? 'bg-[#f0f4e8] text-nutrafi-dark' :
                          plan.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {plan.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Link href={`/meal-plans/${plan.id}`} className="text-nutrafi-primary hover:text-nutrafi-dark">
                          View/Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mealPlans.length === 0 && (
                <div className="text-center py-8 text-gray-500">No meal plans found</div>
              )}
              
              {/* Pagination */}
              {total > 0 && (
                <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1 || loading}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages || loading}
                      className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                        <span className="font-medium">{Math.min(currentPage * itemsPerPage, total)}</span> of{' '}
                        <span className="font-medium">{total}</span> meal plans
                      </p>
                    </div>
                    <div>
                      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1 || loading}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Previous</span>
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                          let pageNum
                          if (totalPages <= 7) {
                            pageNum = i + 1
                          } else if (currentPage <= 4) {
                            pageNum = i + 1
                          } else if (currentPage >= totalPages - 3) {
                            pageNum = totalPages - 6 + i
                          } else {
                            pageNum = currentPage - 3 + i
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              disabled={loading}
                              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                currentPage === pageNum
                                  ? 'z-10 bg-nutrafi-primary border-nutrafi-primary text-white'
                                  : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {pageNum}
                            </button>
                          )
                        })}
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages || loading}
                          className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Next</span>
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Kitchen Planning Tab */}
      {activeTab === 'kitchen-planning' && (
        <>
          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input
                type="date"
                value={productionFilters.date}
                onChange={(e) => setProductionFilters({ ...productionFilters, date: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md"
              />
              <input
                type="time"
                value={productionFilters.timeSlot}
                onChange={(e) => setProductionFilters({ ...productionFilters, timeSlot: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Time Slot (e.g., 08:00)"
              />
              <input
                type="text"
                placeholder="Delivery Area"
                value={productionFilters.deliveryArea}
                onChange={(e) => setProductionFilters({ ...productionFilters, deliveryArea: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md"
              />
              <button
                onClick={fetchProductionData}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Apply Filters
              </button>
            </div>
          </div>

          {/* Summary */}
          {productionData && (
            <div className="bg-white p-4 rounded-lg shadow mb-6">
              <h2 className="text-lg font-semibold mb-2">Summary</h2>
              <p>Total Meals: <strong>{productionData.totalMeals}</strong></p>
              <p>Date: <strong>{productionFilters.date ? format(new Date(productionFilters.date), 'MMM dd, yyyy') : 'All'}</strong></p>
              {productionFilters.timeSlot && <p>Time Slot: <strong>{productionFilters.timeSlot}</strong></p>}
            </div>
          )}

          {/* Production Table */}
          {productionLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : productionData && productionData.aggregated.length > 0 ? (
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
                  {productionData.aggregated.map((item) => (
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
        </>
      )}
    </div>
  )
}

