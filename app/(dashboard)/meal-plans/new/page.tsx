'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format, addDays, eachDayOfInterval } from 'date-fns'

interface Customer {
  id: string
  fullName: string
  phone: string
  email: string | null
  deliveryArea: string
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

export default function NewMealPlanPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [dishes, setDishes] = useState<Dish[]>([])
  const [planMode, setPlanMode] = useState<PlanMode>('predefined')
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [showAddDishModal, setShowAddDishModal] = useState(false)
  const [newDishForm, setNewDishForm] = useState({
    name: '',
    description: '',
    category: 'BREAKFAST',
    ingredients: '',
    allergens: '',
    calories: '',
    protein: '',
    carbs: '',
    fats: '',
    price: '',
    status: 'ACTIVE',
  })
  const [creatingDish, setCreatingDish] = useState(false)
  const [selectedMealForDish, setSelectedMealForDish] = useState<{ date: string; timeSlot: string } | null>(null)
  const [expandedMealFields, setExpandedMealFields] = useState<Set<string>>(new Set())
  const [dishSearchQueries, setDishSearchQueries] = useState<Record<string, string>>({})
  const [openDishDropdowns, setOpenDishDropdowns] = useState<Set<string>>(new Set())
  const [visibleWeeks, setVisibleWeeks] = useState<number[]>([1]) // Start with only week 1 visible
  const [totalMealsAllowed, setTotalMealsAllowed] = useState<number>(0) // Total meals allowed by plan
  
  const [formData, setFormData] = useState({
    customerId: '',
    planId: '',
    planType: 'WEEKLY',
    days: '',
    mealsPerDay: '2',
    timeSlots: ['08:00', '13:00'] as string[], // Array of time slots instead of JSON string
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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.dish-dropdown-container')) {
        setOpenDishDropdowns(new Set())
      }
    }
    
