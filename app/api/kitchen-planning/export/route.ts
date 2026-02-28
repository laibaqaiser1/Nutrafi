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

    // Exclude inactive dishes (no dish assigned)
    items = items.filter(item => {
      const hasDish = item.dishId != null || (item.dishName && item.dishName.trim() !== '' && item.dishName !== 'Not Assigned')
      return hasDish
    })

    // Sort by time slot (then by customer name for stable order)
    items.sort((a, b) => {
      const t = (a.timeSlot || '').localeCompare(b.timeSlot || '')
      if (t !== 0) return t
      return (a.mealPlan.customer.fullName || '').localeCompare(b.mealPlan.customer.fullName || '')
    })

    // Group by date + customer: one row per customer per date, dishes comma-separated, delivery time = first meal only
    type AggregatedRow = {
      date: Date
      timeSlot: string
      deliveryTime: string
      customerName: string
      customer: { fullName: string; phone: string | null; address: string | null; deliveryArea: string | null }
      dishNames: string
      items: typeof items
      isPaused: boolean
    }
    const byKey = new Map<string, typeof items>()
    for (const item of items) {
      const dateStr = new Date(item.date).toISOString().slice(0, 10)
      const customerId = item.mealPlan.customerId
      const key = `${dateStr}:${customerId}`
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(item)
    }
    const aggregated: AggregatedRow[] = []
    byKey.forEach((groupItems) => {
      const first = groupItems[0]
      const dateStr = new Date(first.date).toISOString().slice(0, 10)
      const mealPlanStatus = (first.mealPlan as { status?: string })?.status ?? 'ACTIVE'
      const isPaused = String(mealPlanStatus).toUpperCase() === 'PAUSED'
      aggregated.push({
        date: first.date,
        timeSlot: first.timeSlot || '',
        deliveryTime: first.deliveryTime || '',
        customerName: first.mealPlan.customer.fullName,
        customer: first.mealPlan.customer,
        dishNames: groupItems.map(i => i.dishName || i.dish?.name || 'Not Assigned').join(', '),
        items: groupItems,
        isPaused,
      })
    })
    // Sort aggregated rows by time slot (then customer name)
    aggregated.sort((a, b) => {
      const t = a.timeSlot.localeCompare(b.timeSlot)
      if (t !== 0) return t
      return a.customerName.localeCompare(b.customerName)
    })

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

    // Dish names in one cell, each on its own line (so cell doesn't overflow column)
    const dishNamesForCell = (commaSeparated: string): string =>
      commaSeparated.split(',').map(s => s.trim()).filter(Boolean).join('\n')

    // Light red fill for paused (customer not available) rows; keep cell borders visible
    const LIGHT_RED = 'FFFFCCCB' // argb style for ExcelJS
    const BORDER_GRAY = 'FFD3D3D3' // light gray border so cells stay distinct
    const applyPausedRowStyle = (row: ExcelJS.Row, lastCol: number) => {
      const thinBorder = { style: 'thin' as const, color: { argb: BORDER_GRAY } }
      for (let c = 1; c <= lastCol; c++) {
        const cell = row.getCell(c)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: LIGHT_RED },
        }
        cell.border = {
          top: thinBorder,
          left: thinBorder,
          bottom: thinBorder,
          right: thinBorder,
        }
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
          
          // Fill in data (one row per customer). Last column (7) = Dish Name; append "customer not available" there when paused (no extra column).
          const riderLastCol = 7
          aggregated.forEach((rowData, index) => {
            const row = worksheet.getRow(startRow + index)
            row.getCell(1).value = new Date(rowData.date).toLocaleDateString() // Date
            row.getCell(2).value = rowData.deliveryTime // Delivery Time (first meal only)
            row.getCell(3).value = rowData.customerName // Customer Name
            row.getCell(4).value = rowData.customer.phone || '' // Contact Number
            row.getCell(5).value = rowData.customer.address || '' // Delivery Address
            row.getCell(6).value = rowData.customer.deliveryArea || '' // Delivery Area
            const dishCell = row.getCell(7)
            const dishText = dishNamesForCell(rowData.dishNames)
            dishCell.value = rowData.isPaused ? dishText + '\n(customer not available)' : dishText
            dishCell.alignment = { wrapText: true, vertical: 'top' }
            if (rowData.isPaused) applyPausedRowStyle(row, riderLastCol)
            row.commit()
          })
        }
      } else {
        // Fallback: create new sheet if template doesn't exist
        const worksheet = workbook.addWorksheet('Rider')
        worksheet.getCell('A1').value = 'Nutrafi Kitchen Abu Dhabi'
        worksheet.getRow(2).values = ['Date', 'Delivery Time', 'Customer Name', 'Contact Number', 'Delivery Address', 'Delivery Area', 'Dish Name']
        
        const riderLastCol = 7
        aggregated.forEach((rowData, index) => {
          const row = worksheet.getRow(3 + index)
          row.getCell(1).value = new Date(rowData.date).toLocaleDateString()
          row.getCell(2).value = rowData.deliveryTime
          row.getCell(3).value = rowData.customerName
          row.getCell(4).value = rowData.customer.phone || ''
          row.getCell(5).value = rowData.customer.address || ''
          row.getCell(6).value = rowData.customer.deliveryArea || ''
          const dishCell = row.getCell(7)
          const dishText = dishNamesForCell(rowData.dishNames)
          dishCell.value = rowData.isPaused ? dishText + '\n(customer not available)' : dishText
          dishCell.alignment = { wrapText: true, vertical: 'top' }
          if (rowData.isPaused) applyPausedRowStyle(row, riderLastCol)
          row.commit()
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
          
          // Fill in data - one row per customer. A=Date, B=Delivery Time, C=Customer Name, D=Dish Name, E=Instructions, F=Ingredients, G=Allergens, H=Calories, I=Protein, J=Carbs, K=Fats, L=customer not available (when paused).
          const chefLastCol = 12
          aggregated.forEach((rowData, index) => {
            const groupItems = rowData.items
            const instructions = groupItems.map(i => parseInstructions(i.customNote)).filter(Boolean).join('; ')
            const ingredients = groupItems.map(i => i.ingredients || i.dish?.ingredients || '').filter(Boolean).join('; ')
            const allergens = groupItems.map(i => i.allergens || i.dish?.allergens || '').filter(Boolean).join('; ')
            const calories = groupItems.reduce((s, i) => s + (Number(i.calories) || Number(i.dish?.calories) || 0), 0)
            const protein = groupItems.reduce((s, i) => s + (Number(i.protein) || Number(i.dish?.protein) || 0), 0)
            const carbs = groupItems.reduce((s, i) => s + (Number(i.carbs) || Number(i.dish?.carbs) || 0), 0)
            const fats = groupItems.reduce((s, i) => s + (Number(i.fats) || Number(i.dish?.fats) || 0), 0)
            const row = worksheet.getRow(startRow + index)
            row.getCell(1).value = new Date(rowData.date).toLocaleDateString()   // A = Date
            row.getCell(2).value = rowData.deliveryTime                          // B = Delivery Time
            row.getCell(3).value = rowData.customerName                           // C = Customer Name
            const chefDishCell = row.getCell(4)
            chefDishCell.value = dishNamesForCell(rowData.dishNames)
            chefDishCell.alignment = { wrapText: true, vertical: 'top' }         // D = Dish Name
            row.getCell(5).value = instructions                                   // E = Instructions
            row.getCell(6).value = ingredients                                    // F = Ingredients
            row.getCell(7).value = allergens                                      // G = Allergens
            row.getCell(8).value = calories                                       // H = Calories
            row.getCell(9).value = protein                                         // I = Protein
            row.getCell(10).value = carbs                                         // J = Carbs
            row.getCell(11).value = fats                                          // K = Fats
            row.getCell(12).value = rowData.isPaused ? 'customer not available' : ''  // L = customer not available
            if (rowData.isPaused) applyPausedRowStyle(row, chefLastCol)
            row.commit()
          })
        }
      } else {
        // Fallback: create new sheet if template doesn't exist (no Time Slot column)
        const worksheet = workbook.addWorksheet('Chef')
        worksheet.getRow(1).values = ['Date', 'Delivery Time', 'Customer Name', 'Dish Name', 'Ingredients', 'Allergens', 'Calories (kcal)', 'Protein (g)', 'Carbs (g)', 'Fats (g)', 'Instructions', 'Note']
        
        const chefLastCol = 12
        aggregated.forEach((rowData, index) => {
          const groupItems = rowData.items
          const instructions = groupItems.map(i => parseInstructions(i.customNote)).filter(Boolean).join('; ')
          const ingredients = groupItems.map(i => i.ingredients || i.dish?.ingredients || '').filter(Boolean).join('; ')
          const allergens = groupItems.map(i => i.allergens || i.dish?.allergens || '').filter(Boolean).join('; ')
          const calories = groupItems.reduce((s, i) => s + (Number(i.calories) || Number(i.dish?.calories) || 0), 0)
          const protein = groupItems.reduce((s, i) => s + (Number(i.protein) || Number(i.dish?.protein) || 0), 0)
          const carbs = groupItems.reduce((s, i) => s + (Number(i.carbs) || Number(i.dish?.carbs) || 0), 0)
          const fats = groupItems.reduce((s, i) => s + (Number(i.fats) || Number(i.dish?.fats) || 0), 0)
          const row = worksheet.getRow(2 + index)
          const dishCell = row.getCell(4)
          dishCell.value = dishNamesForCell(rowData.dishNames)
          dishCell.alignment = { wrapText: true, vertical: 'top' }
          row.getCell(1).value = new Date(rowData.date).toLocaleDateString()
          row.getCell(2).value = rowData.deliveryTime
          row.getCell(3).value = rowData.customerName
          row.getCell(5).value = ingredients
          row.getCell(6).value = allergens
          row.getCell(7).value = calories
          row.getCell(8).value = protein
          row.getCell(9).value = carbs
          row.getCell(10).value = fats
          row.getCell(11).value = instructions
          row.getCell(12).value = rowData.isPaused ? 'customer not available' : ''  // L = customer not available
          if (rowData.isPaused) applyPausedRowStyle(row, chefLastCol)
          row.commit()
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

