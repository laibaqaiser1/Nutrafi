'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format, addDays, eachDayOfInterval } from 'date-fns'
import {
  getPlanWeekNumber as getWeekNumber,
  getMondayOfPlanWeek,
  nextMissingDayInPlanWeek,
  dayOffsetBetweenPlanWeeks,
  planWeekDayStringsOnOrAfterStart,
} from '@/lib/meal-plan-weeks'
import { formatCategory } from '@/lib/utils'
import { parseMealPlanTimeSlots } from '@/lib/meal-plan-time-slots'
import {
  jsWeekdayFromYmd,
  jsWeekdayToMon1Sun7,
  normalizeWeeklySkipDays,
  parseWeeklySkipDaysByWeekJson,
  shouldSkipCalendarDay,
  WEEKDAY_SKIP_TOGGLES,
} from '@/lib/meal-plan-skip-days'
import { useNotification } from '@/components/notifications/NotificationContext'
import { DeleteMealPlanButton } from '@/components/meal-plans/DeleteMealPlanButton'
import { CustomerInstructionsBanner } from '@/components/customers/CustomerInstructionsBanner'

interface MealPlan {
  id: string
  customer: {
    id: string
    fullName: string
    phone: string
    email: string | null
    deliveryArea: string
    address: string
    instructions?: string | null
  }
  plan: {
    id: string
    name: string
    price: number
  } | null
  planType: string
  days: number
  startDate: string
  endDate: string
  mealsPerDay: number
  /** Plan-level default times (JSON array), applied to new items */
  timeSlots?: unknown
  /** Plan default skip weekdays (1=Mon … 7=Sun); weeks may override in `weeklySkipDaysByWeek` */
  weeklySkipDays?: number[]
  weeklySkipDaysByWeek?: unknown
  status: string
  notes: string | null
  baseAmount: number | null
  vatAmount: number | null
  totalAmount: number | null
  totalMeals: number | null
  remainingMeals: number | null
  averageMealRate: number | null
  mealPlanItems: Array<{
    id: string
    date: string
    timeSlot: string
    dishId: string | null
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
    deliveryTime: string | null
    deliveryType: string | null
    deliveryLocation: string | null
    isSkipped: boolean
    isDelivered: boolean
    wrongDelivery?: boolean
    deliveredAt: string | null
    customNote: string | null
  }>
  payments: Array<{
    id: string
    amount: number
    paymentDate: string
    paymentMethod: string | null
    status: string
    notes: string | null
  }>
}

/** Skipped and wrong-delivery rows do not count toward caps or schedule nutrition. */
function itemCountsForPlanSchedule(item: { isSkipped: boolean; wrongDelivery?: boolean }): boolean {
  return !item.isSkipped && !item.wrongDelivery
}

/** Rows that count toward total meal slots and per-day limits (excludes skipped + wrong delivery). */
function countActiveMealSlots(items: { isSkipped: boolean; wrongDelivery?: boolean }[]): number {
  return items.filter(itemCountsForPlanSchedule).length
}

/** Days with at least one counting meal toward the plan day budget. */
function countUniqueActiveDays(
  items: { date: string; isSkipped: boolean; wrongDelivery?: boolean }[]
): number {
  const days = new Set<string>()
  for (const item of items) {
    if (itemCountsForPlanSchedule(item)) {
      days.add(format(new Date(item.date), 'yyyy-MM-dd'))
    }
  }
  return days.size
}

/** Effective skip weekdays: explicit per-week draft, else plan default (`weeklySkipDays`). */
function getSkipDaysForWeekFromDraft(
  planWeek: number,
  byWeekDraft: Record<number, number[]>,
  planDefaultSkipDays: number[]
): number[] {
  const def = normalizeWeeklySkipDays(planDefaultSkipDays)
  if (byWeekDraft[planWeek] !== undefined) {
    return normalizeWeeklySkipDays(byWeekDraft[planWeek]!)
  }
  return [...def]
}

function formatPlanDefaultSkipDayLabels(days: number[] | null | undefined): string {
  const norm = normalizeWeeklySkipDays(days)
  if (norm.length === 0) return 'None'
  const labelByVal = new Map(WEEKDAY_SKIP_TOGGLES.map((t) => [t.value, t.label]))
  return norm.map((d) => labelByVal.get(d) ?? String(d)).join(', ')
}

/** Stable JSON for comparing skip settings (avoids duplicate PUTs). */
function skipSettingsPayloadJson(
  visibleWeeksList: number[],
  weeklySkipByWeekDraft: Record<number, number[]>,
  planDefaultSkipDays: number[]
): string {
  const planNorm = normalizeWeeklySkipDays(planDefaultSkipDays)
  const sortedWeeks = [...visibleWeeksList].filter((w) => w > 0).sort((a, b) => a - b)
  const persistByWeek: Record<string, number[]> = {}
  for (const w of sortedWeeks) {
    persistByWeek[String(w)] = normalizeWeeklySkipDays(weeklySkipByWeekDraft[w] ?? planNorm)
  }
  return JSON.stringify({
    weeklySkipDaysByWeek: persistByWeek,
  })
}

function itemDateMatchesDraftSkipPattern(
  dateStr: string,
  planStartDate: string,
  byWeekDraft: Record<number, number[]>,
  planDefaultSkipDays: number[]
): boolean {
  const ymd = format(new Date(dateStr), 'yyyy-MM-dd')
  const mon = jsWeekdayToMon1Sun7(jsWeekdayFromYmd(ymd))
  const wk = getWeekNumber(dateStr, planStartDate)
  const pattern = getSkipDaysForWeekFromDraft(wk, byWeekDraft, planDefaultSkipDays)
  const set = new Set(pattern)
  return set.size > 0 && set.has(mon)
}

function countDeliveredItemsMatchingDraftSkipPattern(
  mp: MealPlan,
  d: {
    weeklySkipByWeekDraft: Record<number, number[]>
    planDefaultSkipDays: number[]
  }
): number {
  let n = 0
  for (const item of mp.mealPlanItems) {
    if (!item.isDelivered || item.isSkipped) continue
    if (
      itemDateMatchesDraftSkipPattern(
        item.date,
        mp.startDate,
        d.weeklySkipByWeekDraft,
        d.planDefaultSkipDays
      )
    ) {
      n += 1
    }
  }
  return n
}

interface Dish {
  id: string
  name: string
  description: string | null
  category: string
  ingredients: string | null
  allergens: string | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fats: number | null
  price: number | null
}

