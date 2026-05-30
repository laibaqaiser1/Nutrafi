'use client'

import { useMemo } from 'react'
import {
  formatMealPlanTime12Hour,
  generateMealPlanTimeOptions,
  mealPlanTimeOptionsForSlot,
} from '@/lib/meal-plan-time-slots'

type Props = {
  slots: string[]
  onChange: (slots: string[]) => void
  label?: string
  labelClassName?: string
  requiredFirst?: boolean
  maxWidthClassName?: string
}

export function MealPlanTimeSlotFields({
  slots,
  onChange,
  label = 'Default time slots',
  labelClassName = 'block text-sm font-medium text-gray-700 mb-2',
  requiredFirst = false,
  maxWidthClassName = '',
}: Props) {
  const standardOptions = useMemo(() => generateMealPlanTimeOptions(), [])

  const setSlotAt = (index: number, value: string) => {
    const next = [...slots]
    next[index] = value
    onChange(next)
  }

  const addRow = () => onChange([...slots, ''])

  const removeRow = (index: number) => {
    if (slots.length <= 1) return
    onChange(slots.filter((_, i) => i !== index))
  }

  const rows = slots.length > 0 ? slots : ['']

  return (
    <div className={maxWidthClassName}>
      <label className={labelClassName}>{label}</label>
      <div className="mt-2 space-y-2">
        {rows.map((slot, i) => {
          const options = mealPlanTimeOptionsForSlot(slot, standardOptions)
          return (
            <div key={i} className="flex gap-2 items-center">
              <select
                value={slot}
                required={requiredFirst && i === 0}
                onChange={(e) => setSlotAt(i, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nutrafi-primary focus:border-nutrafi-primary bg-white"
              >
                <option value="">Select time</option>
                {options.map((time) => (
                  <option key={time} value={time}>
                    {formatMealPlanTime12Hour(time)}
                  </option>
                ))}
              </select>
              {rows.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="text-xs text-red-600 hover:underline shrink-0"
                >
                  Remove
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      <button type="button" onClick={addRow} className="mt-2 text-sm text-nutrafi-primary hover:underline">
        + Add time
      </button>
    </div>
  )
}
