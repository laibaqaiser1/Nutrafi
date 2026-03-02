'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNotification } from '@/components/notifications/NotificationContext'

export default function NewCustomerPage() {
  const router = useRouter()
  const toast = useNotification()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    address: '',
    deliveryArea: '',
    status: 'ACTIVE',
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
        }),
      })

      if (response.ok) {
        await response.json()
        toast.success('Customer created successfully!')
        router.push('/customers')
      } else {
        const error = await response.json()
        toast.error('Error: ' + JSON.stringify(error))
      }
    } catch (error) {
      console.error('Error creating customer:', error)
      toast.error('Failed to create customer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-lg font-bold text-gray-900 mb-3">Add New Customer</h1>
      <form onSubmit={handleSubmit} className="bg-white shadow rounded p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone *</label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Area *</label>
            <input
              type="text"
              required
              value={formData.deliveryArea}
              onChange={(e) => setFormData({ ...formData, deliveryArea: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Address *</label>
            <textarea
              required
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status *</label>
            <select
              required
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="PAUSED">Disabled</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
              rows={2}
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-nutrafi-primary text-white rounded hover:bg-nutrafi-dark disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Customer'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-3 py-1.5 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

