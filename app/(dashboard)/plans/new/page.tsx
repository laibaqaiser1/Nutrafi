'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNotification } from '@/components/notifications/NotificationContext'

export default function NewPlanPage() {
  const router = useRouter()
  const toast = useNotification()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    planType: 'WEEKLY',
    days: '',
    mealsPerDay: '2',
    price: '',
    description: '',
    isActive: true,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          days: parseInt(formData.days),
          mealsPerDay: parseInt(formData.mealsPerDay),
          price: parseFloat(formData.price),
        }),
      })

      if (response.ok) {
        router.push('/plans')
      } else {
        const error = await response.json()
        toast.error('Error: ' + JSON.stringify(error))
      }
    } catch (error) {
      console.error('Error creating plan:', error)
      toast.error('Failed to create plan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-lg font-bold text-gray-900 mb-3">Add New Plan</h1>
      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Plan Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="e.g., 2 Meals/Day for 5 Days"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Plan Type *</label>
            <select
              required
              value={formData.planType}
              onChange={(e) => setFormData({ ...formData, planType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Days *</label>
            <input
              type="number"
              required
              min="1"
              value={formData.days}
              onChange={(e) => setFormData({ ...formData, days: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Meals Per Day *</label>
            <select
              required
              value={formData.mealsPerDay}
              onChange={(e) => setFormData({ ...formData, mealsPerDay: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Total meals</label>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              value={(() => {
                const d = parseInt(formData.days, 10)
                const m = parseInt(formData.mealsPerDay, 10)
                if (!Number.isFinite(d) || d < 1 || !Number.isFinite(m) || m < 1) return '—'
                return String(d * m)
              })()}
              className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-900 cursor-default"
              aria-readonly="true"
            />
            <p className="mt-1 text-xs text-gray-500">Days × meals per day. Saved automatically when you create the plan.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Price (AED) *</label>
            <input
              type="number"
              required
              step="0.01"
              min="0"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={formData.isActive ? 'true' : 'false'}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={3}
            />
          </div>
        </div>
        <div className="mt-6 flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Plan'}
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

