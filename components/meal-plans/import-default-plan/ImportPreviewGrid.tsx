'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { formatCategory } from '@/lib/utils'
import { formatMealPlanTime12Hour } from '@/lib/meal-plan-time-slots'
import { IMPORT_DAY_COLORS, importDayColorIndex } from '@/lib/import-default-plan/day-colors'
import { appliedImportDates } from '@/lib/import-default-plan/apply-template'
import type { AppliedImportMeal } from '@/lib/import-default-plan/types'
import { weekdayFullName, jsWeekdayToMon1Sun7, jsWeekdayFromYmd } from '@/lib/meal-plan-skip-days'
import { ImportMealDishPickerDialog } from './ImportMealDishPickerDialog'
import { ImportMealDeliveryDialog } from './ImportMealDeliveryDialog'
import {
  dishFieldsFromMenu,
  importMealKey,
  moveImportMealsDate,
  patchImportMeal,
  type MenuDishOption,
} from './import-meal-edit-helpers'

interface ImportPreviewGridProps {
  meals: AppliedImportMeal[]
  mealsPerDay: number
  editable?: boolean
  defaultLocation?: string
  dishes?: MenuDishOption[]
  onMealsChange?: (meals: AppliedImportMeal[]) => void
}

export function ImportPreviewGrid({
  meals,
  mealsPerDay,
  editable = false,
  defaultLocation,
  dishes = [],
  onMealsChange,
}: ImportPreviewGridProps) {
  const [editingDateYmd, setEditingDateYmd] = useState<string | null>(null)
  const [dateDraft, setDateDraft] = useState('')
  const [dishTargetKey, setDishTargetKey] = useState<string | null>(null)
  const [deliveryTargetKey, setDeliveryTargetKey] = useState<string | null>(null)
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())

  const toggleDayCollapsed = (dateYmd: string) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(dateYmd)) next.delete(dateYmd)
      else next.add(dateYmd)
      return next
    })
  }

  const dates = appliedImportDates(meals)
  if (dates.length === 0) {
    return <p className="text-sm text-gray-500 py-4 text-center">No meals in this range.</p>
  }

  const deliveryTarget = deliveryTargetKey
    ? meals.find((m) => importMealKey(m) === deliveryTargetKey)
    : null
  const dishTarget = dishTargetKey ? meals.find((m) => importMealKey(m) === dishTargetKey) : null

  const commitDateChange = (fromYmd: string, toYmd: string) => {
    if (!onMealsChange || !toYmd || fromYmd === toYmd) {
      setEditingDateYmd(null)
      return
    }
    onMealsChange(moveImportMealsDate(meals, fromYmd, toYmd))
    setEditingDateYmd(null)
  }

  return (
    <>
      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        {dates.map((dateYmd) => {
          const dayMeals = meals.filter((m) => m.date === dateYmd)
          const colors = IMPORT_DAY_COLORS[importDayColorIndex(dateYmd)]!
          const weekday = jsWeekdayToMon1Sun7(jsWeekdayFromYmd(dateYmd))
          const isEditingDate = editingDateYmd === dateYmd
          const isCollapsed = collapsedDays.has(dateYmd)
          const activeCount = dayMeals.filter((m) => !m.isSkipped).length
          const skippedCount = dayMeals.filter((m) => m.isSkipped).length

          return (
            <div
              key={dateYmd}
              className="border border-gray-200 rounded-lg overflow-hidden"
              style={{ background: colors.dayGradient }}
            >
              <div
                className="px-3 py-2 flex items-center gap-2"
                style={{ backgroundColor: colors.header }}
              >
                <button
                  type="button"
                  onClick={() => toggleDayCollapsed(dateYmd)}
                  className="shrink-0 text-white/90 hover:text-white p-0.5"
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? 'Expand day' : 'Collapse day'}
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {editable && isEditingDate ? (
                  <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                    <input
                      type="date"
                      value={dateDraft}
                      onChange={(e) => setDateDraft(e.target.value)}
                      className="rounded border border-white/40 bg-white/95 px-2 py-1 text-sm text-gray-900"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => commitDateChange(dateYmd, dateDraft)}
                      className="rounded bg-white/20 px-2 py-1 text-xs font-medium text-white hover:bg-white/30"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDateYmd(null)}
                      className="rounded px-2 py-1 text-xs text-white/90 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center gap-2 min-w-0">
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => {
                        if (!editable) return
                        setEditingDateYmd(dateYmd)
                        setDateDraft(dateYmd)
                      }}
                      className={`text-sm font-semibold text-white text-left truncate ${
                        editable ? 'hover:underline cursor-pointer' : 'cursor-default'
                      }`}
                      title={editable ? 'Click to change date' : undefined}
                    >
                      {weekdayFullName(weekday)} · {format(parseISO(dateYmd), 'MMM d, yyyy')}
                    </button>
                    {isCollapsed && (
                      <span
                        className={`text-xs shrink-0 font-semibold ${
                          skippedCount > 0 && activeCount === 0
                            ? 'text-amber-200'
                            : 'text-white/80'
                        }`}
                      >
                        {skippedCount > 0 && activeCount === 0
                          ? 'Skipped'
                          : activeCount > 0
                            ? `${activeCount} meal${activeCount === 1 ? '' : 's'}`
                            : 'Empty'}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {!isCollapsed && (
              <div className="p-3 space-y-2 bg-white/80">
                {Array.from({ length: mealsPerDay }, (_, slotIndex) => {
                  const slot = dayMeals.find((m) => m.slotIndex === slotIndex)
                  if (!slot) {
                    return (
                      <div
                        key={slotIndex}
                        className="text-xs text-gray-400 border-b border-gray-100 pb-2"
                      >
                        Meal {slotIndex + 1} — empty
                      </div>
                    )
                  }
                  const key = importMealKey(slot)
                  const deliveryLabel = slot.isSkipped
                    ? '—'
                    : `${slot.deliveryType === 'pickup' ? 'Pickup' : 'Delivery'}${
                        slot.deliveryTime ? ` · ${slot.deliveryTime.slice(0, 5)}` : ''
                      }`

                  return (
                    <div
                      key={slotIndex}
                      className="flex flex-col sm:flex-row sm:gap-4 text-sm border-b border-gray-100 pb-2 last:border-0"
                    >
                      <button
                        type="button"
                        disabled={!editable || slot.isSkipped}
                        onClick={() => editable && !slot.isSkipped && setDeliveryTargetKey(key)}
                        className={`sm:w-28 shrink-0 text-xs font-medium text-left ${
                          editable && !slot.isSkipped
                            ? 'text-nutrafi-primary hover:underline cursor-pointer'
                            : slot.isSkipped
                              ? 'text-gray-400 cursor-default'
                              : 'text-gray-500 cursor-default'
                        }`}
                        title={editable && !slot.isSkipped ? 'Click to edit time & address' : undefined}
                      >
                        {formatMealPlanTime12Hour(slot.timeSlot)}
                      </button>
                      {slot.isSkipped ? (
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => editable && setDishTargetKey(key)}
                          className={`flex-1 font-semibold text-left ${
                            editable
                              ? 'text-amber-600 hover:text-amber-700 hover:underline cursor-pointer'
                              : 'text-amber-600 cursor-default'
                          }`}
                          title={editable ? 'Click to add a meal on this skip day' : undefined}
                        >
                          Skipped
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => editable && setDishTargetKey(key)}
                          className={`flex-1 font-medium text-left ${
                            editable
                              ? 'text-gray-900 hover:text-nutrafi-primary hover:underline cursor-pointer'
                              : 'text-gray-900 cursor-default'
                          }`}
                          title={editable ? 'Click to change dish' : undefined}
                        >
                          {slot.dishName
                            ? `${slot.dishName}${slot.dishCategory ? ` (${formatCategory(slot.dishCategory)})` : ''}`
                            : '— No dish —'}
                        </button>
                      )}
                      {slot.isSkipped ? (
                        <div className="text-xs text-gray-400">—</div>
                      ) : (
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => editable && setDeliveryTargetKey(key)}
                          className={`text-xs text-left ${
                            editable
                              ? 'text-gray-600 hover:text-nutrafi-primary hover:underline cursor-pointer'
                              : 'text-gray-600 cursor-default'
                          }`}
                          title={editable ? 'Click to edit time & address' : undefined}
                        >
                          {deliveryLabel}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              )}
            </div>
          )
        })}
      </div>

      <ImportMealDishPickerDialog
        open={dishTargetKey !== null}
        dishes={dishes}
        currentDishId={dishTarget?.dishId}
        onClose={() => setDishTargetKey(null)}
        onSelect={(dish) => {
          if (!dishTargetKey || !onMealsChange) return
          onMealsChange(
            patchImportMeal(meals, dishTargetKey, {
              ...dishFieldsFromMenu(dish),
              isSkipped: false,
            })
          )
        }}
      />

      <ImportMealDeliveryDialog
        open={deliveryTargetKey !== null && !!deliveryTarget}
        initial={{
          deliveryType: deliveryTarget?.deliveryType ?? 'delivery',
          timeSlot: deliveryTarget?.timeSlot ?? '12:00',
          deliveryTime: deliveryTarget?.deliveryTime ?? '',
          location: deliveryTarget?.location ?? defaultLocation ?? '',
        }}
        defaultLocation={defaultLocation}
        onClose={() => setDeliveryTargetKey(null)}
        onSave={(values) => {
          if (!deliveryTargetKey || !onMealsChange) return
          onMealsChange(
            patchImportMeal(meals, deliveryTargetKey, {
              deliveryType: values.deliveryType,
              timeSlot: values.timeSlot,
              deliveryTime: values.deliveryTime,
              location: values.location,
            })
          )
        }}
      />
    </>
  )
}
