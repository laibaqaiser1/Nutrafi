import { addDays, format, parseISO } from 'date-fns'
import { jsWeekdayToMon1Sun7, jsWeekdayFromYmd } from '@/lib/meal-plan-skip-days'
import { wizardImportScanEndYmd, isDateWithinPlanEnd } from './suggest-start-date'
import type { AppliedImportMeal, MealPlanTemplateItemRow } from './types'

function deliveryTimeFromTimeSlot(timeSlot: string): string {
  const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
  if (!timeMatch) return ''
  const hours = parseInt(timeMatch[1]!, 10)
  const minutes = timeMatch[2]!
  return `${hours.toString().padStart(2, '0')}:${minutes}:00`
}

function templateItemKey(weekday: number, slotIndex: number): string {
  return `${weekday}-${slotIndex}`
}

function buildTemplateLookup(items: MealPlanTemplateItemRow[]): Map<string, MealPlanTemplateItemRow> {
  const map = new Map<string, MealPlanTemplateItemRow>()
  for (const row of items) {
    map.set(templateItemKey(row.weekday, row.slotIndex), row)
  }
  return map
}

function nextYmd(ymd: string): string {
  return format(addDays(parseISO(ymd), 1), 'yyyy-MM-dd')
}

function buildAppliedSlot(
  dateYmd: string,
  slotIndex: number,
  timeSlot: string,
  templateRow: MealPlanTemplateItemRow | undefined,
  deliveryType: 'delivery' | 'pickup',
  deliveryLocation: string,
  isSkipped: boolean
): AppliedImportMeal {
  const deliveryTime = deliveryTimeFromTimeSlot(timeSlot)
  if (isSkipped) {
    return {
      date: dateYmd,
      slotIndex,
      timeSlot,
      dishId: '',
      deliveryType,
      deliveryTime,
      location: deliveryLocation,
      isSkipped: true,
    }
  }
  return {
    date: dateYmd,
    slotIndex,
    timeSlot,
    dishId: templateRow?.dishId != null ? String(templateRow.dishId) : '',
    dishName: templateRow?.dishName ?? undefined,
    dishDescription: templateRow?.dishDescription ?? undefined,
    dishCategory: templateRow?.dishCategory ?? undefined,
    ingredients: templateRow?.ingredients ?? undefined,
    allergens: templateRow?.allergens ?? undefined,
    calories: templateRow?.calories ?? undefined,
    protein: templateRow?.protein ?? undefined,
    carbs: templateRow?.carbs ?? undefined,
    fats: templateRow?.fats ?? undefined,
    price: templateRow?.price ?? undefined,
    deliveryType,
    deliveryTime,
    location: deliveryLocation,
    isSkipped,
    customNote: templateRow?.customNote ?? undefined,
  }
}

export interface ApplyTemplateInput {
  templateItems: MealPlanTemplateItemRow[]
  templateMealsPerDay: number
  planMealsPerDay: number
  planTimeSlots: string[]
  planStartYmd: string
  importStartYmd: string
  /** Plan length in days — used with limitToPlanWeek to cap the scan range. */
  planDays?: number
  deliveryType: 'delivery' | 'pickup'
  deliveryLocation: string
  /** Max non-skipped meals to add (plan capacity minus existing active meals). */
  maxActiveMealsToAdd: number
  /** Dates that already have meal rows — skipped when mapping. */
  occupiedDates?: Set<string>
  /** Customer plan skip days (not template skips). */
  isCalendarDaySkipped?: (dateYmd: string) => boolean
  /** Import one 7-day template cycle from start (same week or spill past Sunday); capped by plan end. */
  limitToPlanWeek?: boolean
}

/**
 * Map template weekdays onto calendar days from import start until `maxActiveMealsToAdd`
 * active meals are placed, or through one import week when `limitToPlanWeek` is set.
 */
export function applyMealPlanTemplate(input: ApplyTemplateInput): AppliedImportMeal[] {
  const {
    templateItems,
    templateMealsPerDay,
    planMealsPerDay,
    planTimeSlots,
    planStartYmd,
    importStartYmd,
    planDays,
    deliveryType,
    deliveryLocation,
    maxActiveMealsToAdd,
    occupiedDates,
    isCalendarDaySkipped,
    limitToPlanWeek,
  } = input

  if (maxActiveMealsToAdd <= 0 || !importStartYmd) return []

  if (
    planDays != null &&
    planDays > 0 &&
    planStartYmd &&
    !isDateWithinPlanEnd(importStartYmd, planStartYmd, planDays)
  ) {
    return []
  }

  const lookup = buildTemplateLookup(templateItems)
  const out: AppliedImportMeal[] = []
  let activeAdded = 0
  let cursor = importStartYmd
  const scanLimit = limitToPlanWeek
    ? wizardImportScanEndYmd(importStartYmd, planStartYmd, planDays)
    : format(addDays(parseISO(importStartYmd), 120), 'yyyy-MM-dd')

  while (activeAdded < maxActiveMealsToAdd && cursor <= scanLimit) {
    if (
      planDays != null &&
      planDays > 0 &&
      planStartYmd &&
      !isDateWithinPlanEnd(cursor, planStartYmd, planDays)
    ) {
      break
    }

    if (occupiedDates?.has(cursor)) {
      cursor = nextYmd(cursor)
      continue
    }

    const weekday = jsWeekdayToMon1Sun7(jsWeekdayFromYmd(cursor))
    const daySkipped = isCalendarDaySkipped?.(cursor) ?? false

    if (daySkipped) {
      for (let slotIndex = 0; slotIndex < planMealsPerDay; slotIndex++) {
        const timeSlot = planTimeSlots[slotIndex] ?? planTimeSlots[0] ?? '12:00'
        let templateRow: MealPlanTemplateItemRow | undefined
        if (slotIndex < templateMealsPerDay) {
          templateRow = lookup.get(templateItemKey(weekday, slotIndex))
        }
        out.push(
          buildAppliedSlot(
            cursor,
            slotIndex,
            timeSlot,
            templateRow,
            deliveryType,
            deliveryLocation,
            true
          )
        )
      }
      cursor = nextYmd(cursor)
      continue
    }

    for (let slotIndex = 0; slotIndex < planMealsPerDay; slotIndex++) {
      if (activeAdded >= maxActiveMealsToAdd) break

      const timeSlot = planTimeSlots[slotIndex] ?? planTimeSlots[0] ?? '12:00'
      let templateRow: MealPlanTemplateItemRow | undefined
      if (slotIndex < templateMealsPerDay) {
        templateRow = lookup.get(templateItemKey(weekday, slotIndex))
      }

      out.push(
        buildAppliedSlot(
          cursor,
          slotIndex,
          timeSlot,
          templateRow,
          deliveryType,
          deliveryLocation,
          false
        )
      )
      activeAdded += 1
    }

    cursor = nextYmd(cursor)
  }

  return out
}

/** Unique sorted dates in applied meals. */
export function appliedImportDates(meals: AppliedImportMeal[]): string[] {
  return [...new Set(meals.map((m) => m.date))].sort()
}
