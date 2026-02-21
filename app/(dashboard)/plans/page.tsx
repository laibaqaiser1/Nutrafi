'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Plan {
  id: string
  name: string
  planType: string
  days: number
  mealsPerDay: number
  price: number
  description: string | null
  isActive: boolean
}

export default function PlansPage() {
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
    if (!confirm('Are you sure you want to delete this plan?')) return

    try {
      const response = await fetch(`/api/plans/${id}`, { method: 'DELETE' })
      if (response.ok) {
        fetchPlans()
      }
    } catch (error) {
      console.error('Error deleting plan:', error)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Plans Management</h1>
        <Link
          href="/plans/new"
          className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
        >
          Add New Plan
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <table className="min-w-full divide-y divide-gray-200">
            <thead style={{ backgroundColor: '#D9F2D0' }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">Days</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">Meals/Day</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">Price (AED)</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{plan.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{plan.planType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{plan.days}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{plan.mealsPerDay}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">AED {plan.price}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      plan.isActive ? 'bg-[#f0f4e8] text-nutrafi-dark' : 'bg-red-100 text-red-800'
                    }`}>
                      {plan.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/plans/${plan.id}/edit`} className="text-nutrafi-primary hover:text-nutrafi-dark mr-4">
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(plan.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {plans.length === 0 && (
            <div className="text-center py-8 text-gray-500">No plans found</div>
          )}
        </div>
      )}
    </div>
  )
}

