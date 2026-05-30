'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { WEEKDAY_SKIP_TOGGLES } from '@/lib/meal-plan-skip-days'
import { useNotification } from '@/components/notifications/NotificationContext'
import { MealPlanTimeSlotFields } from '@/components/meal-plans/MealPlanTimeSlotFields'

function effectiveTimeSlots(slots: string[]): string[] {
  return slots.filter((s) => typeof s === 'string' && s.trim().length > 0)
}

export default function NewMealPlanTemplatePage() {
  const router = useRouter()
  const toast = useNotification()
  const [loading, setLoading] = useState(false)
  const [label, setLabel] = useState('')
  const [planType, setPlanType] = useState<'WEEKLY' | 'MONTHLY' | 'CUSTOM'>('WEEKLY')
  const [days, setDays] = useState('7')
  const [mealsPerDay, setMealsPerDay] = useState('2')
  const [timeSlots, setTimeSlots] = useState<string[]>(['', ''])
  const [weeklySkipDays, setWeeklySkipDays] = useState<number[]>([])
  const [notes, setNotes] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const d = parseInt(days, 10)
    const mpd = parseInt(mealsPerDay, 10)
    if (!label.trim()) {
      toast.warning('Enter a label for this plan.')
      return
    }
    if (!Number.isFinite(d) || d < 1) {
      toast.warning('Enter a valid number of days.')
      return
    }
    if (!Number.isFinite(mpd) || mpd < 1 || mpd > 5) {
      toast.warning('Meals per day must be between 1 and 5.')
      return
    }
    const slots = effectiveTimeSlots(timeSlots)
    if (slots.length === 0) {
      toast.warning('Add at least one delivery time.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/meal-plan-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          planType,
          days: d,
          mealsPerDay: mpd,
          timeSlots: slots,
          weeklySkipDays,
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err.error === 'string' ? err.error : 'Failed to create')
      }
      const created = await res.json()
      router.push(`/meal-plans/templates/${created.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create template')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h1 className="text-lg lg:text-2xl font-bold text-gray-900">Add default meal plan</h1>
        <Link href="/meal-plans/templates" className="text-sm text-nutrafi-primary hover:underline">
          Back to list
        </Link>
      </div>

      <form onSubmit={submit} className="bg-white shadow rounded-lg p-4 lg:p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Low carb plan"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Plan type</label>
          <select
            value={planType}
            onChange={(e) => setPlanType(e.target.value as typeof planType)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Days (contract length)</label>
            <input
              type="number"
              min={1}
              max={366}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Meals per day</label>
            <input
              type="number"
              min={1}
              max={5}
              value={mealsPerDay}
              onChange={(e) => setMealsPerDay(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>

        <MealPlanTimeSlotFields slots={timeSlots} onChange={setTimeSlots} requiredFirst />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Default skip weekdays (optional)</label>
          <div className="flex flex-wrap gap-3">
            {WEEKDAY_SKIP_TOGGLES.map(({ label: lb, value }) => {
              const on = weeklySkipDays.includes(value)
              return (
                <label key={value} className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-nutrafi-primary focus:ring-nutrafi-primary"
                    checked={on}
                    onChange={() => {
                      const s = new Set(weeklySkipDays)
                      if (s.has(value)) s.delete(value)
                      else s.add(value)
                      setWeeklySkipDays(Array.from(s).sort((a, b) => a - b))
                    }}
                  />
                  {lb}
                </label>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50 text-sm font-medium"
          >
            {loading ? 'Creating…' : 'Create & edit menu'}
          </button>
          <Link
            href="/meal-plans/templates"
            className="px-4 py-2 border border-gray-300 text-gray-800 rounded-md hover:bg-gray-50 text-sm"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
