'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { format, addDays, eachDayOfInterval, parseISO } from 'date-fns'
import { getPlanWeekNumber, getMondayOfPlanWeek, planWeekDayStringsOnOrAfterStart } from '@/lib/meal-plan-weeks'
import {
  normalizeWeeklySkipDays,
  shouldSkipCalendarDay,
  WEEKDAY_SKIP_TOGGLES,
} from '@/lib/meal-plan-skip-days'
import { useNotification } from '@/components/notifications/NotificationContext'
import { CustomerInstructionsBanner } from '@/components/customers/CustomerInstructionsBanner'
import { NewMealPlanImportButton } from '@/components/meal-plans/import-default-plan/NewMealPlanImportButton'

interface Customer {
  id: string
  fullName: string
  phone: string
  email: string | null
  deliveryArea: string
  instructions?: string | null
}

interface Plan {
  id: string
  name: string
  planType: string
  days: number
  mealsPerDay: number
  price: number
}

interface Dish {
  id: string
  name: string
  category: string
  price: number | null
  description?: string | null
  ingredients?: string | null
  allergens?: string | null
  calories?: number
  protein?: number
  carbs?: number
  fats?: number
}

type PlanMode = 'predefined' | 'custom'

/** User-selected times only — excludes empty placeholders before a time is chosen. */
function effectiveMealPlanTimeSlots(slots: string[] | undefined): string[] {
  return (Array.isArray(slots) ? slots : []).filter((s) => typeof s === 'string' && s.trim().length > 0)
}

function findWizardMealDish(
  dishes: { id: string | number; name: string }[],
  meal: { dishId?: string; dishName?: string | null }
): { id: string | number; name: string } | null {
  const id = meal.dishId != null ? String(meal.dishId).trim() : ''
  if (id) {
    const match = dishes.find((d) => String(d.id) === id)
    if (match) return match
  }
  const name = meal.dishName?.trim()
  if (name) return { id: id || name, name }
  return null
}

function wizardDishIdsMatch(
  mealDishId: string | undefined,
  dishId: string | number
): boolean {
  const a = mealDishId != null ? String(mealDishId).trim() : ''
  if (!a) return false
  return a === String(dishId)
}

/**
 * Contract total meal slots for the plan (not `formData.meals.length`).
 * Uses start date + day span, explicit skipped days, skipped plan weeks, and default weekly skip days.
 * **`planType` is not used** — Weekly / Monthly / Custom is informational for the saved row only.
 */
/** True when this calendar date has no contract meals (skipped plan week, explicit skip, or default weekly skip). */
function isCreateWizardDateSkipped(
  dateStr: string,
  startDateStr: string,
  _planType: string,
  skippedDays: string[],
  skippedWeeks: number[],
  weeklySkipDays: number[],
  defaultSkipExceptionDates: string[]
): boolean {
  if (!startDateStr) return false
  const week = getPlanWeekNumber(dateStr, startDateStr)
  if (skippedWeeks.includes(week)) return true
  if (skippedDays.includes(dateStr)) return true
  const norm = normalizeWeeklySkipDays(weeklySkipDays)
  if (norm.length === 0) return false
  if (defaultSkipExceptionDates.includes(dateStr)) return false
  return shouldSkipCalendarDay(dateStr, norm)
}

/** Valid positive integer in the field wins; otherwise days × meals per day. */
function effectiveTotalMealsFromForm(daysStr: string, mpdStr: string, totalMealsStr: string): number {
  const d = parseInt(daysStr, 10)
  const mpd = parseInt(mpdStr, 10)
  const naive =
    Number.isFinite(d) && d >= 1 && Number.isFinite(mpd) && mpd >= 1 ? d * mpd : 0
  const raw = totalMealsStr.trim()
  if (raw !== '') {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 1) return Math.min(n, 1_000_000)
  }
  return naive
}

function formatDefaultSkipDaysSummary(days: number[]): string {
  const norm = normalizeWeeklySkipDays(days)
  if (norm.length === 0) return 'No skip days'
  const byVal = new Map(WEEKDAY_SKIP_TOGGLES.map((t) => [t.value, t.label]))
  return norm.map((v) => byVal.get(v) ?? String(v)).join(', ')
}

