'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { useNotification } from '@/components/notifications/NotificationContext'
import { DeleteMealPlanButton } from '@/components/meal-plans/DeleteMealPlanButton'
import { parseMealPlanTimeSlots } from '@/lib/meal-plan-time-slots'
import { normalizeWeeklySkipDays, WEEKDAY_SKIP_TOGGLES } from '@/lib/meal-plan-skip-days'
import { CustomerInstructionsBanner } from '@/components/customers/CustomerInstructionsBanner'

interface MealPlanItem {
  id: string
  date: string
  timeSlot: string
  dishId: string | null
  dishName: string | null
  dishDescription: string | null
  dishCategory: string | null
  ingredients: string | null
  allergens: string | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fats: number | null
  price: number | null
  deliveryTime: string | null
  deliveryType?: string | null
  deliveredLocation?: string | null
  isSkipped: boolean
  isDelivered: boolean
  customNote: string | null
}

interface MealPlan {
  id: string
  customer: {
    id: string
    fullName: string
    instructions?: string | null
  }
  plan: {
    id: string
    name: string
  } | null
  planType: string
  startDate: string
  endDate: string
  days: number
  mealsPerDay: number
  status: string
  notes: string | null
  totalAmount: number | null
  totalMeals?: number | null
  remainingMeals?: number | null
  timeSlots?: unknown
  /** Plan default skip weekdays (Mon=1 … Sun=7) */
  weeklySkipDays?: number[]
  mealPlanItems?: MealPlanItem[]
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
  const toast = useNotification()
  const [loading, setLoading] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [formData, setFormData] = useState({
    planId: '',
    planType: 'WEEKLY',
    mealsPerDay: '2',
    startDate: '',
    endDate: '',
    status: 'ACTIVE',
    notes: '',
    totalMeals: '', // Override: empty = use days × mealsPerDay
    remainingMeals: '', // Stored balance; goes down when meals are marked delivered
    timeSlotsText: '', // One time per line (HH:MM); saved on MealPlan.timeSlots
  })
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentMethod: 'CASH',
    status: 'COMPLETED',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: '',
  })
  type PaymentItem = NonNullable<MealPlan['payments']>[number]
  const [editingPayment, setEditingPayment] = useState<PaymentItem | null>(null)
  const [savingPaymentEdit, setSavingPaymentEdit] = useState(false)
  const [showStartDateConfirm, setShowStartDateConfirm] = useState(false)
  const [showTimeSlotsPropagateConfirm, setShowTimeSlotsPropagateConfirm] = useState(false)
  /** When opening the time-slot propagate dialog after start-date choice, stores align-items flag. */
  const pendingStartDateItemAlignRef = useRef(false)
  /** Default skip days for the whole plan (new weeks / weeks without an override use this). */
  const [defaultSkipWeekdays, setDefaultSkipWeekdays] = useState<number[]>([])

  useEffect(() => {
    if (params.id) {
      fetchMealPlan(params.id as string)
      fetchPlans()
    }
  }, [params.id])

  const fetchMealPlan = async (id: string) => {
    try {
      const response = await fetch(`/api/meal-plans/${id}`, { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        setMealPlan(data)
        setDefaultSkipWeekdays(normalizeWeeklySkipDays(data.weeklySkipDays))
        setFormData({
          planId: data.plan?.id || '',
          planType: data.planType,
          mealsPerDay: data.mealsPerDay.toString(),
          startDate: data.startDate ? data.startDate.split('T')[0] : '',
          endDate: data.endDate ? data.endDate.split('T')[0] : '',
          status: data.status,
          notes: data.notes || '',
          totalMeals: data.totalMeals != null ? String(data.totalMeals) : '',
          remainingMeals: data.remainingMeals != null ? String(data.remainingMeals) : '',
          timeSlotsText: parseMealPlanTimeSlots(data.timeSlots).join('\n'),
        })
      } else {
        toast.error('Failed to fetch meal plan')
        router.push('/meal-plans')
      }
    } catch (error) {
      console.error('Error fetching meal plan:', error)
      toast.error('Failed to fetch meal plan')
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

  /** Empty = omit (keep DB). Invalid/non-numeric = omit — never send NaN (JSON becomes null and would clear server fields). */
  const optionalNonNegativeInt = (raw: string): number | undefined => {
    const t = raw.trim()
    if (t === '') return undefined
    const n = parseInt(t, 10)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }

  const normalizeTimeSlotsText = (text: string) =>
    text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join('\n')

  const hasTimeSlotsScheduleChange = (): boolean => {
    if (!mealPlan) return false
    return (
      normalizeTimeSlotsText(formData.timeSlotsText) !==
      normalizeTimeSlotsText(parseMealPlanTimeSlots(mealPlan.timeSlots).join('\n'))
    )
  }

  const finishStartDateChoice = (alignItemDates: boolean) => {
    setShowStartDateConfirm(false)
    pendingStartDateItemAlignRef.current = alignItemDates
    if (hasTimeSlotsScheduleChange()) {
      setShowTimeSlotsPropagateConfirm(true)
    } else {
      void submitMealPlan(alignItemDates, false)
    }
  }

  const submitMealPlan = async (
    updateItemDatesFromStartDate: boolean,
    propagateTimeSlotsToFutureItems: boolean
  ) => {
    if (!mealPlan) return
    const originalStart = mealPlan.startDate ? mealPlan.startDate.split('T')[0] : ''
    const newStart = formData.startDate || ''
    const startDateChanged = newStart !== originalStart
    const hasItems = (mealPlan.mealPlanItems?.length ?? 0) > 0

    setLoading(true)
    try {
      const { timeSlotsText, ...planFields } = formData
      const slotLines = timeSlotsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)

      const response = await fetch(`/api/meal-plans/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...planFields,
          mealsPerDay: parseInt(formData.mealsPerDay, 10),
          planId: formData.planId || undefined,
          planType: formData.planType || undefined,
          totalMeals: optionalNonNegativeInt(formData.totalMeals),
          remainingMeals: optionalNonNegativeInt(formData.remainingMeals),
          timeSlots: slotLines.length > 0 ? slotLines : null,
          weeklySkipDays: defaultSkipWeekdays,
          updateItemDatesFromStartDate: startDateChanged && hasItems ? updateItemDatesFromStartDate : undefined,
          propagateTimeSlotsToFutureItems: propagateTimeSlotsToFutureItems,
        }),
      })

      if (response.ok) {
        const payload = await response.json()
        const n = typeof payload.propagatedTimeSlotsCount === 'number' ? payload.propagatedTimeSlotsCount : 0
        if (n > 0) {
          toast.success(`Meal plan saved. Updated times on ${n} future meal(s) (from today).`)
        }
        router.push(`/meal-plans/${params.id}`)
      } else {
        const error = await response.json()
        toast.error('Error: ' + JSON.stringify(error))
      }
    } catch (error) {
      console.error('Error updating meal plan:', error)
      toast.error('Failed to update meal plan')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mealPlan) return

    const originalStart = mealPlan.startDate ? mealPlan.startDate.split('T')[0] : ''
    const newStart = formData.startDate || ''
    const startDateChanged = newStart !== originalStart
    const hasItems = (mealPlan.mealPlanItems?.length ?? 0) > 0

    if (startDateChanged && hasItems) {
      setShowStartDateConfirm(true)
      return
    }

    if (hasTimeSlotsScheduleChange()) {
      pendingStartDateItemAlignRef.current = false
      setShowTimeSlotsPropagateConfirm(true)
      return
    }

    await submitMealPlan(false, false)
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
        toast.success('Payment added successfully!')
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
        toast.error('Error: ' + JSON.stringify(error))
      }
    } catch (error) {
      console.error('Error adding payment:', error)
      toast.error('Failed to add payment')
    } finally {
      setSavingPayment(false)
    }
  }

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPayment || !mealPlan) return

    setSavingPaymentEdit(true)
    try {
      const form = e.target as HTMLFormElement
      const formData = new FormData(form)
      const amount = formData.get('edit-amount')
      const paymentDate = formData.get('edit-paymentDate')
      const paymentMethod = formData.get('edit-paymentMethod')
      const status = formData.get('edit-status')
      const notes = formData.get('edit-notes')

      const response = await fetch(`/api/payments/${editingPayment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(String(amount || '0')),
          paymentDate: paymentDate ? String(paymentDate) : format(new Date(editingPayment.paymentDate), 'yyyy-MM-dd'),
          paymentMethod: paymentMethod || null,
          status: (status as 'PENDING' | 'COMPLETED' | 'FAILED') || editingPayment.status,
          notes: notes !== undefined && notes !== null ? String(notes) : null,
        }),
      })

      if (response.ok) {
        toast.success('Payment updated successfully!')
        setEditingPayment(null)
        await fetchMealPlan(mealPlan.id)
      } else {
        const err = await response.json()
        toast.error('Error: ' + (err?.error ? JSON.stringify(err.error) : 'Failed to update payment'))
      }
    } catch (error) {
      console.error('Error updating payment:', error)
      toast.error('Failed to update payment')
    } finally {
      setSavingPaymentEdit(false)
    }
  }

  if (!mealPlan) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h1 className="text-lg font-bold text-gray-900">Edit Meal Plan</h1>
        <DeleteMealPlanButton mealPlanId={String(mealPlan.id)} customerName={mealPlan.customer.fullName} />
      </div>
      <div className="bg-white shadow rounded p-3 mb-3 space-y-3">
        <p className="text-sm text-gray-600">
          <strong>Customer:</strong> {mealPlan.customer.fullName}
        </p>
        <CustomerInstructionsBanner instructions={mealPlan.customer.instructions} />
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
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
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
              <option value="COMPLETED">Completed</option>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Total Meals (override)</label>
            <input
              type="number"
              min={0}
              value={formData.totalMeals ?? ''}
              onChange={(e) => setFormData({ ...formData, totalMeals: e.target.value })}
              placeholder={mealPlan.days && mealPlan.mealsPerDay ? `Calculated: ${mealPlan.days * mealPlan.mealsPerDay}` : 'Optional'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">
              Contract total: <span className="font-semibold text-gray-900">{mealPlan.totalMeals ?? (mealPlan.days && mealPlan.mealsPerDay ? mealPlan.days * mealPlan.mealsPerDay : '-')}</span>
              {mealPlan.days != null && mealPlan.mealsPerDay != null && (
                <span className="text-gray-400"> (leave empty to keep the stored total; enter a number to override)</span>
              )}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Remaining meals (balance)</label>
            <input
              type="number"
              min={0}
              value={formData.remainingMeals ?? ''}
              onChange={(e) => setFormData({ ...formData, remainingMeals: e.target.value })}
              placeholder={mealPlan.remainingMeals != null ? String(mealPlan.remainingMeals) : '0'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">
              Remaining balance is updated when meals are marked delivered or not delivered. You can correct the number here when saving.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default time slots (meal plan)
            </label>
            <textarea
              value={formData.timeSlotsText}
              onChange={(e) => setFormData({ ...formData, timeSlotsText: e.target.value })}
              placeholder={'08:00\n13:00\n19:00'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
              rows={4}
            />
            <p className="text-xs text-gray-500 mt-1">
              One time per line (24h). Stored on the meal plan and applied to new items. Clear all lines and save to remove.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default skip days (whole plan)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Used for every plan week until you change skip days for a specific week on the meal schedule view.
            </p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_SKIP_TOGGLES.map(({ label, value }) => {
                const on = defaultSkipWeekdays.includes(value)
                return (
                  <label
                    key={value}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
                      on
                        ? 'border-nutrafi-primary bg-nutrafi-primary/10 text-nutrafi-primary'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-nutrafi-primary focus:ring-nutrafi-primary"
                      checked={on}
                      onChange={() => {
                        setDefaultSkipWeekdays((prev) => {
                          const s = new Set(prev)
                          if (s.has(value)) s.delete(value)
                          else s.add(value)
                          return Array.from(s).sort((a, b) => a - b)
                        })
                      }}
                    />
                    {label}
                  </label>
                )
              })}
            </div>
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
      <div className="bg-white shadow rounded p-3 mt-3">
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
          <form onSubmit={handleAddPayment} className="mb-3 p-2 bg-gray-50 rounded border border-gray-200">
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                        payment.status === 'COMPLETED' ? 'bg-[#f0f4e8] text-nutrafi-dark' :
                        payment.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {payment.notes || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        type="button"
                        onClick={() => setEditingPayment(payment)}
                        className="px-3 py-1 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark text-xs"
                      >
                        Edit
                      </button>
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
                      : 'text-nutrafi-primary'
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

      {/* Start date change confirmation popup */}
      {showStartDateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowStartDateConfirm(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Update start date</h3>
            <p className="text-sm text-gray-600 mb-4">
              You&apos;ve changed the start date. Do you want to update existing meal plan days to align with the new start date?
            </p>
            <ul className="text-sm text-gray-600 mb-4 list-disc list-inside space-y-1">
              <li><strong>Yes:</strong> We&apos;ll shift all meal days (Day 1 → {formData.startDate ? format(new Date(formData.startDate), 'MMM d, yyyy') : 'new start date'}, Day 2 → next day, etc.).</li>
              <li><strong>No:</strong> We&apos;ll keep the current dates for each meal as they are.</li>
            </ul>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => finishStartDateChoice(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
              >
                No, keep as is
              </button>
              <button
                type="button"
                onClick={() => finishStartDateChoice(true)}
                className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark font-medium"
              >
                Yes, update days
              </button>
            </div>
          </div>
        </div>
      )}

      {showTimeSlotsPropagateConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowTimeSlotsPropagateConfirm(false)}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Update default times?</h3>
            <p className="text-sm text-gray-600 mb-4">
              You changed the default time slots. <strong>Yes</strong> will update meal time slots from today onwards
              for all scheduled meals.
            </p>
            <div className="mt-1 flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <button
                type="button"
                onClick={() => setShowTimeSlotsPropagateConfirm(false)}
                className="w-full px-4 py-2.5 text-center text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 sm:w-auto"
              >
                Cancel
              </button>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-nowrap sm:justify-end sm:gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTimeSlotsPropagateConfirm(false)
                    void submitMealPlan(pendingStartDateItemAlignRef.current, false)
                  }}
                  className="w-full px-4 py-2.5 text-center text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 sm:w-auto"
                >
                  No, defaults only
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTimeSlotsPropagateConfirm(false)
                    void submitMealPlan(pendingStartDateItemAlignRef.current, true)
                  }}
                  className="w-full px-4 py-2.5 text-center text-sm font-medium text-white bg-nutrafi-primary rounded-md hover:bg-nutrafi-dark sm:w-auto"
                >
                  Yes, update future meals
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setEditingPayment(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Payment</h3>
            <form key={editingPayment.id} onSubmit={handleUpdatePayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (AED) *</label>
                <input
                  type="number"
                  name="edit-amount"
                  required
                  min="0"
                  step="0.01"
                  defaultValue={editingPayment.amount}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
                <input
                  type="date"
                  name="edit-paymentDate"
                  required
                  defaultValue={format(new Date(editingPayment.paymentDate), 'yyyy-MM-dd')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  name="edit-paymentMethod"
                  defaultValue={editingPayment.paymentMethod || 'CASH'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="DIGITAL_WALLET">Digital Wallet</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select
                  name="edit-status"
                  required
                  defaultValue={editingPayment.status}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                >
                  <option value="PENDING">Pending</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  name="edit-notes"
                  defaultValue={editingPayment.notes || ''}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                  placeholder="Optional notes..."
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingPaymentEdit}
                  className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50"
                >
                  {savingPaymentEdit ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
