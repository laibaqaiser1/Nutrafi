'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'

interface MealPlan {
  id: string
  customer: {
    id: string
    fullName: string
  }
  plan: {
    id: string
    name: string
  } | null
  planType: string
  startDate: string
  endDate: string
  mealsPerDay: number
  timeSlots: string
  status: string
  notes: string | null
  totalAmount: number | null
  payments?: Array<{
    id: string
    amount: number
    paymentDate: string
    paymentMethod: string | null
    status: string
    notes: string | null
  }>
}

interface Plan {
  id: string
  name: string
  planType: string
  days: number
  mealsPerDay: number
  price: number
}

export default function EditMealPlanPage() {
  const router = useRouter()
  const params = useParams()
  const [loading, setLoading] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [formData, setFormData] = useState({
    planId: '',
    planType: 'WEEKLY',
    mealsPerDay: '2',
    timeSlots: '["08:00", "13:00", "18:00"]',
    startDate: '',
    endDate: '',
    status: 'ACTIVE',
    notes: '',
  })
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentMethod: 'CASH',
    status: 'COMPLETED',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: '',
  })

  useEffect(() => {
    if (params.id) {
      fetchMealPlan(params.id as string)
      fetchPlans()
    }
  }, [params.id])

  const fetchMealPlan = async (id: string) => {
    try {
      const response = await fetch(`/api/meal-plans/${id}`)
      if (response.ok) {
        const data = await response.json()
        setMealPlan(data)
        setFormData({
          planId: data.plan?.id || '',
          planType: data.planType,
          mealsPerDay: data.mealsPerDay.toString(),
          timeSlots: data.timeSlots,
          startDate: data.startDate ? data.startDate.split('T')[0] : '',
          endDate: data.endDate ? data.endDate.split('T')[0] : '',
          status: data.status,
          notes: data.notes || '',
        })
      } else {
        alert('Failed to fetch meal plan')
        router.push('/meal-plans')
      }
    } catch (error) {
      console.error('Error fetching meal plan:', error)
      alert('Failed to fetch meal plan')
    }
  }

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/plans?isActive=true')
      if (response.ok) {
        const data = await response.json()
        setPlans(data)
      }
    } catch (error) {
      console.error('Error fetching plans:', error)
    }
  }

  const handlePlanChange = (planId: string) => {
    const selectedPlan = plans.find(p => p.id === planId)
    if (selectedPlan) {
      setFormData({
        ...formData,
        planId: planId,
        planType: selectedPlan.planType,
        mealsPerDay: selectedPlan.mealsPerDay.toString(),
      })
    } else {
      setFormData({ ...formData, planId: planId })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`/api/meal-plans/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          mealsPerDay: parseInt(formData.mealsPerDay),
          planId: formData.planId || undefined,
          planType: formData.planType || undefined,
        }),
      })

      if (response.ok) {
        router.push(`/meal-plans/${params.id}`)
      } else {
        const error = await response.json()
        alert('Error: ' + JSON.stringify(error))
      }
    } catch (error) {
      console.error('Error updating meal plan:', error)
      alert('Failed to update meal plan')
    } finally {
      setLoading(false)
    }
  }

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mealPlan) return

    setSavingPayment(true)
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: mealPlan.customer.id,
          mealPlanId: mealPlan.id,
          planId: mealPlan.plan?.id || undefined,
          amount: parseFloat(paymentData.amount),
          paymentMethod: paymentData.paymentMethod,
          status: paymentData.status,
          paymentDate: paymentData.paymentDate,
          notes: paymentData.notes || undefined,
        }),
      })

      if (response.ok) {
        alert('Payment added successfully!')
        setShowPaymentForm(false)
        setPaymentData({
          amount: '',
          paymentMethod: 'CASH',
          status: 'COMPLETED',
          paymentDate: new Date().toISOString().split('T')[0],
          notes: '',
        })
        // Refresh meal plan data
        await fetchMealPlan(mealPlan.id)
      } else {
        const error = await response.json()
        alert('Error: ' + JSON.stringify(error))
      }
    } catch (error) {
      console.error('Error adding payment:', error)
      alert('Failed to add payment')
    } finally {
      setSavingPayment(false)
    }
  }

  if (!mealPlan) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Meal Plan</h1>
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <p className="text-sm text-gray-600">
          <strong>Customer:</strong> {mealPlan.customer.fullName}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Predefined Plan (Optional)</label>
            <select
              value={formData.planId}
              onChange={(e) => handlePlanChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">None - Custom Plan</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} - {plan.price} AED
                </option>
              ))}
            </select>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Meals Per Day *</label>
            <select
              required
              value={formData.mealsPerDay}
              onChange={(e) => setFormData({ ...formData, mealsPerDay: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
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
              <option value="PAUSED">Paused</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">Optional - leave empty if not set</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">Optional - leave empty if not set</p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Time Slots * (JSON array)</label>
            <input
              type="text"
              required
              value={formData.timeSlots}
              onChange={(e) => setFormData({ ...formData, timeSlots: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder='["08:00", "13:00", "18:00"]'
            />
            <p className="mt-1 text-xs text-gray-500">Enter time slots as JSON array, e.g., ["08:00", "13:00", "18:00"]</p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
            {loading ? 'Updating...' : 'Update Meal Plan'}
          </button>
          <Link
            href={`/meal-plans/${params.id}`}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* Payment Section */}
      <div className="bg-white shadow rounded-lg p-6 mt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Payment History</h2>
          <button
            onClick={() => setShowPaymentForm(!showPaymentForm)}
            className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark text-sm"
          >
            {showPaymentForm ? 'Cancel' : '+ Add Payment'}
          </button>
        </div>

        {/* Payment Form */}
        {showPaymentForm && (
          <form onSubmit={handleAddPayment} className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-md font-semibold text-gray-900 mb-4">Add New Payment</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount (AED) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={paymentData.paymentDate}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                <select
                  value={paymentData.paymentMethod}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="DIGITAL_WALLET">Digital Wallet</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status *</label>
                <select
                  required
                  value={paymentData.status}
                  onChange={(e) => setPaymentData({ ...paymentData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="PENDING">Pending</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={2}
                  placeholder="Optional payment notes..."
                />
              </div>
            </div>
            <div className="mt-4 flex gap-4">
              <button
                type="submit"
                disabled={savingPayment}
                className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50"
              >
                {savingPayment ? 'Adding...' : 'Add Payment'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPaymentForm(false)
                  setPaymentData({
                    amount: '',
                    paymentMethod: 'CASH',
                    status: 'COMPLETED',
                    paymentDate: new Date().toISOString().split('T')[0],
                    notes: '',
                  })
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Payment List */}
        {mealPlan.payments && mealPlan.payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mealPlan.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(payment.paymentDate), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {payment.amount.toFixed(2)} AED
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {payment.paymentMethod || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        payment.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        payment.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {payment.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mealPlan.totalAmount !== null && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Total Paid:</span>
                  <span className="text-lg font-semibold text-nutrafi-primary">
                    {mealPlan.payments
                      .filter(p => p.status === 'COMPLETED')
                      .reduce((sum, p) => sum + p.amount, 0)
                      .toFixed(2)} AED
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm font-medium text-gray-700">Remaining Balance:</span>
                  <span className={`text-lg font-semibold ${
                    (mealPlan.totalAmount - mealPlan.payments.filter(p => p.status === 'COMPLETED').reduce((sum, p) => sum + p.amount, 0)) > 0
                      ? 'text-orange-600'
                      : 'text-green-600'
                  }`}>
                    {(mealPlan.totalAmount - mealPlan.payments.filter(p => p.status === 'COMPLETED').reduce((sum, p) => sum + p.amount, 0)).toFixed(2)} AED
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No payments recorded for this meal plan.</p>
        )}
      </div>
    </div>
  )
}

