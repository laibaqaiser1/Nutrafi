'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { format } from 'date-fns'
import {
  WEEKDAY_SKIP_TOGGLES,
  mon1Sun7ToJsWeekday,
  normalizeWeeklySkipDays,
  weekdayFullName,
} from '@/lib/meal-plan-skip-days'
import {
  formatMealPlanTime12Hour,
  parseMealPlanTimeSlots,
} from '@/lib/meal-plan-time-slots'
import { MealPlanTimeSlotFields } from '@/components/meal-plans/MealPlanTimeSlotFields'
import { formatCategory } from '@/lib/utils'
import { useNotification } from '@/components/notifications/NotificationContext'

/** JS Sunday=0 … Saturday=6 — matches colored headers on customer meal plan view */
const DAY_COLORS = [
  { header: '#be185d', dayGradient: 'linear-gradient(180deg, #fce7f3 0%, #ffffff 100%)' },
  { header: '#1d4ed8', dayGradient: 'linear-gradient(180deg, #dbeafe 0%, #ffffff 100%)' },
  { header: '#15803d', dayGradient: 'linear-gradient(180deg, #dcfce7 0%, #ffffff 100%)' },
  { header: '#b91c1c', dayGradient: 'linear-gradient(180deg, #fee2e2 0%, #ffffff 100%)' },
  { header: '#0d9488', dayGradient: 'linear-gradient(180deg, #ccfbf1 0%, #ffffff 100%)' },
  { header: '#c2410c', dayGradient: 'linear-gradient(180deg, #ffedd5 0%, #ffffff 100%)' },
  { header: '#6d28d9', dayGradient: 'linear-gradient(180deg, #ede9fe 0%, #ffffff 100%)' },
]

function planTypeLabel(t: string): string {
  if (t === 'WEEKLY') return 'Weekly'
  if (t === 'MONTHLY') return 'Monthly'
  return 'Custom'
}

function skipDaysSummary(days: number[]): string {
  const norm = normalizeWeeklySkipDays(days)
  if (norm.length === 0) return 'None'
  const map = new Map(WEEKDAY_SKIP_TOGGLES.map((x) => [x.value, x.label]))
  return norm.map((d) => map.get(d) ?? String(d)).join(', ')
}

interface TemplateApi {
  id: number
  label: string
  planType: string
  days: number
  mealsPerDay: number
  timeSlots: unknown
  weeklySkipDays: number[]
  notes: string | null
  updatedAt: string
  items: Array<{
    weekday: number
    slotIndex: number
    isSkipped: boolean
    dishId: number | null
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
    customNote: string | null
  }>
}

interface Dish {
  id: string
  name: string
  category: string
  description: string | null
  ingredients: string | null
  allergens: string | null
  calories: number
  protein: number
  carbs: number
  fats: number
  price: number | null
}

type CellState = {
  dishId: string
  isSkipped: boolean
  dishName: string
  dishDescription: string
  dishCategory: string
  ingredients: string
  allergens: string
  calories: number | ''
  protein: number | ''
  carbs: number | ''
  fats: number | ''
  price: number | ''
  customNote: string
}

function emptyCell(): CellState {
  return {
    dishId: '',
    isSkipped: false,
    dishName: '',
    dishDescription: '',
    dishCategory: '',
    ingredients: '',
    allergens: '',
    calories: '',
    protein: '',
    carbs: '',
    fats: '',
    price: '',
    customNote: '',
  }
}

function cellKey(weekday: number, slotIndex: number) {
  return `${weekday}-${slotIndex}`
}

type MacroTotals = { calories: number; protein: number; carbs: number; fats: number }

function macroNum(v: number | '' | null | undefined): number {
  if (v === '' || v == null) return 0
  return Number.isFinite(v) ? v : 0
}

/** Mark every slot on skip weekdays as skipped; clear skip on other weekdays. */
function applyWeeklySkipDaysToCells(
  cells: Record<string, CellState>,
  skipDays: number[],
  mealsPerDay: number
): Record<string, CellState> {
  const skipSet = new Set(normalizeWeeklySkipDays(skipDays))
  const next = { ...cells }
  for (const { value: weekday } of WEEKDAY_SKIP_TOGGLES) {
    for (let s = 0; s < mealsPerDay; s++) {
      const k = cellKey(weekday, s)
      next[k] = { ...(next[k] ?? emptyCell()), isSkipped: skipSet.has(weekday) }
    }
  }
  return next
}