function DefaultSkipDaysMultiSelect({
  value,
  onChange,
}: {
  value: number[]
  onChange: (next: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const summary = formatDefaultSkipDaysSummary(value)

  return (
    <div ref={ref} className="mb-6 w-full relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">Default skip days</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-md bg-white text-left text-sm text-gray-900 hover:bg-gray-50"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{summary}</span>
        <span className="text-gray-500 shrink-0 text-xs" aria-hidden>
          ▼
        </span>
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 w-full rounded-md border border-gray-200 bg-white py-1 shadow-lg max-h-60 overflow-y-auto"
          role="listbox"
        >
          {WEEKDAY_SKIP_TOGGLES.map(({ label, value: dayValue }) => {
            const on = value.includes(dayValue)
            return (
              <label
                key={dayValue}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-nutrafi-primary focus:ring-nutrafi-primary shrink-0"
                  checked={on}
                  onChange={() => {
                    const s = new Set(value)
                    if (s.has(dayValue)) s.delete(dayValue)
                    else s.add(dayValue)
                    onChange(Array.from(s).sort((a, b) => a - b))
                  }}
                />
                {label}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Day colors: different colour per day – pink, blue, green, red, teal, orange, violet (solid header + gradient day background)
const getDayOfWeekIndex = (date: string) => new Date(date).getDay()
const DAY_COLORS = [
  { border: '#be185d', top: '#be185d', bg: '#ffffff', header: '#be185d', dayGradient: 'linear-gradient(180deg, #fce7f3 0%, #ffffff 100%)' },   // Sunday - pink
  { border: '#1d4ed8', top: '#1d4ed8', bg: '#ffffff', header: '#1d4ed8', dayGradient: 'linear-gradient(180deg, #dbeafe 0%, #ffffff 100%)' },   // Monday - blue
  { border: '#15803d', top: '#15803d', bg: '#ffffff', header: '#15803d', dayGradient: 'linear-gradient(180deg, #dcfce7 0%, #ffffff 100%)' },   // Tuesday - green
  { border: '#b91c1c', top: '#b91c1c', bg: '#ffffff', header: '#b91c1c', dayGradient: 'linear-gradient(180deg, #fee2e2 0%, #ffffff 100%)' },   // Wednesday - red
  { border: '#0d9488', top: '#0d9488', bg: '#ffffff', header: '#0d9488', dayGradient: 'linear-gradient(180deg, #ccfbf1 0%, #ffffff 100%)' },   // Thursday - teal
  { border: '#c2410c', top: '#c2410c', bg: '#ffffff', header: '#c2410c', dayGradient: 'linear-gradient(180deg, #ffedd5 0%, #ffffff 100%)' },   // Friday - orange
  { border: '#6d28d9', top: '#6d28d9', bg: '#ffffff', header: '#6d28d9', dayGradient: 'linear-gradient(180deg, #ede9fe 0%, #ffffff 100%)' },   // Saturday - violet
]

export default function NewMealPlanPage() {
  const router = useRouter()
  const toast = useNotification()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [dishes, setDishes] = useState<Dish[]>([])
  const [planMode, setPlanMode] = useState<PlanMode>('predefined')
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [expandedMealFields, setExpandedMealFields] = useState<Set<string>>(new Set())
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [dishSearchQueries, setDishSearchQueries] = useState<Record<string, string>>({})
  const [openDishDropdowns, setOpenDishDropdowns] = useState<Set<string>>(new Set())
  const [dropdownAnchor, setDropdownAnchor] = useState<{ mealKey: string; top: number; left: number; width: number } | null>(null)
  const [hoveredDishIdInDropdown, setHoveredDishIdInDropdown] = useState<string | null>(null)
  const [visibleWeeks, setVisibleWeeks] = useState<number[]>([1]) // Start with only week 1 visible
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<number>>(new Set()) // Track collapsed weeks
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set()) // Track collapsed days
  const [visibleDaysByWeek, setVisibleDaysByWeek] = useState<Record<number, string[]>>({}) // Track visible days per week
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const customerDropdownRef = useRef<HTMLDivElement>(null)
  const skipNextGenerateMealsRef = useRef(false)

  const [formData, setFormData] = useState({
    customerId: '',
    planId: '',
    planType: 'WEEKLY',
    days: '',
    mealsPerDay: '2',
    timeSlots: [''] as string[], // User must choose a time; no preset default
    startDate: '',
    endDate: '',
    status: 'ACTIVE',
    notes: '',
    // Payment
    paymentAmount: '',
    paymentStatus: 'PENDING',
    paymentMethod: '',
    // Custom plan
    pricePerMeal: '',
    // Meal configuration
    deliveryType: 'delivery', // 'delivery' or 'pickup'
    meals: [] as Array<{
      date: string
      timeSlot: string
      dishId: string
      dishName?: string
      dishDescription?: string
      dishCategory?: string
      ingredients?: string
      allergens?: string
      calories?: number
      protein?: number
      carbs?: number
      fats?: number
      price?: number
      deliveryType: 'delivery' | 'pickup'
      deliveryTime?: string
      location: string
      isSkipped: boolean
      showDishFields?: boolean
      customNote?: string
    }>,
    skippedWeeks: [] as number[], // Array of week numbers to skip
    skippedDays: [] as string[], // Array of dates to skip
    /** Plan default skip weekdays (Mon=1 … Sun=7), same as meal plan `weeklySkipDays` */
    weeklySkipDays: [] as number[],
    /** Dates that would match `weeklySkipDays` but the user chose to keep meals (step 4) */
    defaultSkipExceptionDates: [] as string[],
    /** Customer already had a plan off-portal — only this many meals are left on the contract */
    legacyMidPlan: false,
    legacyMealsRemaining: '',
    /** Total meals (POST); synced from days × meals per day unless edited */
    totalMeals: '',
  })

  useEffect(() => {
    fetchCustomers()
    fetchPlans()
    fetchDishes()
    
    // Check if customerId is in URL params
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const customerId = urlParams.get('customerId')
      if (customerId) {
        setFormData(prev => ({ ...prev, customerId }))
        setStep(2) // Skip to plan selection if customer is pre-selected
      }
    }
  }, [])

  // Close customer dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setCustomerDropdownOpen(false)
      }
    }
    if (customerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [customerDropdownOpen])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.dish-dropdown-container')) {
        setOpenDishDropdowns(new Set())
        setDropdownAnchor(null)
      }
    }
    
    if (openDishDropdowns.size > 0) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    } else {
      setDropdownAnchor(null)
      setHoveredDishIdInDropdown(null)
    }
  }, [openDishDropdowns])

  // Close dropdown when user scrolls (dropdown is fixed so it would stay in wrong place)
  useEffect(() => {
    const handleScroll = () => {
      if (openDishDropdowns.size > 0) {
        setOpenDishDropdowns(new Set())
        setDropdownAnchor(null)
      }
    }
    window.addEventListener('scroll', handleScroll, true) // capture phase to catch scroll inside scrollable divs
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [openDishDropdowns])

  // Generate time options for dropdowns (every 30 minutes from 00:00 to 23:30)
  const generateTimeOptions = (): string[] => {
    const times: string[] = []
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
        times.push(timeStr)
      }
    }
    return times
  }

  const timeOptions = generateTimeOptions()

  useEffect(() => {
    if (formData.planId) {
      const selectedPlan = plans.find(p => p.id == formData.planId)
      if (selectedPlan) {
        const product = selectedPlan.days * selectedPlan.mealsPerDay
        setVisibleWeeks([1]) // Reset to show only week 1
        setFormData((prev) => {
          const mpd = selectedPlan.mealsPerDay
          let timeSlots = prev.timeSlots?.length ? [...prev.timeSlots] : ['']
          const filled = effectiveMealPlanTimeSlots(timeSlots)
          if (filled.length === 0) {
            timeSlots = Array.from({ length: mpd }, () => '')
          } else if (filled.length < mpd) {
            while (timeSlots.filter((s) => s.trim()).length < mpd) {
              timeSlots.push('')
            }
          }
          return {
            ...prev,
            planType: selectedPlan.planType,
            mealsPerDay: selectedPlan.mealsPerDay.toString(),
            days: selectedPlan.days.toString(),
            timeSlots,
            totalMeals: String(product),
          }
        })
      }
    }
  }, [formData.planId, plans])

  // Also handle custom plans — sync total meals from days × meals per day; time slots stay as one (or user-added)
  useEffect(() => {
    if (planMode === 'custom' && formData.days && formData.mealsPerDay) {
      const d = parseInt(formData.days, 10)
      const mpd = parseInt(formData.mealsPerDay, 10)
      if (!Number.isFinite(d) || !Number.isFinite(mpd) || d < 1 || mpd < 1) return
      setVisibleWeeks([1])
      setFormData((prev) => ({ ...prev, totalMeals: String(d * mpd) }))
    }
  }, [planMode, formData.days, formData.mealsPerDay])

  useEffect(() => {
    // Only generate meals if we have all required fields and we're on step 4 or beyond
    // This prevents generating meals too early or multiple times
    if (step >= 4 && formData.startDate && formData.days && formData.mealsPerDay && effectiveMealPlanTimeSlots(formData.timeSlots).length > 0) {
      generateMeals()
    }
  }, [
    step,
    formData.startDate,
    formData.days,
    formData.mealsPerDay,
    formData.timeSlots,
    formData.deliveryType,
    formData.customerId,
    formData.skippedDays,
    formData.skippedWeeks,
    formData.weeklySkipDays,
    formData.defaultSkipExceptionDates,
  ])
  
  // Create stable string representation of visibleWeeks for dependency array
  const visibleWeeksKey = visibleWeeks.join(',')

  // Regenerate meals when visible weeks change
  useEffect(() => {
    if (skipNextGenerateMealsRef.current) {
      skipNextGenerateMealsRef.current = false
      return
    }
    if (step >= 4 && formData.startDate && formData.days && formData.mealsPerDay && effectiveMealPlanTimeSlots(formData.timeSlots).length > 0) {
      generateMeals()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleWeeksKey]) // Use stable string key

  // Generate meals when entering step 4 if not already generated
  useEffect(() => {
    if (step === 4) {
      // If startDate is not set, default to today
      if (!formData.startDate && formData.days) {
        const today = new Date().toISOString().split('T')[0]
        setFormData(prev => ({ ...prev, startDate: today }))
        // The main useEffect will handle meal generation when startDate is set
      } else if (formData.startDate && formData.days && formData.mealsPerDay && effectiveMealPlanTimeSlots(formData.timeSlots).length > 0) {
        // Check if we need to generate meals for visible weeks
        const hasMealsForVisibleWeeks = visibleWeeks.some(week => {
          return formData.meals.some(meal => {
            const mealWeek = getPlanWeekNumber(meal.date, formData.startDate)
            return mealWeek === week
          })
        })
        
        // Generate meals if we don't have meals for visible weeks
        if (!hasMealsForVisibleWeeks) {
          generateMeals()
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, visibleWeeksKey])

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers?status=ACTIVE&limit=1000')
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) {
          setCustomers(data)
        } else if (data.customers && Array.isArray(data.customers)) {
          setCustomers(data.customers)
        }
      }
    } catch (error) {
      console.error('Error fetching customers:', error)
    }
  }

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/plans?isActive=true')
      if (response.ok) {
        const data = await response.json()
        setPlans(data)
      }
    } catch (error) {
      console.error('Error fetching plans:', error)
    }
  }

  const fetchDishes = async () => {
    try {
      const response = await fetch('/api/menu?status=ACTIVE&limit=1000')
      if (response.ok) {
        const data = await response.json()
        // API returns { dishes, total, page, limit, totalPages }
        setDishes(Array.isArray(data.dishes) ? data.dishes : Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Error fetching dishes:', error)
      setDishes([]) // Set to empty array on error
    }
  }

  const updateMeal = (date: string, timeSlot: string, field: string, value: any, mealIndex?: number) => {
    const selectedCustomer = customers.find(c => c.id == formData.customerId)
    let occurrenceIndex = 0
    const newMeals = formData.meals.map(meal => {
      if (meal.date === date && meal.timeSlot === timeSlot) {
        const isTargetMeal = mealIndex === undefined || occurrenceIndex === mealIndex
        occurrenceIndex++
        if (!isTargetMeal) return meal
        const updated = { ...meal, [field]: value }
        
        // If dishId is being set, auto-populate dish fields
        if (field === 'dishId' && value) {
          const selectedDish = dishes.find(d => d.id === value)
          if (selectedDish) {
            updated.dishName = selectedDish.name
            updated.dishCategory = selectedDish.category
            updated.dishDescription = selectedDish.description || ''
            updated.ingredients = selectedDish.ingredients || ''
            updated.allergens = selectedDish.allergens || ''
            updated.calories = selectedDish.calories || 0
            updated.protein = selectedDish.protein || 0
            updated.carbs = selectedDish.carbs || 0
            updated.fats = selectedDish.fats || 0
            updated.price = selectedDish.price || 0
            updated.showDishFields = false // Details hidden by default
          }
        } else if (field === 'dishId' && !value) {
          // Clear dish fields when dish is deselected
          updated.dishName = ''
          updated.dishCategory = ''
          updated.dishDescription = ''
          updated.ingredients = ''
          updated.allergens = ''
          updated.calories = undefined
          updated.protein = undefined
          updated.carbs = undefined
          updated.fats = undefined
          updated.price = undefined
        }
        
        // If delivery type changes to pickup, clear location
        if (field === 'deliveryType' && value === 'pickup') {
          updated.location = ''
        } else if (field === 'deliveryType' && value === 'delivery') {
          updated.location = selectedCustomer?.deliveryArea || ''
        }
        
        return updated
      }
      return meal
    })
    setFormData({ ...formData, meals: newMeals })
  }

  const formatTime12Hour = (timeSlot: string): string => {
    try {
      const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
      if (!timeMatch) return timeSlot
      
      let hours = parseInt(timeMatch[1])
      const minutes = timeMatch[2]
      
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

  const generateMeals = () => {
    if (!formData.startDate || !formData.days || !formData.mealsPerDay || !formData.timeSlots) return

    try {
      const startDate = new Date(formData.startDate)
      const days = parseInt(formData.days)
      const endDate = addDays(startDate, days - 1)
      const dates = eachDayOfInterval({ start: startDate, end: endDate })
      
      const timeSlots = effectiveMealPlanTimeSlots(formData.timeSlots)
      if (timeSlots.length === 0) {
        return
      }
      
      const selectedCustomer = customers.find(c => c.id == formData.customerId)
      const mealsPerDay = parseInt(formData.mealsPerDay)

      const dateSkippedOnPlan = (dateStr: string) =>
        isCreateWizardDateSkipped(
          dateStr,
          formData.startDate,
          formData.planType,
          formData.skippedDays,
          formData.skippedWeeks,
          formData.weeklySkipDays,
          formData.defaultSkipExceptionDates
        )

      // Only create rows for days the user has opened ("Add Day"), not the whole week — keeps capacity in sync with the UI.
      const effectiveVisibleDaysByWeek: Record<number, string[]> = { ...visibleDaysByWeek }
      visibleWeeks.forEach((week) => {
        if (!effectiveVisibleDaysByWeek[week]?.length) {
          if (week === 1) {
            effectiveVisibleDaysByWeek[week] = [format(startDate, 'yyyy-MM-dd')]
          } else {
            effectiveVisibleDaysByWeek[week] = [
              format(getMondayOfPlanWeek(formData.startDate, week), 'yyyy-MM-dd'),
            ]
          }
        }
      })

      const existingMeals = formData.meals.filter((meal) => {
        const week = getPlanWeekNumber(meal.date, formData.startDate)
        if (!visibleWeeks.includes(week)) return true
        if (effectiveVisibleDaysByWeek[week]?.includes(meal.date)) return true
        if (meal.dishId || meal.dishName) return true
        return false
      })

      const mealKeys = new Set<string>()
      for (const meal of existingMeals) {
        const week = getPlanWeekNumber(meal.date, formData.startDate)
        if (!visibleWeeks.includes(week)) continue
        if (!effectiveVisibleDaysByWeek[week]?.includes(meal.date)) continue
        const dayMeals = existingMeals.filter((m) => m.date === meal.date)
        const idx = dayMeals.indexOf(meal)
        mealKeys.add(`${meal.date}-${idx}`)
      }

      const newMeals: typeof formData.meals = []

      const dateStrSet = new Set<string>()
      dates.forEach((d) => dateStrSet.add(format(d, 'yyyy-MM-dd')))
      visibleWeeks.forEach((w) => {
        for (const key of planWeekDayStringsOnOrAfterStart(formData.startDate, w)) {
          dateStrSet.add(key)
        }
      })
      const sortedDateStrs = [...dateStrSet].sort()

      sortedDateStrs.forEach((dateStr) => {
        const week = getPlanWeekNumber(dateStr, formData.startDate)

        if (!visibleWeeks.includes(week)) return
        if (!effectiveVisibleDaysByWeek[week]?.includes(dateStr)) return
        if (timeSlots.length === 0) return

        for (let mealIndex = 0; mealIndex < mealsPerDay; mealIndex++) {
          const mealKey = `${dateStr}-${mealIndex}`
          if (mealKeys.has(mealKey)) continue
          mealKeys.add(mealKey)
          
          const timeSlot = timeSlots[mealIndex % timeSlots.length]
          const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
          let deliveryTime = ''
          if (timeMatch) {
            let hours = parseInt(timeMatch[1])
            const minutes = timeMatch[2]
            if (timeSlot.toUpperCase().includes('PM') && hours !== 12) hours += 12
            else if (timeSlot.toUpperCase().includes('AM') && hours === 12) hours = 0
            deliveryTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`
          } else {
            deliveryTime = timeSlot
          }
          
          newMeals.push({
            date: dateStr,
            timeSlot,
            dishId: '',
            deliveryType: formData.deliveryType as 'delivery' | 'pickup',
            deliveryTime: deliveryTime,
            location: selectedCustomer?.deliveryArea || '',
            isSkipped: dateSkippedOnPlan(dateStr),
            showDishFields: false,
            customNote: '',
          })
        }
      })

      const allMeals = [...existingMeals, ...newMeals]

      setVisibleDaysByWeek(effectiveVisibleDaysByWeek)
      
      // Do not set endDate here — only persist end date if the user enters it on the form.
      setFormData((prev) => ({ ...prev, meals: allMeals }))
    } catch (error) {
      console.error('Error generating meals:', error)
    }
  }

  // Function to add a day to a week
  const addDayToWeek = (week: number) => {
    if (!formData.startDate || !formData.days) return

    const eligibleWeekDateStrs = planWeekDayStringsOnOrAfterStart(formData.startDate, week)

    const currentVisibleDays = visibleDaysByWeek[week] || []

    const nextDay = eligibleWeekDateStrs.find((dateStr) => !currentVisibleDays.includes(dateStr))
    
    if (!nextDay) {
      toast.info('All days for this week are already visible.')
      return
    }
    
    // Add the day to visible days
    setVisibleDaysByWeek(prev => ({
      ...prev,
      [week]: [...currentVisibleDays, nextDay].sort()
    }))
    
    const timeSlots = effectiveMealPlanTimeSlots(formData.timeSlots)
    if (timeSlots.length === 0) return
    
    const selectedCustomer = customers.find(c => c.id == formData.customerId)
    const mealsPerDay = parseInt(formData.mealsPerDay)
    const existingForDay = formData.meals.filter(m => m.date === nextDay).length
    if (existingForDay > 0) return // Day already has meals
    
    const newMeals: typeof formData.meals = []
    for (let mealIndex = 0; mealIndex < mealsPerDay; mealIndex++) {
      const timeSlot = timeSlots[mealIndex % timeSlots.length]
      const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
      let deliveryTime = ''
      if (timeMatch) {
        let hours = parseInt(timeMatch[1])
        const minutes = timeMatch[2]
        if (timeSlot.toUpperCase().includes('PM') && hours !== 12) hours += 12
        else if (timeSlot.toUpperCase().includes('AM') && hours === 12) hours = 0
        deliveryTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`
      } else {
        deliveryTime = timeSlot
      }
      newMeals.push({
        date: nextDay,
        timeSlot,
        dishId: '',
        deliveryType: formData.deliveryType as 'delivery' | 'pickup',
        deliveryTime: deliveryTime,
        location: selectedCustomer?.deliveryArea || '',
        isSkipped: isCreateWizardDateSkipped(
          nextDay,
          formData.startDate,
          formData.planType,
          formData.skippedDays,
          formData.skippedWeeks,
          formData.weeklySkipDays,
          formData.defaultSkipExceptionDates
        ),
        showDishFields: false,
        customNote: '',
      })
    }
    
    setFormData(prev => ({ ...prev, meals: [...prev.meals, ...newMeals] }))
  }

  // Function to remove a day from a week (if accidentally added)
  const removeDayFromWeek = (week: number, date: string) => {
    const currentVisibleDays = visibleDaysByWeek[week] || []
    if (currentVisibleDays.length <= 1) {
      toast.info('Keep at least one day in the week. Skip the day instead if you don\'t need meals for it.')
      return
    }
    setVisibleDaysByWeek(prev => ({
      ...prev,
      [week]: (prev[week] || []).filter(d => d !== date).sort()
    }))
    setFormData(prev => ({
      ...prev,
      meals: prev.meals.filter(m => m.date !== date),
      skippedDays: prev.skippedDays.filter(d => d !== date),
      defaultSkipExceptionDates: prev.defaultSkipExceptionDates.filter((d) => d !== date),
    }))
    toast.success('Day removed.')
  }
  
  // Function to add another week
  const addAnotherWeek = () => {
    if (!formData.startDate || !formData.days || !formData.mealsPerDay) return
    
    const startDate = new Date(formData.startDate)
    const days = parseInt(formData.days)
    const planEndStr = format(addDays(startDate, days - 1), 'yyyy-MM-dd')
    const maxWeek = getPlanWeekNumber(planEndStr, formData.startDate)
    
    // Find the next week to add
    const nextWeek = Math.max(...visibleWeeks) + 1
    
    // Check if adding this week would exceed total meals allowed
    const mealsPerWeek = 7 * parseInt(formData.mealsPerDay)
    const currentMealsCount = formData.meals.length
    const totalMealsAllowed = effectiveTotalMealsFromForm(
      formData.days,
      formData.mealsPerDay,
      formData.totalMeals
    )
    const mealsInNewWeek = Math.min(mealsPerWeek, totalMealsAllowed - currentMealsCount)
    
    if (nextWeek > maxWeek) {
      toast.warning('Cannot add more weeks. Maximum weeks for this plan reached.')
      return
    }
    
    if (currentMealsCount + mealsInNewWeek > totalMealsAllowed) {
      toast.warning(`Cannot add another week. This would exceed the plan's limit of ${totalMealsAllowed} meals.`)
      return
    }
    
    // Add the new week to visible weeks and generate meals for that week
    const updatedVisibleWeeks = [...visibleWeeks, nextWeek].sort((a, b) => a - b)
    setVisibleWeeks(updatedVisibleWeeks)
    
    const firstDateStr = format(getMondayOfPlanWeek(formData.startDate, nextWeek), 'yyyy-MM-dd')
    setVisibleDaysByWeek((prev) => ({
      ...prev,
      [nextWeek]: [firstDateStr],
    }))

    const weekDates = [parseISO(firstDateStr)]
    
    const timeSlots = effectiveMealPlanTimeSlots(formData.timeSlots)
    if (timeSlots.length === 0) {
      return
    }
    
    const selectedCustomer = customers.find(c => c.id == formData.customerId)
    const mealsPerDay = parseInt(formData.mealsPerDay)
    const newMeals: typeof formData.meals = []
    weekDates.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd')
      if (formData.meals.filter(m => m.date === dateStr).length > 0) return
      for (let mealIndex = 0; mealIndex < mealsPerDay; mealIndex++) {
        const timeSlot = timeSlots[mealIndex % timeSlots.length]
        const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
        let deliveryTime = ''
        if (timeMatch) {
          let hours = parseInt(timeMatch[1])
          const minutes = timeMatch[2]
          if (timeSlot.toUpperCase().includes('PM') && hours !== 12) hours += 12
          else if (timeSlot.toUpperCase().includes('AM') && hours === 12) hours = 0
          deliveryTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`
        } else {
          deliveryTime = timeSlot
        }
        newMeals.push({
          date: dateStr,
          timeSlot,
          dishId: '',
          deliveryType: formData.deliveryType as 'delivery' | 'pickup',
          deliveryTime: deliveryTime,
          location: selectedCustomer?.deliveryArea || '',
          isSkipped: isCreateWizardDateSkipped(
            dateStr,
            formData.startDate,
            formData.planType,
            formData.skippedDays,
            formData.skippedWeeks,
            formData.weeklySkipDays,
            formData.defaultSkipExceptionDates
          ),
          showDishFields: false,
          customNote: '',
        })
      }
    })
    
    // Add new meals to existing meals
    setFormData(prev => ({ ...prev, meals: [...prev.meals, ...newMeals] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const daysNum = parseInt(formData.days, 10)
      const mpd = parseInt(formData.mealsPerDay, 10)
      const totalMealsForPlan = effectiveTotalMealsFromForm(
        formData.days,
        formData.mealsPerDay,
        formData.totalMeals
      )

      if (totalMealsForPlan < 1) {
        toast.warning('This plan has no meals (check skipped days/weeks or plan length).')
        setLoading(false)
        return
      }

      const planTimeSlots = effectiveMealPlanTimeSlots(formData.timeSlots)

      // Create meal plan
      const mealPlanResponse = await fetch('/api/meal-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: formData.customerId,
          planId: planMode === 'predefined' ? formData.planId : undefined,
          planType: formData.planType,
          startDate: formData.startDate,
          ...(formData.endDate.trim() ? { endDate: formData.endDate } : {}),
          days: daysNum,
          mealsPerDay: mpd,
          ...(planTimeSlots.length > 0 ? { timeSlots: planTimeSlots } : {}),
          status: formData.status,
          notes: formData.notes,
          totalMeals: totalMealsForPlan,
          weeklySkipDays: normalizeWeeklySkipDays(formData.weeklySkipDays),
          // Calculate amounts
          totalAmount: (() => {
            const pay = parseFloat(formData.paymentAmount)
            if (planMode === 'predefined') {
              return Number.isFinite(pay) ? pay : 0
            }
            const ppm = parseFloat(formData.pricePerMeal)
            if (Number.isFinite(ppm) && ppm > 0) {
              return ppm * totalMealsForPlan
            }
            return Number.isFinite(pay) && pay > 0 ? pay : 0
          })(),
        }),
      })

      if (!mealPlanResponse.ok) {
        const error = await mealPlanResponse.json()
        throw new Error(JSON.stringify(error))
      }

      const mealPlan = await mealPlanResponse.json()

      // Create payment if amount is set
      if (formData.paymentAmount && parseFloat(formData.paymentAmount) > 0) {
        await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: formData.customerId,
            mealPlanId: mealPlan.id,
            planId: planMode === 'predefined' ? formData.planId : undefined,
            amount: parseFloat(formData.paymentAmount),
            paymentMethod: formData.paymentMethod || 'CASH',
            status: formData.paymentStatus,
          }),
        })
      }

      // Update meal plan items with dishes and delivery info
      // Only create meal items when a dish is actually assigned (dishId or dishName)
      // Filter out skipped days and weeks, and meals without dishes
      const activeMeals = formData.meals.filter((meal) => {
        if (!meal.dishId && !meal.dishName) {
          return false
        }
        if (
          isCreateWizardDateSkipped(
            meal.date,
            formData.startDate,
            formData.planType,
            formData.skippedDays,
            formData.skippedWeeks,
            formData.weeklySkipDays,
            formData.defaultSkipExceptionDates
          )
        ) {
          return false
        }
        return true
      })

      // Create meal plan items for active meals
      const updatePromises = activeMeals.map((meal) =>
        fetch(`/api/meal-plans/${mealPlan.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: meal.date,
            timeSlot: meal.timeSlot,
            dishId: meal.dishId || undefined,
            dishName: meal.dishName || undefined,
            dishDescription: meal.dishDescription || undefined,
            dishCategory: meal.dishCategory || undefined,
            ingredients: meal.ingredients || undefined,
            allergens: meal.allergens || undefined,
            calories: meal.calories || undefined,
            protein: meal.protein || undefined,
            carbs: meal.carbs || undefined,
            fats: meal.fats || undefined,
            price: meal.price || undefined,
            deliveryType: meal.deliveryType,
            deliveryTime: meal.deliveryTime || undefined,
            customNote: meal.customNote || undefined,
          }),
        })
      )
      for (const res of await Promise.all(updatePromises)) {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(
            typeof err.error === 'string' ? err.error : 'Failed to save a meal on the plan'
          )
        }
      }
      
      // Create skipped meal plan items for skipped days/weeks
      const skippedMeals = formData.meals.filter((meal) =>
        isCreateWizardDateSkipped(
          meal.date,
          formData.startDate,
          formData.planType,
          formData.skippedDays,
          formData.skippedWeeks,
          formData.weeklySkipDays,
          formData.defaultSkipExceptionDates
        )
      )
      
      const skippedPromises = skippedMeals.map(meal => {
        return fetch(`/api/meal-plans/${mealPlan.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: meal.date,
            timeSlot: meal.timeSlot,
            dishId: meal.dishId || undefined,
            deliveryType: meal.deliveryType,
            isSkipped: true,
            customNote: meal.customNote || undefined,
          }),
        })
      })
      await Promise.all(skippedPromises)

      router.push('/meal-plans')
    } catch (error) {
      console.error('Error creating meal plan:', error)
      toast.error('Failed to create meal plan: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const selectedCustomer = customers.find(c => c.id == formData.customerId)
  const selectedPlan = plans.find(p => p.id == formData.planId)

  const totalMeals = effectiveTotalMealsFromForm(
    formData.days,
    formData.mealsPerDay,
    formData.totalMeals
  )
  const customEnteredPricePerMeal = parseFloat(formData.pricePerMeal)
  const customUsesEnteredPricePerMeal =
    Number.isFinite(customEnteredPricePerMeal) && customEnteredPricePerMeal > 0

  // Predefined = catalog price; custom with per-meal rate = rate × meals (no auto total if rate omitted)
  const totalAmount =
    planMode === 'predefined'
      ? (selectedPlan?.price ?? 0)
      : customUsesEnteredPricePerMeal
        ? customEnteredPricePerMeal * totalMeals
        : 0

  return (
    <div className="max-w-[95%] mx-auto min-h-screen">
      <h1 className="text-lg font-bold text-gray-900 mb-3">Create New Meal Plan</h1>

      {/* Progress Steps */}
      <div className="mb-3">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                step >= s ? 'bg-nutrafi-primary text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {s}
              </div>
              {s < 4 && (
                <div className={`flex-1 h-1 mx-2 ${step > s ? 'bg-nutrafi-primary' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-sm text-gray-600">
          <span>Customer</span>
          <span>Plan</span>
          <span>Payment</span>
          <span>Meals</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6">
        {/* Step 1: Customer Selection */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Customer</h2>
            <div className="mb-4" ref={customerDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2">Customer *</label>
              <div className="relative">
                <div
                  role="combobox"
                  aria-expanded={customerDropdownOpen}
                  aria-haspopup="listbox"
                  className="w-full min-h-[42px] px-3 py-2 border border-gray-300 rounded-md bg-white flex items-center justify-between cursor-pointer focus-within:ring-2 focus-within:ring-nutrafi-primary focus-within:border-nutrafi-primary"
                  onClick={() => setCustomerDropdownOpen((v) => !v)}
                >
                  {!customerDropdownOpen ? (
                    formData.customerId && selectedCustomer ? (
                      <span className="text-gray-900">
                        {selectedCustomer.fullName} – {selectedCustomer.phone} ({selectedCustomer.deliveryArea})
                      </span>
                    ) : (
                      <span className={formData.customerId ? 'text-gray-900' : 'text-gray-400'}>
                        {formData.customerId
                          ? customers.find((c) => c.id === formData.customerId)?.fullName ?? 'Select a customer'
                          : 'Select a customer'}
                      </span>
                    )
                  ) : (
                    <input
                      type="text"
                      value={customerDropdownOpen ? customerSearchQuery : ''}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      onFocus={() => setCustomerDropdownOpen(true)}
                      placeholder="Type customer name, phone, or area..."
                      className="flex-1 min-w-0 border-0 p-0 focus:ring-0 focus:outline-none text-gray-900 placeholder:text-gray-400"
                      autoFocus={customerDropdownOpen}
                    />
                  )}
                  <svg
                    className={`w-5 h-5 text-gray-400 flex-shrink-0 ml-2 transition-transform ${customerDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                {customerDropdownOpen && (
                  <ul
                    role="listbox"
                    className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-md border border-gray-300 bg-white py-1 shadow-lg"
                  >
                    {(() => {
                      const q = customerSearchQuery.trim().toLowerCase()
                      const filtered = q
                        ? customers.filter(
                            (c) =>
                              (c.fullName || '').toLowerCase().includes(q) ||
                              (c.phone || '').toLowerCase().includes(q) ||
                              (c.deliveryArea || '').toLowerCase().includes(q)
                          )
                        : customers
                      if (filtered.length === 0) {
                        return (
                          <li className="px-3 py-2 text-sm text-gray-500" role="option">
                            No customer found. Try a different search.
                          </li>
                        )
                      }
                      return filtered.map((customer) => (
                        <li
                          key={customer.id}
                          role="option"
                          aria-selected={formData.customerId === customer.id}
                          className={`px-3 py-2 text-sm cursor-pointer ${
                            formData.customerId === customer.id
                              ? 'bg-nutrafi-primary/15 text-nutrafi-dark font-medium'
                              : 'text-gray-900 hover:bg-gray-100'
                          }`}
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, customerId: customer.id }))
                            setCustomerDropdownOpen(false)
                            setCustomerSearchQuery('')
                          }}
                        >
                          {customer.fullName} – {customer.phone} ({customer.deliveryArea})
                        </li>
                      ))
                    })()}
                  </ul>
                )}
              </div>
            </div>
            {selectedCustomer && (
              <div className="space-y-3">
                <CustomerInstructionsBanner instructions={selectedCustomer.instructions} />
                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="font-medium text-gray-900 mb-2">Customer Details</h3>
                  <p className="text-sm text-gray-600">Name: {selectedCustomer.fullName}</p>
                  <p className="text-sm text-gray-600">Phone: {selectedCustomer.phone}</p>
                  <p className="text-sm text-gray-600">Area: {selectedCustomer.deliveryArea}</p>
                </div>
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!formData.customerId}
                className="px-3 py-1.5 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Select Plan
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Plan Selection */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Plan Type</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Plan Mode *</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="predefined"
                    checked={planMode === 'predefined'}
                    onChange={() => setPlanMode('predefined')}
                    className="mr-2"
                  />
                  Predefined Plan
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="custom"
                    checked={planMode === 'custom'}
                    onChange={() => {
                      setPlanMode('custom')
                      setFormData((prev) => ({ ...prev, planId: '' }))
                    }}
                    className="mr-2"
                  />
                  Custom Plan
                </label>
              </div>
            </div>

            {planMode === 'predefined' ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Plan *</label>
                  <select
                    required
                    value={formData.planId}
                    onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select a plan</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} - {plan.price} AED ({plan.days} days, {plan.mealsPerDay} meals/day)
                      </option>
                    ))}
                  </select>
                </div>
                {selectedPlan && (
                  <div className="bg-[#f0f4e8] p-4 rounded-md mb-4">
                    <h3 className="font-medium text-gray-900 mb-2">Plan Details</h3>
                    <p className="text-sm text-gray-600">Type: {selectedPlan.planType}</p>
                    <p className="text-sm text-gray-600">Days: {selectedPlan.days}</p>
                    <p className="text-sm text-gray-600">Meals per Day: {selectedPlan.mealsPerDay}</p>
                    <p className="text-sm font-semibold text-nutrafi-dark">Price: {selectedPlan.price} AED</p>
                  </div>
                )}
                {selectedPlan && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Total meals</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formData.totalMeals}
                      onChange={(e) => setFormData({ ...formData, totalMeals: e.target.value })}
                      className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                )}
                {selectedPlan && (
                  <DefaultSkipDaysMultiSelect
                    value={formData.weeklySkipDays}
                    onChange={(weeklySkipDays) => setFormData((prev) => ({ ...prev, weeklySkipDays }))}
                  />
                )}
                {selectedPlan && (
                  <div className="w-full">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Delivery time (all meals) *</label>
                    <div className="space-y-2">
                      {(formData.timeSlots?.length ? formData.timeSlots : ['']).map((slot, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <select
                            required={index === 0}
                            value={slot}
                            onChange={(e) => {
                              const base = formData.timeSlots?.length ? [...formData.timeSlots] : ['']
                              const newTimeSlots = [...base]
                              newTimeSlots[index] = e.target.value
                              setFormData({ ...formData, timeSlots: newTimeSlots })
                            }}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                          >
                            <option value="">Select time</option>
                            {timeOptions.map((time) => (
                              <option key={time} value={time}>
                                {formatTime12Hour(time)}
                              </option>
                            ))}
                          </select>
                          {index > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newTimeSlots = formData.timeSlots.filter((_, i) => i !== index)
                                setFormData({
                                  ...formData,
                                  timeSlots: newTimeSlots.length > 0 ? newTimeSlots : [''],
                                })
                              }}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            timeSlots: [...(formData.timeSlots?.length ? formData.timeSlots : ['']), ''],
                          })
                        }
                        className="text-sm text-nutrafi-dark hover:underline"
                      >
                        + Add time slot (for special cases)
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    onFocus={(e) => e.currentTarget.showPicker?.()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Plan Type *</label>
                  <select
                    required
                    value={formData.planType}
                    onChange={(e) => setFormData({ ...formData, planType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Days *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.days}
                      onChange={(e) => setFormData({ ...formData, days: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Meals Per Day *</label>
                    <select
                      required
                      value={formData.mealsPerDay}
                      onChange={(e) => setFormData({ ...formData, mealsPerDay: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={String(n)}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Total meals</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.totalMeals}
                    onChange={(e) => setFormData({ ...formData, totalMeals: e.target.value })}
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                {Number.parseInt(formData.days, 10) >= 1 && (
                  <DefaultSkipDaysMultiSelect
                    value={formData.weeklySkipDays}
                    onChange={(weeklySkipDays) => setFormData((prev) => ({ ...prev, weeklySkipDays }))}
                  />
                )}
                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Delivery time (all meals) *</label>
                  <div className="space-y-2">
                    {(formData.timeSlots?.length ? formData.timeSlots : ['']).map((slot, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <select
                          required={index === 0}
                          value={slot}
                          onChange={(e) => {
                            const base = formData.timeSlots?.length ? [...formData.timeSlots] : ['']
                            const newTimeSlots = [...base]
                            newTimeSlots[index] = e.target.value
                            setFormData({ ...formData, timeSlots: newTimeSlots })
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                        >
                          <option value="">Select time</option>
                          {timeOptions.map((time) => (
                            <option key={time} value={time}>
                              {formatTime12Hour(time)}
                            </option>
                          ))}
                        </select>
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newTimeSlots = formData.timeSlots.filter((_, i) => i !== index)
                              setFormData({
                                ...formData,
                                timeSlots: newTimeSlots.length > 0 ? newTimeSlots : [''],
                              })
                            }}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          timeSlots: [...(formData.timeSlots?.length ? formData.timeSlots : ['']), ''],
                        })
                      }
                      className="text-sm text-nutrafi-dark hover:underline"
                    >
                      + Add time slot (for special cases)
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Price Per Meal (AED)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.pricePerMeal}
                    onChange={(e) => setFormData({ ...formData, pricePerMeal: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Optional"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      onFocus={(e) => e.currentTarget.showPicker?.()}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                {totalMeals > 0 && customUsesEnteredPricePerMeal && (
                  <div className="bg-blue-50 p-4 rounded-md">
                    <p className="text-sm font-semibold text-blue-700">
                      Total Meals: {totalMeals} × {formData.pricePerMeal} AED = {totalAmount.toFixed(2)} AED
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (planMode === 'predefined' && formData.planId) {
                    setStep(3)
                    return
                  }
                  if (
                    planMode === 'custom' &&
                    formData.days &&
                    formData.startDate &&
                    effectiveMealPlanTimeSlots(formData.timeSlots).length > 0
                  ) {
                    setStep(3)
                  }
                }}
                disabled={
                  (planMode === 'predefined' && (!formData.planId || !formData.startDate || effectiveMealPlanTimeSlots(formData.timeSlots).length === 0)) ||
                  (planMode === 'custom' && (!formData.days || !formData.startDate || effectiveMealPlanTimeSlots(formData.timeSlots).length === 0))
                }
                className="px-3 py-1.5 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Payment
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Payment */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Information</h2>
            {(planMode === 'predefined' ||
              (planMode === 'custom' && customUsesEnteredPricePerMeal)) && (
              <div className="bg-[#f0f4e8] p-4 rounded-md mb-4">
                {planMode === 'predefined' && (
                  <p className="text-lg font-semibold text-nutrafi-dark">
                    Total Amount: {totalAmount.toFixed(2)} AED
                  </p>
                )}
                {planMode === 'custom' && customUsesEnteredPricePerMeal && (
                  <>
                    <p className="text-lg font-semibold text-nutrafi-dark">
                      Total Amount: {totalAmount.toFixed(2)} AED
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      ({totalMeals} meals × {formData.pricePerMeal} AED per meal)
                    </p>
                  </>
                )}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Amount (AED) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.paymentAmount}
                  onChange={(e) => setFormData({ ...formData, paymentAmount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Status *</label>
                  <select
                    required
                    value={formData.paymentStatus}
                    onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="PENDING">Pending</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select method</option>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="DIGITAL_WALLET">Digital Wallet</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Type *</label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="delivery"
                      checked={formData.deliveryType === 'delivery'}
                      onChange={(e) => setFormData({ ...formData, deliveryType: e.target.value as 'delivery' | 'pickup' })}
                      className="mr-2"
                    />
                    Delivery
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="pickup"
                      checked={formData.deliveryType === 'pickup'}
                      onChange={(e) => setFormData({ ...formData, deliveryType: e.target.value as 'delivery' | 'pickup' })}
                      className="mr-2"
                    />
                    Pickup
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                disabled={!formData.paymentAmount || parseFloat(formData.paymentAmount) <= 0}
                className="px-3 py-1.5 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Configure Meals
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Meal Configuration */}
        {step === 4 && (() => {
          // Helper functions
          const getDayName = (date: string) => {
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
            return dayNames[new Date(date).getDay()]
          }
          const getDayOfWeekIndex = (date: string) => new Date(date).getDay() // 0 = Sunday, 6 = Saturday
          
          const toggleDishFields = (date: string, timeSlot: string, isNewDish: boolean = false, mealIndex: number = 0) => {
            const mealKey = `${date}-${timeSlot}-${mealIndex}`
            const newExpanded = new Set(expandedMealFields)
            
            // If opening fields for a new dish, clear existing dish data for this specific meal only
            if (isNewDish) {
              let occurrenceIndex = 0
              const newMeals = formData.meals.map(meal => {
                if (meal.date === date && meal.timeSlot === timeSlot) {
                  if (occurrenceIndex === mealIndex) {
                    occurrenceIndex++
                    return {
                      ...meal,
                      dishId: '',
                      dishName: '',
                      dishCategory: 'BREAKFAST',
                      dishDescription: '',
                      ingredients: '',
                      allergens: '',
                      calories: undefined,
                      protein: undefined,
                      carbs: undefined,
                      fats: undefined,
                      price: undefined,
                      showDishFields: false,
                    }
                  }
                  occurrenceIndex++
                }
                return meal
              })
              setFormData({ ...formData, meals: newMeals })
            }
            
            if (newExpanded.has(mealKey) && !isNewDish) {
              newExpanded.delete(mealKey)
            } else {
              newExpanded.add(mealKey)
            }
            setExpandedMealFields(newExpanded)
            
            // Update only the meal at this (date, timeSlot, mealIndex)
            let occurrenceIndex = 0
            const newMeals = formData.meals.map(meal => {
              if (meal.date === date && meal.timeSlot === timeSlot) {
                if (occurrenceIndex === mealIndex) {
                  occurrenceIndex++
                  return { ...meal, showDishFields: newExpanded.has(mealKey) }
                }
                occurrenceIndex++
              }
              return meal
            })
            setFormData({ ...formData, meals: newMeals })
          }

          const toggleSkipDay = (date: string) => {
            const norm = normalizeWeeklySkipDays(formData.weeklySkipDays)
            const cur = isCreateWizardDateSkipped(
              date,
              formData.startDate,
              formData.planType,
              formData.skippedDays,
              formData.skippedWeeks,
              formData.weeklySkipDays,
              formData.defaultSkipExceptionDates
            )
            if (!cur) {
              if (formData.defaultSkipExceptionDates.includes(date)) {
                setFormData({
                  ...formData,
                  defaultSkipExceptionDates: formData.defaultSkipExceptionDates.filter((d) => d !== date),
                })
              } else {
                setFormData({ ...formData, skippedDays: [...formData.skippedDays, date] })
              }
            } else if (formData.skippedDays.includes(date)) {
              const nextSkipped = formData.skippedDays.filter((d) => d !== date)
              const nextExc = [...formData.defaultSkipExceptionDates]
              if (norm.length > 0 && shouldSkipCalendarDay(date, norm) && !nextExc.includes(date)) {
                nextExc.push(date)
              }
              setFormData({
                ...formData,
                skippedDays: nextSkipped,
                defaultSkipExceptionDates: nextExc,
              })
            } else {
              setFormData({
                ...formData,
                defaultSkipExceptionDates: [...formData.defaultSkipExceptionDates, date],
              })
            }
          }

          const toggleSkipWeek = (week: number) => {
            const newSkippedWeeks = formData.skippedWeeks.includes(week)
              ? formData.skippedWeeks.filter(w => w !== week)
              : [...formData.skippedWeeks, week]
            setFormData({ ...formData, skippedWeeks: newSkippedWeeks })
          }

          // Calculate total macros for a day
          const calculateDayMacros = (dayMeals: typeof formData.meals) => {
            return dayMeals.reduce((totals, meal) => {
              // Only count if meal has a dish assigned (has nutritional values)
              if (meal.calories !== null && meal.calories !== undefined) {
                totals.calories += meal.calories
              }
              if (meal.protein !== null && meal.protein !== undefined) {
                totals.protein += meal.protein
              }
              if (meal.carbs !== null && meal.carbs !== undefined) {
                totals.carbs += meal.carbs
              }
              if (meal.fats !== null && meal.fats !== undefined) {
                totals.fats += meal.fats
              }
              return totals
            }, { calories: 0, protein: 0, carbs: 0, fats: 0 })
          }

          // Organize meals by day
          const mealsByDay = formData.meals.reduce((acc, meal) => {
            const date = meal.date
            if (!acc[date]) {
              acc[date] = []
            }
            acc[date].push(meal)
            return acc
          }, {} as Record<string, typeof formData.meals>)

          // Organize by calendar week from plan start (used by MONTHLY and WEEKLY step-4 UI)
          const mealsByWeek: Record<number, Record<string, typeof formData.meals>> = {}
          if (formData.planType === 'MONTHLY' || formData.planType === 'WEEKLY') {
            Object.entries(mealsByDay).forEach(([date, meals]) => {
              const week = getPlanWeekNumber(date, formData.startDate)
              if (!mealsByWeek[week]) {
                mealsByWeek[week] = {}
              }
              mealsByWeek[week][date] = meals
            })
          }

          // Calculate active meals count (excluding skipped)
          const stepActiveMealsCount = formData.meals.filter((meal) => {
            if (!formData.startDate) return true
            return !isCreateWizardDateSkipped(
              meal.date,
              formData.startDate,
              formData.planType,
              formData.skippedDays,
              formData.skippedWeeks,
              formData.weeklySkipDays,
              formData.defaultSkipExceptionDates
            )
          }).length

          // Calculate current meals count and remaining meals
          const currentMealsCount = formData.meals.length
          const totalMealsAllowed = effectiveTotalMealsFromForm(
            formData.days,
            formData.mealsPerDay,
            formData.totalMeals
          )
          const remainingMeals = totalMealsAllowed - currentMealsCount
          const maxWeek =
            formData.days && formData.startDate
              ? getPlanWeekNumber(
                  format(addDays(new Date(formData.startDate), parseInt(formData.days, 10) - 1), 'yyyy-MM-dd'),
                  formData.startDate
                )
              : 0
          const canAddMoreWeeks = Math.max(...visibleWeeks) < maxWeek && currentMealsCount < totalMealsAllowed

          return (
            <div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Configure Meals</h2>
                <NewMealPlanImportButton
                  step={step}
                  startDate={formData.startDate}
                  days={formData.days}
                  mealsPerDay={formData.mealsPerDay}
                  totalMeals={formData.totalMeals}
                  timeSlots={formData.timeSlots}
                  deliveryType={formData.deliveryType}
                  customerId={formData.customerId}
                  customers={customers}
                  meals={formData.meals}
                  isCalendarDaySkipped={(dateStr) =>
                    isCreateWizardDateSkipped(
                      dateStr,
                      formData.startDate,
                      formData.planType,
                      formData.skippedDays,
                      formData.skippedWeeks,
                      formData.weeklySkipDays,
                      formData.defaultSkipExceptionDates
                    )
                  }
                  setMeals={(meals) => setFormData((prev) => ({ ...prev, meals }))}
                  onImportApplied={() => {
                    skipNextGenerateMealsRef.current = true
                  }}
                  setVisibleWeeks={setVisibleWeeks}
                  setVisibleDaysByWeek={setVisibleDaysByWeek}
                />
              </div>
              {selectedCustomer ? (
                <CustomerInstructionsBanner instructions={selectedCustomer.instructions} className="mb-4" />
              ) : null}
              <div className="bg-blue-50 p-4 rounded-md mb-4">
                <p className="text-sm font-semibold text-blue-700 mb-2">
                  Meals on schedule: {currentMealsCount} / {totalMealsAllowed}
                </p>
                {remainingMeals > 0 && (
                  <p className="text-sm text-blue-600">
                    {remainingMeals} meals remaining
                  </p>
                )}
                {remainingMeals === 0 && (
                  <p className="text-sm text-blue-800">
                    All {totalMealsAllowed} meal slots are on your schedule for this plan. Assign dishes below; use{" "}
                    <span className="font-medium">Add Day</span> to show more days in each week when needed.
                  </p>
                )}
              </div>

              {/* Show weeks (for both MONTHLY and other plan types) */}
              {(formData.planType === 'MONTHLY' || formData.planType === 'WEEKLY') ? (
                <div className="space-y-6 pr-2">
                  {visibleWeeks
                    .filter(week => week > 0) // Filter out Week 0
                    .sort((a, b) => a - b)
                    .map((week) => {
                    const isWeekSkipped = formData.skippedWeeks.includes(week)
                    const weekMeals = mealsByWeek[week] || {}
                    const weekDates = Object.keys(weekMeals).sort()
                    
                    return (
                      <div key={week} className="border-2 border-gray-500 rounded-lg bg-white flex flex-col max-h-[75vh] overflow-hidden">
                        {/* Week Header */}
                        <div className={`px-4 py-3 flex items-center justify-between border-b-2 border-gray-500 flex-shrink-0 ${isWeekSkipped ? 'opacity-60' : ''}`} style={{ backgroundColor: '#000000' }}>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                const newCollapsed = new Set(collapsedWeeks)
                                if (newCollapsed.has(week)) {
                                  newCollapsed.delete(week)
                                } else {
                                  newCollapsed.add(week)
                                }
                                setCollapsedWeeks(newCollapsed)
                              }}
                              className="text-white hover:text-gray-200 focus:outline-none"
                            >
                              <svg
                                className={`w-5 h-5 transition-transform ${collapsedWeeks.has(week) ? '' : 'rotate-90'}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                            <h3 className="font-semibold text-white">Week {week}</h3>
                            <span className="text-sm text-white">
                              ({weekDates.length} days, {weekDates.length * parseInt(formData.mealsPerDay)} meals)
                            </span>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isWeekSkipped}
                              onChange={() => toggleSkipWeek(week)}
                              className="w-4 h-4 text-nutrafi-primary rounded focus:ring-nutrafi-primary"
                            />
                            <span className="text-sm text-white font-medium">Skip Week</span>
                          </label>
                        </div>
                        
                        {/* Week Content - scroll inside week */}
                        {!isWeekSkipped && !collapsedWeeks.has(week) && (
                          <div className="p-4 space-y-4 overflow-y-auto min-h-0 flex-1">
                            {(() => {
                              // Filter to only show visible days for this week
                              const visibleDays = visibleDaysByWeek[week] || []
                              const filteredDates = weekDates.filter(date => visibleDays.includes(date))
                              return filteredDates.length > 0 ? filteredDates.map((date) => {
                                const meals = weekMeals[date] || []
                                const isDaySkipped = isCreateWizardDateSkipped(
                                  date,
                                  formData.startDate,
                                  formData.planType,
                                  formData.skippedDays,
                                  formData.skippedWeeks,
                                  formData.weeklySkipDays,
                                  formData.defaultSkipExceptionDates
                                )
                              
                    return (
                      <div
                        key={date}
                        className={`rounded-md overflow-hidden ${isDaySkipped ? 'opacity-60' : ''}`}
                        style={{
                          borderLeft: `4px solid ${DAY_COLORS[getDayOfWeekIndex(date)].border}`,
                          borderTop: `3px solid ${DAY_COLORS[getDayOfWeekIndex(date)].top}`,
                          background: isDaySkipped ? '#f9fafb' : DAY_COLORS[getDayOfWeekIndex(date)].dayGradient,
                          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.06)',
                        }}
                      >
                        <div
                          className="flex items-center justify-between px-4 py-3"
                          style={{ backgroundColor: DAY_COLORS[getDayOfWeekIndex(date)].header }}
                        >
                            <div className="flex items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newCollapsed = new Set(collapsedDays)
                                          if (newCollapsed.has(date)) {
                                            newCollapsed.delete(date)
                                          } else {
                                            newCollapsed.add(date)
                                          }
                                          setCollapsedDays(newCollapsed)
                                        }}
                                        className="text-white hover:text-gray-200 focus:outline-none"
                                      >
                                        <svg
                                          className={`w-4 h-4 transition-transform ${collapsedDays.has(date) ? '' : 'rotate-90'}`}
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>
                                      <h4 className="font-semibold text-white">
                                        <span className="font-bold">{getDayName(date)}</span> - {format(new Date(date), 'MMM dd, yyyy')}
                                      </h4>
                                      {(() => {
                                        const macros = calculateDayMacros(meals)
                                        if (macros.calories > 0) {
                                          return (
                                            <div className="flex items-center gap-3 text-sm">
                                              <span className="font-bold text-base text-gray-900 px-3 py-1.5 rounded bg-white">
                                                {macros.calories} kcal
                                              </span>
                                              <span className="font-bold text-white">
                                                P: {macros.protein.toFixed(1)}g | C: {macros.carbs.toFixed(1)}g | F: {macros.fats.toFixed(1)}g
                                              </span>
                                            </div>
                                          )
                                        }
                                        return null
                                      })()}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={isDaySkipped}
                                          onChange={() => toggleSkipDay(date)}
                                          className="w-4 h-4 text-nutrafi-primary rounded focus:ring-nutrafi-primary"
                                        />
                                        <span className="text-xs font-medium text-white">Skip Day</span>
                                      </label>
                                      {(visibleDaysByWeek[week] || []).length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => removeDayFromWeek(week, date)}
                                          className="text-xs font-medium text-white hover:text-red-200 underline"
                                          title="Remove this day from the plan"
                                        >
                                          Remove day
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {!isDaySkipped && !collapsedDays.has(date) && (
                                    <div className="space-y-3 p-4 pt-2">
                                      {meals.map((meal, idx) => {
                                        const mealKey = `${meal.date}-${meal.timeSlot}-${idx}`
                                        const isExpanded = expandedMealFields.has(mealKey) || meal.showDishFields
                                        const dayColors = DAY_COLORS[getDayOfWeekIndex(date)]
                                        const mealLabels = ['First Meal', 'Second Meal', 'Third Meal', 'Fourth Meal', 'Fifth Meal']
                                        const mealLabel = mealLabels[idx] || `Meal ${idx + 1}`
                                        
                                        return (
                                          <div 
                                            key={idx} 
                                            className="border border-gray-300 rounded-md overflow-visible"
                                            style={{ backgroundColor: dayColors.bg }}
                                          >
                                            {/* Meal Label Header - grey */}
                                            <div className="px-3 py-2 border-b border-gray-300 bg-gray-300">
                                              <span className="text-xs font-bold uppercase tracking-wide text-gray-900">
                                                {mealLabel}
                                              </span>
                                            </div>
                                            <div className="p-3 space-y-3 [&_input]:bg-white [&_select]:bg-white [&_textarea]:bg-white">
                                              {/* First Row: Select Dish, Delivery Type, Delivery Time, Location */}
                                              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                                                <div className="md:col-span-4 relative">
                                                  <label className="block text-xs text-gray-600 mb-1">Select Dish</label>
                                                  {(() => {
                                                    const mealKey = `${meal.date}-${meal.timeSlot}-${idx}`
                                                    const isOpen = openDishDropdowns.has(mealKey)
                                                    const searchQuery = dishSearchQueries[mealKey] || ''
                                                    const filteredDishes = Array.isArray(dishes) ? dishes.filter(dish => 
                                                      dish.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                      dish.category.toLowerCase().includes(searchQuery.toLowerCase())
                                                    ) : []
                                                    const selectedDish = findWizardMealDish(dishes, meal)
                                                    
                                                    return (
                                                      <div className="relative dish-dropdown-container">
                                                        <button
                                                          type="button"
                                                          onClick={(e) => {
                                                            const newOpen = new Set(openDishDropdowns)
                                                            if (isOpen) {
                                                              newOpen.delete(mealKey)
                                                              setDropdownAnchor(null)
                                                            } else {
                                                              newOpen.add(mealKey)
                                                              const rect = e.currentTarget.getBoundingClientRect()
                                                              setDropdownAnchor({ mealKey, top: rect.bottom + 4, left: rect.left, width: rect.width })
                                                            }
                                                            setOpenDishDropdowns(newOpen)
                                                          }}
                                                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary bg-white text-left flex items-center justify-between"
                                                        >
                                                          <span className={selectedDish ? 'text-gray-900' : 'text-gray-500'}>
                                                            {selectedDish ? selectedDish.name : 'Select dish (optional)'}
                                                          </span>
                                                          <svg className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                          </svg>
                                                        </button>
                                                        
                                                        {isOpen && dropdownAnchor?.mealKey !== mealKey && (
                                                          <div className="absolute z-[200] w-full mt-1 top-full left-0 bg-white border border-gray-300 rounded-md shadow-lg max-h-[320px] overflow-auto">
                                                            <div className="p-2 border-b border-gray-200 sticky top-0 bg-white z-10">
                                                              <input
                                                                type="text"
                                                                placeholder="Search dishes..."
                                                                value={searchQuery}
                                                                onChange={(e) => {
                                                                  setDishSearchQueries({ ...dishSearchQueries, [mealKey]: e.target.value })
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary bg-white"
                                                                autoFocus
                                                              />
                                                            </div>
                                                            <div className="max-h-[280px] overflow-auto">
                                                              {filteredDishes.length > 0 ? (
                                                                filteredDishes.slice(0, 6).map((dish) => {
                                                                  const isSelected = wizardDishIdsMatch(meal.dishId, dish.id)
                                                                  const isHovered = hoveredDishIdInDropdown === dish.id
                                                                  const isHighlighted = isSelected || isHovered
                                                                  return (
                                                                  <button
                                                                    key={dish.id}
                                                                    type="button"
                                                                    onMouseEnter={() => setHoveredDishIdInDropdown(dish.id)}
                                                                    onMouseLeave={() => setHoveredDishIdInDropdown(null)}
                                                                    onClick={() => {
                                                                      updateMeal(meal.date, meal.timeSlot, 'dishId', dish.id, idx)
                                                                      setOpenDishDropdowns(prev => {
                                                                        const newSet = new Set(prev)
                                                                        newSet.delete(mealKey)
                                                                        return newSet
                                                                      })
                                                                      setDropdownAnchor(null)
                                                                      setDishSearchQueries({ ...dishSearchQueries, [mealKey]: '' })
                                                                    }}
                                                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                                                                      isHighlighted ? 'bg-gray-100 font-bold text-gray-900' : 'text-gray-900'
                                                                    }`}
                                                                  >
                                                                    {dish.name}
                                                                  </button>
                                                                  )
                                                                })
                                                              ) : (
                                                                <div className="px-3 py-2 text-sm text-gray-500">No dishes found</div>
                                                              )}
                                                              {filteredDishes.length > 6 && (
                                                                <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100">
                                                                  Showing 6 of {filteredDishes.length} — type to search
                                                                </div>
                                                              )}
                                                            </div>
                                                          </div>
                                                        )}
                                                      </div>
                                                    )
                                                  })()}
                                                </div>
                                                <div className="md:col-span-2">
                                                  <label className="block text-xs text-gray-600 mb-1">Delivery Type</label>
                                                  <select
                                                    value={meal.deliveryType}
                                                    onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'deliveryType', e.target.value, idx)}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                  >
                                                    <option value="delivery">Delivery</option>
                                                    <option value="pickup">Pickup</option>
                                                  </select>
                                                </div>
                                                <div className="md:col-span-2">
                                                  <label className="block text-xs text-gray-600 mb-1">Delivery Time</label>
                                                  <input
                                                    type="time"
                                                    value={meal.deliveryTime || ''}
                                                    onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'deliveryTime', e.target.value, idx)}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                  />
                                                </div>
                                                {meal.deliveryType === 'delivery' && (
                                                  <div className="md:col-span-3">
                                                    <p className="text-xs text-gray-500">
                                                      Delivery location uses the customer&apos;s saved address (default Home).
                                                    </p>
                                                  </div>
                                                )}
                                              </div>
                                              
                                              {/* Notes and Show Details Buttons */}
                                              {(() => {
                                                const mealKey = `${meal.date}-${meal.timeSlot}-${idx}`
                                                const hasNote = meal.customNote && meal.customNote.trim() !== ''
                                                const isNotesExpanded = expandedNotes.has(mealKey) || hasNote
                                                const hasDish = meal.dishId || meal.dishName
                                                
                                                // If notes are expanded, show textarea and move Show Details below
                                                if (isNotesExpanded) {
                                                  return (
                                                    <div className="space-y-3">
                                                      <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                          <label className="block text-xs text-gray-600">Notes</label>
                                                          {!hasNote && (
                                                            <button
                                                              type="button"
                                                              onClick={() => {
                                                                const newExpanded = new Set(expandedNotes)
                                                                newExpanded.delete(mealKey)
                                                                setExpandedNotes(newExpanded)
                                                              }}
                                                              className="text-xs text-gray-500 hover:text-gray-700"
                                                            >
                                                              Remove
                                                            </button>
                                                          )}
                                                        </div>
                                                        <textarea
                                                          value={meal.customNote || ''}
                                                          onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'customNote', e.target.value, idx)}
                                                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                          rows={2}
                                                          placeholder="Add any notes for this meal..."
                                                        />
                                                      </div>
                                                      {/* Show Details Button - moved below notes when notes are expanded */}
                                                      {hasDish && (
                                                        <div className="flex items-center gap-2">
                                                          <button
                                                            type="button"
                                                            onClick={() => toggleDishFields(meal.date, meal.timeSlot, !isExpanded, idx)}
                                                            className="px-3 py-1.5 text-sm bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 whitespace-nowrap"
                                                            title={isExpanded ? "Hide Dish Details" : "Show Dish Details"}
                                                          >
                                                            {isExpanded ? 'Hide Details' : 'Show Details'}
                                                          </button>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )
                                                }
                                                
                                                // If notes are not expanded, show buttons in one row
                                                return (
                                                  <div className="flex items-center gap-2">
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        const newExpanded = new Set(expandedNotes)
                                                        newExpanded.add(mealKey)
                                                        setExpandedNotes(newExpanded)
                                                      }}
                                                      className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 whitespace-nowrap"
                                                    >
                                                      + Add Notes
                                                    </button>
                                                    {hasDish && (
                                                      <button
                                                        type="button"
                                                        onClick={() => toggleDishFields(meal.date, meal.timeSlot, !isExpanded, idx)}
                                                        className="px-3 py-1.5 text-sm bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 whitespace-nowrap"
                                                        title={isExpanded ? "Hide Dish Details" : "Show Dish Details"}
                                                      >
                                                        {isExpanded ? 'Hide Details' : 'Show Details'}
                                                      </button>
                                                    )}
                                                  </div>
                                                )
                                              })()}
                                            </div>
                                            
                                            {/* Inline Dish Fields */}
                                            {isExpanded && (
                                              <div className="border-t border-gray-200 p-4 space-y-3 [&_input]:bg-white [&_input]:text-gray-900 [&_select]:bg-white [&_select]:text-gray-900 [&_textarea]:bg-white [&_textarea]:text-gray-900" style={{ backgroundColor: dayColors.bg }}>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Dish Name *</label>
                                                    <input
                                                      type="text"
                                                      value={meal.dishName || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'dishName', e.target.value, idx)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                      required
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                                                    <select
                                                      value={meal.dishCategory || 'BREAKFAST'}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'dishCategory', e.target.value, idx)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
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
                                                      value={meal.dishDescription || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'dishDescription', e.target.value, idx)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                      rows={2}
                                                    />
                                                  </div>
                                                  <div className="md:col-span-2">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Ingredients</label>
                                                    <textarea
                                                      value={meal.ingredients || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'ingredients', e.target.value, idx)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                      rows={2}
                                                    />
                                                  </div>
                                                  <div className="md:col-span-2">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Allergens</label>
                                                    <input
                                                      type="text"
                                                      value={meal.allergens || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'allergens', e.target.value, idx)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                      placeholder="e.g., Dairy, Eggs, Gluten"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Calories (kcal) *</label>
                                                    <input
                                                      type="number"
                                                      value={meal.calories || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'calories', parseInt(e.target.value) || 0, idx)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                      required
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Protein (g) *</label>
                                                    <input
                                                      type="number"
                                                      step="0.1"
                                                      value={meal.protein || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'protein', parseFloat(e.target.value) || 0, idx)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                      required
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Carbs (g) *</label>
                                                    <input
                                                      type="number"
                                                      step="0.1"
                                                      value={meal.carbs || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'carbs', parseFloat(e.target.value) || 0, idx)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                      required
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Fats (g) *</label>
                                                    <input
                                                      type="number"
                                                      step="0.1"
                                                      value={meal.fats || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'fats', parseFloat(e.target.value) || 0, idx)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                      required
                                                    />
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                              }) : (
                                <div className="text-center text-sm text-gray-500 py-4">
                                  No meals generated for this week yet. Meals will be generated when you add dishes.
                                </div>
                              )
                            })()}
                            
                            {/* Add Day Button */}
                            {(() => {
                              if (!formData.startDate || !formData.days) return null
                              const eligibleWeekDateStrs = planWeekDayStringsOnOrAfterStart(
                                formData.startDate,
                                week
                              )
                              const visibleDays = visibleDaysByWeek[week] || []
                              const hasMoreDays = eligibleWeekDateStrs.some(
                                (d) => !visibleDays.includes(d)
                              )
                              
                              if (hasMoreDays) {
                                return (
                                  <div className="mt-4 flex justify-center">
                                    <button
                                      type="button"
                                      onClick={() => addDayToWeek(week)}
                                      className="px-3 py-1.5 text-white rounded-md hover:opacity-90 font-medium flex items-center gap-2"
                                    style={{ backgroundColor: '#000000' }}
                                    >
                                      <span>+</span>
                                      <span>Add Day</span>
                                    </button>
                                  </div>
                                )
                              }
                              return null
                            })()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  
                  {/* Add Another Week Button */}
                  {canAddMoreWeeks && (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={addAnotherWeek}
                        className="px-6 py-3 text-white rounded-md hover:opacity-90 font-medium flex items-center gap-2"
                        style={{ backgroundColor: '#000000' }}
                      >
                        <span>+</span>
                        <span>Add Another Week</span>
                      </button>
                    </div>
                  )}
                  
                  {!canAddMoreWeeks && currentMealsCount < totalMealsAllowed && (
                    <div className="mt-4 text-center text-sm text-gray-500">
                      Maximum weeks for this plan reached.
                    </div>
                  )}
                </div>
              ) : (
                // Weekly or Custom: Show days (fallback for non-weekly/monthly plans)
                <div className="space-y-4 pr-2">
                  {Object.entries(mealsByDay).sort().map(([date, meals]) => {
                    const isDaySkipped = isCreateWizardDateSkipped(
                      date,
                      formData.startDate,
                      formData.planType,
                      formData.skippedDays,
                      formData.skippedWeeks,
                      formData.weeklySkipDays,
                      formData.defaultSkipExceptionDates
                    )
                    
                    return (
                      <div
                        key={date}
                        className={`rounded-md overflow-hidden ${isDaySkipped ? 'opacity-60' : ''}`}
                        style={{
                          borderLeft: `4px solid ${DAY_COLORS[getDayOfWeekIndex(date)].border}`,
                          borderTop: `3px solid ${DAY_COLORS[getDayOfWeekIndex(date)].top}`,
                          background: isDaySkipped ? '#f9fafb' : DAY_COLORS[getDayOfWeekIndex(date)].dayGradient,
                          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.06)',
                        }}
                      >
                        <div
                          className="flex items-center justify-between px-4 py-3"
                          style={{ backgroundColor: DAY_COLORS[getDayOfWeekIndex(date)].header }}
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                const newCollapsed = new Set(collapsedDays)
                                if (newCollapsed.has(date)) {
                                  newCollapsed.delete(date)
                                } else {
                                  newCollapsed.add(date)
                                }
                                setCollapsedDays(newCollapsed)
                              }}
                              className="text-white hover:text-gray-200 focus:outline-none"
                            >
                              <svg
                                className={`w-4 h-4 transition-transform ${collapsedDays.has(date) ? '' : 'rotate-90'}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                            <h4 className="font-semibold text-white">
                              <span className="font-bold">{getDayName(date)}</span> - {format(new Date(date), 'MMM dd, yyyy')}
                            </h4>
                            {(() => {
                              const macros = calculateDayMacros(meals)
                              if (macros.calories > 0) {
                                return (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="font-semibold text-gray-900 px-2 py-1 rounded bg-white">
                                      {macros.calories} kcal
                                    </span>
                                    <span className="font-semibold text-white">
                                      P: {macros.protein.toFixed(1)}g | C: {macros.carbs.toFixed(1)}g | F: {macros.fats.toFixed(1)}g
                                    </span>
                                  </div>
                                )
                              }
                              return null
                            })()}
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isDaySkipped}
                              onChange={() => toggleSkipDay(date)}
                              className="w-4 h-4 text-nutrafi-primary rounded focus:ring-nutrafi-primary"
                            />
                            <span className="text-xs font-medium text-white">Skip Day</span>
                          </label>
                        </div>
                        
                        {!isDaySkipped && !collapsedDays.has(date) && (
                          <div className="space-y-3 p-4 pt-2">
                            {meals.map((meal, idx) => {
                              const mealKey = `${meal.date}-${meal.timeSlot}-${idx}`
                              const isExpanded = expandedMealFields.has(mealKey) || meal.showDishFields
                              const dayColors = DAY_COLORS[getDayOfWeekIndex(date)]
                              const mealLabels = ['First Meal', 'Second Meal', 'Third Meal', 'Fourth Meal', 'Fifth Meal']
                              const mealLabel = mealLabels[idx] || `Meal ${idx + 1}`
                              
                                        return (
                                          <div 
                                            key={idx} 
                                            className="border border-gray-300 rounded-md overflow-visible"
                                            style={{ backgroundColor: dayColors.bg }}
                                          >
                                            {/* Meal Label Header - grey */}
                                            <div className="px-3 py-2 border-b border-gray-300 bg-gray-300">
                                              <span className="text-xs font-bold uppercase tracking-wide text-gray-900">
                                                {mealLabel}
                                              </span>
                                            </div>
                                            <div className="p-3 space-y-3 [&_input]:bg-white [&_select]:bg-white [&_textarea]:bg-white">
                                              {/* First Row: Select Dish, Delivery Type, Delivery Time, Location */}
                                              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                                                <div className="md:col-span-4 relative">
                                                  <label className="block text-xs text-gray-600 mb-1">Select Dish</label>
                                                  {(() => {
                                                    const mealKey = `${meal.date}-${meal.timeSlot}-${idx}`
                                                    const isOpen = openDishDropdowns.has(mealKey)
                                                    const searchQuery = dishSearchQueries[mealKey] || ''
                                                    const filteredDishes = Array.isArray(dishes) ? dishes.filter(dish => 
                                                      dish.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                      dish.category.toLowerCase().includes(searchQuery.toLowerCase())
                                                    ) : []
                                                    const selectedDish = findWizardMealDish(dishes, meal)
                                                    
                                                    return (
                                                      <div className="relative dish-dropdown-container">
                                                        <button
                                                          type="button"
                                                          onClick={(e) => {
                                                            const newOpen = new Set(openDishDropdowns)
                                                            if (isOpen) {
                                                              newOpen.delete(mealKey)
                                                              setDropdownAnchor(null)
                                                            } else {
                                                              newOpen.add(mealKey)
                                                              const rect = e.currentTarget.getBoundingClientRect()
                                                              setDropdownAnchor({ mealKey, top: rect.bottom + 4, left: rect.left, width: rect.width })
                                                            }
                                                            setOpenDishDropdowns(newOpen)
                                                          }}
                                                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary bg-white text-left flex items-center justify-between"
                                                        >
                                                          <span className={selectedDish ? 'text-gray-900' : 'text-gray-500'}>
                                                            {selectedDish ? selectedDish.name : 'Select dish (optional)'}
                                                          </span>
                                                          <svg className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                          </svg>
                                                        </button>
                                                        
                                                        {isOpen && dropdownAnchor?.mealKey !== mealKey && (
                                                          <div className="absolute z-[200] w-full mt-1 top-full left-0 bg-white border border-gray-300 rounded-md shadow-lg max-h-[320px] overflow-auto">
                                                            <div className="p-2 border-b border-gray-200 sticky top-0 bg-white z-10">
                                                              <input
                                                                type="text"
                                                                placeholder="Search dishes..."
                                                                value={searchQuery}
                                                                onChange={(e) => {
                                                                  setDishSearchQueries({ ...dishSearchQueries, [mealKey]: e.target.value })
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary bg-white"
                                                                autoFocus
                                                              />
                                                            </div>
                                                            <div className="max-h-[280px] overflow-auto">
                                                              {filteredDishes.length > 0 ? (
                                                                filteredDishes.slice(0, 6).map((dish) => {
                                                                  const isSelected = wizardDishIdsMatch(meal.dishId, dish.id)
                                                                  const isHovered = hoveredDishIdInDropdown === dish.id
                                                                  const isHighlighted = isSelected || isHovered
                                                                  return (
                                                                  <button
                                                                    key={dish.id}
                                                                    type="button"
                                                                    onMouseEnter={() => setHoveredDishIdInDropdown(dish.id)}
                                                                    onMouseLeave={() => setHoveredDishIdInDropdown(null)}
                                                                    onClick={() => {
                                                                      updateMeal(meal.date, meal.timeSlot, 'dishId', dish.id, idx)
                                                                      setOpenDishDropdowns(prev => {
                                                                        const newSet = new Set(prev)
                                                                        newSet.delete(mealKey)
                                                                        return newSet
                                                                      })
                                                                      setDropdownAnchor(null)
                                                                      setDishSearchQueries({ ...dishSearchQueries, [mealKey]: '' })
                                                                    }}
                                                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                                                                      isHighlighted ? 'bg-gray-100 font-bold text-gray-900' : 'text-gray-900'
                                                                    }`}
                                                                  >
                                                                    {dish.name}
                                                                  </button>
                                                                  )
                                                                })
                                                              ) : (
                                                                <div className="px-3 py-2 text-sm text-gray-500">No dishes found</div>
                                                              )}
                                                              {filteredDishes.length > 6 && (
                                                                <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100">
                                                                  Showing 6 of {filteredDishes.length} — type to search
                                                                </div>
                                                              )}
                                                            </div>
                                                          </div>
                                                        )}
                                                      </div>
                                                    )
                                                  })()}
                                                </div>
                                                <div className="md:col-span-2">
                                                  <label className="block text-xs text-gray-600 mb-1">Delivery Type</label>
                                                  <select
                                                    value={meal.deliveryType}
                                                    onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'deliveryType', e.target.value, idx)}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                  >
                                                    <option value="delivery">Delivery</option>
                                                    <option value="pickup">Pickup</option>
                                                  </select>
                                                </div>
                                                <div className="md:col-span-2">
                                                  <label className="block text-xs text-gray-600 mb-1">Delivery Time</label>
                                                  <input
                                                    type="time"
                                                    value={meal.deliveryTime || ''}
                                                    onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'deliveryTime', e.target.value, idx)}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                  />
                                                </div>
                                                {meal.deliveryType === 'delivery' && (
                                                  <div className="md:col-span-3">
                                                    <p className="text-xs text-gray-500">
                                                      Delivery location uses the customer&apos;s saved address (default Home).
                                                    </p>
                                                  </div>
                                                )}
                                              </div>
                                              
                                              {/* Notes and Show Details Buttons */}
                                              {(() => {
                                                const mealKey = `${meal.date}-${meal.timeSlot}-${idx}`
                                                const hasNote = meal.customNote && meal.customNote.trim() !== ''
                                                const isNotesExpanded = expandedNotes.has(mealKey) || hasNote
                                                const hasDish = meal.dishId || meal.dishName
                                                
                                                // If notes are expanded, show textarea and move Show Details below
                                                if (isNotesExpanded) {
                                                  return (
                                                    <div className="space-y-3">
                                                      <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                          <label className="block text-xs text-gray-600">Notes</label>
                                                          {!hasNote && (
                                                            <button
                                                              type="button"
                                                              onClick={() => {
                                                                const newExpanded = new Set(expandedNotes)
                                                                newExpanded.delete(mealKey)
                                                                setExpandedNotes(newExpanded)
                                                              }}
                                                              className="text-xs text-gray-500 hover:text-gray-700"
                                                            >
                                                              Remove
                                                            </button>
                                                          )}
                                                        </div>
                                                        <textarea
                                                          value={meal.customNote || ''}
                                                          onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'customNote', e.target.value, idx)}
                                                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                          rows={2}
                                                          placeholder="Add any notes for this meal..."
                                                        />
                                                      </div>
                                                      {/* Show Details Button - moved below notes when notes are expanded */}
                                                      {hasDish && (
                                                        <div className="flex items-center gap-2">
                                                          <button
                                                            type="button"
                                                            onClick={() => toggleDishFields(meal.date, meal.timeSlot, !isExpanded, idx)}
                                                            className="px-3 py-1.5 text-sm bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 whitespace-nowrap"
                                                            title={isExpanded ? "Hide Dish Details" : "Show Dish Details"}
                                                          >
                                                            {isExpanded ? 'Hide Details' : 'Show Details'}
                                                          </button>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )
                                                }
                                                
                                                // If notes are not expanded, show buttons in one row
                                                return (
                                                  <div className="flex items-center gap-2">
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        const newExpanded = new Set(expandedNotes)
                                                        newExpanded.add(mealKey)
                                                        setExpandedNotes(newExpanded)
                                                      }}
                                                      className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 whitespace-nowrap"
                                                    >
                                                      + Add Notes
                                                    </button>
                                                    {hasDish && (
                                                      <button
                                                        type="button"
                                                        onClick={() => toggleDishFields(meal.date, meal.timeSlot, !isExpanded, idx)}
                                                        className="px-3 py-1.5 text-sm bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 whitespace-nowrap"
                                                        title={isExpanded ? "Hide Dish Details" : "Show Dish Details"}
                                                      >
                                                        {isExpanded ? 'Hide Details' : 'Show Details'}
                                                      </button>
                                                    )}
                                                  </div>
                                                )
                                              })()}
                                            </div>
                                  
                                  {/* Inline Dish Fields */}
                                  {isExpanded && (
                                    <div className="border-t border-gray-200 p-4 space-y-3 [&_input]:bg-white [&_input]:text-gray-900 [&_select]:bg-white [&_select]:text-gray-900 [&_textarea]:bg-white [&_textarea]:text-gray-900" style={{ backgroundColor: dayColors.bg }}>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Dish Name *</label>
                                          <input
                                            type="text"
                                            value={meal.dishName || ''}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'dishName', e.target.value, idx)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                            required
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                                          <select
                                            value={meal.dishCategory || 'BREAKFAST'}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'dishCategory', e.target.value, idx)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
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
                                            value={meal.dishDescription || ''}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'dishDescription', e.target.value, idx)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                            rows={2}
                                          />
                                        </div>
                                        <div className="md:col-span-2">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Ingredients</label>
                                          <textarea
                                            value={meal.ingredients || ''}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'ingredients', e.target.value, idx)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                            rows={2}
                                          />
                                        </div>
                                        <div className="md:col-span-2">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Allergens</label>
                                          <input
                                            type="text"
                                            value={meal.allergens || ''}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'allergens', e.target.value, idx)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                            placeholder="e.g., Dairy, Eggs, Gluten"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Calories (kcal) *</label>
                                          <input
                                            type="number"
                                            value={meal.calories || ''}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'calories', parseInt(e.target.value) || 0, idx)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                            required
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Protein (g) *</label>
                                          <input
                                            type="number"
                                            step="0.1"
                                            value={meal.protein || ''}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'protein', parseFloat(e.target.value) || 0, idx)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                            required
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Carbs (g) *</label>
                                          <input
                                            type="number"
                                            step="0.1"
                                            value={meal.carbs || ''}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'carbs', parseFloat(e.target.value) || 0, idx)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                            required
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Fats (g) *</label>
                                          <input
                                            type="number"
                                            step="0.1"
                                            value={meal.fats || ''}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'fats', parseFloat(e.target.value) || 0, idx)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                            required
                                          />
                                        </div>
                                      </div>
                                    </div>
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
              )}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={3}
                />
              </div>
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 py-1.5 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Meal Plan'}
                </button>
              </div>
            </div>
          )
        })()}
      </form>

      {dropdownAnchor && typeof document !== 'undefined' && createPortal(
        (() => {
          const parts = dropdownAnchor.mealKey.split('-')
          const idx = parseInt(parts[parts.length - 1], 10)
          const timeSlot = parts[parts.length - 2]
          const date = parts.slice(0, parts.length - 2).join('-')
          const dayColors = DAY_COLORS[getDayOfWeekIndex(date)]
          const mealsForSlot = formData.meals.filter(m => m.date === date && m.timeSlot === timeSlot)
          const meal = mealsForSlot[idx]
          if (!meal) return null
          const mealKey = dropdownAnchor.mealKey
          const searchQuery = dishSearchQueries[mealKey] || ''
          const filteredDishes = Array.isArray(dishes) ? dishes.filter(dish =>
            dish.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            dish.category.toLowerCase().includes(searchQuery.toLowerCase())
          ) : []
          return (
            <div
              className="dish-dropdown-container fixed z-[300] bg-white border border-gray-300 rounded-md shadow-xl min-w-[200px] max-h-[70vh] flex flex-col"
              style={{
                top: dropdownAnchor.top,
                left: dropdownAnchor.left,
                width: Math.max(dropdownAnchor.width, 200),
              }}
            >
              <div className="p-2 border-b border-gray-200 flex-shrink-0 bg-white">
                <input
                  type="text"
                  placeholder="Search dishes..."
                  value={searchQuery}
                  onChange={(e) => setDishSearchQueries({ ...dishSearchQueries, [mealKey]: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary bg-white"
                  autoFocus
                />
              </div>
              <div className="overflow-auto flex-1 min-h-0 max-h-[280px]">
                {filteredDishes.length > 0 ? (
                  filteredDishes.slice(0, 6).map((dish) => {
                    const isSelected = wizardDishIdsMatch(meal.dishId, dish.id)
                    const isHovered = hoveredDishIdInDropdown === dish.id
                    const isHighlighted = isSelected || isHovered
                    return (
                    <button
                      key={dish.id}
                      type="button"
                      onMouseEnter={() => setHoveredDishIdInDropdown(dish.id)}
                      onMouseLeave={() => setHoveredDishIdInDropdown(null)}
                      onClick={() => {
                        updateMeal(meal.date, meal.timeSlot, 'dishId', dish.id, idx)
                        setOpenDishDropdowns(prev => {
                          const newSet = new Set(prev)
                          newSet.delete(mealKey)
                          return newSet
                        })
                        setDropdownAnchor(null)
                        setDishSearchQueries({ ...dishSearchQueries, [mealKey]: '' })
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                        isHighlighted ? 'bg-gray-100 font-bold text-gray-900' : 'text-gray-900'
                      }`}
                    >
                      {dish.name}
                    </button>
                    )
                  })
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500">No dishes found</div>
                )}
                {filteredDishes.length > 6 && (
                  <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100">
                    Showing 6 of {filteredDishes.length} — type to search
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
