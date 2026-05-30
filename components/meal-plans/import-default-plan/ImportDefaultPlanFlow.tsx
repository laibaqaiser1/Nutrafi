'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { applyMealPlanTemplate } from '@/lib/import-default-plan/apply-template'
import { clampImportStartYmd, planEndYmd } from '@/lib/import-default-plan/suggest-start-date'
import { formatTemplateListSubtitle } from '@/lib/import-default-plan/template-label'
import type {
  AppliedImportMeal,
  MealPlanTemplateDetail,
  MealPlanTemplateListRow,
} from '@/lib/import-default-plan/types'
import { ImportPreviewGrid } from './ImportPreviewGrid'
import type { MenuDishOption } from './import-meal-edit-helpers'

type FlowStep = 'list' | 'preview'

export interface ImportDefaultPlanFlowProps {
  open: boolean
  onClose: () => void
  planStartYmd: string
  planDays: number
  planMealsPerDay: number
  planTimeSlots: string[]
  deliveryType: 'delivery' | 'pickup'
  deliveryLocation: string
  defaultImportStartYmd: string
  /** Last calendar day of the plan contract (inclusive). */
  planEndYmd?: string
  /** First date without existing meals (import cannot start on occupied dates). */
  earliestImportStartYmd?: string
  occupiedDates?: Set<string>
  maxActiveMealsToAdd?: number
  isCalendarDaySkipped?: (dateYmd: string) => boolean
  /** One 7-day template cycle from import start (wizard and meal plan view). */
  limitToPlanWeek?: boolean
  applyButtonLabel?: string
  saving?: boolean
  onApply: (meals: AppliedImportMeal[], importStartYmd: string) => void | Promise<void>
}

