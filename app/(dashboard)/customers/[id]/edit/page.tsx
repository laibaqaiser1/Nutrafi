'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useNotification } from '@/components/notifications/NotificationContext'
import { CustomerLocationsPanel } from '@/components/customers/CustomerLocationsPanel'
import {
  CustomerLocationIcon,
  homeLocationDraftFromCustomer,
} from '@/components/customers/CustomerLocationFormFields'

interface Customer {
  id: string
  fullName: string
  phone: string
  email: string | null
  address: string
  deliveryArea: string
  status: string
  notes: string | null
  instructions: string | null
}

export default function EditCustomerPage() {
  const router = useRouter()
  const params = useParams()
  const toast = useNotification()
  const customerId = params.id as string
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    address: '',
    deliveryArea: '',
    status: 'ACTIVE',
    notes: '',
    instructions: '',
  })

  const homePreview = homeLocationDraftFromCustomer(formData.address, formData.deliveryArea)

  useEffect(() => {
    async function fetchCustomer() {
      try {
        const response = await fetch(`/api/customers/${customerId}`)
        if (response.ok) {
          const customer: Customer = await response.json()
          setFormData({
            fullName: customer.fullName,
            phone: customer.phone,
            email: customer.email || '',
            address: customer.address,
            deliveryArea: customer.deliveryArea,
            status: customer.status === 'CANCELLED' ? 'INACTIVE' : customer.status,
            notes: customer.notes || '',
            instructions: customer.instructions || '',
          })
        } else {
          toast.error('Failed to fetch customer')
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
        }),
      })

      if (response.ok) {
        router.push(`/customers/${customerId}`)
      } else {
        const error = await response.json()
        toast.error('Error: ' + JSON.stringify(error))
      }
    } catch (error) {
      console.error('Error updating customer:', error)
      toast.error('Failed to update customer')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-8">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-lg font-bold text-gray-900 mb-3">Edit Customer</h1>
      <form onSubmit={handleSubmit} className="bg-white shadow rounded p-3 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
            <input
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone *</label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status *</label>
            <select
              required
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="PAUSED">Disabled</option>
            </select>
          </div>
        </div>

        <div className="border border-gray-200 rounded p-3 bg-gray-50/60">
          <div className="flex items-center gap-2 mb-3">
            <CustomerLocationIcon iconKey="home" className="text-xl" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Home location (default)</h2>
              <p className="text-xs text-gray-500">
                Updates the customer&apos;s primary delivery location used for new meals.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Area *</label>
              <input
                type="text"
                required
                value={formData.deliveryArea}
                onChange={(e) => setFormData({ ...formData, deliveryArea: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Address *</label>
              <textarea
                required
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                rows={2}
              />
            </div>
          </div>
          {(formData.address || formData.deliveryArea) && (
            <p className="mt-2 text-xs text-gray-500">
              Preview: {homePreview.label} — {formData.deliveryArea || '…'}
            </p>
          )}
        </div>

        <CustomerLocationsPanel
          customerId={Number(customerId)}
          excludeHome
          title="Additional locations"
          description="Edit Work, gym, or other saved addresses. Changes save immediately."
        />

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Instructions & alerts</label>
            <p className="text-xs text-gray-500 mb-2">
              Allergies, dietary needs, or delivery notes — highlighted on the customer profile and on meal plans for this customer.
            </p>
            <textarea
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              className="w-full px-3 py-2 border border-amber-200 rounded-md bg-amber-50/40"
              rows={3}
              placeholder="e.g. Allergic to fish; no shellfish"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Customer'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
