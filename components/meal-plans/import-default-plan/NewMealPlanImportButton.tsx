'use client'

import { useState, useMemo, useCallback, type Dispatch, type SetStateAction } from 'react'
import { parseMealPlanTimeSlots } from '@/lib/meal-plan-time-slots'
import { mergeAppliedIntoWizardMeals } from '@/lib/import-default-plan/merge-wizard-meals'
import { appliedImportDates } from '@/lib/import-default-plan/apply-template'
import { ensureWizardVisibilityForDates } from '@/lib/import-default-plan/ensure-wizard-visibility'
import {
  datesWithAssignedMealsYmd,
  maxActiveMealsToImport,
} from '@/lib/import-default-plan/import-capacity'
import {
  defaultImportStartForWizard,
  firstAvailableImportStartYmd,
} from '@/lib/import-default-plan/suggest-start-date'
import type { AppliedImportMeal, WizardMealRow } from '@/lib/import-default-plan/types'
import { ImportDefaultPlanFlow } from './ImportDefaultPlanFlow'

interface CustomerOption {
  id: string
  deliveryArea: string
}

interface NewMealPlanImportButtonProps {
  step: number
  startDate: string
  days: string
  mealsPerDay: string
  totalMeals?: string
  timeSlots: string[]
  deliveryType: string
  customerId: string
  customers: CustomerOption[]
  meals: WizardMealRow[]
  isCalendarDaySkipped?: (dateYmd: string) => boolean
  setMeals: (meals: WizardMealRow[]) => void
  /** Called before meals/visibility update so the wizard can skip regenerating empty rows. */
  onImportApplied?: () => void
  setVisibleWeeks: Dispatch<SetStateAction<number[]>>
  setVisibleDaysByWeek: Dispatch<SetStateAction<Record<number, string[]>>>
}

export function NewMealPlanImportButton({
  step,
  startDate,
  days,
  mealsPerDay,
  totalMeals,
  timeSlots,
  deliveryType,
  customerId,
  customers,
  meals,
  isCalendarDaySkipped,
  setMeals,
  onImportApplied,
  setVisibleWeeks,
  setVisibleDaysByWeek,
}: NewMealPlanImportButtonProps) {
  const [open, setOpen] = useState(false)

  const planTimeSlots = useMemo(() => parseMealPlanTimeSlots(timeSlots), [timeSlots])
  const daysNum = parseInt(days, 10)
  const mpdNum = parseInt(mealsPerDay, 10)
  const totalMealsNum = parseInt(totalMeals ?? '', 10)
  const selectedCustomer = customers.find((c) => c.id == customerId)

  const occupiedDates = useMemo(
    () => datesWithAssignedMealsYmd(meals),
    [meals]
  )

  const maxActiveMealsToAdd = useMemo(() => {
    const capTotal =
      Number.isFinite(totalMealsNum) && totalMealsNum > 0
        ? totalMealsNum
        : Number.isFinite(daysNum) && Number.isFinite(mpdNum)
          ? daysNum * mpdNum
          : 0
    return maxActiveMealsToImport({
      totalMeals: capTotal,
      days: daysNum,
      mealsPerDay: mpdNum,
      existingItems: meals,
      wizardMode: true,
    })
  }, [totalMealsNum, daysNum, mpdNum, meals])

  const defaultImportStart = startDate
    ? defaultImportStartForWizard(startDate, occupiedDates)
    : startDate

  const earliestImportStart = startDate
    ? firstAvailableImportStartYmd(startDate, occupiedDates)
    : startDate

  const canImport =
    step === 4 &&
    !!startDate &&
    Number.isFinite(daysNum) &&
    daysNum >= 1 &&
    Number.isFinite(mpdNum) &&
    mpdNum >= 1 &&
    planTimeSlots.length > 0 &&
    maxActiveMealsToAdd > 0

  const handleApply = useCallback(
    (applied: AppliedImportMeal[], importStartYmd: string) => {
      const merged = mergeAppliedIntoWizardMeals(meals, applied, importStartYmd)
      onImportApplied?.()
      setMeals(merged)
      ensureWizardVisibilityForDates(
        appliedImportDates(applied),
        startDate,
        setVisibleWeeks,
        setVisibleDaysByWeek
      )
    },
    [meals, setMeals, onImportApplied, startDate, setVisibleWeeks, setVisibleDaysByWeek]
  )

  if (!canImport && step !== 4) return null
  if (step === 4 && (!startDate || planTimeSlots.length === 0)) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={maxActiveMealsToAdd <= 0}
        className="px-3 py-1.5 text-sm font-medium border-2 border-nutrafi-primary text-nutrafi-primary rounded-md hover:bg-[#f0f4e8] disabled:opacity-50"
      >
        Import default plan
      </button>
      <ImportDefaultPlanFlow
        open={open}
        onClose={() => setOpen(false)}
        planStartYmd={startDate}
        planDays={daysNum}
        planMealsPerDay={mpdNum}
        planTimeSlots={planTimeSlots}
        deliveryType={deliveryType === 'pickup' ? 'pickup' : 'delivery'}
        deliveryLocation={selectedCustomer?.deliveryArea ?? ''}
        defaultImportStartYmd={defaultImportStart}
        earliestImportStartYmd={earliestImportStart}
        occupiedDates={occupiedDates}
        maxActiveMealsToAdd={maxActiveMealsToAdd}
        isCalendarDaySkipped={isCalendarDaySkipped}
        limitToPlanWeek
        onApply={handleApply}
      />
    </>
  )
}
