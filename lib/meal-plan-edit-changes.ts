import type { Prisma } from '@/lib/generated/prisma/client'
import { parseMealPlanTimeSlots } from '@/lib/meal-plan-time-slots'

export type MealPlanFieldChange = {
  field: string
  label: string
  from: string | number | null
  to: string | number | null
}

type PlanLike = {
  totalMeals: number | null
  remainingMeals: number | null
  days: number
  mealsPerDay: number
  status: string
  planType: string
  planId: number | null
  startDate: Date | string | null
  endDate: Date | string | null
  notes: string | null
  timeSlots: Prisma.JsonValue | null
  weeklySkipDays: number[]
  weeklySkipDaysByWeek: Prisma.JsonValue | null
}

function ymd(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function slotsKey(value: Prisma.JsonValue | null | undefined): string {
  return JSON.stringify(parseMealPlanTimeSlots(value))
}

function jsonKey(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function pushIfChanged(
  out: MealPlanFieldChange[],
  field: string,
  label: string,
  from: string | number | null,
  to: string | number | null
): void {
  if (from === to) return
  out.push({ field, label, from, to })
}

/** Diff plan fields for history — only entries that actually changed. */
export function buildMealPlanEditChanges(
  before: PlanLike,
  after: PlanLike,
  extras?: {
    propagatedTimeSlotsCount?: number
    appliedWeeklySkipsCount?: number
    appliedWeeklySkipsDeliveredCount?: number
  }
): MealPlanFieldChange[] {
  const changes: MealPlanFieldChange[] = []

  pushIfChanged(changes, 'totalMeals', 'Total meals', before.totalMeals, after.totalMeals)
  pushIfChanged(
    changes,
    'remainingMeals',
    'Remaining meals',
    before.remainingMeals,
    after.remainingMeals
  )
  pushIfChanged(changes, 'days', 'Days', before.days, after.days)
  pushIfChanged(changes, 'mealsPerDay', 'Meals per day', before.mealsPerDay, after.mealsPerDay)
  pushIfChanged(changes, 'status', 'Status', before.status, after.status)
  pushIfChanged(changes, 'planType', 'Plan type', before.planType, after.planType)
  pushIfChanged(changes, 'planId', 'Predefined plan', before.planId, after.planId)
  pushIfChanged(changes, 'startDate', 'Start date', ymd(before.startDate), ymd(after.startDate))
  pushIfChanged(changes, 'endDate', 'End date', ymd(before.endDate), ymd(after.endDate))

  const notesBefore = (before.notes ?? '').trim() || null
  const notesAfter = (after.notes ?? '').trim() || null
  if (notesBefore !== notesAfter) {
    changes.push({
      field: 'notes',
      label: 'Notes',
      from: notesBefore ? truncate(notesBefore, 80) : null,
      to: notesAfter ? truncate(notesAfter, 80) : null,
    })
  }

  const slotsBefore = slotsKey(before.timeSlots)
  const slotsAfter = slotsKey(after.timeSlots)
  if (slotsBefore !== slotsAfter) {
    const fromList = parseMealPlanTimeSlots(before.timeSlots)
    const toList = parseMealPlanTimeSlots(after.timeSlots)
    changes.push({
      field: 'timeSlots',
      label: 'Time slots',
      from: fromList.length ? fromList.join(', ') : null,
      to: toList.length ? toList.join(', ') : null,
    })
  }

  if (jsonKey(before.weeklySkipDays) !== jsonKey(after.weeklySkipDays)) {
    changes.push({
      field: 'weeklySkipDays',
      label: 'Weekly skip days',
      from: before.weeklySkipDays.length ? before.weeklySkipDays.join(',') : null,
      to: after.weeklySkipDays.length ? after.weeklySkipDays.join(',') : null,
    })
  }

  if (jsonKey(before.weeklySkipDaysByWeek) !== jsonKey(after.weeklySkipDaysByWeek)) {
    changes.push({
      field: 'weeklySkipDaysByWeek',
      label: 'Skip days by week',
      from: before.weeklySkipDaysByWeek == null ? null : 'updated',
      to: after.weeklySkipDaysByWeek == null ? null : 'updated',
    })
  }

  if (extras?.propagatedTimeSlotsCount && extras.propagatedTimeSlotsCount > 0) {
    changes.push({
      field: 'propagatedTimeSlots',
      label: 'Future meal times updated',
      from: null,
      to: extras.propagatedTimeSlotsCount,
    })
  }
  if (extras?.appliedWeeklySkipsCount && extras.appliedWeeklySkipsCount > 0) {
    changes.push({
      field: 'appliedWeeklySkips',
      label: 'Weekly skips applied to meals',
      from: null,
      to: extras.appliedWeeklySkipsCount,
    })
  }
  if (extras?.appliedWeeklySkipsDeliveredCount && extras.appliedWeeklySkipsDeliveredCount > 0) {
    changes.push({
      field: 'appliedWeeklySkipsDelivered',
      label: 'Delivered meals marked skipped',
      from: null,
      to: extras.appliedWeeklySkipsDeliveredCount,
    })
  }

  return changes
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

export function summarizeMealPlanEditChanges(changes: MealPlanFieldChange[]): string {
  if (changes.length === 0) return 'Plan edited (no field changes detected)'
  const parts = changes.slice(0, 4).map((c) => {
    if (c.from == null && c.to != null) return `${c.label}: ${c.to}`
    if (c.from != null && c.to == null) return `${c.label}: cleared`
    return `${c.label}: ${c.from} → ${c.to}`
  })
  const more = changes.length > 4 ? ` · +${changes.length - 4} more` : ''
  return `Plan edited · ${parts.join(' · ')}${more}`
}
