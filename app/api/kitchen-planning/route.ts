import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// GET - Get kitchen planning data filtered by date and time range
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const startTime = searchParams.get('startTime')
    const endTime = searchParams.get('endTime')
    const status = searchParams.get('status') || 'active' // Default to 'active'

    if (!date) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 })
    }

    const where: any = {
      isSkipped: false,
      date: {
        gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
        lt: new Date(new Date(date).setHours(23, 59, 59, 999)),
      },
    }

    // Filter by status: 'active' means not delivered, 'delivered' means delivered, 'all' means both
    if (status === 'active') {
      where.isDelivered = false
    } else if (status === 'delivered') {
      where.isDelivered = true
    }
    // If status is 'all', don't add isDelivered filter

    // Fetch all items for the date first
    let items = await prisma.mealPlanItem.findMany({
      where,
      include: {
        mealPlan: {
          include: {
            customer: true,
          },
        },
        dish: true, // Optional reference
      },
      orderBy: [
        { timeSlot: 'asc' },
        { mealPlan: { customer: { fullName: 'asc' } } },
      ],
    })

    // Filter by time range if provided (time comparison for HH:MM format)
    if (startTime || endTime) {
      items = items.filter(item => {
        const itemTime = item.timeSlot
        if (startTime && endTime) {
          return itemTime >= startTime && itemTime <= endTime
        } else if (startTime) {
          return itemTime >= startTime
        } else if (endTime) {
          return itemTime <= endTime
        }
        return true
      })
    }

    // Aggregate by dish
    const dishAggregation: Record<string, {
      dishName: string
      dishCategory: string | null
      totalPortions: number
      customers: Set<string>
      deliveryAreas: Set<string>
    }> = {}

    items.forEach(item => {
      const dishName = item.dishName || item.dish?.name || 'Not Assigned'
      const dishCategory = item.dishCategory || item.dish?.category || null
      
      if (!dishAggregation[dishName]) {
        dishAggregation[dishName] = {
          dishName,
          dishCategory,
          totalPortions: 0,
          customers: new Set(),
          deliveryAreas: new Set(),
        }
      }

      dishAggregation[dishName].totalPortions++
      dishAggregation[dishName].customers.add(item.mealPlan.customer.fullName)
      if (item.mealPlan.customer.deliveryArea) {
        dishAggregation[dishName].deliveryAreas.add(item.mealPlan.customer.deliveryArea)
      }
    })

    // Convert to array format
    const aggregated = Object.values(dishAggregation).map(agg => ({
      dishName: agg.dishName,
      dishCategory: agg.dishCategory,
      totalPortions: agg.totalPortions,
      customerCount: agg.customers.size,
      deliveryAreas: Array.from(agg.deliveryAreas),
    }))

    return NextResponse.json({
      items,
      aggregated,
      total: items.length,
      date,
      startTime: startTime || null,
      endTime: endTime || null,
    })
  } catch (error) {
    console.error('Error fetching kitchen planning data:', error)
    return NextResponse.json({ error: 'Failed to fetch kitchen planning data' }, { status: 500 })
  }
}