export function ImportDefaultPlanFlow({
  open,
  onClose,
  planStartYmd,
  planDays,
  planMealsPerDay,
  planTimeSlots,
  deliveryType,
  deliveryLocation,
  defaultImportStartYmd,
  planEndYmd: planEndProp,
  earliestImportStartYmd,
  occupiedDates,
  maxActiveMealsToAdd = 0,
  isCalendarDaySkipped,
  limitToPlanWeek = false,
  applyButtonLabel = 'Apply to plan',
  saving = false,
  onApply,
}: ImportDefaultPlanFlowProps) {
  const [step, setStep] = useState<FlowStep>('list')
  const [templates, setTemplates] = useState<MealPlanTemplateListRow[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [selected, setSelected] = useState<MealPlanTemplateDetail | null>(null)
  const [importStart, setImportStart] = useState(defaultImportStartYmd)
  const [error, setError] = useState<string | null>(null)
  const [editableMeals, setEditableMeals] = useState<AppliedImportMeal[]>([])
  const [dishes, setDishes] = useState<MenuDishOption[]>([])
  const [applying, setApplying] = useState(false)

  const minStart = earliestImportStartYmd || planStartYmd
  const occupied = occupiedDates ?? new Set<string>()
  const planEnd =
    planEndProp ||
    (planDays > 0 && planStartYmd ? planEndYmd(planStartYmd, planDays) : '')

  useEffect(() => {
    if (!open) return
    setStep('list')
    setSelected(null)
    setImportStart(defaultImportStartYmd)
    setError(null)
    setLoadingList(true)
    fetch('/api/meal-plan-templates', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingList(false))
  }, [open, defaultImportStartYmd])

  const effectiveStart = useMemo(() => {
    if (!importStart || !planStartYmd) return ''
    return clampImportStartYmd(importStart, planStartYmd, occupied, planEnd || null)
  }, [importStart, planStartYmd, occupied, planEnd])

  const previewMeals = useMemo(() => {
    if (!selected || !effectiveStart || !planStartYmd || maxActiveMealsToAdd <= 0) return []
    const meals = applyMealPlanTemplate({
      templateItems: selected.items,
      templateMealsPerDay: selected.mealsPerDay,
      planMealsPerDay,
      planTimeSlots,
      planStartYmd,
      importStartYmd: effectiveStart,
      planDays,
      deliveryType,
      deliveryLocation,
      maxActiveMealsToAdd,
      occupiedDates: occupied,
      isCalendarDaySkipped,
      limitToPlanWeek,
    })
    if (!planEnd) return meals
    return meals.filter((m) => m.date.slice(0, 10) <= planEnd)
  }, [
    selected,
    effectiveStart,
    planStartYmd,
    planDays,
    planMealsPerDay,
    planTimeSlots,
    deliveryType,
    deliveryLocation,
    maxActiveMealsToAdd,
    occupied,
    isCalendarDaySkipped,
    limitToPlanWeek,
    planEnd,
  ])

  useEffect(() => {
    setEditableMeals(previewMeals)
  }, [previewMeals])

  useEffect(() => {
    if (!open || step !== 'preview') return
    fetch('/api/menu?status=ACTIVE&limit=1000', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list = Array.isArray(data?.dishes) ? data.dishes : Array.isArray(data) ? data : []
        setDishes(
          list.map((d: MenuDishOption & { id: string | number }) => ({
            ...d,
            id: String(d.id),
          }))
        )
      })
      .catch(() => setDishes([]))
  }, [open, step])

  const displayMeals = editableMeals.length > 0 ? editableMeals : previewMeals
  const activePreviewCount = displayMeals.filter((m) => !m.isSkipped).length

  const selectTemplate = async (row: MealPlanTemplateListRow) => {
    setLoadingDetail(true)
    setError(null)
    try {
      const res = await fetch(`/api/meal-plan-templates/${row.id}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load template')
      const detail: MealPlanTemplateDetail = await res.json()
      setSelected(detail)
      setImportStart(clampImportStartYmd(defaultImportStartYmd, planStartYmd, occupied, planEnd || null))
      setStep('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load template')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleApply = async () => {
    if (!selected || displayMeals.length === 0 || applying || saving) return
    setApplying(true)
    setError(null)
    try {
      await onApply(displayMeals, effectiveStart)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save plan')
    } finally {
      setApplying(false)
    }
  }

  const isSaving = applying || saving

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-default-plan-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 id="import-default-plan-title" className="text-lg font-semibold text-gray-900">
            {step === 'list' ? 'Import default plan' : selected?.label ?? 'Preview'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error ? (
            <p className="text-sm text-red-600 mb-3">{error}</p>
          ) : null}

          {step === 'list' && (
            <>
              {loadingList ? (
                <p className="text-sm text-gray-500">Loading templates…</p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-gray-500">No default plans yet.</p>
              ) : (
                <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
                  {templates.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        disabled={loadingDetail || maxActiveMealsToAdd <= 0}
                        onClick={() => void selectTemplate(row)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <div className="font-medium text-gray-900">{row.label}</div>
                        <div className="text-sm text-gray-500 mt-0.5">
                          {formatTemplateListSubtitle(row)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {maxActiveMealsToAdd <= 0 && !loadingList && (
                <p className="text-sm text-amber-800 mt-3">
                  This plan has no remaining meal slots to import.
                </p>
              )}
            </>
          )}

          {step === 'preview' && selected && (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Import start date
              </label>
              <input
                type="date"
                value={importStart}
                min={minStart}
                max={planEnd || undefined}
                onChange={(e) => setImportStart(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3"
              />
              {!defaultImportStartYmd && planEnd ? (
                <p className="text-xs text-amber-800 mb-3">
                  This plan is filled through {format(parseISO(`${planEnd}T12:00:00`), 'MMM d, yyyy')}.
                  Extend plan days to import more meals.
                </p>
              ) : null}
              {effectiveStart !== importStart && importStart && !effectiveStart && (
                <p className="text-xs text-amber-800 mb-3">
                  {planEnd
                    ? `Import cannot start after ${format(parseISO(`${planEnd}T12:00:00`), 'MMM d, yyyy')} (plan end).`
                    : 'No valid import start date for this plan.'}
                </p>
              )}
              {effectiveStart !== importStart && importStart && effectiveStart && (
                <p className="text-xs text-amber-800 mb-3">
                  Start adjusted to {format(parseISO(`${effectiveStart}T12:00:00`), 'MMM d, yyyy')} (date already
                  has meals).
                </p>
              )}
              <ImportPreviewGrid
                meals={displayMeals}
                mealsPerDay={planMealsPerDay}
                editable
                defaultLocation={deliveryLocation}
                dishes={dishes}
                onMealsChange={setEditableMeals}
              />
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex justify-between gap-2 shrink-0">
          {step === 'preview' ? (
            <button
              type="button"
              onClick={() => {
                setStep('list')
                setSelected(null)
              }}
              className="px-3 py-1.5 text-sm bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              Back
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            {step === 'preview' && (
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={displayMeals.length === 0 || activePreviewCount === 0 || isSaving}
                className="px-3 py-1.5 text-sm bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : applyButtonLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
