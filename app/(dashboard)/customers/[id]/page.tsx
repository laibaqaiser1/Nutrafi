'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { format } from 'date-fns'
import { useNotification } from '@/components/notifications/NotificationContext'
import { customerStatusLabel } from '@/lib/utils'
import { CustomerInstructionsBanner } from '@/components/customers/CustomerInstructionsBanner'
import { CustomerLocationsPanel } from '@/components/customers/CustomerLocationsPanel'

interface Customer {
  id: number
  fullName: string
  phone: string
  email: string | null
  address: string
  deliveryArea: string
  status: string
  notes: string | null
  instructions?: string | null
  mealPlans?: Array<{
    id: number
    planType: string
    mealsPerDay: number
    status: string
    startDate: string
    endDate: string
  }>
}

export default function ViewCustomerPage() {
  const router = useRouter()
  const params = useParams()
  const toast = useNotification()
  const customerId = params.id as string
  const [fetching, setFetching] = useState(true)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [mealPlanPage, setMealPlanPage] = useState(1)
  const [mealPlanPageSize, setMealPlanPageSize] = useState(10)
  const MEAL_PLAN_PAGE_OPTIONS = [10, 20, 50] as const

  useEffect(() => {
    async function fetchCustomer() {
      try {
        const response = await fetch(`/api/customers/${customerId}`)
        if (response.ok) {
          const data: Customer = await response.json()
          setCustomer(data)
        } else {
          const err = await response.json()
          toast.error(err?.error || 'Failed to fetch customer')
          router.push('/customers')
        }
      } catch (error) {
        console.error('Error fetching customer:', error)
        toast.error('Failed to fetch customer')
        router.push('/customers')
      } finally {
        setFetching(false)
      }
    }

    if (customerId) {
      fetchCustomer()
    }
  }, [customerId, router, toast])

  useEffect(() => {
    setMealPlanPage(1)
  }, [customerId])

  useEffect(() => {
    const n = customer?.mealPlans?.length ?? 0
    const pages = Math.max(1, Math.ceil(n / mealPlanPageSize))
    setMealPlanPage((p) => Math.min(p, pages))
  }, [customer?.mealPlans?.length, mealPlanPageSize])

  const mealPlansList = customer?.mealPlans ?? []
  const mpTotal = mealPlansList.length
  const mpTotalPages = Math.max(1, Math.ceil(mpTotal / mealPlanPageSize))
  const safeMealPlanPage = Math.min(mealPlanPage, mpTotalPages)
  const mpStart = mpTotal === 0 ? 0 : (safeMealPlanPage - 1) * mealPlanPageSize
  const paginatedMealPlans = mealPlansList.slice(mpStart, mpStart + mealPlanPageSize)

  if (fetching) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-8">Loading...</div>
      </div>
    )
  }

  if (!customer) {
    return null
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-lg font-bold text-gray-900">Customer Details</h1>
        <div className="flex gap-2">
          <Link
            href={`/customers/${customer.id}/edit`}
            className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={() => router.push('/customers')}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
          >
            Back to list
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded p-3 lg:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
            <p className="text-gray-900 font-medium">{customer.fullName}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Phone</label>
            <p className="text-gray-900">{customer.phone}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Email</label>
            <p className="text-gray-900">{customer.email || '—'}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Delivery Area</label>
            <p className="text-gray-900">{customer.deliveryArea || '—'}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Status</label>
            <span className={`px-2 py-0.5 inline-flex text-xs font-semibold rounded ${
              customer.status === 'ACTIVE' ? 'bg-[#f0f4e8] text-nutrafi-dark' :
              customer.status === 'PAUSED' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-700'
            }`}>
              {customerStatusLabel(customer.status)}
            </span>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Address</label>
            <p className="text-gray-900 whitespace-pre-wrap">{customer.address || '—'}</p>
          </div>
          {customer.notes ? (
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Notes</label>
              <p className="text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
            </div>
          ) : null}
        </div>

        <CustomerInstructionsBanner instructions={customer.instructions} className="mt-6" />

        <CustomerLocationsPanel customerId={customer.id} />

        {customer.mealPlans && customer.mealPlans.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Meal Plans</h2>
            <ul className="space-y-2">
              {paginatedMealPlans.map((mp) => (
                <li key={mp.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <Link
                    href={`/meal-plans/${mp.id}`}
                    className="text-nutrafi-primary hover:underline font-medium"
                  >
                    {mp.planType} – {mp.mealsPerDay} meals/day
                  </Link>
                  <span className="text-gray-500">
                    {mp.startDate ? format(new Date(mp.startDate), 'MMM d, yyyy') : '—'} – {mp.endDate ? format(new Date(mp.endDate), 'MMM d, yyyy') : '—'}
                  </span>
                  <span className={`px-1.5 text-xs font-medium rounded ${
                    mp.status === 'ACTIVE' ? 'bg-[#f0f4e8] text-nutrafi-dark' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {mp.status}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between text-xs text-gray-600 border-t border-gray-100 pt-3">
              <p>
                Showing{' '}
                <span className="font-medium text-gray-900">{mpTotal === 0 ? 0 : mpStart + 1}</span> to{' '}
                <span className="font-medium text-gray-900">{Math.min(mpStart + mealPlanPageSize, mpTotal)}</span> of{' '}
                <span className="font-medium text-gray-900">{mpTotal}</span> plans
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label htmlFor="customer-mp-page-size" className="whitespace-nowrap">
                    Rows per page
                  </label>
                  <select
                    id="customer-mp-page-size"
                    value={String(mealPlanPageSize)}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10)
                      if (!Number.isNaN(n) && n > 0) {
                        setMealPlanPageSize(n)
                        setMealPlanPage(1)
                      }
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-gray-900 text-xs bg-white focus:ring-2 focus:ring-nutrafi-primary focus:border-transparent"
                  >
                    {MEAL_PLAN_PAGE_OPTIONS.map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                {mpTotalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMealPlanPage((p) => Math.max(1, p - 1))}
                      disabled={safeMealPlanPage <= 1}
                      className="px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-gray-700">
                      Page {safeMealPlanPage} of {mpTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMealPlanPage((p) => Math.min(mpTotalPages, p + 1))}
                      disabled={safeMealPlanPage >= mpTotalPages}
                      className="px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200 flex gap-2">
          <Link
            href={`/customers/${customer.id}/edit`}
            className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
          >
            Edit Customer
          </Link>
          <button
            type="button"
            onClick={() => router.push('/customers')}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
          >
            Back to list
          </button>
        </div>
      </div>
    </div>
  )
}
