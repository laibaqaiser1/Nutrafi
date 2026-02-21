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
    const sheet = searchParams.get('sheet') || 'chef' // 'chef' or 'rider'

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

    // Parse custom note for instructions
    const parseInstructions = (customNote: string | null): string => {
      if (!customNote) return ''
      try {
        const parsed = JSON.parse(customNote)
        return parsed.instructions || ''
      } catch (e) {
        return customNote // Return as-is if not JSON
      }
    }

    // Prepare data based on sheet type
    let excelData: any[] = []
    let sheetName = 'Kitchen Planning'

    if (sheet === 'chef') {
      // Chef Sheet - meal details and preparation info
      excelData = items.map(item => {
        const instructions = parseInstructions(item.customNote)

        return {
          'Date': new Date(item.date).toLocaleDateString(),
          'Time Slot': item.timeSlot,
          'Delivery Time': item.deliveryTime || '',
          'Customer Name': item.mealPlan.customer.fullName,
          'Dish Name': item.dishName || item.dish?.name || 'Not Assigned',
          'Category': item.dishCategory || item.dish?.category || '',
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
      sheetName = 'Chef'
    } else if (sheet === 'rider') {
      // Rider Sheet - delivery information
      excelData = items.map(item => {
        return {
          'Date': new Date(item.date).toLocaleDateString(),
          'Time Slot': item.timeSlot,
          'Delivery Time': item.deliveryTime || '',
          'Customer Name': item.mealPlan.customer.fullName,
          'Contact Number': item.mealPlan.customer.phone || '',
          'Delivery Address': item.mealPlan.customer.address || '',
          'Delivery Area': item.mealPlan.customer.deliveryArea || '',
          'Dish Name': item.dishName || item.dish?.name || 'Not Assigned',
          'Status': item.isDelivered ? 'Delivered' : item.isSkipped ? 'Skipped' : 'Active',
        }
      })
      sheetName = 'Rider'
    }

    // Create workbook with single sheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)

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
    const filename = `kitchen-planning-${sheet}-${date}-${timeRange}.xlsx`

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

