'use client'

import { useCallback, useMemo, useState } from 'react'
import { mealPlanDateYmd } from '@/lib/meal-plan-calendar-date'
import { parseMealPlanTimeSlots } from '@/lib/meal-plan-time-slots'
import {
  datesWithAssignedMealsYmd,
  existingMealDatesYmd,
  maxActiveMealsToImport,
} from '@/lib/import-default-plan/import-capacity'
import { isCustomerPlanCalendarDaySkipped } from '@/lib/import-default-plan/plan-skip-for-date'
import { getPlanWeekNumber } from '@/lib/meal-plan-weeks'
import { shouldSkipCalendarDay } from '@/lib/meal-plan-skip-days'
import {
  appliedMealsToBulkPayload,
  limitActiveImportMealsPerDate,
} from '@/lib/import-default-plan/bulk-save-items'
import {
  defaultImportStartForExistingPlan,
  firstAvailableImportStartYmd,
  isDateWithinPlanEnd,
  planEndYmd,
} from '@/lib/import-default-plan/suggest-start-date'
import type { AppliedImportMeal } from '@/lib/import-default-plan/types'

export interface MealPlanViewImportSource {
  id: string
  startDate: string
  days: number
  mealsPerDay: number
  totalMeals?: number | null
  remainingMeals?: number | null
  timeSlots?: unknown
  weeklySkipDays?: number[]
  weeklySkipDaysByWeek?: unknown
  customer: { deliveryArea: string }
  mealPlanItems: Array<{
    id: string
    date: string
    timeSlot: string
    isSkipped?: boolean
    wrongDelivery?: boolean
    [key: string]: unknown
  }>
}

export interface MealPlanViewImportOptions {
  /** Per–plan-week skip pattern (includes unsaved UI draft); overrides server-only skip data. */
  resolveSkipDaysForPlanWeek?: (planWeek: number) => number[]
}

export function useMealPlanViewImport(
  mealPlan: MealPlanViewImportSource | null,
  onSaved: () => void | Promise<void>,
  toast: { success: (m: string) => void; error: (m: string) => void },
  onApplied?: (dateYmds: string[]) => void,
  options?: MealPlanViewImportOptions
) {
  const [saving, setSaving] = useState(false)

  const planStartYmd = mealPlan?.startDate ? mealPlanDateYmd(mealPlan.startDate) : ''
  const planEnd = mealPlan && mealPlan.days > 0 ? planEndYmd(planStartYmd, mealPlan.days) : ''

  /** Dates with a dish block import; empty placeholder rows can be filled via upsert. */
  const occupiedDates = useMemo(
    () => (mealPlan ? datesWithAssignedMealsYmd(mealPlan.mealPlanItems) : new Set<string>()),
    [mealPlan]
  )

  const rowOccupiedDates = useMemo(
    () => (mealPlan ? existingMealDatesYmd(mealPlan.mealPlanItems) : new Set<string>()),
    [mealPlan]
  )

  const defaultImportStart = mealPlan
    ? defaultImportStartForExistingPlan(planStartYmd, mealPlan.days, mealPlan.mealPlanItems)
    : ''

  const earliestImportStart = mealPlan
    ? firstAvailableImportStartYmd(planStartYmd, rowOccupiedDates)
    : planStartYmd

  const hasCalendarRoomToImport =
    !!defaultImportStart &&
    (!planEnd || defaultImportStart <= planEnd)

  const maxActiveMealsToAdd = useMemo(() => {
    if (!mealPlan || !hasCalendarRoomToImport) return 0
    return maxActiveMealsToImport({
      totalMeals: mealPlan.totalMeals,
      days: mealPlan.days,
      mealsPerDay: mealPlan.mealsPerDay,
      existingItems: mealPlan.mealPlanItems,
      remainingMeals: mealPlan.remainingMeals,
      wizardMode: true,
    })
  }, [mealPlan, hasCalendarRoomToImport])

  const planTimeSlots = parseMealPlanTimeSlots(mealPlan?.timeSlots)
  const effectiveTimeSlots =
    planTimeSlots.length > 0
      ? planTimeSlots
      : Array.from({ length: mealPlan?.mealsPerDay ?? 1 }, () => '12:00')

  const resolveSkipDaysForPlanWeek = options?.resolveSkipDaysForPlanWeek

  const isCalendarDaySkipped = useCallback(
    (dateYmd: string) => {
      if (!mealPlan || !planStartYmd) return false
      if (resolveSkipDaysForPlanWeek) {
        const planWeek = getPlanWeekNumber(dateYmd, planStartYmd)
        return shouldSkipCalendarDay(dateYmd, resolveSkipDaysForPlanWeek(planWeek))
      }
      return isCustomerPlanCalendarDaySkipped(
        dateYmd,
        planStartYmd,
        mealPlan.weeklySkipDays,
        mealPlan.weeklySkipDaysByWeek
      )
    },
    [mealPlan, planStartYmd, resolveSkipDaysForPlanWeek]
  )

  const saveImport = useCallback(
    async (applied: AppliedImportMeal[]) => {
      if (!mealPlan || applied.length === 0) return
      const inContract = limitActiveImportMealsPerDate(
        applied.filter((m) =>
          isDateWithinPlanEnd(m.date.slice(0, 10), planStartYmd, mealPlan.days)
        ),
        mealPlan.mealsPerDay
      )
      if (inContract.length === 0) {
        toast.error(
          planEnd
            ? `This plan ends on ${planEnd}. Extend the plan days to import more meals.`
            : 'No meals to import within the plan date range.'
        )
        return
      }
      setSaving(true)
      try {
        const res = await fetch(`/api/meal-plans/${mealPlan.id}/items/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: appliedMealsToBulkPayload(inContract) }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(
            typeof err.error === 'string' ? err.error : 'Failed to save plan'
          )
        }
        onApplied?.([...new Set(inContract.map((m) => m.date))].sort())
        await onSaved()
        toast.success('Plan saved.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to save plan')
        throw e
      } finally {
        setSaving(false)
      }
    },
    [mealPlan, onSaved, onApplied, toast, planStartYmd, planEnd]
  )

  return {
    savingImport: saving,
    defaultImportStart,
    earliestImportStart,
    occupiedDates,
    maxActiveMealsToAdd,
    planStartYmd,
    planEndYmd: planEnd,
    planDays: mealPlan?.days ?? 0,
    planMealsPerDay: mealPlan?.mealsPerDay ?? 0,
    planTimeSlots: effectiveTimeSlots,
    deliveryType: 'delivery' as const,
    deliveryLocation: mealPlan?.customer.deliveryArea ?? '',
    isCalendarDaySkipped,
    saveImport,
  }
}
