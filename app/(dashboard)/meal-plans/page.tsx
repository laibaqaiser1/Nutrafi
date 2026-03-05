'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'

interface MealPlan {
  id: string
  customerId: string
  startDate: string
  endDate: string
  days: number | null
  mealsPerDay: number
  status: string
  totalMeals: number | null
  remainingMeals: number | null
  customer: {
    fullName: string
  }
  payments?: Array<{ amount: number; status: string }>
  _count: {
    mealPlanItems: number
  }
}

// Paid if any payment has status COMPLETED; otherwise Unpaid. No comparison with plan amounts.
function getPaymentStatus(plan: MealPlan): { label: string; className: string } {
  const hasCompleted = (plan.payments || []).some((p) => p.status === 'COMPLETED')
  if (hasCompleted) return { label: 'Paid', className: 'bg-[#f0f4e8] text-nutrafi-dark' }
  return { label: 'Unpaid', className: 'bg-red-100 text-red-800' }
}


export default function MealPlansPage() {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const itemsPerPage = 10
  const [filters, setFilters] = useState({
    status: '',
  })

  useEffect(() => {
    setCurrentPage(1) // Reset to first page when filters change
  }, [filters.status])

  useEffect(() => {
    fetchMealPlans()
  }, [currentPage, filters])

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


  return (
    <div>
      <div className="flex justify-between items-center mb-3 lg:mb-6">
        <h1 className="text-lg lg:text-2xl font-bold text-gray-900">Meal Plans</h1>
        <Link
          href="/meal-plans/new"
          className="px-3 py-1.5 lg:px-4 lg:py-2 text-sm bg-nutrafi-primary text-white rounded hover:bg-nutrafi-dark"
        >
          Create New Meal Plan
        </Link>
      </div>

      {/* Meal Plans */}
      <>
          {/* Filters */}
          <div className="bg-white p-2 lg:p-4 rounded shadow lg:rounded-lg mb-3 lg:mb-6">
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-2 py-1.5 lg:px-3 lg:py-2 text-sm border border-gray-300 rounded"
            >
              <option value="">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Meal Plans Table */}
          {loading ? (
            <div className="text-center py-4 text-sm">Loading...</div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded lg:rounded-md">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-nutrafi-primary">
                  <tr>
                    <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Customer</th>
                    <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Start Date</th>
                    <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">End Date</th>
                    <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Meals/Day</th>
                    <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Total Meals</th>
                    <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Remaining Meals</th>
                    <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                    <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Payment</th>
                    <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {mealPlans.map((plan) => (
                    <tr key={plan.id}>
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap font-medium text-gray-900">{plan.customer.fullName}</td>
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-gray-500">{format(new Date(plan.startDate), 'MMM dd, yyyy')}</td>
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-gray-500">{format(new Date(plan.endDate), 'MMM dd, yyyy')}</td>
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-gray-500">{plan.mealsPerDay}</td>
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-gray-500 font-medium">
                        {plan.totalMeals !== null ? plan.totalMeals : (plan.days && plan.mealsPerDay ? plan.days * plan.mealsPerDay : '-')}
                      </td>
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-gray-500 font-medium">
                        {plan.remainingMeals !== null ? (
                          <span className={plan.remainingMeals < 10 ? 'text-orange-600' : 'text-nutrafi-primary'}>
                            {plan.remainingMeals}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap">
                        <span className={`px-1.5 inline-flex text-xs leading-4 font-semibold rounded ${
                          plan.status === 'ACTIVE' ? 'bg-[#f0f4e8] text-nutrafi-dark' :
                          plan.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {plan.status}
                        </span>
                      </td>
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap">
                        {(() => {
                          const { label, className } = getPaymentStatus(plan)
                          return (
                            <span className={`px-1.5 inline-flex text-xs leading-4 font-semibold rounded ${className}`}>
                              {label}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap font-medium">
                        <Link href={`/meal-plans/${plan.id}`} className="text-nutrafi-primary hover:text-nutrafi-dark text-xs">
                          View/Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mealPlans.length === 0 && (
                <div className="text-center py-4 text-sm text-gray-500">No meal plans found</div>
              )}
              
              {/* Pagination */}
              {total > 0 && (
                <div className="bg-white px-2 lg:px-4 py-2 lg:py-3 flex items-center justify-between border-t border-gray-200 sm:px-3 lg:px-6 text-sm">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1 || loading}
                      className="relative inline-flex items-center px-2 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages || loading}
                      className="ml-2 relative inline-flex items-center px-2 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs text-gray-700">
                        Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                        <span className="font-medium">{Math.min(currentPage * itemsPerPage, total)}</span> of{' '}
                        <span className="font-medium">{total}</span> meal plans
                      </p>
                    </div>
                    <div>
                      <nav className="relative z-0 inline-flex rounded shadow-sm -space-x-px" aria-label="Pagination">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1 || loading}
                          className="relative inline-flex items-center px-1.5 py-1.5 rounded-l border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Previous</span>
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
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
                              className={`relative inline-flex items-center px-2 py-1.5 border text-xs font-medium ${
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
                          className="relative inline-flex items-center px-1.5 py-1.5 rounded-r border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Next</span>
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
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
    </div>
  )
}

