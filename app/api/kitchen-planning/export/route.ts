import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

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
        dish: true,
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

    // Prepare data for Excel - use dish details from MealPlanItem
    const excelData = items.map(item => {
      // Parse custom note for instructions
      let instructions = ''
      if (item.customNote) {
        try {
          const customNote = JSON.parse(item.customNote)
          instructions = customNote.instructions || ''
        } catch (e) {
          // Ignore parse errors
        }
      }

      return {
        'Date': new Date(item.date).toLocaleDateString(),
        'Time Slot': item.timeSlot,
        'Customer Name': item.mealPlan.customer.fullName,
        'Customer Phone': item.mealPlan.customer.phone || '',
        'Delivery Area': item.mealPlan.customer.deliveryArea || '',
        'Delivery Time': item.deliveryTime || '',
        'Dish Name': item.dishName || item.dish?.name || 'Not Assigned',
        'Ingredients': item.ingredients || item.dish?.ingredients || '',
        'Allergens': item.allergens || item.dish?.allergens || '',
        'Calories (kcal)': item.calories || item.dish?.calories || 0,
        'Protein (g)': item.protein || item.dish?.protein || 0,
        'Carbs (g)': item.carbs || item.dish?.carbs || 0,
        'Fats (g)': item.fats || item.dish?.fats || 0,
        'Instructions': instructions,
        'Status': item.isDelivered ? 'Delivered' : item.isSkipped ? 'Skipped' : 'Active',
      }
    })

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)
    XLSX.utils.book_append_sheet(wb, ws, 'Kitchen Planning')

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // Generate filename
    const timeRange = startTime && endTime 
      ? `${startTime}-${endTime}` 
      : startTime 
        ? `from-${startTime}` 
        : endTime 
          ? `until-${endTime}` 
          : 'all-times'
    const filename = `kitchen-planning-${date}-${timeRange}.xlsx`

    // Return as downloadable file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Error exporting kitchen planning data:', error)
    return NextResponse.json({ error: 'Failed to export kitchen planning data' }, { status: 500 })
  }
}