export default function MealPlanViewPage() {
  const router = useRouter()
  const params = useParams()
  const toast = useNotification()
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<MealPlan['mealPlanItems'][0] | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [dishes, setDishes] = useState<Dish[]>([])
  const [editingDish, setEditingDish] = useState(false)
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set())
  const [visibleWeeks, setVisibleWeeks] = useState<number[]>([])
  const [addingWeek, setAddingWeek] = useState(false)
  const [dishFormData, setDishFormData] = useState({
    dishId: '',
    dishName: '',
    dishDescription: '',
    dishCategory: 'BREAKFAST',
    ingredients: '',
    allergens: '',
    calories: '',
    protein: '',
    carbs: '',
    fats: '',
    price: '',
    deliveryType: 'delivery' as 'delivery' | 'pickup',
    deliveryTime: '',
    location: '',
    customNote: '',
  })
  const [savingDish, setSavingDish] = useState(false)
  const [skippingMeal, setSkippingMeal] = useState(false)
  const [removingDay, setRemovingDay] = useState(false)
  const [settingWrongDelivery, setSettingWrongDelivery] = useState(false)
  const [dishDropdownOpen, setDishDropdownOpen] = useState(false)
  const [dishSearchQuery, setDishSearchQuery] = useState('')
  const [showDishDetails, setShowDishDetails] = useState(false)
  const [visibleDaysByWeek, setVisibleDaysByWeek] = useState<Record<number, string[]>>({})
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [downloadingWeekPdf, setDownloadingWeekPdf] = useState<number | null>(null)
  const [dayMenuOpen, setDayMenuOpen] = useState<{ week: number; date: string } | null>(null)
  const [weekMenuOpen, setWeekMenuOpen] = useState<number | null>(null)
  const [addingDay, setAddingDay] = useState(false)
  const [duplicatingWeek, setDuplicatingWeek] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [itemDateEdit, setItemDateEdit] = useState('')
  const [savingDate, setSavingDate] = useState(false)
  const [weeklySkipByWeekDraft, setWeeklySkipByWeekDraft] = useState<Record<number, number[]>>({})
  /** Which week header shows “Saving…” while skip autosave runs; null = none. */
  const [savingWeeklySkipsForWeek, setSavingWeeklySkipsForWeek] = useState<number | null>(null)
  const [weeklySkipDeliveredModalCount, setWeeklySkipDeliveredModalCount] = useState<number | null>(null)
  const [savingWeeklyDeliveredFollowUp, setSavingWeeklyDeliveredFollowUp] = useState(false)
  const lastPersistedSkipJsonRef = useRef<string | null>(null)
  const visibleWeeksRef = useRef<number[]>([])
  const weeklySkipLastEditWeekRef = useRef<number | null>(null)
  const skipAutosaveDraftRef = useRef({
    weeklySkipByWeekDraft,
    visibleWeeks: [] as number[],
    planDefaultSkipDays: [] as number[],
  })
  const mealPlanIdRef = useRef<string | null>(null)
  const mealPlanRef = useRef<MealPlan | null>(null)
  const weeklySkipDeliveredFollowUpRef = useRef<{
    mpId: string
    payloadJson: string
    body: { weeklySkipDaysByWeek: Record<string, number[]> }
  } | null>(null)
  const fetchMealPlanRef = useRef<(id: string) => Promise<MealPlan | undefined>>(async () => {
    return undefined
  })

  const planDefaultSkipDaysNorm = normalizeWeeklySkipDays(mealPlan?.weeklySkipDays)

  const getSkipDaysForPlanWeek = (planWeek: number) =>
    getSkipDaysForWeekFromDraft(planWeek, weeklySkipByWeekDraft, planDefaultSkipDaysNorm)

  useEffect(() => {
    if (params.id) {
      fetchMealPlan(params.id as string)
      fetchDishes()
    }
  }, [params.id])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (dishDropdownOpen) {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement
        if (!target.closest('.dish-dropdown-container')) {
          setDishDropdownOpen(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [dishDropdownOpen])

  // Close dish dropdown when user scrolls (avoids dropdown staying in wrong place)
  useEffect(() => {
    if (!dishDropdownOpen) return
    const handleScroll = () => setDishDropdownOpen(false)
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [dishDropdownOpen])

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.day-menu-container') && !target.closest('.week-menu-container') && !target.closest('.actions-menu-container')) {
        setDayMenuOpen(null)
        setWeekMenuOpen(null)
        setActionsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const fetchDishes = async () => {
    try {
      const response = await fetch('/api/menu?status=ACTIVE&limit=1000')
      if (response.ok) {
        const data = await response.json()
        setDishes(Array.isArray(data.dishes) ? data.dishes : [])
      }
    } catch (error) {
      console.error('Error fetching dishes:', error)
    }
  }

  const fetchMealPlan = async (id: string) => {
    try {
      const response = await fetch(`/api/meal-plans/${id}`, { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        lastPersistedSkipJsonRef.current = null
        setMealPlan(data)
        const globalSkip = normalizeWeeklySkipDays(data.weeklySkipDays)
        const parsedByWeek = parseWeeklySkipDaysByWeekJson(data.weeklySkipDaysByWeek)

        // Initialize visible weeks and days based on existing meal items
        if (data.mealPlanItems && data.mealPlanItems.length > 0) {
          const weeks = new Set<number>()
          const daysByWeek: Record<number, Set<string>> = {}
          
          data.mealPlanItems.forEach((item: MealPlan['mealPlanItems'][0]) => {
            const week = getWeekNumber(item.date, data.startDate)
            if (week > 0) {
              weeks.add(week)
              const date = format(new Date(item.date), 'yyyy-MM-dd')
              if (!daysByWeek[week]) {
                daysByWeek[week] = new Set()
              }
              daysByWeek[week].add(date)
            }
          })
          
          const weeksArray = Array.from(weeks).sort((a, b) => a - b)
          const mergedByWeek: Record<number, number[]> = {}
          for (const w of weeksArray) {
            const fromDb = parsedByWeek[String(w)]
            mergedByWeek[w] =
              fromDb !== undefined ? normalizeWeeklySkipDays(fromDb) : [...globalSkip]
          }
          setWeeklySkipByWeekDraft(mergedByWeek)
          setVisibleWeeks(weeksArray)
          
          // For existing meal plans, we don't restrict visible days - show all days that have items
          // Only use visibleDaysByWeek for newly added weeks (tracked separately)
          // We'll leave visibleDaysByWeek empty for existing plans so they show all days
          
          // Only expand the last week by default
          if (weeksArray.length > 0) {
            const lastWeek = Math.max(...weeksArray)
            setExpandedWeeks(new Set([lastWeek]))
          }
        } else {
          // If no items, start with week 1
          setVisibleWeeks([1])
          setExpandedWeeks(new Set([1]))
          setVisibleDaysByWeek({})
          setWeeklySkipByWeekDraft({
            1: [...globalSkip],
          })
        }

        return data as MealPlan
      } else {
        toast.error('Failed to fetch meal plan')
        router.push('/meal-plans')
      }
    } catch (error) {
      console.error('Error fetching meal plan:', error)
      toast.error('Failed to fetch meal plan')
    } finally {
      setLoading(false)
    }
  }

  fetchMealPlanRef.current = fetchMealPlan
  visibleWeeksRef.current = visibleWeeks
  skipAutosaveDraftRef.current = {
    weeklySkipByWeekDraft,
    visibleWeeks,
    planDefaultSkipDays: normalizeWeeklySkipDays(mealPlan?.weeklySkipDays),
  }
  mealPlanIdRef.current = mealPlan?.id ?? null
  mealPlanRef.current = mealPlan

  async function persistWeeklySkipPayload(
    mpId: string,
    body: { weeklySkipDaysByWeek: Record<string, number[]> },
    includeDelivered: boolean
  ): Promise<{ ok: boolean; errorMsg?: string }> {
    const res = await fetch(`/api/meal-plans/${mpId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        applyWeeklySkipsToExistingItems: true,
        applyWeeklySkipsToDeliveredItems: includeDelivered,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg =
        typeof err.error === 'string'
          ? err.error
          : Array.isArray(err.error)
            ? err.error.map((e: { message?: string }) => e.message).filter(Boolean).join(', ')
            : 'Failed to save skip days'
      return { ok: false, errorMsg: msg }
    }
    return { ok: true }
  }

  useEffect(() => {
    const j = skipSettingsPayloadJson(
      visibleWeeks,
      weeklySkipByWeekDraft,
      normalizeWeeklySkipDays(mealPlan?.weeklySkipDays)
    )
    const f = weeklySkipDeliveredFollowUpRef.current
    if (f && f.payloadJson !== j) {
      weeklySkipDeliveredFollowUpRef.current = null
      setWeeklySkipDeliveredModalCount(null)
    }
  }, [visibleWeeks, weeklySkipByWeekDraft, mealPlan?.weeklySkipDays])

  useEffect(() => {
    if (!mealPlan) return
    const payloadJson = skipSettingsPayloadJson(
      visibleWeeks,
      weeklySkipByWeekDraft,
      normalizeWeeklySkipDays(mealPlan.weeklySkipDays)
    )
    if (lastPersistedSkipJsonRef.current === null) {
      lastPersistedSkipJsonRef.current = payloadJson
      return
    }
    if (lastPersistedSkipJsonRef.current === payloadJson) return

    const t = window.setTimeout(() => {
      void (async () => {
        const mpId = mealPlanIdRef.current
        if (!mpId) return
        const d = skipAutosaveDraftRef.current
        const currentJson = skipSettingsPayloadJson(
          d.visibleWeeks,
          d.weeklySkipByWeekDraft,
          d.planDefaultSkipDays
        )
        if (lastPersistedSkipJsonRef.current === currentJson) return

        const mp = mealPlanRef.current
        if (!mp) return
        const body = JSON.parse(currentJson) as { weeklySkipDaysByWeek: Record<string, number[]> }
        const deliveredCount = countDeliveredItemsMatchingDraftSkipPattern(mp, {
          weeklySkipByWeekDraft: d.weeklySkipByWeekDraft,
          planDefaultSkipDays: d.planDefaultSkipDays,
        })

        const firstVisibleWeek =
          [...d.visibleWeeks].filter((w) => w > 0).sort((a, b) => a - b)[0] ?? 1
        const showSavingOnWeek = weeklySkipLastEditWeekRef.current ?? firstVisibleWeek
        setSavingWeeklySkipsForWeek(showSavingOnWeek)
        try {
          const result = await persistWeeklySkipPayload(mpId, body, false)
          if (!result.ok) {
            toast.error(result.errorMsg ?? 'Failed to save skip days')
            await fetchMealPlanRef.current(mpId)
            return
          }
          lastPersistedSkipJsonRef.current = currentJson
          await fetchMealPlanRef.current(mpId)
          if (deliveredCount > 0) {
            weeklySkipDeliveredFollowUpRef.current = { mpId, body, payloadJson: currentJson }
            setWeeklySkipDeliveredModalCount(deliveredCount)
          }
        } catch (e) {
          console.error(e)
          toast.error('Failed to save skip days')
          const mpId2 = mealPlanIdRef.current
          if (mpId2) await fetchMealPlanRef.current(mpId2)
        } finally {
          setSavingWeeklySkipsForWeek(null)
        }
      })()
    }, 400)
    return () => clearTimeout(t)
  }, [mealPlan, visibleWeeks, weeklySkipByWeekDraft])

  const confirmWeeklySkipForDeliveredMeals = async () => {
    const ctx = weeklySkipDeliveredFollowUpRef.current
    if (!ctx) return
    const { mpId, body } = ctx
    weeklySkipDeliveredFollowUpRef.current = null
    setWeeklySkipDeliveredModalCount(null)
    setSavingWeeklyDeliveredFollowUp(true)
    try {
      const result = await persistWeeklySkipPayload(mpId, body, true)
      if (!result.ok) {
        toast.error(result.errorMsg ?? 'Failed to save skip days')
        await fetchMealPlanRef.current(mpId)
        return
      }
      await fetchMealPlanRef.current(mpId)
    } catch (e) {
      console.error(e)
      toast.error('Failed to save skip days')
      await fetchMealPlanRef.current(mpId)
    } finally {
      setSavingWeeklyDeliveredFollowUp(false)
    }
  }

  const dismissWeeklySkipDeliveredModal = () => {
    weeklySkipDeliveredFollowUpRef.current = null
    setWeeklySkipDeliveredModalCount(null)
  }

  const toggleWeeklySkipDayForWeek = (planWeek: number, value: number) => {
    weeklySkipLastEditWeekRef.current = planWeek
    setWeeklySkipByWeekDraft((prev) => {
      const planDefault = normalizeWeeklySkipDays(mealPlanRef.current?.weeklySkipDays)
      const cur = getSkipDaysForWeekFromDraft(planWeek, prev, planDefault)
      const nextSet = new Set(cur)
      if (nextSet.has(value)) nextSet.delete(value)
      else nextSet.add(value)
      const nextArr = Array.from(nextSet).sort((a, b) => a - b)
      return { ...prev, [planWeek]: nextArr }
    })
  }

  const handleMarkAsDelivered = async (itemId: string, isDelivered: boolean) => {
    if (!mealPlan) return
    
    try {
      const method = isDelivered ? 'POST' : 'DELETE'
      const response = await fetch(`/api/meal-plans/${mealPlan.id}/items/${itemId}/deliver`, {
        method,
      })
      
      if (response.ok) {
        const data = await response.json()
        // Update the meal plan with new remaining meals
        if (mealPlan) {
          setMealPlan({
            ...mealPlan,
            remainingMeals: data.remainingMeals,
            mealPlanItems: mealPlan.mealPlanItems.map(item =>
              item.id === itemId
                ? {
                    ...item,
                    isDelivered: data.mealPlanItem.isDelivered,
                    deliveredAt: data.mealPlanItem.deliveredAt,
                    wrongDelivery: data.mealPlanItem.wrongDelivery ?? false,
                  }
                : item
            ),
          })
        }
        // Update selected item if it's the one being marked
        if (selectedItem && selectedItem.id === itemId) {
          setShowModal(false)
          setSelectedItem(null)
        }
        toast.success(isDelivered ? 'Marked as delivered' : 'Marked as not delivered')
      } else {
        toast.error('Failed to update delivery status')
      }
    } catch (error) {
      console.error('Error updating delivery status:', error)
      toast.error('Failed to update delivery status')
    }
  }

  const handleSkipMeal = async (itemId: string, isSkipped: boolean) => {
    if (!mealPlan) return
    setSkippingMeal(true)
    try {
      const response = await fetch(`/api/meal-plans/${mealPlan.id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSkipped }),
      })
      if (response.ok) {
        const data = await response.json()
        setMealPlan({
          ...mealPlan,
          mealPlanItems: mealPlan.mealPlanItems.map(item =>
            item.id === itemId
              ? {
                  ...item,
                  isSkipped: data.isSkipped ?? isSkipped,
                  wrongDelivery: data.wrongDelivery ?? false,
                  isDelivered: data.isDelivered ?? item.isDelivered,
                  deliveredAt: data.deliveredAt ?? item.deliveredAt,
                }
              : item
          ),
        })
        if (selectedItem && selectedItem.id === itemId) {
          setShowModal(false)
          setSelectedItem(null)
        }
        toast.success(isSkipped ? 'Meal marked as skipped' : 'Meal unskipped')
      } else {
        toast.error('Failed to update skip status')
      }
    } catch (error) {
      console.error('Error updating skip status:', error)
      toast.error('Failed to update skip status')
    } finally {
      setSkippingMeal(false)
    }
  }

  const handleWrongDelivery = async (itemId: string, wrong: boolean) => {
    if (!mealPlan) return
    setSettingWrongDelivery(true)
    try {
      const response = await fetch(`/api/meal-plans/${mealPlan.id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wrongDelivery: wrong }),
      })
      if (response.ok) {
        const data = await response.json()
        const remainingMeals =
          typeof data.remainingMeals === 'number' ? data.remainingMeals : mealPlan.remainingMeals
        setMealPlan({
          ...mealPlan,
          remainingMeals,
          mealPlanItems: mealPlan.mealPlanItems.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  wrongDelivery: data.wrongDelivery ?? wrong,
                  isDelivered: data.isDelivered ?? false,
                  deliveredAt: data.deliveredAt ?? null,
                }
              : item
          ),
        })
        if (selectedItem?.id === itemId) {
          setSelectedItem({
            ...selectedItem,
            wrongDelivery: data.wrongDelivery ?? wrong,
            isDelivered: data.isDelivered ?? false,
            deliveredAt: data.deliveredAt ?? null,
          })
        }
        toast.success(wrong ? 'Marked as wrong delivery — not counted toward balance' : 'Wrong delivery flag cleared')
      } else {
        const err = await response.json().catch(() => ({}))
        toast.error(typeof err.error === 'string' ? err.error : 'Failed to update wrong delivery')
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to update wrong delivery')
    } finally {
      setSettingWrongDelivery(false)
    }
  }

  const handleDeleteMeal = async (itemId: string) => {
    if (!mealPlan) return
    try {
      const response = await fetch(`/api/meal-plans/${mealPlan.id}/items/${itemId}`, { method: 'DELETE' })
      if (response.ok) {
        setMealPlan({
          ...mealPlan,
          mealPlanItems: mealPlan.mealPlanItems.filter(item => item.id !== itemId),
        })
        if (selectedItem?.id === itemId) {
          setShowModal(false)
          setSelectedItem(null)
        }
        toast.success('Meal removed from plan.')
      } else {
        const err = await response.json()
        toast.error(err?.error || 'Failed to delete meal')
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to delete meal')
    }
  }

  // Remove the entire day (all meals on that date) from the schedule
  const handleRemoveDay = async () => {
    if (!mealPlan || !selectedItem) return
    const dateStr = new Date(selectedItem.date).toISOString().slice(0, 10) // YYYY-MM-DD
    setRemovingDay(true)
    try {
      const response = await fetch(`/api/meal-plans/${mealPlan.id}/items?date=${encodeURIComponent(dateStr)}`, { method: 'DELETE' })
      if (response.ok) {
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(selectedItem.date).getDay()]
        setMealPlan({
          ...mealPlan,
          mealPlanItems: mealPlan.mealPlanItems.filter(item => {
            const itemDate = new Date(item.date).toISOString().slice(0, 10)
            return itemDate !== dateStr
          }),
        })
        setShowModal(false)
        setSelectedItem(null)
        toast.success(`${dayName} removed from schedule`)
      } else {
        const err = await response.json()
        toast.error(err?.error || 'Failed to remove day')
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to remove day')
    } finally {
      setRemovingDay(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!mealPlan) return
    setDownloadingPdf(true)
    try {
      const res = await fetch(`/api/meal-plans/${mealPlan.id}/export`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="?([^";\n]+)"?/)
      const filename = match ? match[1] : `meal-plan-${mealPlan.id}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded')
    } catch (e) {
      console.error(e)
      toast.error('Failed to download PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleDownloadWeekPdf = async (week: number) => {
    if (!mealPlan) return
    setDownloadingWeekPdf(week)
    try {
      const res = await fetch(`/api/meal-plans/${mealPlan.id}/export?week=${week}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="?([^";\n]+)"?/)
      const filename = match ? match[1] : `meal-plan-${mealPlan.id}-week-${week}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Week ${week} PDF downloaded`)
    } catch (e) {
      console.error(e)
      toast.error('Failed to download week PDF')
    } finally {
      setDownloadingWeekPdf(null)
    }
  }

  const handleItemClick = (item: MealPlan['mealPlanItems'][0]) => {
    setSelectedItem(item)
    setItemDateEdit(format(new Date(item.date), 'yyyy-MM-dd'))
    setShowModal(true)
    setEditingDish(false)
    setDishDropdownOpen(false)
    setActionsMenuOpen(false)
    setDishSearchQuery('')
    setShowDishDetails(false) // Hide details by default
    // Initialize dish form: customNote is plain text; deliveryType/deliveryLocation from item or legacy JSON
    let deliveryTime = item.deliveryTime || ''
    if (!deliveryTime && item.timeSlot) {
      const timeMatch = item.timeSlot.match(/(\d{1,2}):(\d{2})/)
      if (timeMatch) deliveryTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00`
    }
    const parsedLegacy = parseCustomNote(item.customNote)
    const isPlainNote = typeof item.customNote === 'string' && !item.customNote.trim().startsWith('{')
    setDishFormData({
      dishId: item.dishId || '',
      dishName: item.dishName || '',
      dishDescription: item.dishDescription || '',
      dishCategory: item.dishCategory || 'BREAKFAST',
      ingredients: item.ingredients || '',
      allergens: item.allergens || '',
      calories: item.calories?.toString() || '',
      protein: item.protein?.toString() || '',
      carbs: item.carbs?.toString() || '',
      fats: item.fats?.toString() || '',
      price: item.price?.toString() || '',
      deliveryType: ((item as { deliveryType?: string }).deliveryType ?? parsedLegacy?.deliveryType) || 'delivery',
      deliveryTime: deliveryTime,
      location: (item as { deliveryLocation?: string }).deliveryLocation ?? parsedLegacy?.location ?? parsedLegacy?.deliveryLocation ?? mealPlan?.customer.deliveryArea ?? '',
      customNote: isPlainNote ? (item.customNote || '') : (parsedLegacy?.note ?? parsedLegacy?.instructions ?? ''),
    })
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  if (!mealPlan) {
    return <div className="text-center py-8">Meal plan not found</div>
  }

  // Helper function to format time to 12-hour format
  const formatTime12Hour = (timeSlot: string): string => {
    try {
      // Handle formats like "10:00", "19:00", "10:00:00 AM", etc.
      const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
      if (!timeMatch) return timeSlot
      
      let hours = parseInt(timeMatch[1])
      const minutes = timeMatch[2]
      
      // Check if already has AM/PM
      if (timeSlot.toUpperCase().includes('AM') || timeSlot.toUpperCase().includes('PM')) {
        return timeSlot
      }
      
      const period = hours >= 12 ? 'PM' : 'AM'
      if (hours > 12) hours -= 12
      if (hours === 0) hours = 12
      
      return `${hours}:${minutes} ${period}`
    } catch {
      return timeSlot
    }
  }

  // Helper function to get day name
  const getDayName = (date: string): string => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return dayNames[new Date(date).getDay()]
  }

  // Parse custom note: support legacy JSON for backward compat when reading
  const parseCustomNote = (customNote: string | null) => {
    if (!customNote) return null
    try {
      if (!customNote.trim().startsWith('{')) return { note: customNote }
      return JSON.parse(customNote)
    } catch {
      return { note: customNote }
    }
  }

  const handleDishSelect = (dishId: string) => {
    const dish = dishes.find(d => d.id === dishId)
    if (dish) {
      setDishFormData({
        ...dishFormData,
        dishId: dish.id,
        dishName: dish.name,
        dishDescription: dish.description || '',
        dishCategory: dish.category,
        ingredients: dish.ingredients || '',
        allergens: dish.allergens || '',
        calories: dish.calories?.toString() || '',
        protein: dish.protein?.toString() || '',
        carbs: dish.carbs?.toString() || '',
        fats: dish.fats?.toString() || '',
        price: dish.price?.toString() || '',
      })
      // Don't auto-show details - let user click "Show Details" button
      setDishDropdownOpen(false)
      setDishSearchQuery('')
    } else {
      setDishFormData({ ...dishFormData, dishId: '', dishName: '' })
    }
  }

  const handleSaveDish = async () => {
    if (!mealPlan || !selectedItem) return

    // When creating a new item (no id), dish name is required. When updating existing item (e.g. timeSlot only), dish name is optional.
    const isUpdatingExisting = !!selectedItem.id
    if (!isUpdatingExisting && !dishFormData.dishName) {
      toast.warning('Please enter a dish name')
      return
    }

    setSavingDish(true)
    try {
      // customNote = plain text only. deliveryType and location sent separately (API saves to their columns).
      let timeSlot = selectedItem.timeSlot
      if (dishFormData.deliveryTime) {
        timeSlot = dishFormData.deliveryTime.substring(0, 5)
      }

      const payload = {
        date: (isUpdatingExisting ? itemDateEdit : (itemDateEdit || selectedItem.date)),
        timeSlot,
        dishId: dishFormData.dishId || undefined,
        dishName: dishFormData.dishName || undefined,
        dishDescription: dishFormData.dishDescription || undefined,
        dishCategory: dishFormData.dishCategory,
        ingredients: dishFormData.ingredients || undefined,
        allergens: dishFormData.allergens || undefined,
        calories: dishFormData.calories ? parseInt(dishFormData.calories) : undefined,
        protein: dishFormData.protein ? parseFloat(dishFormData.protein) : undefined,
        carbs: dishFormData.carbs ? parseFloat(dishFormData.carbs) : undefined,
        fats: dishFormData.fats ? parseFloat(dishFormData.fats) : undefined,
        price: dishFormData.price ? parseFloat(dishFormData.price) : undefined,
        deliveryTime: dishFormData.deliveryTime || undefined,
        deliveryType: dishFormData.deliveryType,
        location: dishFormData.location || undefined,
        isSkipped: false,
        customNote: dishFormData.customNote?.trim() || undefined,
      }

      if (isUpdatingExisting) {
        // Update existing item by id so changing timeSlot doesn't create a duplicate row
        const response = await fetch(`/api/meal-plans/${mealPlan.id}/items/${selectedItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (response.ok) {
          const updatedPlan = await fetchMealPlan(mealPlan.id)
          if (updatedPlan) {
            const updated = updatedPlan.mealPlanItems.find((i) => i.id === selectedItem.id)
            if (updated) setSelectedItem(updated)
            setItemDateEdit(updated ? format(new Date(updated.date), 'yyyy-MM-dd') : itemDateEdit)
          }
          setEditingDish(false)
          setShowModal(false)
          toast.success('Meal updated successfully!')
        } else {
          const error = await response.json()
          toast.error('Failed to update meal: ' + (error.error || 'Unknown error'))
        }
      } else {
        const response = await fetch(`/api/meal-plans/${mealPlan.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (response.ok) {
          await fetchMealPlan(mealPlan.id)
          setEditingDish(false)
          setShowModal(false)
          toast.success('Dish added successfully!')
        } else {
          const error = await response.json()
          toast.error('Failed to add dish: ' + (error.error || 'Unknown error'))
        }
      }
    } catch (error) {
      console.error('Error saving dish:', error)
      toast.error('Failed to save dish')
    } finally {
      setSavingDish(false)
    }
  }

  const handleUpdateDate = async () => {
    if (!mealPlan || !selectedItem?.id || !itemDateEdit) return
    setSavingDate(true)
    try {
      const response = await fetch(`/api/meal-plans/${mealPlan.id}/items/${selectedItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: itemDateEdit }),
      })
      if (response.ok) {
        const updatedPlan = await fetchMealPlan(mealPlan.id)
        if (updatedPlan) {
          const updated = updatedPlan.mealPlanItems.find((i) => i.id === selectedItem.id)
          if (updated) {
            setSelectedItem(updated)
            setItemDateEdit(format(new Date(updated.date), 'yyyy-MM-dd'))
          }
        }
        toast.success('Date updated')
      } else {
        const err = await response.json()
        toast.error(err.error || 'Failed to update date')
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to update date')
    } finally {
      setSavingDate(false)
    }
  }

  /** Prefer timeSlot; else derive HH:MM from deliveryTime. */
  const slotLabelFromItem = (item: MealPlan['mealPlanItems'][0]): string | null => {
    const ts = (item.timeSlot || '').trim()
    if (ts) return ts
    const dt = (item.deliveryTime || '').trim()
    const m = dt.match(/(\d{1,2}):(\d{2})/)
    if (!m) return null
    const h = parseInt(m[1], 10)
    const min = m[2]
    if (Number.isNaN(h)) return null
    return `${h.toString().padStart(2, '0')}:${min}`
  }

  /**
   * Per-meal slot pattern from an existing day (cycles like create flow).
   * If no times exist yet, uses 12:00 per meal so Add Day / Add Week works; adjust times in the UI.
   */
  const resolveMealTimeSlotTemplate = (plan: MealPlan): string[] => {
    const n = plan.mealsPerDay
    const placeholder = '12:00'
    const fromPlan = parseMealPlanTimeSlots(plan.timeSlots)
    if (fromPlan.length > 0) {
      return Array.from({ length: n }, (_, i) => fromPlan[i % fromPlan.length]!)
    }
    if (!plan.mealPlanItems?.length) {
      return Array.from({ length: n }, () => placeholder)
    }
    const byDate = new Map<string, MealPlan['mealPlanItems']>()
    for (const item of plan.mealPlanItems) {
      const d = format(new Date(item.date), 'yyyy-MM-dd')
      if (!byDate.has(d)) byDate.set(d, [])
      byDate.get(d)!.push(item)
    }
    const sortedDates = [...byDate.keys()].sort()
    for (const dateKey of sortedDates) {
      const dayItems = [...(byDate.get(dateKey) || [])].sort((a, b) => {
        const c = (a.timeSlot || '').localeCompare(b.timeSlot || '')
        return c !== 0 ? c : String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
      })
      const raw = dayItems.map((i) => slotLabelFromItem(i)).filter((s): s is string => Boolean(s))
      if (raw.length === 0) continue
      return Array.from({ length: n }, (_, i) => raw[i % raw.length])
    }
    return Array.from({ length: n }, () => placeholder)
  }

  // Function to add another week (only creates first day)
  const addAnotherWeek = async () => {
    if (!mealPlan) return
    
    setAddingWeek(true)
    try {
      // Check total days across all weeks - limit to plan days
      const totalDays = countUniqueActiveDays(mealPlan.mealPlanItems)
      const maxDays = mealPlan.days || 22
      
      if (totalDays >= maxDays) {
        toast.warning(`Cannot add another week. The meal plan is limited to ${maxDays} active days.`)
        setAddingWeek(false)
        return
      }
      
      const nextWeek = Math.max(...visibleWeeks, 0) + 1
      const skipForNewWeek = getSkipDaysForWeekFromDraft(
        nextWeek,
        weeklySkipByWeekDraft,
        normalizeWeeklySkipDays(mealPlan.weeklySkipDays)
      )

      const activeMealSlots = countActiveMealSlots(mealPlan.mealPlanItems)
      const mealsPerDay = mealPlan.mealsPerDay
      const totalMealsAllowed = mealPlan.totalMeals || (mealPlan.days * mealPlan.mealsPerDay)

      if (activeMealSlots + mealsPerDay > totalMealsAllowed) {
        toast.warning(
          `Cannot add another week. This would exceed the plan's limit of ${totalMealsAllowed} active meals (skipped days do not use a slot).`
        )
        setAddingWeek(false)
        return
      }

      // New week = next calendar Mon–Sun block (Monday first)
      const weekMonday = getMondayOfPlanWeek(mealPlan.startDate, nextWeek)
      const firstDate = format(weekMonday, 'yyyy-MM-dd')

      const defaultTimeSlots = resolveMealTimeSlotTemplate(mealPlan)

      // Create meal items for only the first day
      const mealItemPromises = defaultTimeSlots.map((timeSlot) => {
        const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
        let deliveryTime = ''
        if (timeMatch) {
          let hours = parseInt(timeMatch[1])
          const minutes = timeMatch[2]
          deliveryTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`
        } else {
          deliveryTime = timeSlot
        }
        
        return fetch(`/api/meal-plans/${mealPlan.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: firstDate,
            timeSlot: timeSlot,
            deliveryType: 'delivery',
            deliveryTime: deliveryTime,
            location: mealPlan.customer.deliveryArea || '',
            isSkipped: shouldSkipCalendarDay(firstDate, skipForNewWeek),
          }),
        })
      })
      
      await Promise.all(mealItemPromises)
      
      // Add the new week to visible weeks
      setVisibleWeeks(prev => [...prev, nextWeek].sort((a, b) => a - b))
      
      // Add first day to visible days for this week
      setVisibleDaysByWeek(prev => ({
        ...prev,
        [nextWeek]: [firstDate]
      }))
      
      // Expand the new week
      setExpandedWeeks(prev => {
        const newSet = new Set(prev)
        newSet.add(nextWeek)
        return newSet
      })
      
      // Refresh meal plan to get new items
      await fetchMealPlan(mealPlan.id)
      
      toast.success(`Week ${nextWeek} started! Add more days using the "Add Day" button.`)
    } catch (error) {
      console.error('Error adding week:', error)
      toast.error('Failed to add week')
    } finally {
      setAddingWeek(false)
    }
  }

  // Function to add a day to a week
  const addDayToWeek = async (week: number) => {
    if (!mealPlan) return
    
    setAddingDay(true)
    try {
      console.log('[addDayToWeek] start', { planId: mealPlan.id, week })
      // Check total days across all weeks - limit to plan days
      const totalDays = countUniqueActiveDays(mealPlan.mealPlanItems)
      const maxDays = mealPlan.days || 22
      const remainingDays = maxDays - totalDays
      const totalMealsAllowedEarly = mealPlan.totalMeals || mealPlan.days * mealPlan.mealsPerDay
      const activeEarly = countActiveMealSlots(mealPlan.mealPlanItems)
      const allowExtraDayDespiteDayCount =
        mealPlan.remainingMeals != null &&
        mealPlan.remainingMeals > 0 &&
        activeEarly < totalMealsAllowedEarly
      console.log('[addDayToWeek] day budget', {
        totalDays,
        maxDays,
        remainingDays,
        allowExtraDayDespiteDayCount,
        pass: remainingDays > 0 || allowExtraDayDespiteDayCount,
      })

      if (remainingDays <= 0 && !allowExtraDayDespiteDayCount) {
        console.log('[addDayToWeek] FAIL remainingDays<=0 and no meal room bypass')
        toast.warning(`Cannot add another day. The meal plan is limited to ${maxDays} active days.`)
        setAddingDay(false)
        return
      }
      
      // Days already in this calendar week (Mon–Sun) from meal items
      const weekDates = new Set<string>()
      mealPlan.mealPlanItems.forEach(item => {
        const itemWeek = getWeekNumber(item.date, mealPlan.startDate)
        if (itemWeek === week) {
          weekDates.add(format(new Date(item.date), 'yyyy-MM-dd'))
        }
      })
      const currentDaysInWeek = weekDates.size
      const maxDaysInThisWeek = planWeekDayStringsOnOrAfterStart(mealPlan.startDate, week).length
      console.log('[addDayToWeek] week calendar', {
        currentDaysInWeek,
        maxDaysInThisWeek,
        passInWeek: currentDaysInWeek < maxDaysInThisWeek,
      })

      if (currentDaysInWeek >= maxDaysInThisWeek) {
        console.log('[addDayToWeek] FAIL currentDaysInWeek>=maxDaysInThisWeek')
        toast.warning('All days for this week are already added.')
        setAddingDay(false)
        return
      }

      const dayBudgetForWeek = remainingDays > 0 ? remainingDays : allowExtraDayDespiteDayCount ? 1 : 0
      const daysCanAddToWeek = Math.min(maxDaysInThisWeek - currentDaysInWeek, dayBudgetForWeek)
      console.log('[addDayToWeek] daysCanAddToWeek', { dayBudgetForWeek, daysCanAddToWeek, pass: daysCanAddToWeek > 0 })

      if (daysCanAddToWeek <= 0) {
        console.log('[addDayToWeek] FAIL daysCanAddToWeek<=0', { remainingDays })
        if (remainingDays <= 0) {
          toast.warning(`Cannot add more days. The meal plan is limited to ${maxDays} days.`)
        } else {
          toast.warning(`Cannot add more days to this week.`)
        }
        setAddingDay(false)
        return
      }

      const totalMealsAllowed = mealPlan.totalMeals || (mealPlan.days * mealPlan.mealsPerDay)
      const defaultTimeSlots = resolveMealTimeSlotTemplate(mealPlan)
      let remainingSlots = Math.max(0, totalMealsAllowed - countActiveMealSlots(mealPlan.mealPlanItems))
      console.log('[addDayToWeek] meal slots (before remainingMeals boost)', {
        totalMealsAllowed,
        activeMealSlots: countActiveMealSlots(mealPlan.mealPlanItems),
        remainingSlots,
        remainingMeals: mealPlan.remainingMeals,
      })
      if (
        remainingSlots <= 0 &&
        mealPlan.remainingMeals != null &&
        mealPlan.remainingMeals > 0
      ) {
        remainingSlots = Math.min(mealPlan.remainingMeals, defaultTimeSlots.length)
        console.log('[addDayToWeek] boosted remainingSlots from remainingMeals', { remainingSlots })
      }

      if (remainingSlots <= 0) {
        console.log('[addDayToWeek] FAIL remainingSlots<=0')
        toast.warning(
          `Cannot add another day. This would exceed the plan's limit of ${totalMealsAllowed} active meals (skipped days do not use a slot).`
        )
        setAddingDay(false)
        return
      }

      // Fill earliest missing calendar day in Mon–Sun on or after plan start
      const nextDay = nextMissingDayInPlanWeek(mealPlan.startDate, week, weekDates)
      console.log('[addDayToWeek] nextMissingDayInPlanWeek', { nextDay: nextDay ? format(nextDay, 'yyyy-MM-dd') : null })
      if (!nextDay) {
        console.log('[addDayToWeek] FAIL no nextDay')
        toast.warning('No free day left in this week.')
        setAddingDay(false)
        return
      }
      const nextDayDateStr = format(nextDay, 'yyyy-MM-dd')

      const timeSlotsForDay = defaultTimeSlots.slice(0, Math.min(defaultTimeSlots.length, remainingSlots))
      console.log('[addDayToWeek] creating items', {
        nextDayDateStr: format(nextDay, 'yyyy-MM-dd'),
        slotsToCreate: timeSlotsForDay.length,
      })

      // Create meal items for the new day (capped so total active meals never exceed the plan)
      const mealItemPromises = timeSlotsForDay.map((timeSlot) => {
        const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
        let deliveryTime = ''
        if (timeMatch) {
          let hours = parseInt(timeMatch[1])
          const minutes = timeMatch[2]
          deliveryTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`
        } else {
          deliveryTime = timeSlot
        }
        
        return fetch(`/api/meal-plans/${mealPlan.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: nextDayDateStr,
            timeSlot: timeSlot,
            deliveryType: 'delivery',
            deliveryTime: deliveryTime,
            location: mealPlan.customer.deliveryArea || '',
            isSkipped: shouldSkipCalendarDay(nextDayDateStr, getSkipDaysForPlanWeek(week)),
          }),
        })
      })
      
      await Promise.all(mealItemPromises)
      
      // Add the new day to visible days
      setVisibleDaysByWeek(prev => ({
        ...prev,
        [week]: [...(prev[week] || []), nextDayDateStr].sort()
      }))
      
      // Refresh meal plan to get new items
      await fetchMealPlan(mealPlan.id)
    } catch (error) {
      console.error('Error adding day:', error)
      toast.error('Failed to add day')
    } finally {
      setAddingDay(false)
    }
  }

  // Function to add a meal to a day
  const addMealToDay = async (date: string, week: number) => {
    if (!mealPlan) return
    
    try {
      // Get existing meals for this day
      const existingMeals = mealPlan.mealPlanItems.filter(item => 
        format(new Date(item.date), 'yyyy-MM-dd') === date
      )
      
      const activeMealsOnDay = existingMeals.filter((item) => itemCountsForPlanSchedule(item)).length
      if (activeMealsOnDay >= mealPlan.mealsPerDay) {
        toast.warning(`This day already has ${mealPlan.mealsPerDay} active meals.`)
        return
      }
      
      const activeMealSlots = countActiveMealSlots(mealPlan.mealPlanItems)
      const totalMealsAllowed = mealPlan.totalMeals || (mealPlan.days * mealPlan.mealsPerDay)
      
      if (activeMealSlots + 1 > totalMealsAllowed) {
        toast.warning(`Cannot add another meal. This would exceed the plan's limit of ${totalMealsAllowed} active meals (skipped days do not use a slot).`)
        return
      }
      
      const template = resolveMealTimeSlotTemplate(mealPlan)
      const nextTimeSlot = template[activeMealsOnDay]!

      // Convert timeSlot to 24-hour format for deliveryTime
      const timeMatch = String(nextTimeSlot).match(/(\d{1,2}):(\d{2})/)
      let deliveryTime = ''
      if (timeMatch) {
        let hours = parseInt(timeMatch[1])
        const minutes = timeMatch[2]
        deliveryTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`
      } else {
        deliveryTime = nextTimeSlot
      }
      
      const response = await fetch(`/api/meal-plans/${mealPlan.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: date,
          timeSlot: nextTimeSlot,
          deliveryType: 'delivery',
          deliveryTime: deliveryTime,
          location: mealPlan.customer.deliveryArea || '',
          isSkipped: shouldSkipCalendarDay(date, getSkipDaysForPlanWeek(week)),
        }),
      })
      
      if (response.ok) {
        // Refresh meal plan to get new items
        await fetchMealPlan(mealPlan.id)
        setDayMenuOpen(null)
      } else {
        toast.error('Failed to add meal')
      }
    } catch (error) {
      console.error('Error adding meal:', error)
      toast.error('Failed to add meal')
    }
  }

  // Function to duplicate a week
  const duplicateWeek = async (sourceWeek: number) => {
    if (!mealPlan) return
    
    setDuplicatingWeek(true)
    try {
      const maxWeek = Math.ceil(mealPlan.days / 7)
      const nextWeek = Math.max(...visibleWeeks, 0) + 1
      
      // Check if adding this week would exceed plan days
      if (nextWeek > maxWeek) {
        toast.warning('Cannot duplicate week. Maximum weeks for this plan reached.')
        setDuplicatingWeek(false)
        return
      }
      
      // Get all items from the source week
      const sourceItems = mealPlan.mealPlanItems.filter(item => {
        const week = getWeekNumber(item.date, mealPlan.startDate)
        return week === sourceWeek
      })
      
      if (sourceItems.length === 0) {
        toast.warning('No meals found in the source week to duplicate.')
        setDuplicatingWeek(false)
        return
      }
      
      const activeMealSlots = countActiveMealSlots(mealPlan.mealPlanItems)
      const activeSlotsBeingDuplicated = sourceItems.filter((i) => !i.isSkipped).length
      const totalMealsAllowed = mealPlan.totalMeals || (mealPlan.days * mealPlan.mealsPerDay)
      
      if (activeMealSlots + activeSlotsBeingDuplicated > totalMealsAllowed) {
        toast.warning(`Cannot duplicate week. This would exceed the plan's limit of ${totalMealsAllowed} active meals (skipped days do not use a slot).`)
        setDuplicatingWeek(false)
        return
      }
      
      const dayOffset = dayOffsetBetweenPlanWeeks(mealPlan.startDate, sourceWeek, nextWeek)
      
      // Create new items for the next week with same dishes (keep original time slots)
      const mealItemPromises = sourceItems.map(item => {
        const sourceDate = new Date(item.date)
        const targetDate = addDays(sourceDate, dayOffset)
        const targetDateStr = format(targetDate, 'yyyy-MM-dd')
        const parsedLegacy = parseCustomNote(item.customNote)
        const isPlainNote = typeof item.customNote === 'string' && !item.customNote.trim().startsWith('{')
        const noteText = isPlainNote ? (item.customNote || '') : (parsedLegacy?.note ?? parsedLegacy?.instructions ?? '')
        const itemAny = item as { deliveryType?: string; deliveryLocation?: string }
        return fetch(`/api/meal-plans/${mealPlan.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: targetDateStr,
            timeSlot: item.timeSlot,
            dishId: item.dishId || undefined,
            dishName: item.dishName || undefined,
            dishDescription: item.dishDescription || undefined,
            dishCategory: item.dishCategory || undefined,
            ingredients: item.ingredients || undefined,
            allergens: item.allergens || undefined,
            calories: item.calories || undefined,
            protein: item.protein || undefined,
            carbs: item.carbs || undefined,
            fats: item.fats || undefined,
            price: item.price || undefined,
            deliveryTime: item.deliveryTime || undefined,
            deliveryType: itemAny.deliveryType ?? parsedLegacy?.deliveryType ?? 'delivery',
            location: itemAny.deliveryLocation ?? parsedLegacy?.location ?? parsedLegacy?.deliveryLocation ?? mealPlan.customer.deliveryArea ?? '',
            isSkipped:
              item.isSkipped ||
              shouldSkipCalendarDay(targetDateStr, getSkipDaysForPlanWeek(nextWeek)),
            customNote: noteText?.trim() || undefined,
          }),
        })
      })
      
      await Promise.all(mealItemPromises)
      
      // Add the new week to visible weeks
      setVisibleWeeks(prev => [...prev, nextWeek].sort((a, b) => a - b))
      
      // Get visible days from source week and add to target week
      const sourceDays = visibleDaysByWeek[sourceWeek] || []
      const targetDays = sourceDays.map(dateStr => {
        const sourceDate = new Date(dateStr)
        const targetDate = addDays(sourceDate, dayOffset)
        return format(targetDate, 'yyyy-MM-dd')
      })
      
      setVisibleDaysByWeek(prev => ({
        ...prev,
        [nextWeek]: targetDays
      }))
      
      // Expand the new week
      setExpandedWeeks(prev => {
        const newSet = new Set(prev)
        newSet.add(nextWeek)
        return newSet
      })
      
      // Refresh meal plan to get new items
      await fetchMealPlan(mealPlan.id)
      
      setWeekMenuOpen(null)
      toast.success(`Week ${nextWeek} duplicated successfully!`)
    } catch (error) {
      console.error('Error duplicating week:', error)
      toast.error('Failed to duplicate week')
    } finally {
      setDuplicatingWeek(false)
    }
  }

  if (!mealPlan) {
    return <div>Loading...</div>
  }

  // Group meal plan items by week, then by date
  const itemsByWeek: Record<number, Record<string, typeof mealPlan.mealPlanItems>> = {}
  mealPlan.mealPlanItems.forEach(item => {
    const week = getWeekNumber(item.date, mealPlan.startDate)
    const date = format(new Date(item.date), 'yyyy-MM-dd')
    
    if (!itemsByWeek[week]) {
      itemsByWeek[week] = {}
    }
    if (!itemsByWeek[week][date]) {
      itemsByWeek[week][date] = []
    }
    itemsByWeek[week][date].push(item)
  })

  // Calculate daily totals for each date
  const dailyTotals: Record<string, { calories: number; protein: number; carbs: number; fats: number }> = {}
  Object.values(itemsByWeek).forEach(weekDates => {
    Object.entries(weekDates).forEach(([date, items]) => {
      const forTotals = items.filter((item) => !item.wrongDelivery)
      dailyTotals[date] = {
        calories: forTotals.reduce((sum, item) => sum + (item.calories || 0), 0),
        protein: forTotals.reduce((sum, item) => sum + (item.protein || 0), 0),
        carbs: forTotals.reduce((sum, item) => sum + (item.carbs || 0), 0),
        fats: forTotals.reduce((sum, item) => sum + (item.fats || 0), 0),
      }
    })
  })

  // Calculate weekly totals
  const weeklyTotals: Record<number, { calories: number; protein: number; carbs: number; fats: number }> = {}
  Object.entries(itemsByWeek).forEach(([weekStr, weekDates]) => {
    const week = parseInt(weekStr)
    weeklyTotals[week] = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
    }
    Object.values(weekDates).forEach(items => {
      items.forEach(item => {
        if (item.wrongDelivery) return
        weeklyTotals[week].calories += item.calories || 0
        weeklyTotals[week].protein += item.protein || 0
        weeklyTotals[week].carbs += item.carbs || 0
        weeklyTotals[week].fats += item.fats || 0
      })
    })
  })

  // Calculate grand totals
  const grandTotals = Object.values(dailyTotals).reduce(
    (acc, day) => ({
      calories: acc.calories + day.calories,
      protein: acc.protein + day.protein,
      carbs: acc.carbs + day.carbs,
      fats: acc.fats + day.fats,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-3 lg:mb-6">
        <h1 className="text-lg lg:text-2xl font-bold text-gray-900">Meal Plan Details</h1>
        <div className="flex flex-wrap gap-2 lg:p-4">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="px-3 py-1.5 lg:px-4 lg:py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            {downloadingPdf ? 'Downloading…' : 'Download PDF'}
          </button>
          <Link
            href={`/meal-plans/${mealPlan.id}/edit`}
            className="px-3 py-1.5 lg:px-4 lg:py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
          >
            Edit
          </Link>
          <DeleteMealPlanButton mealPlanId={String(mealPlan.id)} customerName={mealPlan.customer.fullName} />
          <button
            onClick={() => router.back()}
            className="px-3 py-1.5 lg:px-4 lg:py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
          >
            Back
          </button>
        </div>
      </div>

      {/* Customer Info */}
      <div className="bg-white shadow rounded-lg p-3 lg:p-5 mb-3 lg:mb-6">
        <h2 className="text-base lg:text-lg font-semibold text-gray-900 mb-4">Customer Information</h2>
        <CustomerInstructionsBanner instructions={mealPlan.customer.instructions} className="mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 lg:p-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Name</label>
            <p className="text-sm text-gray-900">{mealPlan.customer.fullName}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Phone</label>
            <p className="text-sm text-gray-900">{mealPlan.customer.phone}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Email</label>
            <p className="text-sm text-gray-900">{mealPlan.customer.email || '-'}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Delivery Area</label>
            <p className="text-sm text-gray-900">{mealPlan.customer.deliveryArea}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Address</label>
            <p className="text-sm text-gray-900">{mealPlan.customer.address || '-'}</p>
          </div>
        </div>
      </div>

      {/* Meal Plan Info */}
      <div className="bg-white shadow rounded-lg p-3 lg:p-5 mb-3 lg:mb-6">
        <h2 className="text-base lg:text-lg font-semibold text-gray-900 mb-4">Meal Plan Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 lg:p-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Plan Type</label>
            <p className="text-sm text-gray-900">{mealPlan.planType}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Days</label>
            <p className="text-sm text-gray-900">{mealPlan.days || '-'}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Start Date</label>
            <p className="text-sm text-gray-900">{mealPlan.startDate ? format(new Date(mealPlan.startDate), 'MMM dd, yyyy') : '-'}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">End Date</label>
            <p className="text-sm text-gray-900">{mealPlan.endDate ? format(new Date(mealPlan.endDate), 'MMM dd, yyyy') : '-'}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Meals Per Day</label>
            <p className="text-sm text-gray-900">{mealPlan.mealsPerDay}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Skipped days</label>
            <p className="text-sm text-gray-900">{formatPlanDefaultSkipDayLabels(mealPlan.weeklySkipDays)}</p>
          </div>
          {parseMealPlanTimeSlots(mealPlan.timeSlots).length > 0 && (
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-500">Default time slots (plan)</label>
              <p className="text-sm text-gray-900">
                {parseMealPlanTimeSlots(mealPlan.timeSlots).join(' · ')}
              </p>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-500">Total Meals</label>
            <p className="text-sm text-gray-900 font-semibold">
              {mealPlan.totalMeals !== null ? mealPlan.totalMeals : (mealPlan.days && mealPlan.mealsPerDay ? mealPlan.days * mealPlan.mealsPerDay : '-')}
              <Link href={`/meal-plans/${mealPlan.id}/edit`} className="ml-2 text-xs text-nutrafi-primary hover:underline">Edit</Link>
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Remaining Meals</label>
            <p className={`text-sm font-semibold ${mealPlan.remainingMeals !== null && mealPlan.remainingMeals < 10 ? 'text-orange-600' : 'text-nutrafi-primary'}`}>
              {mealPlan.remainingMeals !== null ? mealPlan.remainingMeals : '-'}
            </p>
            {mealPlan.totalMeals != null && (
              <p className="text-xs text-gray-500 mt-0.5">Total meals minus delivered (non-skipped) slots.</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Status</label>
            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
              mealPlan.status === 'ACTIVE' ? 'bg-[#f0f4e8] text-nutrafi-dark' :
              mealPlan.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-800' :
              mealPlan.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800' :
              'bg-red-100 text-red-800'
            }`}>
              {mealPlan.status}
            </span>
          </div>
          {mealPlan.plan && (
            <div>
              <label className="text-xs font-medium text-gray-500">Predefined Plan</label>
              <p className="text-sm text-gray-900">{mealPlan.plan.name} - {mealPlan.plan.price} AED</p>
            </div>
          )}
          {mealPlan.notes && (
            <div className="md:col-span-3">
              <label className="text-xs font-medium text-gray-500">Notes</label>
              <p className="text-sm text-gray-900">{mealPlan.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Pricing Information */}
      {(mealPlan.baseAmount !== null || mealPlan.totalAmount !== null) && (
        <div className="bg-white shadow rounded-lg p-3 lg:p-5 mb-3 lg:mb-6">
          <h2 className="text-base lg:text-lg font-semibold text-gray-900 mb-4">Pricing Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 lg:p-4">
            {mealPlan.baseAmount !== null && (
              <div>
                <label className="text-xs font-medium text-gray-500">Base Amount</label>
                <p className="text-base lg:text-lg font-semibold text-gray-900">{mealPlan.baseAmount.toFixed(2)} AED</p>
              </div>
            )}
            {mealPlan.vatAmount !== null && (
              <div>
                <label className="text-xs font-medium text-gray-500">VAT (5%)</label>
                <p className="text-base lg:text-lg font-semibold text-gray-900">{mealPlan.vatAmount.toFixed(2)} AED</p>
              </div>
            )}
            {mealPlan.totalAmount !== null && (
              <div>
                <label className="text-xs font-medium text-gray-500">Total Amount</label>
                <p className="text-base lg:text-lg font-semibold text-nutrafi-primary">{mealPlan.totalAmount.toFixed(2)} AED</p>
              </div>
            )}
            {mealPlan.averageMealRate !== null && (
              <div>
                <label className="text-xs font-medium text-gray-500">Average Meal Rate</label>
                <p className="text-base lg:text-lg font-semibold text-gray-900">{mealPlan.averageMealRate.toFixed(2)} AED</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment History */}
      <div className="bg-white shadow rounded-lg p-3 lg:p-5 mb-3 lg:mb-6">
        <h2 className="text-base lg:text-lg font-semibold text-gray-900 mb-4">Payment History</h2>
        {mealPlan.payments && mealPlan.payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 lg:px-6 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-2 py-2 lg:px-6 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-2 py-2 lg:px-6 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                  <th className="px-2 py-2 lg:px-6 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-2 py-2 lg:px-6 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mealPlan.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-2 py-2 lg:px-6 lg:py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(payment.paymentDate), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-2 py-2 lg:px-6 lg:py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {payment.amount.toFixed(2)} AED
                    </td>
                    <td className="px-2 py-2 lg:px-6 lg:py-4 whitespace-nowrap text-sm text-gray-500">
                      {payment.paymentMethod || '-'}
                    </td>
                    <td className="px-2 py-2 lg:px-6 lg:py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        payment.status === 'COMPLETED' ? 'bg-[#f0f4e8] text-nutrafi-dark' :
                        payment.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-2 py-2 lg:px-6 lg:py-4 text-sm text-gray-500">
                      {payment.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-700">Total Paid:</span>
                <span className="text-base lg:text-lg font-semibold text-nutrafi-primary">
                  {mealPlan.payments
                    .filter(p => p.status === 'COMPLETED')
                    .reduce((sum, p) => sum + p.amount, 0)
                    .toFixed(2)} AED
                </span>
              </div>
              {mealPlan.totalAmount !== null && (
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs font-medium text-gray-700">Remaining Balance:</span>
                  <span className={`text-base lg:text-lg font-semibold ${
                    (mealPlan.totalAmount - mealPlan.payments.filter(p => p.status === 'COMPLETED').reduce((sum, p) => sum + p.amount, 0)) > 0
                      ? 'text-orange-600'
                      : 'text-nutrafi-primary'
                  }`}>
                    {(mealPlan.totalAmount - mealPlan.payments.filter(p => p.status === 'COMPLETED').reduce((sum, p) => sum + p.amount, 0)).toFixed(2)} AED
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No payments recorded for this meal plan.</p>
        )}
      </div>

      {/* Meal Plan Items */}
      <div className="bg-white shadow rounded-lg p-3 lg:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h2 className="text-base lg:text-lg font-semibold text-gray-900">Meal Schedule</h2>
          {(() => {
            if (!mealPlan) return null
            const activeMealSlots = countActiveMealSlots(mealPlan.mealPlanItems)
            const totalMealsAllowed = mealPlan.totalMeals || (mealPlan.days * mealPlan.mealsPerDay)
            const mealsPerDay = mealPlan.mealsPerDay

            const totalDays = countUniqueActiveDays(mealPlan.mealPlanItems)
            const maxDays = mealPlan.days || 22

            const canAddMoreWeeks = totalDays < maxDays && activeMealSlots + mealsPerDay <= totalMealsAllowed
            
            return canAddMoreWeeks ? (
              <button
                onClick={addAnotherWeek}
                disabled={addingWeek}
                className="px-3 py-1.5 lg:px-4 lg:py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark font-medium flex items-center gap-2 lg:p-4 disabled:opacity-50"
              >
                {addingWeek ? 'Adding...' : (
                  <>
                    <span>+</span>
                    <span>Add Another Week</span>
                  </>
                )}
              </button>
            ) : null
          })()}
        </div>
        <div className="space-y-6">
          {visibleWeeks.length > 0 ? (
            visibleWeeks
              .filter(week => week > 0) // Filter out Week 0
              .sort((a, b) => a - b)
              .map((week) => {
                const weekDates = itemsByWeek[week] || {}
                const weekTotal = weeklyTotals[week] || { calories: 0, protein: 0, carbs: 0, fats: 0 }
                const isExpanded = expandedWeeks.has(week)
                
                const toggleWeek = () => {
                  setExpandedWeeks(prev => {
                    const newSet = new Set(prev)
                    if (newSet.has(week)) {
                      newSet.delete(week)
                    } else {
                      newSet.add(week)
                    }
                    return newSet
                  })
                }
                
                return (
              <div key={week} className="border border-gray-200 rounded-lg overflow-hidden min-w-0">
                {/* Week Header */}
                <div 
                  className="px-2 py-1.5 lg:px-4 lg:py-2 border-b border-nutrafi-primary/30 bg-nutrafi-primary hover:opacity-95 transition-opacity"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 lg:gap-3 flex-1" onClick={toggleWeek}>
                      <svg 
                        className={`w-4 h-4 text-white transition-transform cursor-pointer ${isExpanded ? 'transform rotate-90' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <h3 className="text-sm font-semibold text-white cursor-pointer">Week {week}</h3>
                    </div>
                    <div className="text-xs text-white font-semibold">
                      <span className="font-bold">{weekTotal.calories} kcal</span>
                      {' '}• P: {weekTotal.protein.toFixed(1)}g | C: {weekTotal.carbs.toFixed(1)}g | F: {weekTotal.fats.toFixed(1)}g
                    </div>
                    {/* Week download PDF + actions */}
                    <div className="flex items-center gap-0.5 ml-2">
                      {mealPlan.startDate && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownloadWeekPdf(week)
                        }}
                        disabled={downloadingWeekPdf === week}
                        title="Download week PDF"
                        aria-label="Download week PDF"
                        className="p-1.5 rounded text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                      >
                        {downloadingWeekPdf === week ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        )}
                      </button>
                      )}
                    <div className="relative week-menu-container">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setWeekMenuOpen(weekMenuOpen === week ? null : week)
                        }}
                        className="p-1.5 rounded text-white hover:bg-white/20 transition-colors"
                        title="Duplicate week"
                        aria-label="Week actions"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      {weekMenuOpen === week && (
                        <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg z-50 border border-gray-200 overflow-hidden">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              duplicateWeek(week)
                            }}
                            disabled={duplicatingWeek}
                            className="w-full text-left px-4 py-3 text-sm font-semibold bg-white text-nutrafi-primary border-2 border-nutrafi-primary hover:bg-nutrafi-primary hover:text-white disabled:opacity-50 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            {duplicatingWeek ? 'Duplicating...' : 'Duplicate Week'}
                          </button>
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                  {mealPlan && (
                    <div
                      className="w-full min-w-0 border-t border-white/35 pt-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-white drop-shadow-sm">
                          Skip days
                        </span>
                        <div className="flex min-w-0 w-full flex-1 flex-wrap items-stretch justify-between gap-1 sm:gap-0.5 sm:justify-start">
                          {WEEKDAY_SKIP_TOGGLES.map(({ label, value }) => {
                            const list = getSkipDaysForPlanWeek(week)
                            const on = list.includes(value)
                            return (
                              <label
                                key={`${week}-${value}`}
                                className={`flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border px-1.5 py-1.5 text-xs font-semibold text-white shadow-sm sm:min-w-[2.75rem] ${
                                  on
                                    ? 'border-white/60 bg-white/35 ring-1 ring-white/40'
                                    : 'border-white/25 bg-white/10 hover:bg-white/25 hover:border-white/40'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 shrink-0 rounded border-white/70 bg-white/30 text-nutrafi-primary focus:ring-white/80"
                                  checked={on}
                                  onChange={() => toggleWeeklySkipDayForWeek(week, value)}
                                />
                                {label}
                              </label>
                            )
                          })}
                        </div>
                        <div className="flex shrink-0 items-center sm:ml-auto sm:pl-2">
                          {savingWeeklySkipsForWeek === week ? (
                            <span className="text-center text-[11px] text-white/90 sm:text-right" aria-live="polite">
                              Saving…
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Week Content */}
                {isExpanded && (
                  <div className="w-full min-w-0 overflow-x-auto">
                    <table className="w-full min-w-[800px] divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 lg:px-6 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Day / Date</th>
                        <th className="px-2 py-2 lg:px-6 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time Slot</th>
                        <th className="px-2 py-2 lg:px-6 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dish</th>
                        <th className="px-2 py-2 lg:px-6 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Calories</th>
                        <th className="px-2 py-2 lg:px-6 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-2 py-2 lg:px-6 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(() => {
                        // Always show all days that have items
                        // visibleDaysByWeek is only used for tracking newly added days, not for filtering
                        const allDates = Object.keys(weekDates).sort()
                        
                        return allDates.length > 0 ? allDates.map((date) => {
                          const items = weekDates[date] || []
                          const dayTotal = dailyTotals[date] || { calories: 0, protein: 0, carbs: 0, fats: 0 }
                          const mealsCount = items.length
                          const countingMealsOnDay = items.filter((item) => itemCountsForPlanSchedule(item)).length
                          const hasMissingMeals = countingMealsOnDay < mealPlan.mealsPerDay
                          
                          return (
                            <React.Fragment key={date}>
                              {items.length > 0 ? items.map((item, index) => (
                                <tr 
                                  key={item.id}
                                  onClick={() => handleItemClick(item)}
                                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                                >
                                  {index === 0 && (
                                    <>
                                      <td 
                                        rowSpan={items.length + 1}
                                        className="px-2 py-2 lg:px-6 lg:py-4 whitespace-nowrap text-xs font-medium text-gray-900 align-top border-r border-gray-200"
                                      >
                                        <div className="flex items-center gap-2 lg:p-4">
                                          <div>
                                            <div>{getDayName(item.date)}</div>
                                            <div className="text-xs text-gray-500 mt-1">{format(new Date(item.date), 'MMM dd, yyyy')}</div>
                                          </div>
                                          {/* +Meal Button - show if there's at least one meal */}
                                          {hasMissingMeals && index === 0 && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                addMealToDay(date, week)
                                              }}
                                              className="px-2 py-1 text-xs bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark font-medium"
                                            >
                                              + meal
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </>
                                  )}
                                  <td className="px-2 py-2 lg:px-6 lg:py-4 whitespace-nowrap text-sm text-gray-500">
                                    {formatTime12Hour(item.timeSlot)}
                                  </td>
                                  <td className="px-2 py-2 lg:px-6 lg:py-4 whitespace-nowrap text-sm text-gray-500">
                                    {item.dishName || '-'}
                                  </td>
                                  <td className="px-2 py-2 lg:px-6 lg:py-4 whitespace-nowrap text-sm text-gray-500">
                                    {item.calories !== null ? `${item.calories} kcal` : '-'}
                                  </td>
                                  <td className="px-2 py-2 lg:px-6 lg:py-4 whitespace-nowrap text-sm text-gray-500">
                                    {item.isSkipped ? (
                                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                        Skipped
                                      </span>
                                    ) : item.wrongDelivery && !item.isDelivered ? (
                                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-900">
                                        Wrong delivery
                                      </span>
                                    ) : item.isDelivered ? (
                                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                        Delivered
                                      </span>
                                    ) : (!item.dishId && !item.dishName) ? (
                                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-600">
                                        Inactive
                                      </span>
                                    ) : (
                                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-[#f0f4e8] text-nutrafi-dark">
                                        Active
                                      </span>
                                    )}
                                  </td>
                                  <td></td>
                                </tr>
                              )) : (
                                // Empty day row
                                <tr>
                                  <td className="px-2 py-2 lg:px-6 lg:py-4 whitespace-nowrap text-xs font-medium text-gray-900 align-top border-r border-gray-200">
                                    <div className="flex items-center gap-2 lg:p-4">
                                      <div>
                                        <div>{getDayName(date)}</div>
                                        <div className="text-xs text-gray-500 mt-1">{format(new Date(date), 'MMM dd, yyyy')}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td colSpan={5} className="px-2 py-2 lg:px-6 lg:py-4 text-sm text-gray-500">
                                    No meals for this day
                                  </td>
                                </tr>
                              )}
                              {/* Daily Total Row */}
                              {items.length > 0 && (
                                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                                  <td></td>
                                  <td colSpan={2} className="px-2 py-2 lg:px-6 lg:py-4 text-sm text-gray-700 text-left">
                                    Daily Total:
                                  </td>
                                  <td className="px-2 py-2 lg:px-6 lg:py-4 text-left">
                                    <span className="px-3 py-1.5 lg:px-4 lg:py-2 text-white font-bold rounded-md text-sm" style={{ backgroundColor: '#728d53' }}>
                                      {dayTotal.calories} kcal
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 lg:px-6 lg:py-4 text-sm text-gray-600 text-left">
                                    P: {dayTotal.protein.toFixed(1)}g | C: {dayTotal.carbs.toFixed(1)}g | F: {dayTotal.fats.toFixed(1)}g
                                  </td>
                                  <td></td>
                                </tr>
                              )}
                              {/* Add Next Day Button - show below the daily total if we can still add days */}
                              {(() => {
                                // Check if this is the last day in the sorted list
                                const sortedDates = Object.keys(weekDates).sort()
                                const isLastDay = date === sortedDates[sortedDates.length - 1]
                                console.log('[Add Next Day UI]', {
                                  planId: mealPlan.id,
                                  week,
                                  date,
                                  sortedDates,
                                  isLastDay,
                                })
                                if (!isLastDay) return null
                                
                                // Check total days across all weeks - limit to plan days
                                const totalDays = countUniqueActiveDays(mealPlan.mealPlanItems)
                                const maxDays = mealPlan.days || 22
                                const remainingDays = maxDays - totalDays
                                console.log('[Add Next Day UI] day budget', { totalDays, maxDays, remainingDays })
                                
                                const weekDatesSet = new Set<string>()
                                mealPlan.mealPlanItems.forEach(item => {
                                  const itemWeek = getWeekNumber(item.date, mealPlan.startDate)
                                  if (itemWeek === week) {
                                    const date = format(new Date(item.date), 'yyyy-MM-dd')
                                    weekDatesSet.add(date)
                                  }
                                })
                                const currentDaysInWeek = weekDatesSet.size
                                const maxDaysInThisWeek = planWeekDayStringsOnOrAfterStart(
                                  mealPlan.startDate,
                                  week
                                ).length

                                const canAddDayInWeek = currentDaysInWeek < maxDaysInThisWeek
                                const activeMealSlots = countActiveMealSlots(mealPlan.mealPlanItems)
                                const totalMealsAllowed = mealPlan.totalMeals || (mealPlan.days * mealPlan.mealsPerDay)
                                const dayBudgetAllows =
                                  remainingDays > 0 ||
                                  (mealPlan.remainingMeals != null &&
                                    mealPlan.remainingMeals > 0 &&
                                    activeMealSlots < totalMealsAllowed)
                                const canAddDay = canAddDayInWeek && dayBudgetAllows
                                console.log('[Add Next Day UI] week slot', {
                                  currentDaysInWeek,
                                  maxDaysInThisWeek,
                                  canAddDayInWeek,
                                  remainingDays,
                                  dayBudgetAllows,
                                  canAddDay,
                                })
                                
                                const capOk = activeMealSlots < totalMealsAllowed
                                const remainingOk =
                                  mealPlan.remainingMeals != null && mealPlan.remainingMeals > 0
                                const canAddMoreMeals = capOk || remainingOk
                                console.log('[Add Next Day UI] meal cap', {
                                  activeMealSlots,
                                  totalMealsAllowed,
                                  capOk,
                                  remainingMeals: mealPlan.remainingMeals,
                                  remainingOk,
                                  canAddMoreMeals,
                                })
                                const show = canAddDay && canAddMoreMeals
                                console.log('[Add Next Day UI] SHOW_BUTTON', show)

                                return show ? (
                                  <tr>
                                    <td colSpan={6} className="px-2 py-2 lg:px-6 lg:py-4 text-center">
                                      <button
                                        onClick={() => addDayToWeek(week)}
                                        disabled={addingDay}
                                        className="px-3 py-1.5 lg:px-4 lg:py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark font-medium flex items-center gap-2 lg:p-4 disabled:opacity-50 text-sm mx-auto"
                                      >
                                        {addingDay ? 'Adding...' : (
                                          <>
                                            <span>+</span>
                                            <span>Add Next Day</span>
                                          </>
                                        )}
                                      </button>
                                    </td>
                                  </tr>
                                ) : null
                              })()}
                            </React.Fragment>
                          )
                        }) : (
                          <tr>
                            <td colSpan={6} className="px-6 py-8 text-center">
                              <div className="flex flex-col items-center gap-3 lg:p-5">
                                <p className="text-sm text-gray-500 mb-2">
                                  No days added to this week yet.
                                </p>
                                {(() => {
                                  // Check if we can add a day
                                  const totalDays = countUniqueActiveDays(mealPlan.mealPlanItems)
                                  const maxDays = mealPlan.days || 22
                                  const remainingDays = maxDays - totalDays
                                  console.log('[Add Day empty week UI]', {
                                    planId: mealPlan.id,
                                    week,
                                    totalDays,
                                    maxDays,
                                    remainingDays,
                                    passRemainingDays: remainingDays > 0,
                                  })
                                  
                                  const activeMealSlots = countActiveMealSlots(mealPlan.mealPlanItems)
                                  const totalMealsAllowed = mealPlan.totalMeals || (mealPlan.days * mealPlan.mealsPerDay)
                                  const capOk = activeMealSlots < totalMealsAllowed
                                  const remainingOk =
                                    mealPlan.remainingMeals != null && mealPlan.remainingMeals > 0
                                  const canAddMoreMeals = capOk || remainingOk
                                  const dayBudgetAllows =
                                    remainingDays > 0 ||
                                    (mealPlan.remainingMeals != null &&
                                      mealPlan.remainingMeals > 0 &&
                                      activeMealSlots < totalMealsAllowed)
                                  console.log('[Add Day empty week UI] meal cap', {
                                    activeMealSlots,
                                    totalMealsAllowed,
                                    capOk,
                                    remainingMeals: mealPlan.remainingMeals,
                                    remainingOk,
                                    canAddMoreMeals,
                                    dayBudgetAllows,
                                  })
                                  const show = dayBudgetAllows && canAddMoreMeals
                                  console.log('[Add Day empty week UI] SHOW_BUTTON', show)

                                  return show ? (
                                    <button
                                      onClick={() => addDayToWeek(week)}
                                      disabled={addingDay}
                                      className="px-3 py-1.5 lg:px-4 lg:py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark font-medium flex items-center gap-2 lg:p-4 disabled:opacity-50 text-sm"
                                    >
                                      {addingDay ? 'Adding...' : (
                                        <>
                                          <span>+</span>
                                          <span>Add Day</span>
                                        </>
                                      )}
                                    </button>
                                  ) : null
                                })()}
                              </div>
                            </td>
                          </tr>
                        )
                      })()}
                      {/* Week Total Row */}
                      <tr className="bg-nutrafi-primary font-semibold border-t-2 border-nutrafi-primary/50">
                        <td colSpan={6} className="px-2 py-2 lg:px-4 lg:py-3 text-left">
                          <div className="flex items-center gap-2 text-white">
                            <span className="text-sm">Week {week} Total:</span>
                            <span className="text-sm font-bold">
                              {weekTotal.calories} kcal
                            </span>
                            <span className="text-sm text-white/90">
                              P: {weekTotal.protein.toFixed(1)}g | C: {weekTotal.carbs.toFixed(1)}g | F: {weekTotal.fats.toFixed(1)}g
                            </span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })
          ) : (
            <div className="text-center py-8 text-gray-500">
              No weeks available. Click "Add Another Week" to start.
            </div>
          )}
        </div>
      </div>

      {/* Delivered meals on newly skipped weekdays — optional second save */}
      {weeklySkipDeliveredModalCount !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="weekly-skip-delivered-title"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={dismissWeeklySkipDeliveredModal}
            aria-hidden
          />
          <div className="relative max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 id="weekly-skip-delivered-title" className="text-base font-semibold text-gray-900">
              Skip a delivered day?
            </h3>
            <p className="mt-3 text-sm text-gray-600">
              {weeklySkipDeliveredModalCount === 1
                ? 'A meal on a skipped weekday is already marked as delivered. Are you sure you want to mark it as skipped?'
                : `${weeklySkipDeliveredModalCount} meals on skipped weekdays are already marked as delivered. Are you sure you want to mark them as skipped?`}{' '}
              Delivered status will be removed and your remaining meal balance will be updated.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={dismissWeeklySkipDeliveredModal}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmWeeklySkipForDeliveredMeals()}
                disabled={savingWeeklyDeliveredFollowUp}
                className="rounded-md bg-nutrafi-primary px-3 py-2 text-sm font-medium text-white hover:bg-nutrafi-dark disabled:opacity-50"
              >
                {savingWeeklyDeliveredFollowUp ? 'Saving…' : 'Mark as skipped'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meal Item Detail Modal */}
      {showModal && selectedItem && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-2 lg:p-4"
          onClick={() => setShowModal(false)}
        >
          {/* Blurred Background */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>
          
          {/* Modal Box */}
          <div 
            className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-2 py-2 lg:px-6 lg:py-4 flex justify-between items-center">
              <h3 className="text-base lg:text-lg font-semibold text-gray-900">
                Meal Details - {selectedItem.dishName || 'No Dish Assigned'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg lg:text-2xl font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="p-3 lg:p-5 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-2 lg:p-4">
                <div>
                  <label className="text-xs font-medium text-gray-500">Day</label>
                  <p className="text-sm text-gray-900 font-semibold">{getDayName(selectedItem.date)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Date</label>
                  <div className="mt-0.5 flex items-center gap-2">
                    <input
                      type="date"
                      value={itemDateEdit}
                      onChange={(e) => setItemDateEdit(e.target.value)}
                      className="block rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-nutrafi-primary focus:ring-nutrafi-primary"
                    />
                    {itemDateEdit !== format(new Date(selectedItem.date), 'yyyy-MM-dd') && (
                      <button
                        type="button"
                        onClick={handleUpdateDate}
                        disabled={savingDate}
                        className="rounded-md bg-nutrafi-primary px-2 py-1.5 text-xs font-medium text-white hover:bg-nutrafi-primary/90 disabled:opacity-50"
                      >
                        {savingDate ? 'Updating…' : 'Update date'}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Time Slot</label>
                  <p className="text-sm text-gray-900 font-semibold">{formatTime12Hour(selectedItem.timeSlot)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Status</label>
                  <select
                    value={
                      selectedItem.isSkipped
                        ? 'SKIPPED'
                        : selectedItem.isDelivered
                          ? 'DELIVERED'
                          : selectedItem.wrongDelivery
                            ? 'WRONG_DELIVERY'
                            : (!selectedItem.dishId && !selectedItem.dishName)
                              ? 'INACTIVE'
                              : 'ACTIVE'
                    }
                    onChange={(e) => {
                      const v = e.target.value as
                        | 'ACTIVE'
                        | 'INACTIVE'
                        | 'SKIPPED'
                        | 'DELIVERED'
                        | 'WRONG_DELIVERY'
                      if (v === 'SKIPPED') {
                        handleSkipMeal(selectedItem.id, true)
                      } else if (v === 'DELIVERED') {
                        handleMarkAsDelivered(selectedItem.id, true)
                      } else if (v === 'WRONG_DELIVERY') {
                        handleWrongDelivery(selectedItem.id, true)
                      } else {
                        if (selectedItem.isSkipped) handleSkipMeal(selectedItem.id, false)
                        if (selectedItem.isDelivered) handleMarkAsDelivered(selectedItem.id, false)
                        if (selectedItem.wrongDelivery) handleWrongDelivery(selectedItem.id, false)
                      }
                    }}
                    disabled={skippingMeal || settingWrongDelivery}
                    className="mt-0.5 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm font-medium text-gray-900 focus:border-nutrafi-primary focus:ring-nutrafi-primary disabled:opacity-50"
                  >
                    <option value="INACTIVE">Inactive</option>
                    <option value="ACTIVE">Active</option>
                    <option value="WRONG_DELIVERY">Wrong delivery</option>
                    <option value="SKIPPED">Skipped</option>
                    <option value="DELIVERED">Delivered</option>
                  </select>
                </div>
              </div>

              {/* Dish Information */}
              {selectedItem.dishName && (
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-md font-semibold text-gray-900 mb-3 lg:mb-6">Dish Information</h4>
                  <div className="grid grid-cols-2 gap-2 lg:p-4">
                    <div>
                      <label className="text-xs font-medium text-gray-500">Dish Name</label>
                      <p className="text-sm text-gray-900">{selectedItem.dishName}</p>
                    </div>
                    {selectedItem.dishCategory && (
                      <div>
                        <label className="text-xs font-medium text-gray-500">Category</label>
                        <p className="text-sm text-gray-900">{formatCategory(selectedItem.dishCategory)}</p>
                      </div>
                    )}
                    {selectedItem.dishDescription && (
                      <div className="col-span-2">
                        <label className="text-xs font-medium text-gray-500">Description</label>
                        <p className="text-sm text-gray-900">{selectedItem.dishDescription}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Ingredients */}
              {selectedItem.ingredients && (
                <div className="border-t border-gray-200 pt-4">
                  <label className="text-xs font-medium text-gray-500">Ingredients</label>
                  <p className="text-sm text-gray-900 mt-1">{selectedItem.ingredients}</p>
                </div>
              )}

              {/* Allergens */}
              {selectedItem.allergens && (
                <div className="border-t border-gray-200 pt-4">
                  <label className="text-xs font-medium text-gray-500">Allergens</label>
                  <p className="text-sm text-gray-900 mt-1">{selectedItem.allergens || 'None'}</p>
                </div>
              )}


              {/* Instructions / Notes */}
              {(() => {
                const itemAny = selectedItem as { deliveryType?: string; deliveryLocation?: string }
                const parsed = parseCustomNote(selectedItem.customNote)
                const noteText = (selectedItem.customNote && !selectedItem.customNote.trim().startsWith('{'))
                  ? selectedItem.customNote
                  : (parsed?.note ?? parsed?.instructions)
                if (noteText) {
                  return (
                    <div className="border-t border-gray-200 pt-4">
                      <label className="text-xs font-medium text-gray-500">Notes</label>
                      <p className="text-sm text-gray-900 mt-1">{noteText}</p>
                    </div>
                  )
                }
                return null
              })()}

              {/* Delivery Information */}
              {(() => {
                const itemAny = selectedItem as { deliveryType?: string; deliveryLocation?: string }
                const deliveryType = itemAny.deliveryType
                const deliveryLocation = itemAny.deliveryLocation
                const parsed = parseCustomNote(selectedItem.customNote)
                const loc = deliveryLocation ?? parsed?.deliveryLocation ?? parsed?.location
                const type = deliveryType ?? parsed?.deliveryType
                if (loc || type) {
                  return (
                    <div className="border-t border-gray-200 pt-4">
                      <h4 className="text-md font-semibold text-gray-900 mb-3 lg:mb-6">Delivery Information</h4>
                      <div className="grid grid-cols-2 gap-2 lg:p-4">
                        {type && (
                          <div>
                            <label className="text-xs font-medium text-gray-500">Delivery Type</label>
                            <p className="text-sm text-gray-900 capitalize">{type}</p>
                          </div>
                        )}
                        {loc && (
                          <div>
                            <label className="text-xs font-medium text-gray-500">Location</label>
                            <p className="text-sm text-gray-900">{loc}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }
                return null
              })()}
            </div>

            {/* Add/Edit Dish Form */}
            {editingDish && (
              <div className="border-t border-gray-200 pt-4 px-6 pb-4 space-y-4 bg-gray-50">
                <h4 className="text-md font-semibold text-gray-900 mb-3 lg:mb-6">Add Dish to This Meal</h4>
                
                <div className="space-y-4">
                  {/* Searchable Dish Dropdown */}
                  <div className="relative">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Select Dish</label>
                    <div className="relative dish-dropdown-container">
                      <button
                        type="button"
                        onClick={() => setDishDropdownOpen(!dishDropdownOpen)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary bg-white text-left flex items-center justify-between"
                      >
                        <span className={dishFormData.dishId ? 'text-gray-900' : 'text-gray-500'}>
                          {dishFormData.dishId ? dishes.find(d => d.id === dishFormData.dishId)?.name || 'Select dish' : 'Select dish (optional)'}
                        </span>
                        <svg className={`w-4 h-4 text-gray-500 transition-transform ${dishDropdownOpen ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      
                      {dishDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-[320px] overflow-auto">
                          <div className="p-2 lg:p-4 border-b border-gray-200 sticky top-0 bg-white">
                            <input
                              type="text"
                              placeholder="Search dishes..."
                              value={dishSearchQuery}
                              onChange={(e) => setDishSearchQuery(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                              autoFocus
                            />
                          </div>
                          <div className="max-h-[280px] overflow-auto">
                            {(() => {
                              const filteredDishes = Array.isArray(dishes) ? dishes.filter(dish => 
                                dish.name.toLowerCase().includes(dishSearchQuery.toLowerCase()) ||
                                dish.category.toLowerCase().includes(dishSearchQuery.toLowerCase())
                              ) : []
                              return filteredDishes.length > 0 ? (
                                filteredDishes.slice(0, 6).map((dish) => (
                                  <button
                                    key={dish.id}
                                    type="button"
                                    onClick={() => {
                                      handleDishSelect(dish.id)
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                                      dishFormData.dishId === dish.id ? 'bg-nutrafi-primary/10 text-nutrafi-primary font-medium' : 'text-gray-900'
                                    }`}
                                  >
                                    {dish.name} ({dish.category})
                                  </button>
                                ))
                              ) : (
                                <div className="px-3 py-2 text-sm text-gray-500">No dishes found</div>
                              )
                            })()}
                            {(() => {
                              const filteredDishes = Array.isArray(dishes) ? dishes.filter(dish => 
                                dish.name.toLowerCase().includes(dishSearchQuery.toLowerCase()) ||
                                dish.category.toLowerCase().includes(dishSearchQuery.toLowerCase())
                              ) : []
                              return filteredDishes.length > 6 ? (
                                <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100">
                                  Showing 6 of {filteredDishes.length} — type to search
                                </div>
                              ) : null
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Delivery Type, Time, Location */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 lg:p-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Type</label>
                      <select
                        value={dishFormData.deliveryType}
                        onChange={(e) => setDishFormData({ ...dishFormData, deliveryType: e.target.value as 'delivery' | 'pickup' })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                      >
                        <option value="delivery">Delivery</option>
                        <option value="pickup">Pickup</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Time</label>
                      <input
                        type="time"
                        value={dishFormData.deliveryTime}
                        onChange={(e) => setDishFormData({ ...dishFormData, deliveryTime: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                      />
                    </div>
                    
                    {dishFormData.deliveryType === 'delivery' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Address</label>
                        <input
                          type="text"
                          value={dishFormData.location}
                          onChange={(e) => setDishFormData({ ...dishFormData, location: e.target.value })}
                          placeholder={mealPlan?.customer.deliveryArea || 'Delivery Address'}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                        />
                      </div>
                    )}
                  </div>

                  {/* Notes Field - Always Visible */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={dishFormData.customNote}
                      onChange={(e) => setDishFormData({ ...dishFormData, customNote: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                      rows={2}
                      placeholder="Add any notes for this meal..."
                    />
                  </div>

                  {/* Show/Hide Details Button */}
                  <div className="flex items-center gap-2 lg:p-4">
                    <button
                      type="button"
                      onClick={() => setShowDishDetails(!showDishDetails)}
                      className="px-3 py-1.5 lg:px-4 lg:py-2 text-sm bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 whitespace-nowrap"
                      title={showDishDetails ? "Hide Dish Details" : "Show Dish Details"}
                    >
                      {showDishDetails ? 'Hide Details' : 'Show Details'}
                    </button>
                  </div>

                  {/* Dish Details Fields - Collapsible */}
                  {showDishDetails && (
                    <div className="border-t border-gray-200 pt-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 lg:p-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Dish Name *</label>
                          <input
                            type="text"
                            value={dishFormData.dishName}
                            onChange={(e) => setDishFormData({ ...dishFormData, dishName: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            required
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                          <select
                            value={dishFormData.dishCategory}
                            onChange={(e) => setDishFormData({ ...dishFormData, dishCategory: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                          >
                            <option value="BREAKFAST">Breakfast</option>
                            <option value="LUNCH">Lunch</option>
                            <option value="DINNER">Dinner</option>
                            <option value="LUNCH_DINNER">Lunch/Dinner</option>
                            <option value="SNACK">Snack</option>
                            <option value="SMOOTHIE">Smoothie</option>
                            <option value="JUICE">Juice</option>
                          </select>
                        </div>
                        
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                          <textarea
                            value={dishFormData.dishDescription}
                            onChange={(e) => setDishFormData({ ...dishFormData, dishDescription: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            rows={2}
                          />
                        </div>
                        
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Ingredients</label>
                          <textarea
                            value={dishFormData.ingredients}
                            onChange={(e) => setDishFormData({ ...dishFormData, ingredients: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            rows={2}
                          />
                        </div>
                        
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Allergens</label>
                          <input
                            type="text"
                            value={dishFormData.allergens}
                            onChange={(e) => setDishFormData({ ...dishFormData, allergens: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            placeholder="e.g., Dairy, Eggs, Gluten"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Calories (kcal) *</label>
                          <input
                            type="number"
                            value={dishFormData.calories}
                            onChange={(e) => setDishFormData({ ...dishFormData, calories: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            required
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Protein (g) *</label>
                          <input
                            type="number"
                            step="0.1"
                            value={dishFormData.protein}
                            onChange={(e) => setDishFormData({ ...dishFormData, protein: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            required
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Carbs (g) *</label>
                          <input
                            type="number"
                            step="0.1"
                            value={dishFormData.carbs}
                            onChange={(e) => setDishFormData({ ...dishFormData, carbs: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            required
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Fats (g) *</label>
                          <input
                            type="number"
                            step="0.1"
                            value={dishFormData.fats}
                            onChange={(e) => setDishFormData({ ...dishFormData, fats: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-2 py-2 lg:px-6 lg:py-4 flex justify-between items-center">
              <div className="flex gap-2 lg:p-4">
                {((!selectedItem.dishName || selectedItem.dishName?.trim() === '') && (!selectedItem.dishId || selectedItem.dishId === '')) && !editingDish && (
                  <button
                    onClick={() => setEditingDish(true)}
                    className="px-3 py-1.5 lg:px-4 lg:py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark font-medium"
                  >
                    Add Dish
                  </button>
                )}
                {((!selectedItem.dishName || selectedItem.dishName?.trim() === '') && (!selectedItem.dishId || selectedItem.dishId === '')) && editingDish && (
                  <>
                    <button
                      onClick={handleSaveDish}
                      disabled={savingDish}
                      className="px-3 py-1.5 lg:px-4 lg:py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium disabled:opacity-50"
                    >
                      {savingDish ? 'Saving...' : 'Save Dish'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingDish(false)
                        handleItemClick(selectedItem) // Reset form data
                      }}
                      disabled={savingDish}
                      className="px-3 py-1.5 lg:px-4 lg:py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {/* Edit Dish button - show when dish exists and not editing */}
                {((selectedItem.dishName && selectedItem.dishName.trim() !== '') || (selectedItem.dishId && selectedItem.dishId !== '')) && !editingDish && (
                  <button
                    onClick={() => setEditingDish(true)}
                    className="px-3 py-1.5 lg:px-4 lg:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                  >
                    Edit Dish
                  </button>
                )}
                {/* Save/Cancel when editing existing dish */}
                {((selectedItem.dishName && selectedItem.dishName.trim() !== '') || (selectedItem.dishId && selectedItem.dishId !== '')) && editingDish && (
                  <>
                    <button
                      onClick={handleSaveDish}
                      disabled={savingDish}
                      className="px-3 py-1.5 lg:px-4 lg:py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium disabled:opacity-50"
                    >
                      {savingDish ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingDish(false)
                        handleItemClick(selectedItem) // Reset form data
                      }}
                      disabled={savingDish}
                      className="px-3 py-1.5 lg:px-4 lg:py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
                <div className="relative actions-menu-container">
                  <button
                    type="button"
                    onClick={() => setActionsMenuOpen(!actionsMenuOpen)}
                    className="px-3 py-1.5 lg:px-4 lg:py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium flex items-center gap-1"
                  >
                    Actions
                    <svg className={`w-4 h-4 transition-transform ${actionsMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {actionsMenuOpen && (
                    <div className="absolute left-0 bottom-full mb-1 z-50 min-w-[180px] rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                      <button
                        type="button"
                        onClick={() => {
                          setActionsMenuOpen(false)
                          handleMarkAsDelivered(selectedItem.id, !selectedItem.isDelivered)
                        }}
                        className={`w-full text-left px-3 py-2 text-sm ${
                          selectedItem.isDelivered ? 'text-gray-600 hover:bg-gray-100' : 'text-nutrafi-dark hover:bg-nutrafi-primary/10'
                        }`}
                      >
                        {selectedItem.isDelivered ? 'Mark as Not Delivered' : 'Mark as Delivered'}
                      </button>
                      {!selectedItem.isSkipped && (selectedItem.dishId || selectedItem.dishName) && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionsMenuOpen(false)
                            handleWrongDelivery(selectedItem.id, !selectedItem.wrongDelivery)
                          }}
                          disabled={settingWrongDelivery}
                          className="w-full text-left px-3 py-2 text-sm text-orange-800 hover:bg-orange-50 disabled:opacity-50"
                        >
                          {selectedItem.wrongDelivery ? 'Clear wrong delivery' : 'Mark wrong delivery'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setActionsMenuOpen(false)
                          handleDeleteMeal(selectedItem.id)
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        Delete meal
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActionsMenuOpen(false)
                          handleRemoveDay()
                        }}
                        disabled={removingDay}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {removingDay ? 'Removing...' : `Remove ${getDayName(selectedItem.date)} from schedule`}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 lg:px-4 lg:py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

