'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Customer {
  id: string
  fullName: string
  phone: string
  email: string | null
  address: string
  deliveryArea: string
  status: string
  mealPlans: Array<{
    id: string
    planType: string
    mealsPerDay: number
    // timeSlots removed - delivery times stored per meal item
    status: string
  }>
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const itemsPerPage = 10
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    planType: '',
    deliveryArea: '',
  })

  useEffect(() => {
    setCurrentPage(1) // Reset to first page when filters change
  }, [filters.search, filters.status, filters.planType, filters.deliveryArea])

  useEffect(() => {
    fetchCustomers()
  }, [currentPage, filters])

  const fetchCustomers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.search) params.append('search', filters.search)
      if (filters.status) params.append('status', filters.status)
      if (filters.planType) params.append('planType', filters.planType)
      if (filters.deliveryArea) params.append('deliveryArea', filters.deliveryArea)
      params.append('page', currentPage.toString())
      params.append('limit', itemsPerPage.toString())

      const response = await fetch(`/api/customers?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        console.log(`Received ${data.customers.length} customers from API (page ${data.page}/${data.totalPages}, total: ${data.total})`)
        setCustomers(data.customers)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      } else {
        const error = await response.json()
        console.error('API error:', error)
        alert(`Failed to fetch customers: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error fetching customers:', error)
      alert('Failed to fetch customers. Please check the console for details.')
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async (id: string) => {
    if (!confirm('Are you sure you want to disable this customer?')) return

    try {
      const response = await fetch(`/api/customers/${id}/pause`, { method: 'POST' })
      if (response.ok) {
        fetchCustomers()
      }
    } catch (error) {
      console.error('Error disabling customer:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer? This will also delete all associated meal plans.')) return

    try {
      const response = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
      if (response.ok) {
        fetchCustomers()
      }
    } catch (error) {
      console.error('Error deleting customer:', error)
    }
  }


  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customer Management</h1>
        <Link
          href="/customers/new"
          className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
        >
          Add New Customer
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Search by name, phone..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
          />
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Disabled</option>
          </select>
          <select
            value={filters.planType}
            onChange={(e) => setFilters({ ...filters, planType: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">All Plan Types</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="CUSTOM">Custom</option>
          </select>
          <input
            type="text"
            placeholder="Delivery Area"
            value={filters.deliveryArea}
            onChange={(e) => setFilters({ ...filters, deliveryArea: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>

      {/* Customers Table */}
      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="bg-white shadow sm:rounded-md">
          {customers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No customers found</div>
          ) : (
            <table className="w-full divide-y divide-gray-200 table-fixed">
              <thead style={{ backgroundColor: '#D9F2D0' }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase tracking-wider" style={{ width: '20%' }}>Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase tracking-wider" style={{ width: '15%' }}>Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase tracking-wider" style={{ width: '25%' }}>Area</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase tracking-wider" style={{ width: '20%' }}>Active Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase tracking-wider" style={{ width: '10%' }}>Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase tracking-wider" style={{ width: '10%' }}>Actions</th>
                </tr>
              </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customers.map((customer) => {
                    const activeMealPlan = customer.mealPlans?.[0]
                    return (
                  <tr key={customer.id}>
                    <td className="px-4 py-4 text-sm font-medium text-gray-900">{customer.fullName}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.phone?.startsWith('TEMP-') ? (
                        <span className="text-orange-600 font-medium" title="Temporary phone - needs update">
                          {customer.phone} ⚠️
                        </span>
                      ) : (
                        customer.phone
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 max-w-xs truncate" title={customer.deliveryArea}>
                      {customer.deliveryArea === 'To be updated' || !customer.deliveryArea ? (
                        <span className="text-orange-600 font-medium">⚠️ Needs update</span>
                      ) : (
                        customer.deliveryArea
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {activeMealPlan ? (
                        <span>
                          {activeMealPlan.planType} - {activeMealPlan.mealsPerDay} meals/day
                        </span>
                      ) : (
                        <span className="text-gray-400">No active plan</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        customer.status === 'ACTIVE' ? 'bg-[#f0f4e8] text-nutrafi-dark' :
                        customer.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {customer.status === 'PAUSED' ? 'DISABLED' : customer.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="relative">
                            <button
                              onClick={() => setOpenDropdown(openDropdown === customer.id ? null : customer.id)}
                              className="text-gray-600 hover:text-gray-900 focus:outline-none"
                              aria-label="Actions"
                            >
                              <svg
                                className="w-5 h-5"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                              </svg>
                            </button>
                            {openDropdown === customer.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setOpenDropdown(null)}
                                ></div>
                                <div className="absolute right-0 bottom-full mb-2 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-200">
                                  <div className="py-1">
                                    <Link
                                      href={`/customers/${customer.id}`}
                                      onClick={() => setOpenDropdown(null)}
                                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                      View
                                    </Link>
                                    <Link
                                      href={`/customers/${customer.id}/edit`}
                                      onClick={() => setOpenDropdown(null)}
                                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                      Edit
                                    </Link>
                                    {customer.status === 'ACTIVE' && (
                                      <button
                                        onClick={() => {
                                          setOpenDropdown(null)
                                          handleDisable(customer.id)
                                        }}
                                        className="block w-full text-left px-4 py-2 text-sm text-orange-600 hover:bg-orange-50"
                                      >
                                        Disabled
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        setOpenDropdown(null)
                                        handleDelete(customer.id)
                                      }}
                                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
          )}
          
          {/* Pagination and Total Count */}
          <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6 flex items-center justify-between">
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
                  <span className="font-medium">{total}</span> customers
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
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    // Show first page, last page, current page, and pages around current
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          disabled={loading}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === page
                              ? 'z-10 bg-nutrafi-primary border-nutrafi-primary text-white'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {page}
                        </button>
                      )
                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                      return (
                        <span key={page} className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                          ...
                        </span>
                      )
                    }
                    return null
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
        </div>
      )}
    </div>
  )
}

