import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma, withRetry } from '@/lib/prisma'

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

    // Fetch all items for the date first (with retry on connection pool timeout P2024)
    let items = await withRetry(() =>
      prisma.mealPlanItem.findMany({
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
    )

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

    // Exclude inactive dishes (no dish assigned - no dishId and no real dishName)
    items = items.filter(item => {
      const hasDish = item.dishId != null || (item.dishName && item.dishName.trim() !== '' && item.dishName !== 'Not Assigned')
      return hasDish
    })

    // Find customers who have an active meal plan for this date but ALL meals skipped (no meal for today)
    const dateStart = new Date(new Date(date).setHours(0, 0, 0, 0))
    const dateEnd = new Date(new Date(date).setHours(23, 59, 59, 999))
    const allItemsForDate = await withRetry(() =>
      prisma.mealPlanItem.findMany({
        where: {
          date: { gte: dateStart, lt: dateEnd },
          mealPlan: { status: 'ACTIVE' },
        },
        include: {
          mealPlan: { include: { customer: true } },
        },
      })
    )
    let allFiltered = allItemsForDate
    if (startTime || endTime) {
      allFiltered = allFiltered.filter(item => {
        const itemTime = item.timeSlot
        if (startTime && endTime) return itemTime >= startTime && itemTime <= endTime
        if (startTime) return itemTime >= startTime
        if (endTime) return itemTime <= endTime
        return true
      })
    }
    const customerIdsWithNonSkipped = new Set(items.map(i => String(i.mealPlan.customerId)))
    const byCustomer = new Map<string, typeof allFiltered>()
    for (const item of allFiltered) {
      const cid = String(item.mealPlan.customerId)
      if (!byCustomer.has(cid)) byCustomer.set(cid, [])
      byCustomer.get(cid)!.push(item)
    }
    const skippedDayRows: Array<{ customerId: string; customerName: string; phone: string | null; deliveryArea: string | null; address: string | null; timeSlot: string; deliveryTime: string | null }> = []
    byCustomer.forEach((group, customerId) => {
      if (customerIdsWithNonSkipped.has(customerId)) return
      const allSkipped = group.every(i => i.isSkipped)
      if (allSkipped && group.length > 0) {
        const first = group[0]
        const c = first.mealPlan.customer
        skippedDayRows.push({
          customerId,
          customerName: c.fullName,
          phone: c.phone,
          deliveryArea: c.deliveryArea,
          address: c.address,
          timeSlot: first.timeSlot || '',
          deliveryTime: first.deliveryTime ?? null,
        })
      }
    })

    // Aggregate by dish
    const dishAggregation: Record<string, {
      dishName: string
      dishCategory: string | null
      totalPortions: number
      customers: Set<string>
      deliveryAreas: Set<string>
    }> = {}

    const dishLabelCustomerUnavailable = 'Customer not available'

    items.forEach(item => {
      const paused = String((item.mealPlan as { status?: string }).status || '').toUpperCase() === 'PAUSED'
      const dishName = paused
        ? dishLabelCustomerUnavailable
        : item.dishName || item.dish?.name || 'Not Assigned'
      const dishCategory = paused ? null : item.dishCategory || item.dish?.category || null
      
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
      skippedDayRows,
    })
  } catch (error) {
    console.error('Error fetching kitchen planning data:', error)
    return NextResponse.json({ error: 'Failed to fetch kitchen planning data' }, { status: 500 })
  }
}

