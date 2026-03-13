'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useNotification } from '@/components/notifications/NotificationContext'
import { customerStatusLabel } from '@/lib/utils'

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
  const router = useRouter()
  const toast = useNotification()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [deleteConfirmCustomer, setDeleteConfirmCustomer] = useState<Customer | null>(null)
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
        toast.error(`Failed to fetch customers: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error fetching customers:', error)
      toast.error('Failed to fetch customers. Please check the console for details.')
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async (id: string) => {
    try {
      const response = await fetch(`/api/customers/${id}/pause`, { method: 'POST' })
      if (response.ok) {
        fetchCustomers()
        toast.success('Customer disabled.')
      } else {
        toast.error('Failed to disable customer')
      }
    } catch (error) {
      console.error('Error disabling customer:', error)
      toast.error('Failed to disable customer')
    }
  }

  const handleDeleteClick = (customer: Customer) => {
    setOpenDropdown(null)
    setDeleteConfirmCustomer(customer)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmCustomer) return
    const id = deleteConfirmCustomer.id
    setDeleteConfirmCustomer(null)
    await handleDelete(id)
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
      if (response.ok) {
        fetchCustomers()
        toast.success('Customer deleted.')
      } else {
        const err = await response.json()
        toast.error(err?.error || 'Failed to delete customer')
      }
    } catch (error) {
      console.error('Error deleting customer:', error)
      toast.error('Failed to delete customer')
    }
  }


  return (
    <div>
      <div className="flex justify-between items-center mb-3 lg:mb-6">
        <h1 className="text-lg lg:text-2xl font-bold text-gray-900">Customer Management</h1>
        <Link
          href="/customers/new"
          className="px-3 py-1.5 lg:px-4 lg:py-2 text-sm bg-nutrafi-primary text-white rounded hover:bg-nutrafi-dark"
        >
          Add New Customer
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white p-2 lg:p-4 rounded shadow lg:rounded-lg mb-3 lg:mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 lg:gap-4">
          <input
            type="text"
            placeholder="Search by name, phone..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="px-2 py-1.5 lg:px-3 lg:py-2 text-sm border border-gray-300 rounded"
          />
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-2 py-1.5 lg:px-3 lg:py-2 text-sm border border-gray-300 rounded"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="PAUSED">Disabled</option>
          </select>
          <select
            value={filters.planType}
            onChange={(e) => setFilters({ ...filters, planType: e.target.value })}
            className="px-2 py-1.5 lg:px-3 lg:py-2 text-sm border border-gray-300 rounded"
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
            className="px-2 py-1.5 lg:px-3 lg:py-2 text-sm border border-gray-300 rounded"
          />
        </div>
      </div>

      {/* Customers Table */}
      {loading ? (
        <div className="text-center py-4 lg:py-8 text-sm">Loading...</div>
      ) : (
        <div className="bg-white shadow sm:rounded lg:rounded-md">
          {customers.length === 0 ? (
            <div className="text-center py-4 lg:py-8 text-sm text-gray-500">No customers found</div>
          ) : (
            <table className="w-full divide-y divide-gray-200 table-fixed text-sm">
              <thead className="bg-nutrafi-primary">
                <tr>
                  <th className="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider" style={{ width: '20%' }}>Name</th>
                  <th className="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider" style={{ width: '15%' }}>Phone</th>
                  <th className="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider" style={{ width: '25%' }}>Area</th>
                  <th className="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider" style={{ width: '20%' }}>Active Plan</th>
                  <th className="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider" style={{ width: '10%' }}>Status</th>
                  <th className="px-2 lg:px-4 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider" style={{ width: '10%' }}>Actions</th>
                </tr>
              </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customers.map((customer) => {
                    const activeMealPlan = customer.mealPlans?.[0]
                    return (
                  <tr
                    key={customer.id}
                    onClick={() => router.push(`/customers/${customer.id}`)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-2 lg:px-4 py-2 lg:py-4 font-medium text-gray-900">{customer.fullName}</td>
                    <td className="px-2 lg:px-4 py-2 lg:py-4 whitespace-nowrap text-gray-500">
                      {customer.phone?.startsWith('TEMP-') ? (
                        <span className="text-orange-600 font-medium" title="Temporary phone - needs update">
                          {customer.phone} ⚠️
                        </span>
                      ) : (
                        customer.phone
                      )}
                    </td>
                    <td className="px-2 lg:px-4 py-2 lg:py-4 text-gray-500 max-w-xs truncate" title={customer.deliveryArea}>
                      {customer.deliveryArea === 'To be updated' || !customer.deliveryArea ? (
                        <span className="text-orange-600 font-medium">⚠️ Needs update</span>
                      ) : (
                        customer.deliveryArea
                      )}
                    </td>
                    <td className="px-2 lg:px-4 py-2 lg:py-4 text-gray-500">
                      {activeMealPlan ? (
                        <span>
                          {activeMealPlan.planType} - {activeMealPlan.mealsPerDay} meals/day
                        </span>
                      ) : (
                        <span className="text-gray-400">No active plan</span>
                      )}
                    </td>
                    <td className="px-2 lg:px-4 py-2 lg:py-4 whitespace-nowrap">
                      <span className={`px-1.5 inline-flex text-xs leading-4 font-semibold rounded ${
                        customer.status === 'ACTIVE' ? 'bg-[#f0f4e8] text-nutrafi-dark' :
                        customer.status === 'PAUSED' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {customerStatusLabel(customer.status)}
                      </span>
                    </td>
                    <td
                      className="px-2 lg:px-4 py-2 lg:py-4 whitespace-nowrap font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                          <div className="relative">
                            <button
                              onClick={() => setOpenDropdown(openDropdown === customer.id ? null : customer.id)}
                              className="text-gray-600 hover:text-gray-900 focus:outline-none"
                              aria-label="Actions"
                            >
                              <svg
                                className="w-4 h-4"
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
                                <div className="absolute right-0 bottom-full mb-1 w-40 bg-white rounded shadow-lg z-20 border border-gray-200 text-sm">
                                  <div className="py-0.5">
                                    <Link
                                      href={`/customers/${customer.id}`}
                                      onClick={() => setOpenDropdown(null)}
                                      className="block px-2 py-1.5 text-gray-700 hover:bg-gray-100"
                                    >
                                      View
                                    </Link>
                                    <Link
                                      href={`/customers/${customer.id}/edit`}
                                      onClick={() => setOpenDropdown(null)}
                                      className="block px-2 py-1.5 text-gray-700 hover:bg-gray-100"
                                    >
                                      Edit
                                    </Link>
                                    {customer.status === 'ACTIVE' && (
                                      <button
                                        onClick={() => {
                                          setOpenDropdown(null)
                                          handleDisable(customer.id)
                                        }}
                                        className="block w-full text-left px-2 py-1.5 text-orange-600 hover:bg-orange-50"
                                      >
                                        Disabled
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDeleteClick(customer)}
                                      className="block w-full text-left px-2 py-1.5 text-red-600 hover:bg-red-50"
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
          <div className="bg-white px-2 lg:px-4 py-2 lg:py-3 border-t border-gray-200 sm:px-3 lg:px-6 flex items-center justify-between text-sm">
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
                  <span className="font-medium">{total}</span> customers
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
                          className={`relative inline-flex items-center px-2 py-1.5 border text-xs font-medium ${
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
                        <span key={page} className="relative inline-flex items-center px-2 py-1.5 border border-gray-300 bg-white text-xs font-medium text-gray-700">
                          ...
                        </span>
                      )
                    }
                    return null
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
        </div>
      )}

      {/* Delete customer confirmation modal */}
      {deleteConfirmCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirmCustomer(null)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete customer?</h3>
            <p className="text-sm text-gray-600 mb-4">
              {deleteConfirmCustomer.mealPlans && deleteConfirmCustomer.mealPlans.length > 0 ? (
                <>
                  This will delete <strong>{deleteConfirmCustomer.fullName}</strong> and the{' '}
                  <strong>{deleteConfirmCustomer.mealPlans.length} meal plan(s)</strong> associated with this customer.
                  This action cannot be undone.
                </>
              ) : (
                <>
                  This will permanently delete <strong>{deleteConfirmCustomer.fullName}</strong>. This action cannot be undone.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmCustomer(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

