'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format, addDays, eachDayOfInterval } from 'date-fns'
import { formatCategory } from '@/lib/utils'

interface MealPlan {
  id: string
  customer: {
    id: string
    fullName: string
    phone: string
    email: string | null
    deliveryArea: string
    address: string
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
  // timeSlots removed - delivery times stored per meal item
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
    isSkipped: boolean
    isDelivered: boolean
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
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<MealPlan['mealPlanItems'][0] | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingTimeSlot, setEditingTimeSlot] = useState(false)
  const [timeSlotValue, setTimeSlotValue] = useState('')
  const [savingTimeSlot, setSavingTimeSlot] = useState(false)
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
  const [dishDropdownOpen, setDishDropdownOpen] = useState(false)
  const [dishSearchQuery, setDishSearchQuery] = useState('')
  const [showDishDetails, setShowDishDetails] = useState(false)

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

  // Helper function to calculate week number from start date
  const getWeekNumber = (date: string, startDate: string | null): number => {
    if (!startDate) return 1
    const mealDate = new Date(date)
    const start = new Date(startDate)
    const daysDiff = Math.floor((mealDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    // Ensure week number is always >= 1 (no Week 0)
    return Math.max(1, Math.floor(daysDiff / 7) + 1)
  }

  const fetchMealPlan = async (id: string) => {
    try {
      const response = await fetch(`/api/meal-plans/${id}`)
      if (response.ok) {
        const data = await response.json()
        setMealPlan(data)
        
        // Initialize visible weeks based on existing meal items
        if (data.mealPlanItems && data.mealPlanItems.length > 0) {
          const weeks = new Set<number>()
          data.mealPlanItems.forEach((item: MealPlan['mealPlanItems'][0]) => {
            const week = getWeekNumber(item.date, data.startDate)
            if (week > 0) {
              weeks.add(week)
            }
          })
          const weeksArray = Array.from(weeks).sort((a, b) => a - b)
          setVisibleWeeks(weeksArray)
          
          // Only expand the last week by default
          if (weeksArray.length > 0) {
            const lastWeek = Math.max(...weeksArray)
            setExpandedWeeks(new Set([lastWeek]))
          }
        } else {
          // If no items, start with week 1
          setVisibleWeeks([1])
          setExpandedWeeks(new Set([1]))
        }
      } else {
        alert('Failed to fetch meal plan')
        router.push('/meal-plans')
      }
    } catch (error) {
      console.error('Error fetching meal plan:', error)
      alert('Failed to fetch meal plan')
    } finally {
      setLoading(false)
    }
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
                ? { ...item, isDelivered: data.mealPlanItem.isDelivered, deliveredAt: data.mealPlanItem.deliveredAt }
                : item
            ),
          })
        }
        // Update selected item if it's the one being marked
        if (selectedItem && selectedItem.id === itemId) {
          setSelectedItem({
            ...selectedItem,
            isDelivered: data.mealPlanItem.isDelivered,
            deliveredAt: data.mealPlanItem.deliveredAt,
          })
        }
      } else {
        alert('Failed to update delivery status')
      }
    } catch (error) {
      console.error('Error updating delivery status:', error)
      alert('Failed to update delivery status')
    }
  }

  const handleUpdateTimeSlot = async () => {
    if (!mealPlan || !selectedItem || !timeSlotValue) return
    
    setSavingTimeSlot(true)
    try {
      // Convert time from HH:MM format to HH:MM format (24-hour)
      const timeMatch = timeSlotValue.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
      let timeSlot = timeSlotValue
      
      if (timeMatch) {
        let hours = parseInt(timeMatch[1])
        const minutes = timeMatch[2]
        const ampm = timeMatch[3]?.toUpperCase()
        
        if (ampm === 'PM' && hours !== 12) {
          hours += 12
        } else if (ampm === 'AM' && hours === 12) {
          hours = 0
        }
        
        timeSlot = `${hours.toString().padStart(2, '0')}:${minutes}`
      }
      
      // If time slot hasn't changed, just cancel editing
      if (timeSlot === selectedItem.timeSlot) {
        setEditingTimeSlot(false)
        setSavingTimeSlot(false)
        return
      }
      
      // First, delete the old item if time slot is changing
      if (timeSlot !== selectedItem.timeSlot) {
        const deleteResponse = await fetch(`/api/meal-plans/${mealPlan.id}/items/${selectedItem.id}`, {
          method: 'DELETE',
        })
        
        if (!deleteResponse.ok) {
          throw new Error('Failed to delete old item')
        }
      }
      
      // Then create/update with new time slot
      const response = await fetch(`/api/meal-plans/${mealPlan.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedItem.date,
          timeSlot: timeSlot,
          dishId: selectedItem.dishId || undefined,
          dishName: selectedItem.dishName || undefined,
          ingredients: selectedItem.ingredients || undefined,
          allergens: selectedItem.allergens || undefined,
          calories: selectedItem.calories || undefined,
          protein: selectedItem.protein || undefined,
          carbs: selectedItem.carbs || undefined,
          fats: selectedItem.fats || undefined,
          deliveryTime: selectedItem.deliveryTime || undefined,
          customNote: selectedItem.customNote || undefined,
        }),
      })
      
      if (response.ok) {
        // Refresh meal plan to get updated items
        await fetchMealPlan(mealPlan.id)
        setEditingTimeSlot(false)
        setTimeSlotValue('')
        setShowModal(false)
        alert('Time slot updated successfully')
      } else {
        const error = await response.json()
        alert('Failed to update time slot: ' + (error.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error updating time slot:', error)
      alert('Failed to update time slot')
    } finally {
      setSavingTimeSlot(false)
    }
  }

  const handleItemClick = (item: MealPlan['mealPlanItems'][0]) => {
    setSelectedItem(item)
    setShowModal(true)
    setEditingTimeSlot(false)
    setTimeSlotValue(item.timeSlot)
    setEditingDish(false)
    setDishDropdownOpen(false)
    setDishSearchQuery('')
    setShowDishDetails(false) // Hide details by default
    // Initialize dish form data from item
    const customNote = parseCustomNote(item.customNote)
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
      deliveryType: customNote?.deliveryType || 'delivery',
      deliveryTime: item.deliveryTime || '',
      location: customNote?.location || mealPlan?.customer.deliveryArea || '',
      customNote: customNote?.note || '',
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

  // Parse custom note JSON
  const parseCustomNote = (customNote: string | null) => {
    if (!customNote) return null
    try {
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
    
    // Validate required fields
    if (!dishFormData.dishName) {
      alert('Please enter a dish name')
      return
    }
    
    setSavingDish(true)
    try {
      const customNoteObj: any = {}
      if (dishFormData.deliveryType) customNoteObj.deliveryType = dishFormData.deliveryType
      if (dishFormData.location) customNoteObj.location = dishFormData.location
      if (dishFormData.customNote) customNoteObj.note = dishFormData.customNote

      const response = await fetch(`/api/meal-plans/${mealPlan.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedItem.date,
          timeSlot: selectedItem.timeSlot,
          dishId: dishFormData.dishId || undefined,
          dishName: dishFormData.dishName,
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
          isSkipped: false, // Un-skip the meal when adding dish
          customNote: Object.keys(customNoteObj).length > 0 ? JSON.stringify(customNoteObj) : undefined,
        }),
      })

      if (response.ok) {
        await fetchMealPlan(mealPlan.id)
        setEditingDish(false)
        setShowModal(false)
        alert('Dish added successfully!')
      } else {
        const error = await response.json()
        alert('Failed to add dish: ' + (error.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error saving dish:', error)
      alert('Failed to save dish')
    } finally {
      setSavingDish(false)
    }
  }

  // Function to add another week
  const addAnotherWeek = async () => {
    if (!mealPlan) return
    
    setAddingWeek(true)
    try {
      const maxWeek = Math.ceil(mealPlan.days / 7)
      const nextWeek = Math.max(...visibleWeeks, 0) + 1
      
      // Check if adding this week would exceed plan days
      if (nextWeek > maxWeek) {
        alert('Cannot add more weeks. Maximum weeks for this plan reached.')
        setAddingWeek(false)
        return
      }
      
      // Check if adding this week would exceed total meals allowed
      const currentMealsCount = mealPlan.mealPlanItems.length
      const mealsPerWeek = 7 * mealPlan.mealsPerDay
      const totalMealsAllowed = mealPlan.totalMeals || (mealPlan.days * mealPlan.mealsPerDay)
      
      if (currentMealsCount + mealsPerWeek > totalMealsAllowed) {
        alert(`Cannot add another week. This would exceed the plan's limit of ${totalMealsAllowed} meals.`)
        setAddingWeek(false)
        return
      }
      
      // Calculate dates for the new week
      const startDate = new Date(mealPlan.startDate)
      const weekStartDay = (nextWeek - 1) * 7
      const weekStartDate = addDays(startDate, weekStartDay)
      const weekEndDate = addDays(weekStartDate, 6) // 7 days in a week
      const dates = eachDayOfInterval({ start: weekStartDate, end: weekEndDate })
      
      // Generate default time slots (you may want to get these from the plan or use defaults)
      const defaultTimeSlots = ['08:00', '13:00', '18:00'].slice(0, mealPlan.mealsPerDay)
      
      // Create meal items for the new week
      const mealItemPromises = dates.map(date => {
        return defaultTimeSlots.map((timeSlot, idx) => {
          // Convert timeSlot to 24-hour format for deliveryTime
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
              date: format(date, 'yyyy-MM-dd'),
              timeSlot: timeSlot,
              deliveryType: 'delivery',
              deliveryTime: deliveryTime,
              location: mealPlan.customer.deliveryArea || '',
              isSkipped: false,
            }),
          })
        })
      }).flat()
      
      await Promise.all(mealItemPromises)
      
      // Add the new week to visible weeks
      setVisibleWeeks(prev => [...prev, nextWeek].sort((a, b) => a - b))
      
      // Expand the new week
      setExpandedWeeks(prev => {
        const newSet = new Set(prev)
        newSet.add(nextWeek)
        return newSet
      })
      
      // Refresh meal plan to get new items
      await fetchMealPlan(mealPlan.id)
      
      alert(`Week ${nextWeek} added successfully!`)
    } catch (error) {
      console.error('Error adding week:', error)
      alert('Failed to add week')
    } finally {
      setAddingWeek(false)
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
      dailyTotals[date] = {
        calories: items.reduce((sum, item) => sum + (item.calories || 0), 0),
        protein: items.reduce((sum, item) => sum + (item.protein || 0), 0),
        carbs: items.reduce((sum, item) => sum + (item.carbs || 0), 0),
        fats: items.reduce((sum, item) => sum + (item.fats || 0), 0),
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Meal Plan Details</h1>
        <div className="flex gap-4">
          <Link
            href={`/meal-plans/${mealPlan.id}/edit`}
            className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
          >
            Edit
          </Link>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
          >
            Back
          </button>
        </div>
      </div>

      {/* Customer Info */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Name</label>
            <p className="text-sm text-gray-900">{mealPlan.customer.fullName}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Phone</label>
            <p className="text-sm text-gray-900">{mealPlan.customer.phone}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Email</label>
            <p className="text-sm text-gray-900">{mealPlan.customer.email || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Delivery Area</label>
            <p className="text-sm text-gray-900">{mealPlan.customer.deliveryArea}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Address</label>
            <p className="text-sm text-gray-900">{mealPlan.customer.address || '-'}</p>
          </div>
        </div>
      </div>

      {/* Meal Plan Info */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Meal Plan Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Plan Type</label>
            <p className="text-sm text-gray-900">{mealPlan.planType}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Days</label>
            <p className="text-sm text-gray-900">{mealPlan.days || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Start Date</label>
            <p className="text-sm text-gray-900">{mealPlan.startDate ? format(new Date(mealPlan.startDate), 'MMM dd, yyyy') : '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">End Date</label>
            <p className="text-sm text-gray-900">{mealPlan.endDate ? format(new Date(mealPlan.endDate), 'MMM dd, yyyy') : '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Meals Per Day</label>
            <p className="text-sm text-gray-900">{mealPlan.mealsPerDay}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Total Meals</label>
            <p className="text-sm text-gray-900 font-semibold">{mealPlan.totalMeals !== null ? mealPlan.totalMeals : (mealPlan.days && mealPlan.mealsPerDay ? mealPlan.days * mealPlan.mealsPerDay : '-')}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Remaining Meals</label>
            <p className={`text-sm font-semibold ${mealPlan.remainingMeals !== null && mealPlan.remainingMeals < 10 ? 'text-orange-600' : 'text-nutrafi-primary'}`}>
              {mealPlan.remainingMeals !== null ? mealPlan.remainingMeals : '-'}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Status</label>
            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
              mealPlan.status === 'ACTIVE' ? 'bg-[#f0f4e8] text-nutrafi-dark' :
              mealPlan.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {mealPlan.status}
            </span>
          </div>
          {mealPlan.plan && (
            <div>
              <label className="text-sm font-medium text-gray-500">Predefined Plan</label>
              <p className="text-sm text-gray-900">{mealPlan.plan.name} - {mealPlan.plan.price} AED</p>
            </div>
          )}
          {mealPlan.notes && (
            <div className="md:col-span-3">
              <label className="text-sm font-medium text-gray-500">Notes</label>
              <p className="text-sm text-gray-900">{mealPlan.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Pricing Information */}
      {(mealPlan.baseAmount !== null || mealPlan.totalAmount !== null) && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {mealPlan.baseAmount !== null && (
              <div>
                <label className="text-sm font-medium text-gray-500">Base Amount</label>
                <p className="text-lg font-semibold text-gray-900">{mealPlan.baseAmount.toFixed(2)} AED</p>
              </div>
            )}
            {mealPlan.vatAmount !== null && (
              <div>
                <label className="text-sm font-medium text-gray-500">VAT (5%)</label>
                <p className="text-lg font-semibold text-gray-900">{mealPlan.vatAmount.toFixed(2)} AED</p>
              </div>
            )}
            {mealPlan.totalAmount !== null && (
              <div>
                <label className="text-sm font-medium text-gray-500">Total Amount</label>
                <p className="text-lg font-semibold text-nutrafi-primary">{mealPlan.totalAmount.toFixed(2)} AED</p>
              </div>
            )}
            {mealPlan.averageMealRate !== null && (
              <div>
                <label className="text-sm font-medium text-gray-500">Average Meal Rate</label>
                <p className="text-lg font-semibold text-gray-900">{mealPlan.averageMealRate.toFixed(2)} AED</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment History */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h2>
        {mealPlan.payments && mealPlan.payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mealPlan.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(payment.paymentDate), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {payment.amount.toFixed(2)} AED
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {payment.paymentMethod || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        payment.status === 'COMPLETED' ? 'bg-[#f0f4e8] text-nutrafi-dark' :
                        payment.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {payment.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Total Paid:</span>
                <span className="text-lg font-semibold text-nutrafi-primary">
                  {mealPlan.payments
                    .filter(p => p.status === 'COMPLETED')
                    .reduce((sum, p) => sum + p.amount, 0)
                    .toFixed(2)} AED
                </span>
              </div>
              {mealPlan.totalAmount !== null && (
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm font-medium text-gray-700">Remaining Balance:</span>
                  <span className={`text-lg font-semibold ${
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
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Meal Schedule</h2>
          {(() => {
            if (!mealPlan) return null
            const maxWeek = Math.ceil(mealPlan.days / 7)
            const currentMealsCount = mealPlan.mealPlanItems.length
            const totalMealsAllowed = mealPlan.totalMeals || (mealPlan.days * mealPlan.mealsPerDay)
            const mealsPerWeek = 7 * mealPlan.mealsPerDay
            const canAddMoreWeeks = Math.max(...visibleWeeks, 0) < maxWeek && currentMealsCount + mealsPerWeek <= totalMealsAllowed
            
            return canAddMoreWeeks ? (
              <button
                onClick={addAnotherWeek}
                disabled={addingWeek}
                className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark font-medium flex items-center gap-2 disabled:opacity-50"
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
              <div key={week} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Week Header */}
                <div 
                  className="bg-nutrafi-primary bg-opacity-10 px-6 py-3 border-b border-gray-200 cursor-pointer hover:bg-opacity-20 transition-colors"
                  onClick={toggleWeek}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <svg 
                        className={`w-5 h-5 text-gray-600 transition-transform ${isExpanded ? 'transform rotate-90' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <h3 className="text-md font-semibold text-gray-900">Week {week}</h3>
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-semibold text-nutrafi-primary">{weekTotal.calories} kcal</span>
                      {' '}• P: {weekTotal.protein.toFixed(1)}g | C: {weekTotal.carbs.toFixed(1)}g | F: {weekTotal.fats.toFixed(1)}g
                    </div>
                  </div>
                </div>
                
                {/* Week Content */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Day / Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time Slot</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dish</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Calories</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {Object.keys(weekDates).length > 0 ? Object.entries(weekDates).sort().map(([date, items]) => {
                        const dayTotal = dailyTotals[date]
                        return (
                          <React.Fragment key={date}>
                            {items.map((item, index) => (
                              <tr 
                                key={item.id}
                                onClick={() => handleItemClick(item)}
                                className="cursor-pointer hover:bg-gray-50 transition-colors"
                              >
                                {index === 0 && (
                                  <>
                                    <td 
                                      rowSpan={items.length + 1}
                                      className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 align-top border-r border-gray-200"
                                    >
                                      <div>{getDayName(item.date)}</div>
                                      <div className="text-xs text-gray-500 mt-1">{format(new Date(item.date), 'MMM dd, yyyy')}</div>
                                    </td>
                                  </>
                                )}
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {formatTime12Hour(item.timeSlot)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {item.dishName || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {item.calories !== null ? `${item.calories} kcal` : '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {item.isSkipped ? (
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                      Skipped
                                    </span>
                                  ) : item.isDelivered ? (
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                      Delivered
                                    </span>
                                  ) : (
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-[#f0f4e8] text-nutrafi-dark">
                                      Active
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {/* Daily Total Row */}
                            <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                              <td></td>
                              <td colSpan={2} className="px-6 py-3 text-sm text-gray-700 text-left">
                                Daily Total:
                              </td>
                              <td className="px-6 py-3 text-left">
                                <span className="px-3 py-1.5 bg-gray-800 text-white font-bold rounded-md text-sm">
                                  {dayTotal.calories} kcal
                                </span>
                              </td>
                              <td className="px-6 py-3 text-sm text-gray-600 text-left">
                                P: {dayTotal.protein.toFixed(1)}g | C: {dayTotal.carbs.toFixed(1)}g | F: {dayTotal.fats.toFixed(1)}g
                              </td>
                            </tr>
                          </React.Fragment>
                        )
                      }) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                            No meals generated for this week yet. Meals will be generated when you add dishes.
                          </td>
                        </tr>
                      )}
                      {/* Week Total Row */}
                      <tr className="bg-nutrafi-primary bg-opacity-20 font-bold border-t-2 border-nutrafi-primary">
                        <td colSpan={5} className="px-6 py-4 text-left">
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-900">Week {week} Total:</span>
                            <span className="text-sm text-nutrafi-primary font-bold">
                              {weekTotal.calories} kcal
                            </span>
                            <span className="text-sm text-gray-700">
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
          
          {/* Grand Total Row */}
          {visibleWeeks.length > 0 && (
            <div className="bg-nutrafi-primary bg-opacity-10 rounded-lg p-4 border-2 border-nutrafi-primary">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-gray-900">Grand Total:</span>
                <span className="text-sm text-nutrafi-primary font-bold">
                  {grandTotals.calories} kcal
                </span>
                <span className="text-sm text-gray-700">
                  P: {grandTotals.protein.toFixed(1)}g | C: {grandTotals.carbs.toFixed(1)}g | F: {grandTotals.fats.toFixed(1)}g
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Meal Item Detail Modal */}
      {showModal && selectedItem && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          {/* Blurred Background */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>
          
          {/* Modal Box */}
          <div 
            className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                Meal Details - {selectedItem.dishName || 'No Dish Assigned'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Day</label>
                  <p className="text-sm text-gray-900 font-semibold">{getDayName(selectedItem.date)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Date</label>
                  <p className="text-sm text-gray-900">{format(new Date(selectedItem.date), 'MMM dd, yyyy')}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Time Slot</label>
                  {editingTimeSlot ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="time"
                        value={timeSlotValue}
                        onChange={(e) => setTimeSlotValue(e.target.value)}
                        className="px-2 py-1 text-sm border border-gray-300 rounded-md w-32"
                        disabled={savingTimeSlot}
                      />
                      <button
                        onClick={handleUpdateTimeSlot}
                        disabled={savingTimeSlot}
                        className="px-3 py-1 text-sm bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50"
                      >
                        {savingTimeSlot ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingTimeSlot(false)
                          setTimeSlotValue(selectedItem.timeSlot)
                        }}
                        disabled={savingTimeSlot}
                        className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-900 font-semibold">{formatTime12Hour(selectedItem.timeSlot)}</p>
                      <button
                        onClick={() => setEditingTimeSlot(true)}
                        className="text-xs text-nutrafi-primary hover:text-nutrafi-dark underline"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <p className="text-sm">
                    {selectedItem.isSkipped ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        Skipped
                      </span>
                    ) : selectedItem.isDelivered ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        Delivered
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-[#f0f4e8] text-nutrafi-dark">
                        Active
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Dish Information */}
              {selectedItem.dishName && (
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Dish Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Dish Name</label>
                      <p className="text-sm text-gray-900">{selectedItem.dishName}</p>
                    </div>
                    {selectedItem.dishCategory && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Category</label>
                        <p className="text-sm text-gray-900">{formatCategory(selectedItem.dishCategory)}</p>
                      </div>
                    )}
                    {selectedItem.dishDescription && (
                      <div className="col-span-2">
                        <label className="text-sm font-medium text-gray-500">Description</label>
                        <p className="text-sm text-gray-900">{selectedItem.dishDescription}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Ingredients */}
              {selectedItem.ingredients && (
                <div className="border-t border-gray-200 pt-4">
                  <label className="text-sm font-medium text-gray-500">Ingredients</label>
                  <p className="text-sm text-gray-900 mt-1">{selectedItem.ingredients}</p>
                </div>
              )}

              {/* Allergens */}
              {selectedItem.allergens && (
                <div className="border-t border-gray-200 pt-4">
                  <label className="text-sm font-medium text-gray-500">Allergens</label>
                  <p className="text-sm text-gray-900 mt-1">{selectedItem.allergens || 'None'}</p>
                </div>
              )}


              {/* Instructions */}
              {(() => {
                const customNote = parseCustomNote(selectedItem.customNote)
                const instructions = customNote?.instructions
                
                if (instructions) {
                  return (
                    <div className="border-t border-gray-200 pt-4">
                      <label className="text-sm font-medium text-gray-500">Instructions</label>
                      <p className="text-sm text-gray-900 mt-1">{instructions}</p>
                    </div>
                  )
                }
                return null
              })()}

              {/* Delivery Information */}
              {(() => {
                const customNote = parseCustomNote(selectedItem.customNote)
                const deliveryLocation = customNote?.deliveryLocation
                const deliveryType = customNote?.deliveryType
                
                if (deliveryLocation || deliveryType) {
                  return (
                    <div className="border-t border-gray-200 pt-4">
                      <h4 className="text-md font-semibold text-gray-900 mb-3">Delivery Information</h4>
                      <div className="grid grid-cols-2 gap-4">
                        {deliveryType && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">Delivery Type</label>
                            <p className="text-sm text-gray-900 capitalize">{deliveryType}</p>
                          </div>
                        )}
                        {deliveryLocation && (
                          <div>
                            <label className="text-sm font-medium text-gray-500">Location</label>
                            <p className="text-sm text-gray-900">{deliveryLocation}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }
                return null
              })()}
            </div>

            {/* Add Dish Form for Empty Meals */}
            {((!selectedItem.dishName || selectedItem.dishName?.trim() === '') && (!selectedItem.dishId || selectedItem.dishId === '')) && editingDish && (
              <div className="border-t border-gray-200 pt-4 px-6 pb-4 space-y-4 bg-gray-50">
                <h4 className="text-md font-semibold text-gray-900 mb-3">Add Dish to This Meal</h4>
                
                <div className="space-y-4">
                  {/* Searchable Dish Dropdown */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Dish</label>
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
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                          <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
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
                          <div className="max-h-48 overflow-auto">
                            {(() => {
                              const filteredDishes = Array.isArray(dishes) ? dishes.filter(dish => 
                                dish.name.toLowerCase().includes(dishSearchQuery.toLowerCase()) ||
                                dish.category.toLowerCase().includes(dishSearchQuery.toLowerCase())
                              ) : []
                              return filteredDishes.length > 0 ? (
                                filteredDishes.map((dish) => (
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
                            <div className="border-t border-gray-200">
                              <button
                                type="button"
                                onClick={() => {
                                  setDishFormData({
                                    ...dishFormData,
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
                                  })
                                  setShowDishDetails(true)
                                  setDishDropdownOpen(false)
                                  setDishSearchQuery('')
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
                  </div>

                  {/* Delivery Type, Time, Location */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Type</label>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Time</label>
                      <input
                        type="time"
                        value={dishFormData.deliveryTime}
                        onChange={(e) => setDishFormData({ ...dishFormData, deliveryTime: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                      />
                    </div>
                    
                    {dishFormData.deliveryType === 'delivery' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={dishFormData.customNote}
                      onChange={(e) => setDishFormData({ ...dishFormData, customNote: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                      rows={2}
                      placeholder="Add any notes for this meal..."
                    />
                  </div>

                  {/* Show/Hide Details Button */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDishDetails(!showDishDetails)}
                      className="px-4 py-2 text-sm bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 whitespace-nowrap"
                      title={showDishDetails ? "Hide Dish Details" : "Show Dish Details"}
                    >
                      {showDishDetails ? 'Hide Details' : 'Show Details'}
                    </button>
                  </div>

                  {/* Dish Details Fields - Collapsible */}
                  {showDishDetails && (
                    <div className="border-t border-gray-200 pt-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Dish Name *</label>
                          <input
                            type="text"
                            value={dishFormData.dishName}
                            onChange={(e) => setDishFormData({ ...dishFormData, dishName: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            required
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                          <textarea
                            value={dishFormData.dishDescription}
                            onChange={(e) => setDishFormData({ ...dishFormData, dishDescription: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            rows={2}
                          />
                        </div>
                        
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Ingredients</label>
                          <textarea
                            value={dishFormData.ingredients}
                            onChange={(e) => setDishFormData({ ...dishFormData, ingredients: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            rows={2}
                          />
                        </div>
                        
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Allergens</label>
                          <input
                            type="text"
                            value={dishFormData.allergens}
                            onChange={(e) => setDishFormData({ ...dishFormData, allergens: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            placeholder="e.g., Dairy, Eggs, Gluten"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Calories (kcal) *</label>
                          <input
                            type="number"
                            value={dishFormData.calories}
                            onChange={(e) => setDishFormData({ ...dishFormData, calories: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                            required
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Protein (g) *</label>
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">Carbs (g) *</label>
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">Fats (g) *</label>
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

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-between items-center">
              <div className="flex gap-2">
                {((!selectedItem.dishName || selectedItem.dishName?.trim() === '') && (!selectedItem.dishId || selectedItem.dishId === '')) && !editingDish && (
                  <button
                    onClick={() => setEditingDish(true)}
                    className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark font-medium"
                  >
                    Add Dish
                  </button>
                )}
                {((!selectedItem.dishName || selectedItem.dishName?.trim() === '') && (!selectedItem.dishId || selectedItem.dishId === '')) && editingDish && (
                  <>
                    <button
                      onClick={handleSaveDish}
                      disabled={savingDish}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium disabled:opacity-50"
                    >
                      {savingDish ? 'Saving...' : 'Save Dish'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingDish(false)
                        handleItemClick(selectedItem) // Reset form data
                      }}
                      disabled={savingDish}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {!selectedItem.isSkipped && (
                  <button
                    onClick={() => handleMarkAsDelivered(selectedItem.id, !selectedItem.isDelivered)}
                    className={`px-4 py-2 rounded-md font-medium ${
                      selectedItem.isDelivered
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-nutrafi-primary text-white hover:bg-nutrafi-dark'
                    }`}
                  >
                    {selectedItem.isDelivered ? 'Mark as Not Delivered' : 'Mark as Delivered'}
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
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

