'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNotification } from '@/components/notifications/NotificationContext'
import {
  CustomerLocationFormFields,
  CustomerLocationIcon,
  emptyLocationDraft,
  homeLocationDraftFromCustomer,
  type CustomerLocationDraft,
} from '@/components/customers/CustomerLocationFormFields'

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
    instructions: '',
  })
  const [additionalLocations, setAdditionalLocations] = useState<CustomerLocationDraft[]>([])

  const homePreview = homeLocationDraftFromCustomer(formData.address, formData.deliveryArea)

  const addAdditionalLocation = () => {
    setAdditionalLocations((prev) => [...prev, emptyLocationDraft({ label: 'Work', icon: 'work' })])
  }

  const removeAdditionalLocation = (index: number) => {
    setAdditionalLocations((prev) => prev.filter((_, i) => i !== index))
  }

  const updateAdditionalLocation = (index: number, next: CustomerLocationDraft) => {
    setAdditionalLocations((prev) => prev.map((loc, i) => (i === index ? next : loc)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const invalidExtra = additionalLocations.find(
      (loc) => !loc.label.trim() || !loc.address.trim() || !loc.deliveryArea.trim()
    )
    if (invalidExtra) {
      toast.warning('Each additional location needs a label, delivery area, and address')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          additionalLocations: additionalLocations.map((loc) => ({
            label: loc.label.trim(),
            icon: loc.icon,
            address: loc.address.trim(),
            deliveryArea: loc.deliveryArea.trim(),
            isDefault: loc.isDefault,
          })),
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
      <form onSubmit={handleSubmit} className="bg-white shadow rounded p-3 space-y-4">
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
        </div>

        <div className="border border-gray-200 rounded p-3 bg-gray-50/60">
          <div className="flex items-center gap-2 mb-3">
            <CustomerLocationIcon iconKey="home" className="text-xl" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Home location (default)</h2>
              <p className="text-xs text-gray-500">Saved as the customer&apos;s primary delivery location.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Area *</label>
              <input
                type="text"
                required
                value={formData.deliveryArea}
                onChange={(e) => setFormData({ ...formData, deliveryArea: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Address *</label>
              <textarea
                required
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
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

        <div className="border border-gray-200 rounded p-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Additional locations</h2>
              <p className="text-xs text-gray-500">Optional — e.g. Work, gym, or other addresses.</p>
            </div>
            <button
              type="button"
              onClick={addAdditionalLocation}
              className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
            >
              Add location
            </button>
          </div>

          {additionalLocations.length === 0 ? (
            <p className="text-sm text-gray-500">No extra locations yet.</p>
          ) : (
            <ul className="space-y-4">
              {additionalLocations.map((loc, index) => (
                <li key={index} className="p-3 border border-gray-200 rounded bg-gray-50/40">
                  <div className="flex justify-end mb-2">
                    <button
                      type="button"
                      onClick={() => removeAdditionalLocation(index)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <CustomerLocationFormFields
                    value={loc}
                    onChange={(next) => updateAdditionalLocation(index, next)}
                    idPrefix={`new-loc-${index}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Instructions & alerts</label>
            <p className="text-xs text-gray-500 mb-1">
              Allergies, dietary needs, or delivery notes — shown prominently when viewing this customer and their meal plans.
            </p>
            <textarea
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-amber-200 rounded bg-amber-50/40"
              rows={3}
              placeholder="e.g. Allergic to fish; no shellfish"
            />
          </div>
        </div>

        <div className="flex gap-2">
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