function weekdayMacros(weekday: number, mealsPerDay: number, cells: Record<string, CellState>): MacroTotals {
  return Array.from({ length: mealsPerDay }, (_, slotIndex) => cells[cellKey(weekday, slotIndex)]).reduce(
    (totals, c) => {
      if (!c || c.isSkipped) return totals
      totals.calories += macroNum(c.calories)
      totals.protein += macroNum(c.protein)
      totals.carbs += macroNum(c.carbs)
      totals.fats += macroNum(c.fats)
      return totals
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  )
}

function dishIdKey(id: string | number | null | undefined): string {
  if (id == null || id === '') return ''
  return String(id)
}

function filterDishesForSearch(dishes: Dish[], query: string): Dish[] {
  const q = query.trim().toLowerCase()
  if (!q) return dishes
  return dishes.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      formatCategory(d.category).toLowerCase().includes(q)
  )
}

export default function MealPlanTemplateDetailPage() {
  const router = useRouter()
  const params = useParams()
  const toast = useNotification()
  const idParam = params.id as string

  const [loading, setLoading] = useState(true)
  const [template, setTemplate] = useState<TemplateApi | null>(null)
  const [dishes, setDishes] = useState<Dish[]>([])

  const [label, setLabel] = useState('')
  const [planType, setPlanType] = useState<'WEEKLY' | 'MONTHLY' | 'CUSTOM'>('WEEKLY')
  const [days, setDays] = useState('')
  const [mealsPerDay, setMealsPerDay] = useState('')
  const [timeSlotInputs, setTimeSlotInputs] = useState<string[]>([''])
  const [weeklySkipDays, setWeeklySkipDays] = useState<number[]>([])
  const [notes, setNotes] = useState('')

  const [cells, setCells] = useState<Record<string, CellState>>({})
  const [dishSearchQueries, setDishSearchQueries] = useState<Record<string, string>>({})
  const [dishDropdownAnchor, setDishDropdownAnchor] = useState<{
    key: string
    weekday: number
    slotIndex: number
    top: number
    left: number
    width: number
  } | null>(null)
  const [savingDetails, setSavingDetails] = useState(false)
  const [savingMenu, setSavingMenu] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set())

  const toggleDayCollapsed = (weekday: number) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(weekday)) next.delete(weekday)
      else next.add(weekday)
      return next
    })
    setDishDropdownAnchor((anchor) => (anchor?.weekday === weekday ? null : anchor))
  }

  useEffect(() => {
    if (!dishDropdownAnchor) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target
      if (
        target instanceof Element &&
        (target.closest('.template-dish-dropdown') || target.closest('.template-dish-dropdown-portal'))
      ) {
        return
      }
      setDishDropdownAnchor(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [dishDropdownAnchor])

  useEffect(() => {
    if (!dishDropdownAnchor) return
    const close = () => setDishDropdownAnchor(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [dishDropdownAnchor])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, dRes] = await Promise.all([
        fetch(`/api/meal-plan-templates/${idParam}`, { cache: 'no-store' }),
        fetch('/api/menu?status=ACTIVE&limit=1000'),
      ])
      if (!tRes.ok) {
        if (tRes.status === 404) router.push('/meal-plans/templates')
        return
      }
      const t: TemplateApi = await tRes.json()
      setTemplate(t)
      setLabel(t.label)
      setPlanType(t.planType as typeof planType)
      setDays(String(t.days))
      setMealsPerDay(String(t.mealsPerDay))
      const slots = parseMealPlanTimeSlots(t.timeSlots)
      setTimeSlotInputs(slots.length > 0 ? slots : [''])
      setWeeklySkipDays(normalizeWeeklySkipDays(t.weeklySkipDays))
      setNotes(t.notes ?? '')

      const nextCells: Record<string, CellState> = {}
      for (const { value: w } of WEEKDAY_SKIP_TOGGLES) {
        for (let s = 0; s < t.mealsPerDay; s++) {
          nextCells[cellKey(w, s)] = emptyCell()
        }
      }
      for (const row of t.items) {
        const k = cellKey(row.weekday, row.slotIndex)
        nextCells[k] = {
          dishId: row.dishId != null ? String(row.dishId) : '',
          isSkipped: row.isSkipped,
          dishName: row.dishName ?? '',
          dishDescription: row.dishDescription ?? '',
          dishCategory: row.dishCategory ?? '',
          ingredients: row.ingredients ?? '',
          allergens: row.allergens ?? '',
          calories: row.calories ?? '',
          protein: row.protein ?? '',
          carbs: row.carbs ?? '',
          fats: row.fats ?? '',
          price: row.price ?? '',
          customNote: row.customNote ?? '',
        }
      }
      setCells(nextCells)

      if (dRes.ok) {
        const data = await dRes.json()
        const raw = Array.isArray(data.dishes) ? data.dishes : Array.isArray(data) ? data : []
        setDishes(
          raw.map((d: Dish & { id: string | number }) => ({
            ...d,
            id: dishIdKey(d.id),
          }))
        )
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to load template')
    } finally {
      setLoading(false)
    }
  }, [idParam, router, toast])

  useEffect(() => {
    void load()
  }, [load])

  const parsedMpdLive = parseInt(mealsPerDay, 10)
  const mpdNum =
    template && Number.isFinite(parsedMpdLive) && parsedMpdLive >= 1 && parsedMpdLive <= 5
      ? parsedMpdLive
      : template?.mealsPerDay ?? 0

  // Default skip weekdays → skip all meals on those days in the weekly menu.
  useEffect(() => {
    if (mpdNum < 1) return
    setCells((prev) => {
      const merged = { ...prev }
      for (const { value: weekday } of WEEKDAY_SKIP_TOGGLES) {
        for (let s = 0; s < mpdNum; s++) {
          const k = cellKey(weekday, s)
          if (!merged[k]) merged[k] = emptyCell()
        }
      }
      return applyWeeklySkipDaysToCells(merged, weeklySkipDays, mpdNum)
    })
  }, [weeklySkipDays, mpdNum])

  const prevDefaultSkipDaysRef = useRef<Set<number>>(new Set())

  // Auto-collapse days marked as default skip; expand when removed from skip list.
  useEffect(() => {
    const skipSet = new Set(normalizeWeeklySkipDays(weeklySkipDays))
    const prevSkip = prevDefaultSkipDaysRef.current
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      for (const { value: weekday } of WEEKDAY_SKIP_TOGGLES) {
        if (skipSet.has(weekday)) {
          next.add(weekday)
        } else if (prevSkip.has(weekday)) {
          next.delete(weekday)
        }
      }
      return next
    })
    prevDefaultSkipDaysRef.current = skipSet
    setDishDropdownAnchor((anchor) => {
      if (!anchor) return null
      return skipSet.has(anchor.weekday) ? null : anchor
    })
  }, [weeklySkipDays])

  const slotLabel = useCallback(
    (slotIndex: number) => {
      const slots = parseMealPlanTimeSlots(
        timeSlotInputs.filter((s) => s.trim().length > 0).length > 0 ? timeSlotInputs : ['']
      )
      const eff = slots.filter((s) => s.trim().length > 0)
      if (eff.length === 0) return `Meal ${slotIndex + 1}`
      const t = eff[slotIndex % eff.length]!
      return formatMealPlanTime12Hour(t)
    },
    [timeSlotInputs]
  )

  const updateCell = (weekday: number, slotIndex: number, patch: Partial<CellState>) => {
    const k = cellKey(weekday, slotIndex)
    setCells((prev) => ({
      ...prev,
      [k]: { ...(prev[k] ?? emptyCell()), ...patch },
    }))
  }

  const onPickDish = (weekday: number, slotIndex: number, dishIdStr: string) => {
    if (!dishIdStr) {
      updateCell(weekday, slotIndex, {
        dishId: '',
        dishName: '',
        dishDescription: '',
        dishCategory: '',
        ingredients: '',
        allergens: '',
        calories: '',
        protein: '',
        carbs: '',
        fats: '',
        price: '',
      })
      return
    }
    const d = dishes.find((x) => dishIdKey(x.id) === dishIdStr)
    if (!d) return
    updateCell(weekday, slotIndex, {
      dishId: dishIdKey(d.id),
      dishName: d.name,
      dishDescription: d.description ?? '',
      dishCategory: d.category,
      ingredients: d.ingredients ?? '',
      allergens: d.allergens ?? '',
      calories: d.calories,
      protein: d.protein,
      carbs: d.carbs,
      fats: d.fats,
      price: d.price ?? '',
    })
  }

  const saveDetails = async () => {
    const d = parseInt(days, 10)
    const mpd = parseInt(mealsPerDay, 10)
    if (!label.trim()) {
      toast.warning('Label is required.')
      return
    }
    if (!Number.isFinite(d) || d < 1) {
      toast.warning('Invalid days.')
      return
    }
    if (!Number.isFinite(mpd) || mpd < 1 || mpd > 5) {
      toast.warning('Meals per day must be 1–5.')
      return
    }
    const slots = timeSlotInputs.map((s) => s.trim()).filter((s) => s.length > 0)
    if (slots.length === 0) {
      toast.warning('Add at least one time slot.')
      return
    }

    setSavingDetails(true)
    try {
      const res = await fetch(`/api/meal-plan-templates/${idParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          planType,
          days: d,
          mealsPerDay: mpd,
          timeSlots: slots,
          weeklySkipDays,
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Plan details saved.')
      await load()
    } catch {
      toast.error('Could not save plan details.')
    } finally {
      setSavingDetails(false)
    }
  }

  const saveMenu = async () => {
    if (!template) return
    const parsedMpd = parseInt(mealsPerDay, 10)
    const mpd =
      Number.isFinite(parsedMpd) && parsedMpd >= 1 && parsedMpd <= 5 ? parsedMpd : template.mealsPerDay
    const payload: Record<string, unknown>[] = []

    for (const { value: weekday } of WEEKDAY_SKIP_TOGGLES) {
      for (let slotIndex = 0; slotIndex < mpd; slotIndex++) {
        const c = cells[cellKey(weekday, slotIndex)] ?? emptyCell()
        const hasDish = c.dishId !== '' || (c.dishName?.trim() ?? '') !== ''
        if (!c.isSkipped && !hasDish) continue

        const dishId =
          c.dishId !== '' && !Number.isNaN(parseInt(c.dishId, 10)) ? parseInt(c.dishId, 10) : null

        payload.push({
          weekday,
          slotIndex,
          isSkipped: c.isSkipped,
          dishId,
          dishName: c.dishName?.trim() || null,
          dishDescription: c.dishDescription?.trim() || null,
          dishCategory: c.dishCategory?.trim() || null,
          ingredients: c.ingredients?.trim() || null,
          allergens: c.allergens?.trim() || null,
          calories: c.calories === '' ? null : Number(c.calories),
          protein: c.protein === '' ? null : Number(c.protein),
          carbs: c.carbs === '' ? null : Number(c.carbs),
          fats: c.fats === '' ? null : Number(c.fats),
          price: c.price === '' ? null : Number(c.price),
          customNote: c.customNote?.trim() || null,
        })
      }
    }

    setSavingMenu(true)
    try {
      const res = await fetch(`/api/meal-plan-templates/${idParam}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Weekly menu saved.')
      await load()
    } catch {
      toast.error('Could not save menu.')
    } finally {
      setSavingMenu(false)
    }
  }

  const confirmDelete = async () => {
    if (!window.confirm('Delete this default plan? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/meal-plan-templates/${idParam}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      router.push('/meal-plans/templates')
    } catch {
      toast.error('Could not delete.')
    } finally {
      setDeleting(false)
    }
  }

  const dayBlocks = useMemo(() => {
    if (!template || mpdNum < 1) return []
    return WEEKDAY_SKIP_TOGGLES.map(({ value: weekday }) => {
      const ci = mon1Sun7ToJsWeekday(weekday)
      const colors = DAY_COLORS[ci] ?? DAY_COLORS[0]!
      const rows = []
      for (let s = 0; s < mpdNum; s++) {
        rows.push({ slotIndex: s, key: cellKey(weekday, s) })
      }
      return { dayLabel: weekdayFullName(weekday), weekday, colors, rows }
    })
  }, [template, mpdNum])

  if (loading && !template) {
    return <div className="text-center py-8 text-sm">Loading…</div>
  }

  if (!template) {
    return null
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start mb-4 lg:mb-6">
        <div>
          <h1 className="text-lg lg:text-2xl font-bold text-gray-900">{template.label}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveMenu}
            disabled={savingMenu}
            className="px-3 py-1.5 lg:px-4 lg:py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50 text-sm"
          >
            {savingMenu ? 'Saving…' : 'Save menu'}
          </button>
          <Link
            href="/meal-plans/templates"
            className="px-3 py-1.5 lg:px-4 lg:py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 text-sm inline-flex items-center"
          >
            Back
          </Link>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting}
            className="px-3 py-1.5 lg:px-4 lg:py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 text-sm"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Plan information — same structure as customer Meal Plan Information */}
      <div className="bg-white shadow rounded-lg p-3 lg:p-5 mb-3 lg:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h2 className="text-base lg:text-lg font-semibold text-gray-900">Plan information</h2>
          <button
            type="button"
            onClick={saveDetails}
            disabled={savingDetails}
            className="px-3 py-1.5 text-sm bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50 w-fit"
          >
            {savingDetails ? 'Saving…' : 'Save details'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="text-xs font-medium text-gray-500">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Plan type</label>
            <select
              value={planType}
              onChange={(e) => setPlanType(e.target.value as typeof planType)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Updated</label>
            <p className="text-sm text-gray-900 mt-2">{format(new Date(template.updatedAt), 'MMM dd, yyyy HH:mm')}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Days</label>
            <input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Meals per day</label>
            <input
              type="number"
              min={1}
              max={5}
              value={mealsPerDay}
              onChange={(e) => setMealsPerDay(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Default skip weekdays</label>
            <p className="text-sm text-gray-900 mt-2">{skipDaysSummary(weeklySkipDays)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAY_SKIP_TOGGLES.map(({ label: lb, value }) => {
                const on = weeklySkipDays.includes(value)
                return (
                  <label key={value} className="flex items-center gap-1.5 text-xs text-gray-800">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-nutrafi-primary"
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
          <div className="md:col-span-3">
            <MealPlanTimeSlotFields
              slots={timeSlotInputs}
              onChange={setTimeSlotInputs}
              label="Default time slots"
              labelClassName="text-xs font-medium text-gray-500"
              maxWidthClassName="max-w-md"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-medium text-gray-500">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div className="md:col-span-3 text-xs text-gray-500">
            {planTypeLabel(planType)} · {days} days · {mealsPerDay} meals/day
          </div>
        </div>
      </div>

      {/* Meal schedule — weekday sections with colored headers */}
      <div className="bg-white shadow rounded-lg p-3 lg:p-5">
        <h2 className="text-base lg:text-lg font-semibold text-gray-900 mb-4">Weekly menu</h2>
        <div className="space-y-4">
          {dayBlocks.map(({ dayLabel, weekday, colors, rows }) => {
            const isCollapsed = collapsedDays.has(weekday)
            const isDefaultSkipDay = normalizeWeeklySkipDays(weeklySkipDays).includes(weekday)
            return (
            <div
              key={weekday}
              className="border border-gray-200 rounded-lg overflow-hidden"
              style={{ background: colors.dayGradient }}
            >
              <button
                type="button"
                onClick={() => toggleDayCollapsed(weekday)}
                className="w-full px-3 py-2 flex flex-wrap items-center justify-between gap-2 lg:gap-3 text-left hover:opacity-95 transition-opacity"
                style={{ backgroundColor: colors.header }}
                aria-expanded={!isCollapsed}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg
                    className={`w-4 h-4 shrink-0 text-white transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-sm font-semibold text-white">{dayLabel}</span>
                  {isDefaultSkipDay ? (
                    <span className="text-xs font-medium text-white/90 bg-white/20 px-1.5 py-0.5 rounded">
                      Skipped
                    </span>
                  ) : null}
                </div>
                {(() => {
                  const macros = weekdayMacros(weekday, mpdNum, cells)
                  if (macros.calories <= 0) return null
                  return (
                    <div
                      className="flex flex-wrap items-center gap-2 lg:gap-3 text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="font-bold text-base text-gray-900 px-3 py-1.5 rounded bg-white">
                        {macros.calories} kcal
                      </span>
                      <span className="font-bold text-white">
                        P: {macros.protein.toFixed(1)}g | C: {macros.carbs.toFixed(1)}g | F: {macros.fats.toFixed(1)}g
                      </span>
                    </div>
                  )
                })()}
              </button>
              {!isCollapsed ? (
              <div className="p-3 space-y-3 bg-white/80">
                {rows.map(({ slotIndex, key }) => {
                  const c = cells[key] ?? emptyCell()
                  return (
                    <div
                      key={key}
                      className="flex flex-col lg:flex-row lg:items-end gap-2 lg:gap-4 border-b border-gray-100 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="lg:w-36 shrink-0">
                        <span className="text-xs font-medium text-gray-500">{slotLabel(slotIndex)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="text-xs text-gray-500">Dish</label>
                        {(() => {
                          const isOpen = dishDropdownAnchor?.key === key
                          const selected = dishes.find((d) => dishIdKey(d.id) === dishIdKey(c.dishId))
                          return (
                            <div className="relative template-dish-dropdown mt-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  if (isOpen) {
                                    setDishDropdownAnchor(null)
                                    setDishSearchQueries((prev) => ({ ...prev, [key]: '' }))
                                    return
                                  }
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  setDishDropdownAnchor({
                                    key,
                                    weekday,
                                    slotIndex,
                                    top: rect.bottom + 4,
                                    left: rect.left,
                                    width: rect.width,
                                  })
                                }}
                                className="w-full px-2 py-2 text-sm border border-gray-300 rounded-md bg-white text-left flex items-center justify-between gap-2 focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                              >
                                <span className={selected ? 'text-gray-900 truncate' : 'text-gray-500'}>
                                  {selected
                                    ? `${selected.name} (${formatCategory(selected.category)})`
                                    : '— Select dish —'}
                                </span>
                                <svg
                                  className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  aria-hidden
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                          )
                        })()}
                      </div>
                      <label className="flex items-center gap-2 text-sm text-gray-800 shrink-0">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-nutrafi-primary"
                          checked={c.isSkipped}
                          onChange={(e) => updateCell(weekday, slotIndex, { isSkipped: e.target.checked })}
                        />
                        Skip slot
                      </label>
                    </div>
                  )
                })}
              </div>
              ) : null}
            </div>
          )
          })}
        </div>
      </div>

      {dishDropdownAnchor &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const anchor = dishDropdownAnchor
            const cell = cells[anchor.key] ?? emptyCell()
            const searchQuery = dishSearchQueries[anchor.key] ?? ''
            const filtered = filterDishesForSearch(dishes, searchQuery)
            const closeDropdown = () => {
              setDishDropdownAnchor(null)
              setDishSearchQueries((prev) => ({ ...prev, [anchor.key]: '' }))
            }
            return (
              <div
                className="template-dish-dropdown-portal fixed z-[300] bg-white border border-gray-300 rounded-md shadow-xl min-w-[220px] max-h-[70vh] flex flex-col"
                style={{
                  top: anchor.top,
                  left: anchor.left,
                  width: Math.max(anchor.width, 220),
                }}
              >
                <div className="p-2 border-b border-gray-200 shrink-0 bg-white">
                  <input
                    type="text"
                    placeholder="Search dishes..."
                    value={searchQuery}
                    onChange={(e) =>
                      setDishSearchQueries((prev) => ({ ...prev, [anchor.key]: e.target.value }))
                    }
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary bg-white"
                    autoFocus
                  />
                </div>
                <div className="overflow-auto flex-1 min-h-0 max-h-[280px]">
                  <button
                    type="button"
                    onClick={() => {
                      onPickDish(anchor.weekday, anchor.slotIndex, '')
                      closeDropdown()
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                      !cell.dishId ? 'bg-nutrafi-primary/10 text-nutrafi-primary font-medium' : 'text-gray-600'
                    }`}
                  >
                    — Clear selection —
                  </button>
                  {filtered.length > 0 ? (
                    filtered.slice(0, 8).map((d) => (
                      <button
                        key={dishIdKey(d.id)}
                        type="button"
                        onClick={() => {
                          onPickDish(anchor.weekday, anchor.slotIndex, dishIdKey(d.id))
                          closeDropdown()
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                          dishIdKey(d.id) === dishIdKey(cell.dishId)
                            ? 'bg-nutrafi-primary/10 text-nutrafi-primary font-medium'
                            : 'text-gray-900'
                        }`}
                      >
                        {d.name} ({formatCategory(d.category)})
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-500">No dishes found</div>
                  )}
                  {filtered.length > 8 && (
                    <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100">
                      Showing 8 of {filtered.length} — refine your search
                    </div>
                  )}
                </div>
              </div>
            )
          })(),
          document.body
        )}
    </div>
  )
}
