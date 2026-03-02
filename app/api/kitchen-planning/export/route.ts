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
    type BaseRow = {
      date: Date
      timeSlot: string
      deliveryTime: string
      customerName: string
      customer: { fullName: string; phone: string | null; address: string | null; deliveryArea: string | null }
      dishNames: string
      isPaused: boolean
    }
    type AggregatedRow = BaseRow & { items: typeof items }
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

    // Customers who have items on this date but ALL skipped (no meal for today)
    const whereAll = {
      date: {
        gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
        lt: new Date(new Date(date).setHours(23, 59, 59, 999)),
      },
      mealPlan: { status: 'ACTIVE' },
    } as any
    if (status === 'active') (whereAll as any).isDelivered = false
    else if (status === 'delivered') (whereAll as any).isDelivered = true
    const allItemsForDate = await prisma.mealPlanItem.findMany({
      where: whereAll,
      include: {
        mealPlan: { include: { customer: true } },
      },
    })
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
    const byCustomerAll = new Map<string, typeof allFiltered>()
    for (const item of allFiltered) {
      const cid = String(item.mealPlan.customerId)
      if (!byCustomerAll.has(cid)) byCustomerAll.set(cid, [])
      byCustomerAll.get(cid)!.push(item)
    }
    type SkippedDayRow = BaseRow & { isSkippedDay: true; items: typeof allFiltered }
    const skippedDayRows: SkippedDayRow[] = []
    byCustomerAll.forEach((group, customerId) => {
      if (customerIdsWithNonSkipped.has(customerId)) return
      const allSkipped = group.every(i => i.isSkipped)
      if (allSkipped && group.length > 0) {
        const first = group[0]
        const c = first.mealPlan.customer
        skippedDayRows.push({
          date: first.date,
          timeSlot: first.timeSlot || '',
          deliveryTime: first.deliveryTime || '',
          customerName: c.fullName,
          customer: c,
          dishNames: 'No meal for today',
          items: group,
          isPaused: false,
          isSkippedDay: true,
        })
      }
    })
    skippedDayRows.sort((a, b) => {
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

    // Format time string (HH:MM or HH:MM:SS) to 12-hour with AM/PM (e.g. "14:00" -> "2:00 PM")
    const formatTime12h = (timeStr: string): string => {
      if (!timeStr || typeof timeStr !== 'string') return ''
      const trimmed = timeStr.trim()
      if (!trimmed) return ''
      const parts = trimmed.split(':')
      const h = parseInt(parts[0], 10)
      const m = parts[1] ? parseInt(parts[1], 10) : 0
      if (Number.isNaN(h)) return trimmed
      const hour12 = h % 12 || 12
      const ampm = h < 12 ? 'AM' : 'PM'
      const min = Number.isNaN(m) ? '00' : m.toString().padStart(2, '0')
      return `${hour12}:${min} ${ampm}`
    }

    // Delivery time for export: use deliveryTime, fallback to timeSlot (for skipped rows where deliveryTime may be empty)
    const deliveryTimeForExport = (row: { deliveryTime: string; timeSlot: string }) =>
      formatTime12h(row.deliveryTime || row.timeSlot || '')

    // Light red fill for paused (customer not available) rows; keep cell borders visible
    const LIGHT_RED = 'FFFFCCCB' // argb style for ExcelJS
    const LIGHT_YELLOW = 'FFFFFF00' // bright yellow for "no meal for today"
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
    const applySkippedDayRowStyle = (row: ExcelJS.Row, lastCol: number) => {
      const thinBorder = { style: 'thin' as const, color: { argb: BORDER_GRAY } }
      for (let c = 1; c <= lastCol; c++) {
        const cell = row.getCell(c)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: LIGHT_YELLOW },
        }
        cell.border = {
          top: thinBorder,
          left: thinBorder,
          bottom: thinBorder,
          right: thinBorder,
        }
      }
    }

    // Merge normal + skipped-day rows and sort by time then customer name
    type ExportRow = AggregatedRow | SkippedDayRow
    // Item shape for chef row math (skipped-day items don't have dish)
    type ItemWithOptionalDish = { customNote: string | null; ingredients: string | null; allergens: string | null; calories: number | null; protein: number | null; carbs: number | null; fats: number | null; dish?: { ingredients?: string | null; allergens?: string | null; calories?: number; protein?: number; carbs?: number; fats?: number } | null }
    const allRows: ExportRow[] = [...aggregated, ...skippedDayRows]
    allRows.sort((a, b) => {
      const t = a.timeSlot.localeCompare(b.timeSlot)
      if (t !== 0) return t
      return a.customerName.localeCompare(b.customerName)
    })

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
          allRows.forEach((rowData, index) => {
            const row = worksheet.getRow(startRow + index)
            const isSkippedDay = 'isSkippedDay' in rowData && rowData.isSkippedDay
            row.getCell(1).value = new Date(rowData.date).toLocaleDateString() // Date
            row.getCell(2).value = deliveryTimeForExport(rowData) // Delivery Time (12h, skipped rows use timeSlot if needed)
            row.getCell(3).value = rowData.customerName // Customer Name
            row.getCell(4).value = rowData.customer.phone || '' // Contact Number
            row.getCell(5).value = rowData.customer.address || '' // Delivery Address
            row.getCell(6).value = rowData.customer.deliveryArea || '' // Delivery Area
            const dishCell = row.getCell(7)
            const dishText = isSkippedDay ? 'No meal for today' : dishNamesForCell(rowData.dishNames)
            dishCell.value = rowData.isPaused ? dishText + '\n(customer not available)' : dishText
            dishCell.alignment = { wrapText: true, vertical: 'top' }
            if (rowData.isPaused) applyPausedRowStyle(row, riderLastCol)
            else if (isSkippedDay) applySkippedDayRowStyle(row, riderLastCol)
            row.commit()
          })
        }
      } else {
        // Fallback: create new sheet if template doesn't exist
        const worksheet = workbook.addWorksheet('Rider')
        worksheet.getCell('A1').value = 'Nutrafi Kitchen Abu Dhabi'
        worksheet.getRow(2).values = ['Date', 'Delivery Time', 'Customer Name', 'Contact Number', 'Delivery Address', 'Delivery Area', 'Dish Name']
        
        const riderLastCol = 7
        allRows.forEach((rowData, index) => {
          const row = worksheet.getRow(3 + index)
          const isSkippedDay = 'isSkippedDay' in rowData && rowData.isSkippedDay
          row.getCell(1).value = new Date(rowData.date).toLocaleDateString()
          row.getCell(2).value = deliveryTimeForExport(rowData)
          row.getCell(3).value = rowData.customerName
          row.getCell(4).value = rowData.customer.phone || ''
          row.getCell(5).value = rowData.customer.address || ''
          row.getCell(6).value = rowData.customer.deliveryArea || ''
          const dishCell = row.getCell(7)
          const dishText = isSkippedDay ? 'No meal for today' : dishNamesForCell(rowData.dishNames)
          dishCell.value = rowData.isPaused ? dishText + '\n(customer not available)' : dishText
          dishCell.alignment = { wrapText: true, vertical: 'top' }
          if (rowData.isPaused) applyPausedRowStyle(row, riderLastCol)
          else if (isSkippedDay) applySkippedDayRowStyle(row, riderLastCol)
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
          allRows.forEach((rowData, index) => {
            const groupItems = rowData.items as ItemWithOptionalDish[]
            const isSkippedDay = 'isSkippedDay' in rowData && rowData.isSkippedDay
            const instructions = groupItems.map(i => parseInstructions(i.customNote)).filter(Boolean).join('; ')
            const ingredients = groupItems.map(i => i.ingredients || i.dish?.ingredients || '').filter(Boolean).join('; ')
            const allergens = groupItems.map(i => i.allergens || i.dish?.allergens || '').filter(Boolean).join('; ')
            const calories = groupItems.reduce((s, i) => s + (Number(i.calories) || Number(i.dish?.calories) || 0), 0)
            const protein = groupItems.reduce((s, i) => s + (Number(i.protein) || Number(i.dish?.protein) || 0), 0)
            const carbs = groupItems.reduce((s, i) => s + (Number(i.carbs) || Number(i.dish?.carbs) || 0), 0)
            const fats = groupItems.reduce((s, i) => s + (Number(i.fats) || Number(i.dish?.fats) || 0), 0)
            const row = worksheet.getRow(startRow + index)
            row.getCell(1).value = new Date(rowData.date).toLocaleDateString()   // A = Date
            row.getCell(2).value = deliveryTimeForExport(rowData)                // B = Delivery Time
            row.getCell(3).value = rowData.customerName                           // C = Customer Name
            const chefDishCell = row.getCell(4)
            chefDishCell.value = isSkippedDay ? 'No meal for today' : dishNamesForCell(rowData.dishNames)
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
            else if (isSkippedDay) applySkippedDayRowStyle(row, chefLastCol)
            row.commit()
          })
        }
      } else {
        // Fallback: create new sheet if template doesn't exist (no Time Slot column)
        const worksheet = workbook.addWorksheet('Chef')
        worksheet.getRow(1).values = ['Date', 'Delivery Time', 'Customer Name', 'Dish Name', 'Ingredients', 'Allergens', 'Calories (kcal)', 'Protein (g)', 'Carbs (g)', 'Fats (g)', 'Instructions', 'Note']
        
        const chefLastCol = 12
        allRows.forEach((rowData, index) => {
          const groupItems = rowData.items as ItemWithOptionalDish[]
          const isSkippedDay = 'isSkippedDay' in rowData && rowData.isSkippedDay
          const instructions = groupItems.map(i => parseInstructions(i.customNote)).filter(Boolean).join('; ')
          const ingredients = groupItems.map(i => i.ingredients || i.dish?.ingredients || '').filter(Boolean).join('; ')
          const allergens = groupItems.map(i => i.allergens || i.dish?.allergens || '').filter(Boolean).join('; ')
          const calories = groupItems.reduce((s, i) => s + (Number(i.calories) || Number(i.dish?.calories) || 0), 0)
          const protein = groupItems.reduce((s, i) => s + (Number(i.protein) || Number(i.dish?.protein) || 0), 0)
          const carbs = groupItems.reduce((s, i) => s + (Number(i.carbs) || Number(i.dish?.carbs) || 0), 0)
          const fats = groupItems.reduce((s, i) => s + (Number(i.fats) || Number(i.dish?.fats) || 0), 0)
          const row = worksheet.getRow(2 + index)
          const dishCell = row.getCell(4)
          dishCell.value = isSkippedDay ? 'No meal for today' : dishNamesForCell(rowData.dishNames)
          dishCell.alignment = { wrapText: true, vertical: 'top' }
          row.getCell(1).value = new Date(rowData.date).toLocaleDateString()
          row.getCell(2).value = deliveryTimeForExport(rowData)
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
          else if (isSkippedDay) applySkippedDayRowStyle(row, chefLastCol)
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

