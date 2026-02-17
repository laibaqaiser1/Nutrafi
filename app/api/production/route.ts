import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// GET - Get aggregated production data
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const timeSlot = searchParams.get('timeSlot')
    const deliveryArea = searchParams.get('deliveryArea')
    const dishId = searchParams.get('dishId')
    const customerId = searchParams.get('customerId')
    const planType = searchParams.get('planType')

    const where: any = {
      isSkipped: false,
    }

    if (date) {
      const dateObj = new Date(date)
      where.date = {
        gte: new Date(dateObj.setHours(0, 0, 0, 0)),
        lt: new Date(dateObj.setHours(23, 59, 59, 999)),
      }
    }

    if (timeSlot) {
      where.timeSlot = timeSlot
    }

    if (dishId) {
      where.dishId = dishId
    }

    // Filter by customer/plan type through meal plan
    if (customerId || planType) {
      where.mealPlan = {}
      if (customerId) {
        where.mealPlan.customerId = customerId
      }
      if (planType) {
        where.mealPlan.plan = { planType: planType }
      }
    }

    // Get all meal plan items with related data
    const items = await prisma.mealPlanItem.findMany({
      where,
      include: {
        dish: true,
        mealPlan: {
          include: {
            customer: true,
            plan: true,
          },
        },
      },
    })

    // Filter by delivery area if specified
    let filteredItems = items
    if (deliveryArea) {
      filteredItems = items.filter(
        item => item.mealPlan.customer.deliveryArea.toLowerCase().includes(deliveryArea.toLowerCase())
      )
    }

    // Aggregate by dish
    const dishAggregation: Record<string, {
      dish: any
      count: number
      customers: Set<string>
      deliveryAreas: Set<string>
    }> = {}

    filteredItems.forEach(item => {
      if (!item.dish) return

      const dishId = item.dish.id
      if (!dishAggregation[dishId]) {
        dishAggregation[dishId] = {
          dish: item.dish,
          count: 0,
          customers: new Set(),
          deliveryAreas: new Set(),
        }
      }

      dishAggregation[dishId].count++
      dishAggregation[dishId].customers.add(item.mealPlan.customer.fullName)
      dishAggregation[dishId].deliveryAreas.add(item.mealPlan.customer.deliveryArea)
    })

    // Convert to array format
    const aggregated = Object.values(dishAggregation).map(agg => ({
      dish: agg.dish,
      totalPortions: agg.count,
      customerCount: agg.customers.size,
      deliveryAreas: Array.from(agg.deliveryAreas),
    }))

    // Group by time slot if needed
    const byTimeSlot: Record<string, typeof aggregated> = {}
    if (!timeSlot) {
      filteredItems.forEach(item => {
        if (!item.dish) return
        const slot = item.timeSlot
        if (!byTimeSlot[slot]) {
          byTimeSlot[slot] = []
        }
        const existing = byTimeSlot[slot].find(a => a.dish.id === item.dish!.id)
        if (existing) {
          existing.totalPortions++
        } else {
          byTimeSlot[slot].push({
            dish: item.dish,
            totalPortions: 1,
            customerCount: 1,
            deliveryAreas: [item.mealPlan.customer.deliveryArea],
          })
        }
      })
    }

    return NextResponse.json({
      aggregated,
      byTimeSlot,
      totalMeals: filteredItems.length,
      date: date || null,
      timeSlot: timeSlot || null,
    })
  } catch (error) {
    console.error('Error fetching production data:', error)
    return NextResponse.json({ error: 'Failed to fetch production data' }, { status: 500 })
  }
}

