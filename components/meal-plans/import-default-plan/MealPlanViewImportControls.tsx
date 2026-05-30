'use client'

import { useState } from 'react'
import { ImportDefaultPlanFlow } from './ImportDefaultPlanFlow'
import type { useMealPlanViewImport } from './use-meal-plan-view-import'

type ViewImportApi = ReturnType<typeof useMealPlanViewImport>

interface MealPlanViewImportControlsProps {
  importApi: ViewImportApi
  disabled?: boolean
}

export function MealPlanViewImportControls({
  importApi,
  disabled,
}: MealPlanViewImportControlsProps) {
  const [open, setOpen] = useState(false)
  const {
    savingImport,
    defaultImportStart,
    earliestImportStart,
    occupiedDates,
    maxActiveMealsToAdd,
    planStartYmd,
    planEndYmd,
    planDays,
    planMealsPerDay,
    planTimeSlots,
    deliveryType,
    deliveryLocation,
    isCalendarDaySkipped,
    saveImport,
  } = importApi

  if (maxActiveMealsToAdd <= 0) {
    return null
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || !planStartYmd || savingImport}
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm font-medium border-2 border-nutrafi-primary text-nutrafi-primary rounded-md hover:bg-[#f0f4e8] disabled:opacity-50"
      >
        Import default plan
      </button>
      <ImportDefaultPlanFlow
        open={open}
        onClose={() => setOpen(false)}
        planStartYmd={planStartYmd}
        planDays={planDays}
        planMealsPerDay={planMealsPerDay}
        planTimeSlots={planTimeSlots}
        deliveryType={deliveryType}
        deliveryLocation={deliveryLocation}
        defaultImportStartYmd={defaultImportStart}
        planEndYmd={planEndYmd}
        earliestImportStartYmd={earliestImportStart}
        occupiedDates={occupiedDates}
        maxActiveMealsToAdd={maxActiveMealsToAdd}
        isCalendarDaySkipped={isCalendarDaySkipped}
        limitToPlanWeek
        applyButtonLabel="Save plan"
        saving={savingImport}
        onApply={async (meals) => {
          await saveImport(meals)
        }}
      />
    </>
  )
}