    if (openDishDropdowns.size > 0) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
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
      const selectedPlan = plans.find(p => p.id === formData.planId)
      if (selectedPlan) {
        const totalMeals = selectedPlan.days * selectedPlan.mealsPerDay
        setTotalMealsAllowed(totalMeals)
        setVisibleWeeks([1]) // Reset to show only week 1
        
        // Initialize time slots array based on mealsPerDay
        const mealsPerDay = selectedPlan.mealsPerDay
        const defaultTimes = ['08:00', '13:00', '18:00']
        const currentTimeSlots = Array.isArray(formData.timeSlots) ? formData.timeSlots : []
        const newTimeSlots = Array.from({ length: mealsPerDay }, (_, i) => 
          currentTimeSlots[i] || defaultTimes[i] || '08:00'
        )
        
        setFormData(prev => ({
          ...prev,
          planType: selectedPlan.planType,
          mealsPerDay: selectedPlan.mealsPerDay.toString(),
          paymentAmount: selectedPlan.price.toString(),
          days: selectedPlan.days.toString(), // Set days from plan
          timeSlots: newTimeSlots,
        }))
      }
    }
  }, [formData.planId, plans])
  
  // Also handle custom plans - adjust time slots when mealsPerDay changes
  useEffect(() => {
    if (planMode === 'custom' && formData.days && formData.mealsPerDay) {
      const totalMeals = parseInt(formData.days) * parseInt(formData.mealsPerDay)
      setTotalMealsAllowed(totalMeals)
      setVisibleWeeks([1]) // Reset to show only week 1
      
      // Adjust time slots array when mealsPerDay changes
      const mealsPerDay = parseInt(formData.mealsPerDay)
      const defaultTimes = ['08:00', '13:00', '18:00']
      const currentTimeSlots = Array.isArray(formData.timeSlots) ? formData.timeSlots : []
      const newTimeSlots = Array.from({ length: mealsPerDay }, (_, i) => 
        currentTimeSlots[i] || defaultTimes[i] || '08:00'
      )
      
      if (newTimeSlots.length !== currentTimeSlots.length || 
          newTimeSlots.some((time, i) => time !== currentTimeSlots[i])) {
        setFormData(prev => ({
          ...prev,
          timeSlots: newTimeSlots,
        }))
      }
    }
  }, [planMode, formData.days, formData.mealsPerDay])

  useEffect(() => {
    // Only generate meals if we have all required fields and we're on step 4 or beyond
    // This prevents generating meals too early or multiple times
    if (step >= 4 && formData.startDate && formData.days && formData.mealsPerDay && Array.isArray(formData.timeSlots) && formData.timeSlots.length > 0) {
      generateMeals()
    }
  }, [step, formData.startDate, formData.days, formData.mealsPerDay, formData.timeSlots, formData.deliveryType, formData.customerId])
  
  // Create stable string representation of visibleWeeks for dependency array
  const visibleWeeksKey = visibleWeeks.join(',')

  // Regenerate meals when visible weeks change
  useEffect(() => {
    if (step >= 4 && formData.startDate && formData.days && formData.mealsPerDay && Array.isArray(formData.timeSlots) && formData.timeSlots.length > 0) {
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
      } else if (formData.startDate && formData.days && formData.mealsPerDay && Array.isArray(formData.timeSlots) && formData.timeSlots.length > 0) {
        // Check if we need to generate meals for visible weeks
        const hasMealsForVisibleWeeks = visibleWeeks.some(week => {
          const startDate = new Date(formData.startDate)
          return formData.meals.some(meal => {
            const mealDate = new Date(meal.date)
            const daysDiff = Math.floor((mealDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
            const mealWeek = Math.max(1, Math.floor(daysDiff / 7) + 1)
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

  const updateMeal = (date: string, timeSlot: string, field: string, value: any) => {
    const mealKey = `${date}-${timeSlot}`
    const selectedCustomer = customers.find(c => c.id === formData.customerId)
    const newMeals = formData.meals.map(meal => {
      if (meal.date === date && meal.timeSlot === timeSlot) {
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

  const handleCreateDish = async () => {
    if (!newDishForm.name || !newDishForm.calories || !newDishForm.protein || !newDishForm.carbs || !newDishForm.fats) {
      alert('Please fill in all required fields (Name, Calories, Protein, Carbs, Fats)')
      return
    }

    setCreatingDish(true)
    try {
      const response = await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newDishForm,
          calories: parseInt(newDishForm.calories),
          protein: parseFloat(newDishForm.protein),
          carbs: parseFloat(newDishForm.carbs),
          fats: parseFloat(newDishForm.fats),
          price: newDishForm.price ? parseFloat(newDishForm.price) : undefined,
        }),
      })

      if (response.ok) {
        const newDish = await response.json()
        // Add new dish to the dishes list
        setDishes([...dishes, newDish])
        
        // If a meal was selected, assign the new dish to it
        if (selectedMealForDish) {
          updateMeal(selectedMealForDish.date, selectedMealForDish.timeSlot, 'dishId', newDish.id)
        }
        
        // Reset form and close modal
        setNewDishForm({
          name: '',
          description: '',
          category: 'BREAKFAST',
          ingredients: '',
          allergens: '',
          calories: '',
          protein: '',
          carbs: '',
          fats: '',
          price: '',
          status: 'ACTIVE',
        })
        setSelectedMealForDish(null)
        setShowAddDishModal(false)
      } else {
        const error = await response.json()
        alert('Error creating dish: ' + (error.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error creating dish:', error)
      alert('Failed to create dish')
    } finally {
      setCreatingDish(false)
    }
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
      
      // timeSlots is now an array, not a JSON string
      const timeSlots = Array.isArray(formData.timeSlots) ? formData.timeSlots : []
      
      if (timeSlots.length === 0) {
        console.warn('No valid time slots found')
        return
      }
      
      const selectedCustomer = customers.find(c => c.id === formData.customerId)
      const mealsPerDay = parseInt(formData.mealsPerDay)

      // Use a Set to track unique meal keys (date + timeSlot) to prevent duplicates
      const mealKeys = new Set<string>()
      // Keep existing meals that are not in visible weeks OR that already have dishes assigned
      const existingMeals = formData.meals.filter(meal => {
        const mealDate = new Date(meal.date)
        const daysDiff = Math.floor((mealDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        const week = Math.max(1, Math.floor(daysDiff / 7) + 1)
        // Keep meals from non-visible weeks OR meals that already have dishes assigned
        if (!visibleWeeks.includes(week)) return true
        // Keep meals that have dishes assigned (don't regenerate them)
        if (meal.dishId || meal.dishName) return true
        return false
      })
      
      // Track existing meal keys to avoid duplicates
      existingMeals.forEach(meal => {
        mealKeys.add(`${meal.date}-${meal.timeSlot}`)
      })
      
      const newMeals: typeof formData.meals = []
      
      dates.forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd')
        const mealDate = new Date(date)
        const daysDiff = Math.floor((mealDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        const week = Math.max(1, Math.floor(daysDiff / 7) + 1)
        
        // Only generate meals for visible weeks
        if (!visibleWeeks.includes(week)) {
          return
        }
        
        // Only take the first N time slots based on mealsPerDay
        if (!Array.isArray(timeSlots) || timeSlots.length === 0) {
          return
        }
        const dayTimeSlots = timeSlots.slice(0, mealsPerDay)
        
        if (!Array.isArray(dayTimeSlots) || dayTimeSlots.length === 0) {
          return
        }
        
        dayTimeSlots.forEach((timeSlot: string) => {
          const mealKey = `${dateStr}-${timeSlot}`
          
          // Skip if this meal already exists
          if (mealKeys.has(mealKey)) {
            return
          }
          mealKeys.add(mealKey)
          
          // Convert timeSlot to 24-hour format for deliveryTime
          const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
          let deliveryTime = ''
          if (timeMatch) {
            let hours = parseInt(timeMatch[1])
            const minutes = timeMatch[2]
            // If timeSlot already has AM/PM, parse it
            if (timeSlot.toUpperCase().includes('PM') && hours !== 12) {
              hours += 12
            } else if (timeSlot.toUpperCase().includes('AM') && hours === 12) {
              hours = 0
            }
            deliveryTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`
          } else {
            deliveryTime = timeSlot // Use as-is if format is unexpected
          }
          
          newMeals.push({
            date: dateStr,
            timeSlot,
            dishId: '',
            deliveryType: formData.deliveryType as 'delivery' | 'pickup',
            deliveryTime: deliveryTime,
            location: selectedCustomer?.deliveryArea || '',
            isSkipped: false,
            showDishFields: false,
            customNote: '',
          })
        })
      })

      // Combine existing meals (from non-visible weeks) with new meals (from visible weeks)
      const allMeals = [...existingMeals, ...newMeals]
      
      setFormData(prev => ({ ...prev, meals: allMeals, endDate: format(endDate, 'yyyy-MM-dd') }))
    } catch (error) {
      console.error('Error generating meals:', error)
    }
  }
  
  // Function to add another week
  const addAnotherWeek = () => {
    if (!formData.startDate || !formData.days || !formData.mealsPerDay) return
    
    const startDate = new Date(formData.startDate)
    const days = parseInt(formData.days)
    const maxWeek = Math.ceil(days / 7)
    
    // Find the next week to add
    const nextWeek = Math.max(...visibleWeeks) + 1
    
    // Check if adding this week would exceed total meals allowed
    const mealsPerWeek = 7 * parseInt(formData.mealsPerDay)
    const currentMealsCount = formData.meals.length
    const mealsInNewWeek = Math.min(mealsPerWeek, totalMealsAllowed - currentMealsCount)
    
    if (nextWeek > maxWeek) {
      alert('Cannot add more weeks. Maximum weeks for this plan reached.')
      return
    }
    
    if (currentMealsCount + mealsInNewWeek > totalMealsAllowed) {
      alert(`Cannot add another week. This would exceed the plan's limit of ${totalMealsAllowed} meals.`)
      return
    }
    
    // Add the new week to visible weeks and generate meals for that week
    const updatedVisibleWeeks = [...visibleWeeks, nextWeek].sort((a, b) => a - b)
    setVisibleWeeks(updatedVisibleWeeks)
    
    // Generate meals for the new week immediately
    // Calculate the date range for the new week
    const weekStartDay = (nextWeek - 1) * 7
    const weekEndDay = Math.min(weekStartDay + 6, days - 1)
    const weekStartDate = addDays(startDate, weekStartDay)
    const weekEndDate = addDays(startDate, weekEndDay)
    const weekDates = eachDayOfInterval({ start: weekStartDate, end: weekEndDate })
    
    // Get time slots
    const timeSlots = Array.isArray(formData.timeSlots) ? formData.timeSlots : []
    if (timeSlots.length === 0) {
      console.warn('No valid time slots found')
      return
    }
    
    const selectedCustomer = customers.find(c => c.id === formData.customerId)
    const mealsPerDay = parseInt(formData.mealsPerDay)
    const dayTimeSlots = timeSlots.slice(0, mealsPerDay)
    
    // Track existing meal keys to avoid duplicates
    const mealKeys = new Set<string>()
    formData.meals.forEach(meal => {
      mealKeys.add(`${meal.date}-${meal.timeSlot}`)
    })
    
    // Generate meals for the new week
    const newMeals: typeof formData.meals = []
    weekDates.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd')
      
      dayTimeSlots.forEach((timeSlot: string) => {
        const mealKey = `${dateStr}-${timeSlot}`
        
        // Skip if this meal already exists
        if (mealKeys.has(mealKey)) {
          return
        }
        mealKeys.add(mealKey)
        
        // Convert timeSlot to 24-hour format for deliveryTime
        const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
        let deliveryTime = ''
        if (timeMatch) {
          let hours = parseInt(timeMatch[1])
          const minutes = timeMatch[2]
          // If timeSlot already has AM/PM, parse it
          if (timeSlot.toUpperCase().includes('PM') && hours !== 12) {
            hours += 12
          } else if (timeSlot.toUpperCase().includes('AM') && hours === 12) {
            hours = 0
          }
          deliveryTime = `${hours.toString().padStart(2, '0')}:${minutes}`
        } else {
          deliveryTime = timeSlot // Use as-is if format is unexpected
        }
        
        newMeals.push({
          date: dateStr,
          timeSlot,
          dishId: '',
          deliveryType: formData.deliveryType as 'delivery' | 'pickup',
          deliveryTime: deliveryTime,
          location: selectedCustomer?.deliveryArea || '',
          isSkipped: false,
          showDishFields: false,
          customNote: '',
        })
      })
    })
    
    // Add new meals to existing meals
    setFormData(prev => ({ ...prev, meals: [...prev.meals, ...newMeals] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Calculate active meals (excluding skipped days/weeks)
      const activeMealsCount = formData.meals.filter(meal => {
        const date = meal.date
        const mealDate = new Date(date)
        const startDate = new Date(formData.startDate)
        const daysDiff = Math.floor((mealDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        // Ensure week number is always >= 1 (no Week 0)
        const week = Math.max(1, Math.floor(daysDiff / 7) + 1)
        
        if (formData.skippedDays.includes(date)) return false
        if (formData.planType === 'MONTHLY' && formData.skippedWeeks.includes(week)) return false
        return true
      }).length

      // Create meal plan
      const mealPlanResponse = await fetch('/api/meal-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: formData.customerId,
          planId: planMode === 'predefined' ? formData.planId : undefined,
          planType: formData.planType,
          startDate: formData.startDate,
          endDate: formData.endDate,
          days: parseInt(formData.days),
          mealsPerDay: parseInt(formData.mealsPerDay),
          // timeSlots not sent - only used in UI to set deliveryTime when creating meal items
          status: formData.status,
          notes: formData.notes,
          // Calculate totalMeals based on plan configuration (days * mealsPerDay)
          totalMeals: parseInt(formData.days) * parseInt(formData.mealsPerDay),
          // Calculate amounts
          totalAmount: planMode === 'predefined' 
            ? parseFloat(formData.paymentAmount)
            : parseFloat(formData.pricePerMeal) * (parseInt(formData.days) * parseInt(formData.mealsPerDay)),
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
      const activeMeals = formData.meals.filter(meal => {
        // Only create meal items if a dish is assigned
        if (!meal.dishId && !meal.dishName) {
          return false
        }
        
        const date = meal.date
        const mealDate = new Date(date)
        const startDate = new Date(formData.startDate)
        const daysDiff = Math.floor((mealDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        // Ensure week number is always >= 1 (no Week 0)
        const week = Math.max(1, Math.floor(daysDiff / 7) + 1)
        
        // Skip if day is skipped
        if (formData.skippedDays.includes(date)) {
          return false
        }
        
        // Skip if week is skipped (only for monthly plans)
        if (formData.planType === 'MONTHLY' && formData.skippedWeeks.includes(week)) {
          return false
        }
        
        return true
      })

      // Create meal plan items for active meals
      const updatePromises = activeMeals.map(meal => {
        return fetch(`/api/meal-plans/${mealPlan.id}/items`, {
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
            location: meal.location || undefined,
            customNote: meal.customNote || undefined,
          }),
        })
      })
      await Promise.all(updatePromises)
      
      // Create skipped meal plan items for skipped days/weeks
      const skippedMeals = formData.meals.filter(meal => {
        const date = meal.date
        const mealDate = new Date(date)
        const startDate = new Date(formData.startDate)
        const daysDiff = Math.floor((mealDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        // Ensure week number is always >= 1 (no Week 0)
        const week = Math.max(1, Math.floor(daysDiff / 7) + 1)
        
        if (formData.skippedDays.includes(date)) return true
        if (formData.planType === 'MONTHLY' && formData.skippedWeeks.includes(week)) return true
        return false
      })
      
      const skippedPromises = skippedMeals.map(meal => {
        return fetch(`/api/meal-plans/${mealPlan.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: meal.date,
            timeSlot: meal.timeSlot,
            dishId: meal.dishId || undefined,
            deliveryType: meal.deliveryType,
            location: meal.location,
            isSkipped: true,
            customNote: meal.customNote || undefined,
          }),
        })
      })
      await Promise.all(skippedPromises)

      router.push('/meal-plans')
    } catch (error) {
      console.error('Error creating meal plan:', error)
      alert('Failed to create meal plan: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const selectedCustomer = customers.find(c => c.id === formData.customerId)
  const selectedPlan = plans.find(p => p.id === formData.planId)
  
  // Calculate active meals (excluding skipped)
  const activeMealsCount = formData.meals.filter(meal => {
    const date = meal.date
    const mealDate = new Date(date)
    const startDate = formData.startDate ? new Date(formData.startDate) : null
    if (!startDate) return true
    
    const daysDiff = Math.floor((mealDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const week = Math.floor(daysDiff / 7) + 1
    
    if (formData.skippedDays.includes(date)) return false
    if (formData.planType === 'MONTHLY' && formData.skippedWeeks.includes(week)) return false
    return true
  }).length
  
  // Calculate totalMeals based on plan configuration (days * mealsPerDay), not the number of meals added
  const totalMeals = formData.days && formData.mealsPerDay 
    ? parseInt(formData.days) * parseInt(formData.mealsPerDay) 
    : 0
  const totalAmount = planMode === 'predefined' 
    ? parseFloat(formData.paymentAmount || '0')
    : parseFloat(formData.pricePerMeal || '0') * totalMeals

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Meal Plan</h1>

      {/* Progress Steps */}
      <div className="mb-6">
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
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Customer *</label>
              <select
                required
                value={formData.customerId}
                onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select a customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.fullName} - {customer.phone} ({customer.deliveryArea})
                  </option>
                ))}
              </select>
            </div>
            {selectedCustomer && (
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="font-medium text-gray-900 mb-2">Customer Details</h3>
                <p className="text-sm text-gray-600">Name: {selectedCustomer.fullName}</p>
                <p className="text-sm text-gray-600">Phone: {selectedCustomer.phone}</p>
                <p className="text-sm text-gray-600">Area: {selectedCustomer.deliveryArea}</p>
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!formData.customerId}
                className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50 disabled:cursor-not-allowed"
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
                    onChange={(e) => setPlanMode(e.target.value as PlanMode)}
                    className="mr-2"
                  />
                  Predefined Plan
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="custom"
                    checked={planMode === 'custom'}
                    onChange={(e) => setPlanMode(e.target.value as PlanMode)}
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Time Slots *</label>
                    <div className="space-y-2">
                      {Array.from({ length: selectedPlan.mealsPerDay }).map((_, index) => (
                        <div key={index}>
                          <label className="block text-xs text-gray-600 mb-1">Meal {index + 1} Time Slot</label>
                          <select
                            required
                            value={formData.timeSlots[index] || ''}
                            onChange={(e) => {
                              const newTimeSlots = [...formData.timeSlots]
                              newTimeSlots[index] = e.target.value
                              setFormData({ ...formData, timeSlots: newTimeSlots })
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                          >
                            <option value="">Select time</option>
                            {timeOptions.map((time) => (
                              <option key={time} value={time}>
                                {formatTime12Hour(time)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Select delivery time for each meal slot.</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <p className="text-xs text-gray-500 mt-1">Select the start date for this meal plan</p>
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
                      <option value="2">2</option>
                      <option value="3">3</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time Slots *</label>
                  <div className="space-y-2">
                    {Array.from({ length: parseInt(formData.mealsPerDay) || 2 }).map((_, index) => (
                      <div key={index}>
                        <label className="block text-xs text-gray-600 mb-1">Meal {index + 1} Time Slot</label>
                        <select
                          required
                          value={formData.timeSlots[index] || ''}
                          onChange={(e) => {
                            const newTimeSlots = [...formData.timeSlots]
                            newTimeSlots[index] = e.target.value
                            setFormData({ ...formData, timeSlots: newTimeSlots })
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                        >
                          <option value="">Select time</option>
                          {timeOptions.map((time) => (
                            <option key={time} value={time}>
                              {formatTime12Hour(time)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Select delivery time for each meal slot.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Price Per Meal (AED) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.pricePerMeal}
                    onChange={(e) => setFormData({ ...formData, pricePerMeal: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                    <p className="text-xs text-gray-500 mt-1">Optional - leave empty if not set</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                    <p className="text-xs text-gray-500 mt-1">Optional - leave empty if not set</p>
                  </div>
                </div>
                {totalMeals > 0 && (
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
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (planMode === 'predefined' && formData.planId) {
                    setStep(3)
                  } else if (planMode === 'custom' && formData.days && formData.startDate && formData.pricePerMeal) {
                    setStep(3)
                  }
                }}
                disabled={
                  (planMode === 'predefined' && (!formData.planId || !formData.startDate || !formData.timeSlots || formData.timeSlots.length === 0 || formData.timeSlots.some(t => !t))) ||
                  (planMode === 'custom' && (!formData.days || !formData.startDate || !formData.pricePerMeal || !formData.timeSlots || formData.timeSlots.length === 0 || formData.timeSlots.some(t => !t)))
                }
                className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="bg-[#f0f4e8] p-4 rounded-md mb-4">
              <p className="text-lg font-semibold text-nutrafi-dark">
                Total Amount: {totalAmount.toFixed(2)} AED
              </p>
              {planMode === 'custom' && (
                <p className="text-sm text-gray-600 mt-1">
                  ({totalMeals} meals × {formData.pricePerMeal} AED per meal)
                </p>
              )}
            </div>
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
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                disabled={!formData.paymentAmount || parseFloat(formData.paymentAmount) <= 0}
                className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50 disabled:cursor-not-allowed"
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
          
          const toggleDishFields = (date: string, timeSlot: string, isNewDish: boolean = false) => {
            const mealKey = `${date}-${timeSlot}`
            const newExpanded = new Set(expandedMealFields)
            
            // If opening fields for a new dish, clear existing dish data
            if (isNewDish) {
              const newMeals = formData.meals.map(meal => {
                if (meal.date === date && meal.timeSlot === timeSlot) {
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
                    showDishFields: false, // Details hidden by default
                  }
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
            
            // Update meal to show/hide fields
            const newMeals = formData.meals.map(meal => {
              if (meal.date === date && meal.timeSlot === timeSlot) {
                return { ...meal, showDishFields: newExpanded.has(mealKey) }
              }
              return meal
            })
            setFormData({ ...formData, meals: newMeals })
          }

          const toggleSkipDay = (date: string) => {
            const newSkippedDays = formData.skippedDays.includes(date)
              ? formData.skippedDays.filter(d => d !== date)
              : [...formData.skippedDays, date]
            setFormData({ ...formData, skippedDays: newSkippedDays })
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

          // For monthly plans, organize by week
          const mealsByWeek: Record<number, Record<string, typeof formData.meals>> = {}
          if (formData.planType === 'MONTHLY') {
            Object.entries(mealsByDay).forEach(([date, meals]) => {
              const mealDate = new Date(date)
              const startDate = new Date(formData.startDate)
              const daysDiff = Math.floor((mealDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
              // Ensure week number is always >= 1 (no Week 0)
              const week = Math.max(1, Math.floor(daysDiff / 7) + 1)
              if (!mealsByWeek[week]) {
                mealsByWeek[week] = {}
              }
              mealsByWeek[week][date] = meals
            })
          }

          // Calculate active meals count (excluding skipped)
          const stepActiveMealsCount = formData.meals.filter(meal => {
            const date = meal.date
            const mealDate = new Date(date)
            const startDate = formData.startDate ? new Date(formData.startDate) : null
            if (!startDate) return true
            
            const daysDiff = Math.floor((mealDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
            const week = Math.floor(daysDiff / 7) + 1
            
            if (formData.skippedDays.includes(date)) return false
            if (formData.planType === 'MONTHLY' && formData.skippedWeeks.includes(week)) return false
            return true
          }).length

          // Calculate current meals count and remaining meals
          const currentMealsCount = formData.meals.length
          const remainingMeals = totalMealsAllowed - currentMealsCount
          const maxWeek = formData.days ? Math.ceil(parseInt(formData.days) / 7) : 0
          const canAddMoreWeeks = Math.max(...visibleWeeks) < maxWeek && currentMealsCount < totalMealsAllowed

          return (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Configure Meals</h2>
              <div className="bg-blue-50 p-4 rounded-md mb-4">
                <p className="text-sm font-semibold text-blue-700 mb-2">
                  Meals: {currentMealsCount} / {totalMealsAllowed} (Plan Limit)
                </p>
                {remainingMeals > 0 && (
                  <p className="text-sm text-blue-600">
                    {remainingMeals} meals remaining
                  </p>
                )}
                {remainingMeals === 0 && (
                  <p className="text-sm text-orange-600 font-medium">
                    Plan limit reached. Cannot add more meals.
                  </p>
                )}
              </div>

              {/* Show weeks (for both MONTHLY and other plan types) */}
              {(formData.planType === 'MONTHLY' || formData.planType === 'WEEKLY') ? (
                <div className="max-h-[600px] overflow-y-auto space-y-6 pr-2">
                  {visibleWeeks
                    .filter(week => week > 0) // Filter out Week 0
                    .sort((a, b) => a - b)
                    .map((week) => {
                    const isWeekSkipped = formData.skippedWeeks.includes(week)
                    const weekMeals = mealsByWeek[week] || {}
                    const weekDates = Object.keys(weekMeals).sort()
                    
                    return (
                      <div key={week} className="border border-gray-300 rounded-lg overflow-hidden bg-white">
                        {/* Week Header */}
                        <div className={`bg-gray-100 px-4 py-3 flex items-center justify-between border-b border-gray-300 ${isWeekSkipped ? 'opacity-60' : ''}`}>
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-gray-900">Week {week}</h3>
                            <span className="text-sm text-gray-500">
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
                            <span className="text-sm text-gray-600">Skip Week</span>
                          </label>
                        </div>
                        
                        {/* Week Content */}
                        {!isWeekSkipped && (
                          <div className="p-4 space-y-4">
                            {weekDates.length > 0 ? weekDates.map((date) => {
                              const meals = weekMeals[date] || []
                              const isDaySkipped = formData.skippedDays.includes(date)
                              
                              return (
                                <div key={date} className={`border-2 border-gray-400 rounded-md p-4 ${isDaySkipped ? 'opacity-50 bg-gray-50' : 'bg-white'}`}>
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                      <h4 className="font-medium text-gray-900">
                                        <span className="font-bold">{getDayName(date)}</span> - {format(new Date(date), 'MMM dd, yyyy')}
                                      </h4>
                                      {(() => {
                                        const macros = calculateDayMacros(meals)
                                        if (macros.calories > 0) {
                                          return (
                                            <div className="flex items-center gap-3 text-sm">
                                              <span className="font-bold text-base text-nutrafi-primary bg-nutrafi-primary/10 px-3 py-1.5 rounded">
                                                {macros.calories} kcal
                                              </span>
                                              <span className="font-bold text-gray-700">
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
                                      <span className="text-xs text-gray-600">Skip Day</span>
                                    </label>
                                  </div>
                                  
                                  {!isDaySkipped && (
                                    <div className="space-y-3">
                                      {meals.map((meal, idx) => {
                                        const mealKey = `${meal.date}-${meal.timeSlot}`
                                        const isExpanded = expandedMealFields.has(mealKey) || meal.showDishFields
                                        // Second meal (idx === 1) gets custom green background
                                        const isSecondMeal = idx === 1
                                        
                                        return (
                                          <div 
                                            key={idx} 
                                            className="border border-gray-200 rounded-md"
                                            style={isSecondMeal ? { backgroundColor: 'rgba(183, 199, 135, 0.15)' } : { backgroundColor: '#f9fafb' }}
                                          >
                                            <div className="p-3 space-y-3">
                                              {/* First Row: Select Dish, Delivery Type, Delivery Time, Location */}
                                              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                                                <div className="md:col-span-4 relative">
                                                  <label className="block text-xs text-gray-600 mb-1">Select Dish</label>
                                                  {(() => {
                                                    const mealKey = `${meal.date}-${meal.timeSlot}`
                                                    const isOpen = openDishDropdowns.has(mealKey)
                                                    const searchQuery = dishSearchQueries[mealKey] || ''
                                                    const filteredDishes = Array.isArray(dishes) ? dishes.filter(dish => 
                                                      dish.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                      dish.category.toLowerCase().includes(searchQuery.toLowerCase())
                                                    ) : []
                                                    const selectedDish = dishes.find(d => d.id === meal.dishId)
                                                    
                                                    return (
                                                      <div className="relative dish-dropdown-container">
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            const newOpen = new Set(openDishDropdowns)
                                                            if (isOpen) {
                                                              newOpen.delete(mealKey)
                                                            } else {
                                                              newOpen.add(mealKey)
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
                                                        
                                                        {isOpen && (
                                                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                                                            <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
                                                              <input
                                                                type="text"
                                                                placeholder="Search dishes..."
                                                                value={searchQuery}
                                                                onChange={(e) => {
                                                                  setDishSearchQueries({ ...dishSearchQueries, [mealKey]: e.target.value })
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                                autoFocus
                                                              />
                                                            </div>
                                                            <div className="max-h-48 overflow-auto">
                                                              {filteredDishes.length > 0 ? (
                                                                filteredDishes.map((dish) => (
                                                                  <button
                                                                    key={dish.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                      updateMeal(meal.date, meal.timeSlot, 'dishId', dish.id)
                                                                      setOpenDishDropdowns(prev => {
                                                                        const newSet = new Set(prev)
                                                                        newSet.delete(mealKey)
                                                                        return newSet
                                                                      })
                                                                      setDishSearchQueries({ ...dishSearchQueries, [mealKey]: '' })
                                                                    }}
                                                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                                                                      meal.dishId === dish.id ? 'bg-nutrafi-primary/10 text-nutrafi-primary font-medium' : 'text-gray-900'
                                                                    }`}
                                                                  >
                                                                    {dish.name}
                                                                  </button>
                                                                ))
                                                              ) : (
                                                                <div className="px-3 py-2 text-sm text-gray-500">No dishes found</div>
                                                              )}
                                                              <div className="border-t border-gray-200">
                                                                <button
                                                                  type="button"
                                                                  onClick={() => {
                                                                    toggleDishFields(meal.date, meal.timeSlot, true)
                                                                    setOpenDishDropdowns(prev => {
                                                                      const newSet = new Set(prev)
                                                                      newSet.delete(mealKey)
                                                                      return newSet
                                                                    })
                                                                    setDishSearchQueries({ ...dishSearchQueries, [mealKey]: '' })
                                                                  }}
                                                                  className="w-full text-left px-3 py-2 text-sm text-nutrafi-primary hover:bg-nutrafi-primary/10 font-medium flex items-center gap-2"
                                                                >
                                                                  <span>+</span>
                                                                  <span>Add Custom Dish</span>
                                                                </button>
                                                              </div>
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
                                                    onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'deliveryType', e.target.value)}
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
                                                    onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'deliveryTime', e.target.value)}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                  />
                                                </div>
                                                {meal.deliveryType === 'delivery' && (
                                                  <div className="md:col-span-3">
                                                    <label className="block text-xs text-gray-600 mb-1">Delivery Address</label>
                                                    <input
                                                      type="text"
                                                      value={meal.location || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'location', e.target.value)}
                                                      placeholder={selectedCustomer?.deliveryArea || 'Delivery Address'}
                                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                    />
                                                  </div>
                                                )}
                                              </div>
                                              
                                              {/* Notes Field - Always Visible */}
                                              <div>
                                                <label className="block text-xs text-gray-600 mb-1">Notes</label>
                                                <textarea
                                                  value={meal.customNote || ''}
                                                  onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'customNote', e.target.value)}
                                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                  rows={2}
                                                  placeholder="Add any notes for this meal..."
                                                />
                                              </div>
                                              
                                              {/* Show/Hide Details Button */}
                                              <div className="flex items-center gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => toggleDishFields(meal.date, meal.timeSlot, !isExpanded)}
                                                  className="px-4 py-2 text-sm bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 whitespace-nowrap"
                                                  title={isExpanded ? "Hide Dish Details" : "Show Dish Details"}
                                                >
                                                  {isExpanded ? 'Hide Details' : 'Show Details'}
                                                </button>
                                              </div>
                                            </div>
                                            
                                            {/* Inline Dish Fields */}
                                            {isExpanded && (
                                              <div 
                                                className="border-t border-gray-200 p-4 space-y-3"
                                                style={isSecondMeal ? { backgroundColor: 'rgba(183, 199, 135, 0.15)' } : { backgroundColor: '#ffffff' }}
                                              >
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Dish Name *</label>
                                                    <input
                                                      type="text"
                                                      value={meal.dishName || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'dishName', e.target.value)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                      required
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                                                    <select
                                                      value={meal.dishCategory || 'BREAKFAST'}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'dishCategory', e.target.value)}
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
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'dishDescription', e.target.value)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                      rows={2}
                                                    />
                                                  </div>
                                                  <div className="md:col-span-2">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Ingredients</label>
                                                    <textarea
                                                      value={meal.ingredients || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'ingredients', e.target.value)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                      rows={2}
                                                    />
                                                  </div>
                                                  <div className="md:col-span-2">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Allergens</label>
                                                    <input
                                                      type="text"
                                                      value={meal.allergens || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'allergens', e.target.value)}
                                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                      placeholder="e.g., Dairy, Eggs, Gluten"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Calories (kcal) *</label>
                                                    <input
                                                      type="number"
                                                      value={meal.calories || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'calories', parseInt(e.target.value) || 0)}
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
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'protein', parseFloat(e.target.value) || 0)}
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
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'carbs', parseFloat(e.target.value) || 0)}
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
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'fats', parseFloat(e.target.value) || 0)}
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
                            )}
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
                        className="px-6 py-3 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark font-medium flex items-center gap-2"
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
                <div className="max-h-[600px] overflow-y-auto space-y-4 pr-2">
                  {Object.entries(mealsByDay).sort().map(([date, meals]) => {
                    const isDaySkipped = formData.skippedDays.includes(date)
                    
                    return (
                      <div key={date} className={`border-2 border-gray-400 rounded-md p-4 ${isDaySkipped ? 'opacity-50 bg-gray-50' : 'bg-white'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <h4 className="font-medium text-gray-900">
                              <span className="font-bold">{getDayName(date)}</span> - {format(new Date(date), 'MMM dd, yyyy')}
                            </h4>
                            {(() => {
                              const macros = calculateDayMacros(meals)
                              if (macros.calories > 0) {
                                return (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="font-semibold text-nutrafi-primary bg-nutrafi-primary/10 px-2 py-1 rounded">
                                      {macros.calories} kcal
                                    </span>
                                    <span className="text-gray-600">
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
                            <span className="text-xs text-gray-600">Skip Day</span>
                          </label>
                        </div>
                        
                        {!isDaySkipped && (
                          <div className="space-y-3">
                            {meals.map((meal, idx) => {
                              const mealKey = `${meal.date}-${meal.timeSlot}`
                              const isExpanded = expandedMealFields.has(mealKey) || meal.showDishFields
                              // Second meal (idx === 1) gets custom green background
                              const isSecondMeal = idx === 1
                              
                                        return (
                                          <div 
                                            key={idx} 
                                            className="border border-gray-200 rounded-md"
                                            style={isSecondMeal ? { backgroundColor: 'rgba(183, 199, 135, 0.15)' } : { backgroundColor: '#f9fafb' }}
                                          >
                                            <div className="p-3 space-y-3">
                                              {/* First Row: Select Dish, Delivery Type, Delivery Time, Location */}
                                              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                                                <div className="md:col-span-4 relative">
                                                  <label className="block text-xs text-gray-600 mb-1">Select Dish</label>
                                                  {(() => {
                                                    const mealKey = `${meal.date}-${meal.timeSlot}`
                                                    const isOpen = openDishDropdowns.has(mealKey)
                                                    const searchQuery = dishSearchQueries[mealKey] || ''
                                                    const filteredDishes = Array.isArray(dishes) ? dishes.filter(dish => 
                                                      dish.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                      dish.category.toLowerCase().includes(searchQuery.toLowerCase())
                                                    ) : []
                                                    const selectedDish = dishes.find(d => d.id === meal.dishId)
                                                    
                                                    return (
                                                      <div className="relative dish-dropdown-container">
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            const newOpen = new Set(openDishDropdowns)
                                                            if (isOpen) {
                                                              newOpen.delete(mealKey)
                                                            } else {
                                                              newOpen.add(mealKey)
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
                                                        
                                                        {isOpen && (
                                                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                                                            <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
                                                              <input
                                                                type="text"
                                                                placeholder="Search dishes..."
                                                                value={searchQuery}
                                                                onChange={(e) => {
                                                                  setDishSearchQueries({ ...dishSearchQueries, [mealKey]: e.target.value })
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                                autoFocus
                                                              />
                                                            </div>
                                                            <div className="max-h-48 overflow-auto">
                                                              {filteredDishes.length > 0 ? (
                                                                filteredDishes.map((dish) => (
                                                                  <button
                                                                    key={dish.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                      updateMeal(meal.date, meal.timeSlot, 'dishId', dish.id)
                                                                      setOpenDishDropdowns(prev => {
                                                                        const newSet = new Set(prev)
                                                                        newSet.delete(mealKey)
                                                                        return newSet
                                                                      })
                                                                      setDishSearchQueries({ ...dishSearchQueries, [mealKey]: '' })
                                                                    }}
                                                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                                                                      meal.dishId === dish.id ? 'bg-nutrafi-primary/10 text-nutrafi-primary font-medium' : 'text-gray-900'
                                                                    }`}
                                                                  >
                                                                    {dish.name}
                                                                  </button>
                                                                ))
                                                              ) : (
                                                                <div className="px-3 py-2 text-sm text-gray-500">No dishes found</div>
                                                              )}
                                                              <div className="border-t border-gray-200">
                                                                <button
                                                                  type="button"
                                                                  onClick={() => {
                                                                    toggleDishFields(meal.date, meal.timeSlot, true)
                                                                    setOpenDishDropdowns(prev => {
                                                                      const newSet = new Set(prev)
                                                                      newSet.delete(mealKey)
                                                                      return newSet
                                                                    })
                                                                    setDishSearchQueries({ ...dishSearchQueries, [mealKey]: '' })
                                                                  }}
                                                                  className="w-full text-left px-3 py-2 text-sm text-nutrafi-primary hover:bg-nutrafi-primary/10 font-medium flex items-center gap-2"
                                                                >
                                                                  <span>+</span>
                                                                  <span>Add Custom Dish</span>
                                                                </button>
                                                              </div>
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
                                                    onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'deliveryType', e.target.value)}
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
                                                    onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'deliveryTime', e.target.value)}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                  />
                                                </div>
                                                {meal.deliveryType === 'delivery' && (
                                                  <div className="md:col-span-3">
                                                    <label className="block text-xs text-gray-600 mb-1">Delivery Address</label>
                                                    <input
                                                      type="text"
                                                      value={meal.location || ''}
                                                      onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'location', e.target.value)}
                                                      placeholder={selectedCustomer?.deliveryArea || 'Delivery Address'}
                                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                    />
                                                  </div>
                                                )}
                                              </div>
                                              
                                              {/* Notes Field - Always Visible */}
                                              <div>
                                                <label className="block text-xs text-gray-600 mb-1">Notes</label>
                                                <textarea
                                                  value={meal.customNote || ''}
                                                  onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'customNote', e.target.value)}
                                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                                  rows={2}
                                                  placeholder="Add any notes for this meal..."
                                                />
                                              </div>
                                              
                                              {/* Show/Hide Details Button */}
                                              <div className="flex items-center gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => toggleDishFields(meal.date, meal.timeSlot, !isExpanded)}
                                                  className="px-4 py-2 text-sm bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 whitespace-nowrap"
                                                  title={isExpanded ? "Hide Dish Details" : "Show Dish Details"}
                                                >
                                                  {isExpanded ? 'Hide Details' : 'Show Details'}
                                                </button>
                                              </div>
                                            </div>
                                  
                                  {/* Inline Dish Fields */}
                                  {isExpanded && (
                                    <div 
                                      className="border-t border-gray-200 p-4 space-y-3"
                                      style={isSecondMeal ? { backgroundColor: 'rgba(183, 199, 135, 0.15)' } : { backgroundColor: '#ffffff' }}
                                    >
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Dish Name *</label>
                                          <input
                                            type="text"
                                            value={meal.dishName || ''}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'dishName', e.target.value)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                            required
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                                          <select
                                            value={meal.dishCategory || 'BREAKFAST'}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'dishCategory', e.target.value)}
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
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'dishDescription', e.target.value)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                            rows={2}
                                          />
                                        </div>
                                        <div className="md:col-span-2">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Ingredients</label>
                                          <textarea
                                            value={meal.ingredients || ''}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'ingredients', e.target.value)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                            rows={2}
                                          />
                                        </div>
                                        <div className="md:col-span-2">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Allergens</label>
                                          <input
                                            type="text"
                                            value={meal.allergens || ''}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'allergens', e.target.value)}
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                                            placeholder="e.g., Dairy, Eggs, Gluten"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Calories (kcal) *</label>
                                          <input
                                            type="number"
                                            value={meal.calories || ''}
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'calories', parseInt(e.target.value) || 0)}
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
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'protein', parseFloat(e.target.value) || 0)}
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
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'carbs', parseFloat(e.target.value) || 0)}
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
                                            onChange={(e) => updateMeal(meal.date, meal.timeSlot, 'fats', parseFloat(e.target.value) || 0)}
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
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Meal Plan'}
                </button>
              </div>
            </div>
          )
        })()}
      </form>

      {/* Add New Dish Modal */}
      {showAddDishModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowAddDishModal(false)
            setSelectedMealForDish(null)
          }}
        >
          {/* Blurred Background */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>
          
          {/* Modal Box */}
          <div 
            className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Add New Dish</h3>
              <button
                onClick={() => {
                  setShowAddDishModal(false)
                  setSelectedMealForDish(null)
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                  <input
                    type="text"
                    required
                    value={newDishForm.name}
                    onChange={(e) => setNewDishForm({ ...newDishForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
                  <select
                    required
                    value={newDishForm.category}
                    onChange={(e) => setNewDishForm({ ...newDishForm, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={newDishForm.description}
                    onChange={(e) => setNewDishForm({ ...newDishForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                    rows={3}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ingredients</label>
                  <textarea
                    value={newDishForm.ingredients}
                    onChange={(e) => setNewDishForm({ ...newDishForm, ingredients: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                    rows={2}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Allergens</label>
                  <input
                    type="text"
                    value={newDishForm.allergens}
                    onChange={(e) => setNewDishForm({ ...newDishForm, allergens: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                    placeholder="e.g., Dairy, Eggs, Gluten"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Calories (kcal) *</label>
                  <input
                    type="number"
                    required
                    value={newDishForm.calories}
                    onChange={(e) => setNewDishForm({ ...newDishForm, calories: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Protein (g) *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newDishForm.protein}
                    onChange={(e) => setNewDishForm({ ...newDishForm, protein: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Carbs (g) *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newDishForm.carbs}
                    onChange={(e) => setNewDishForm({ ...newDishForm, carbs: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Fats (g) *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newDishForm.fats}
                    onChange={(e) => setNewDishForm({ ...newDishForm, fats: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Price (AED)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newDishForm.price}
                    onChange={(e) => setNewDishForm({ ...newDishForm, price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                  />
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddDishModal(false)
                  setSelectedMealForDish(null)
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateDish}
                disabled={creatingDish}
                className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50"
              >
                {creatingDish ? 'Creating...' : 'Create Dish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
