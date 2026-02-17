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
    const timeSlot = searchParams.get('timeSlot')

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

    if (timeSlot) {
      where.timeSlot = timeSlot
    }

    const items = await prisma.mealPlanItem.findMany({
      where,
      include: {
        dish: true,
        mealPlan: {
          include: {
            customer: true,
          },
        },
      },
      orderBy: [
        { timeSlot: 'asc' },
        { dish: { name: 'asc' } },
      ],
    })

    // Prepare data for Excel
    const excelData = items.map(item => ({
      'Time Slot': item.timeSlot,
      'Dish Name': item.dish?.name || 'Not Assigned',
      'Customer': item.mealPlan.customer.fullName,
      'Delivery Area': item.mealPlan.customer.deliveryArea,
      'Calories': item.dish?.calories || 0,
      'Protein (g)': item.dish?.protein || 0,
      'Carbs (g)': item.dish?.carbs || 0,
      'Fats (g)': item.dish?.fats || 0,
    }))

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)
    XLSX.utils.book_append_sheet(wb, ws, 'Production')

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // Return as downloadable file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="production-${date}-${timeSlot || 'all'}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Error exporting production data:', error)
    return NextResponse.json({ error: 'Failed to export production data' }, { status: 500 })
  }
}

