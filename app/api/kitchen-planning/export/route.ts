import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import ExcelJS from 'exceljs'
import path from 'path'
import fs from 'fs'

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

    // Load template for Rider sheet, create new for Chef sheet
    const workbook = new ExcelJS.Workbook()
    
    if (sheet === 'rider') {
      // Load the template file
      const templatePath = path.join(process.cwd(), 'templates', 'rider-template.xlsx')
      
      if (fs.existsSync(templatePath)) {
        await workbook.xlsx.readFile(templatePath)
        const worksheet = workbook.getWorksheet(1) // Get first worksheet
        
        if (worksheet) {
          // Data starts at row 3 (after header row with company name and column headers)
          let startRow = 3
          
          // Clear any existing data rows (keep header rows)
          if (worksheet.rowCount > 2) {
            worksheet.spliceRows(3, worksheet.rowCount - 2)
          }
          
          // Fill in data
          items.forEach((item, index) => {
            const row = worksheet.getRow(startRow + index)
            row.getCell(1).value = new Date(item.date).toLocaleDateString() // Date
            row.getCell(2).value = item.deliveryTime || '' // Delivery Time
            row.getCell(3).value = item.mealPlan.customer.fullName // Customer Name
            row.getCell(4).value = item.mealPlan.customer.phone || '' // Contact Number
            row.getCell(5).value = item.mealPlan.customer.address || '' // Delivery Address
            row.getCell(6).value = item.mealPlan.customer.deliveryArea || '' // Delivery Area
            row.getCell(7).value = item.dishName || item.dish?.name || 'Not Assigned' // Dish Name
            row.commit()
          })
        }
      } else {
        // Fallback: create new sheet if template doesn't exist
        const worksheet = workbook.addWorksheet('Rider')
        worksheet.getCell('A1').value = 'Nutrafi Kitchen Abu Dhabi'
        worksheet.getRow(2).values = ['Date', 'Delivery Time', 'Customer Name', 'Contact Number', 'Delivery Address', 'Delivery Area', 'Dish Name', '']
        
        items.forEach((item, index) => {
          const row = worksheet.getRow(3 + index)
          row.values = [
            new Date(item.date).toLocaleDateString(),
            item.deliveryTime || '',
            item.mealPlan.customer.fullName,
            item.mealPlan.customer.phone || '',
            item.mealPlan.customer.address || '',
            item.mealPlan.customer.deliveryArea || '',
            item.dishName || item.dish?.name || 'Not Assigned',
            ''
          ]
        })
      }
    } else if (sheet === 'chef') {
      // Load the chef template file
      const templatePath = path.join(process.cwd(), 'templates', 'chef-template.xlsx')
      
      if (fs.existsSync(templatePath)) {
        await workbook.xlsx.readFile(templatePath)
        const worksheet = workbook.getWorksheet(1) // Get first worksheet
        
        if (worksheet) {
          // Data starts at row 3 (after header row with company name and column headers)
          let startRow = 3
          
          // Clear any existing data rows (keep header rows)
          if (worksheet.rowCount > 2) {
            worksheet.spliceRows(3, worksheet.rowCount - 2)
          }
          
          // Fill in data - columns start from column 1 (A) to match headers
          // Headers: A=empty, B=Date, C=Time Slot, D=Delivery Time, E=Customer Name, F=Dish Name, G=Instructions, H=Ingredients, I=Allergens, J=Calories, K=Protein, L=Carbs, M=Fats
          items.forEach((item, index) => {
            const instructions = parseInstructions(item.customNote)
            const row = worksheet.getRow(startRow + index)
            // Column 1 (A) is empty, data starts at column 2 (B) - but ExcelJS might be 0-indexed, so we use 1-based
            // Actually, let's match exactly: if headers are at B, C, D... then data should be at B, C, D...
            // But user says data is one cell right, so maybe headers are actually at A, B, C... and we should start at A
            // Let me check: template shows first empty item, then Date at position 2
            // So headers are: [empty, Date, Time Slot, ...] which is columns A, B, C...
            // But ExcelJS getCell(1) = column A, getCell(2) = column B
            // So if Date header is at column B (index 2), data should be at column B (index 2) ✓
            // But user says it's one cell right, so maybe the template actually has Date at column A?
            // Let me try starting at column 1 (A) instead
            row.getCell(1).value = new Date(item.date).toLocaleDateString() // Date
            row.getCell(2).value = item.timeSlot // Time Slot
            row.getCell(3).value = item.deliveryTime || '' // Delivery Time
            row.getCell(4).value = item.mealPlan.customer.fullName // Customer Name
            row.getCell(5).value = item.dishName || item.dish?.name || 'Not Assigned' // Dish Name
            row.getCell(6).value = instructions // Instructions
            row.getCell(7).value = item.ingredients || item.dish?.ingredients || '' // Ingredients
            row.getCell(8).value = item.allergens || item.dish?.allergens || '' // Allergens
            row.getCell(9).value = item.calories || item.dish?.calories || 0 // Calories (kcal)
            row.getCell(10).value = item.protein || item.dish?.protein || 0 // Protein (g)
            row.getCell(11).value = item.carbs || item.dish?.carbs || 0 // Carbs (g)
            row.getCell(12).value = item.fats || item.dish?.fats || 0 // Fats (g)
            row.commit()
          })
        }
      } else {
        // Fallback: create new sheet if template doesn't exist
        const worksheet = workbook.addWorksheet('Chef')
        worksheet.getRow(1).values = ['Date', 'Time Slot', 'Delivery Time', 'Customer Name', 'Dish Name', 'Category', 'Ingredients', 'Allergens', 'Calories (kcal)', 'Protein (g)', 'Carbs (g)', 'Fats (g)', 'Instructions', 'Status']
        
        items.forEach((item, index) => {
          const instructions = parseInstructions(item.customNote)
          const row = worksheet.getRow(2 + index)
          row.values = [
            new Date(item.date).toLocaleDateString(),
            item.timeSlot,
            item.deliveryTime || '',
            item.mealPlan.customer.fullName,
            item.dishName || item.dish?.name || 'Not Assigned',
            item.dishCategory || item.dish?.category || '',
            item.ingredients || item.dish?.ingredients || '',
            item.allergens || item.dish?.allergens || '',
            item.calories || item.dish?.calories || 0,
            item.protein || item.dish?.protein || 0,
            item.carbs || item.dish?.carbs || 0,
            item.fats || item.dish?.fats || 0,
            instructions,
            item.isDelivered ? 'Delivered' : item.isSkipped ? 'Skipped' : 'Active',
          ]
        })
      }
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()

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

