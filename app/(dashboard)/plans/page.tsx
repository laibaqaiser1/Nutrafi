'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useNotification } from '@/components/notifications/NotificationContext'

interface Plan {
  id: string
  name: string
  planType: string
  days: number
  mealsPerDay: number
  totalMeals: number
  price: number
  description: string | null
  isActive: boolean
}

export default function PlansPage() {
  const toast = useNotification()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPlans()
  }, [])

  const fetchPlans = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/plans')
      if (response.ok) {
        const data = await response.json()
        setPlans(data)
      }
    } catch (error) {
      console.error('Error fetching plans:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/plans/${id}`, { method: 'DELETE' })
      if (response.ok) {
        fetchPlans()
        toast.success('Plan deleted.')
      } else {
        const err = await response.json()
        toast.error(err?.error || 'Failed to delete plan')
      }
    } catch (error) {
      console.error('Error deleting plan:', error)
      toast.error('Failed to delete plan')
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3 lg:mb-6">
        <h1 className="text-lg lg:text-2xl font-bold text-gray-900">Plans Management</h1>
        <Link
          href="/plans/new"
          className="px-3 py-1.5 lg:px-4 lg:py-2 text-sm bg-nutrafi-primary text-white rounded hover:bg-nutrafi-dark"
        >
          Add New Plan
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-4 text-sm">Loading...</div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-nutrafi-primary">
              <tr>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Name</th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Type</th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Days</th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Meals/Day</th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Total meals</th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Price (AED)</th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Status</th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap font-medium text-gray-900">{plan.name}</td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-gray-500">{plan.planType}</td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-gray-500">{plan.days}</td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-gray-500">{plan.mealsPerDay}</td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-gray-500 font-medium">
                    {plan.totalMeals ?? plan.days * plan.mealsPerDay}
                  </td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap text-gray-500">AED {plan.price}</td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap">
                    <span className={`px-1.5 inline-flex text-xs leading-4 font-semibold rounded ${
                      plan.isActive ? 'bg-[#f0f4e8] text-nutrafi-dark' : 'bg-red-100 text-red-800'
                    }`}>
                      {plan.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 whitespace-nowrap font-medium">
                    <Link href={`/plans/${plan.id}/edit`} className="text-nutrafi-primary hover:text-nutrafi-dark mr-2 text-xs">
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(plan.id)}
                      className="text-red-600 hover:text-red-900 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {plans.length === 0 && (
            <div className="text-center py-4 text-sm text-gray-500">No plans found</div>
          )}
        </div>
      )}
    </div>
  )
}

