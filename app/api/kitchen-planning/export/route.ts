import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { getKitchenUnscheduledRows } from '@/lib/kitchen-unscheduled-rows'
import { prisma, withRetry } from '@/lib/prisma'
import ExcelJS from 'exceljs'
import path from 'path'
import fs from 'fs'
import { format } from 'date-fns'

/** Single workbook template for both chef and rider exports (first sheet is filled as before). */
const kitchenExportTemplatePath = path.join(process.cwd(), 'templates', 'template.xlsx')

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

    // Fetch all items for the date first (retry: Neon cold start / transient disconnects)
    let items = await withRetry(() =>
      prisma.mealPlanItem.findMany({
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

    // Group by date + customer + time slot: same slot → one row with all dishes; different slots → one row each
    type ExportHighlight = 'normal' | 'paused' | 'skipped_day'
    type BaseRow = {
      date: Date
      timeSlot: string
      deliveryTime: string
      customerName: string
      customer: { fullName: string; phone: string | null; address: string | null; deliveryArea: string | null }
      dishNames: string
      isPaused: boolean
      /** Drives row fill in Excel — do not rely on dish text alone (e.g. “No meal for today”). */
      exportHighlight: ExportHighlight
    }
    type AggregatedRow = BaseRow & { items: typeof items }
    const byKey = new Map<string, typeof items>()
    for (const item of items) {
      const dateStr = new Date(item.date).toISOString().slice(0, 10)
      const customerId = item.mealPlan.customerId
      const slotKey = (item.timeSlot || '').trim()
      const key = `${dateStr}:${customerId}:${slotKey}`
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
        dishNames: isPaused
          ? 'Customer not available'
          : groupItems.map(i => i.dishName || i.dish?.name || 'Not Assigned').join(', '),
        items: groupItems,
        isPaused,
        exportHighlight: isPaused ? 'paused' : 'normal',
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
    const allItemsForDate = await withRetry(() =>
      prisma.mealPlanItem.findMany({
        where: whereAll,
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
    // Full calendar day: anyone with at least one non-skipped item must not get a yellow "no meal" row.
    // (Do not use `items` here — it drops no-dish rows and time-filtered rows and caused false yellow.)
    const customerIdsWithNonSkippedMealToday = new Set(
      allItemsForDate.filter((i) => !i.isSkipped).map((i) => String(i.mealPlan.customerId))
    )
    const byCustomerAll = new Map<string, typeof allFiltered>()
    for (const item of allFiltered) {
      const cid = String(item.mealPlan.customerId)
      if (!byCustomerAll.has(cid)) byCustomerAll.set(cid, [])
      byCustomerAll.get(cid)!.push(item)
    }
    type SkippedDayRow = BaseRow & { items: typeof allFiltered }
    const skippedDayRows: SkippedDayRow[] = []
    byCustomerAll.forEach((group, customerId) => {
      if (customerIdsWithNonSkippedMealToday.has(customerId)) return
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
          exportHighlight: 'skipped_day',
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

    // Date for export: "3 March 2026"
    const formatDateExport = (d: Date) => format(new Date(d), 'd MMMM yyyy')

    // Contact number for export: from customer.phone, with fallback from first item's mealPlan.customer
    type ExportRow = AggregatedRow | SkippedDayRow
    const contactNoForRow = (rowData: ExportRow): string => {
      const fromCustomer = (rowData as { customer?: { phone?: string | null } }).customer?.phone
      if (fromCustomer != null && String(fromCustomer).trim() !== '') return String(fromCustomer).trim()
      const firstItem = (rowData as { items?: unknown[] }).items?.[0] as { mealPlan?: { customer?: { phone?: string | null } } } | undefined
      const fromItem = firstItem?.mealPlan?.customer?.phone
      return fromItem != null ? String(fromItem).trim() : ''
    }

    // Alignment/wrap: applied in template (wrap text + vertical center); code does not set alignment.

    // Template columns often carry a pale yellow fill; new data rows inherit it for every cell unless we set fill explicitly.
    // Normal rows: white fill cancels that inheritance (fonts/borders/wrap still come from the template).
    const FILL_NORMAL_DATA_ARGB = 'FFFFFFFF'
    const FILL_PAUSED_ARGB = 'FFFF6B6B'
    // Avoid pure `FFFFFF00` (AARRGGBB): some consumers mis-read it as white because the RGB prefix is FFFFFF.
    const FILL_SKIPPED_DAY_ARGB = 'FFFFD966' // golden yellow, unambiguous in OOXML
    const solidFill = (argb: string): ExcelJS.Fill => ({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb },
      bgColor: { argb },
    })
    const setRowFill = (row: ExcelJS.Row, lastCol: number, fill: ExcelJS.Fill) => {
      for (let c = 1; c <= lastCol; c++) {
        const cell = row.getCell(c)
        // Shallow-merge so fill wins over template column/row defaults (assigning `.fill` alone can be ignored in some workbooks).
        cell.style = { ...cell.style, fill }
      }
    }
    const applyNormalDataRowFill = (row: ExcelJS.Row, lastCol: number) => {
      setRowFill(row, lastCol, solidFill(FILL_NORMAL_DATA_ARGB))
    }
    const applyPausedRowStyle = (row: ExcelJS.Row, lastCol: number) => {
      setRowFill(row, lastCol, solidFill(FILL_PAUSED_ARGB))
    }
    const applySkippedDayRowStyle = (row: ExcelJS.Row, lastCol: number) => {
      setRowFill(row, lastCol, solidFill(FILL_SKIPPED_DAY_ARGB))
    }

    // Chef sheet column 5 = Instructions: red font only (row fill stays yellow/white/red from exportHighlight).
    const CHEF_INSTRUCTIONS_COL = 5
    const FONT_INSTRUCTIONS_RED_ARGB = 'FFFF0000'
    const applyChefInstructionsRedFont = (row: ExcelJS.Row) => {
      const cell = row.getCell(CHEF_INSTRUCTIONS_COL)
      const prevFont = cell.style?.font
      const fontBase =
        prevFont && typeof prevFont === 'object' ? { ...(prevFont as object) } : {}
      cell.style = {
        ...cell.style,
        font: { ...fontBase, color: { argb: FONT_INSTRUCTIONS_RED_ARGB } },
      }
    }

    // Merge normal + skipped-day rows and sort by time then customer name
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
      if (fs.existsSync(kitchenExportTemplatePath)) {
        await workbook.xlsx.readFile(kitchenExportTemplatePath)
        const worksheet = workbook.getWorksheet(1) // Get first worksheet
        
        if (worksheet) {
          // Data starts at row 3 (after header row with company name and column headers)
          let startRow = 3
          
          // Clear any existing data rows (keep header rows)
          if (worksheet.rowCount > 2) {
            worksheet.spliceRows(3, worksheet.rowCount - 2)
          }
          
          // Same template columns as chef: Sr.NO, Date, Delivery Time, Customer Name, Instructions, Dish Name, Contact Number, Delivery Address
          const riderLastCol = 8
          allRows.forEach((rowData, index) => {
            const row = worksheet.getRow(startRow + index)
            const dishText =
              rowData.exportHighlight === 'skipped_day'
                ? 'No meal for today'
                : rowData.exportHighlight === 'paused'
                  ? 'Customer not available'
                  : dishNamesForCell(rowData.dishNames)
            row.getCell(1).value = index + 1
            row.getCell(2).value = formatDateExport(rowData.date)
            row.getCell(3).value = deliveryTimeForExport(rowData)
            row.getCell(4).value = rowData.customerName
            row.getCell(5).value = rowData.customer.deliveryArea || '' // no separate “area” column — use Instructions
            row.getCell(6).value = dishText
            row.getCell(7).value = contactNoForRow(rowData)
            row.getCell(8).value = rowData.customer.address || ''
            if (rowData.exportHighlight === 'paused') applyPausedRowStyle(row, riderLastCol)
            else if (rowData.exportHighlight === 'skipped_day') applySkippedDayRowStyle(row, riderLastCol)
            else applyNormalDataRowFill(row, riderLastCol)
          })
        }
      } else {
        // Fallback: create new sheet if template doesn't exist
        const worksheet = workbook.addWorksheet('Rider')
        worksheet.getCell('A1').value = 'Nutrafi Kitchen Abu Dhabi'
        worksheet.getRow(2).values = [
          'Sr.NO',
          'Date',
          'Delivery Time',
          'Customer Name',
          'Instructions',
          'Dish Name',
          'Contact Number',
          'Delivery Address',
        ]
        const riderWidths = [6, 14, 14, 22, 18, 28, 14, 32]
        riderWidths.forEach((w, i) => worksheet.getColumn(i + 1).width = w)

        const riderLastCol = 8
        allRows.forEach((rowData, index) => {
          const row = worksheet.getRow(3 + index)
          const dishText =
            rowData.exportHighlight === 'skipped_day'
              ? 'No meal for today'
              : rowData.exportHighlight === 'paused'
                ? 'Customer not available'
                : dishNamesForCell(rowData.dishNames)
          row.getCell(1).value = index + 1
          row.getCell(2).value = formatDateExport(rowData.date)
          row.getCell(3).value = deliveryTimeForExport(rowData)
          row.getCell(4).value = rowData.customerName
          row.getCell(5).value = rowData.customer.deliveryArea || ''
          row.getCell(6).value = dishText
          row.getCell(7).value = contactNoForRow(rowData)
          row.getCell(8).value = rowData.customer.address || ''
          if (rowData.exportHighlight === 'paused') applyPausedRowStyle(row, riderLastCol)
          else if (rowData.exportHighlight === 'skipped_day') applySkippedDayRowStyle(row, riderLastCol)
          else applyNormalDataRowFill(row, riderLastCol)
        })
      }
    } else if (sheet === 'chef') {
      // Load the chef template file
      if (fs.existsSync(kitchenExportTemplatePath)) {
        await workbook.xlsx.readFile(kitchenExportTemplatePath)
        const worksheet = workbook.getWorksheet(1) // Get first worksheet
        
        if (worksheet) {
          // Data starts at row 3 (after header row with company name and column headers)
          let startRow = 3
          
          // Clear any existing data rows (keep header rows)
          if (worksheet.rowCount > 2) {
            worksheet.spliceRows(3, worksheet.rowCount - 2)
          }
          
          // Template columns: Sr.NO | Date | Delivery Time | Customer Name | Instructions | Dish Name | Contact Number | Delivery Address
          const chefLastCol = 8
          allRows.forEach((rowData, index) => {
            const groupItems = rowData.items as ItemWithOptionalDish[]
            const instructions = groupItems.map(i => parseInstructions(i.customNote)).filter(Boolean).join('; ')
            const dishText =
              rowData.exportHighlight === 'skipped_day'
                ? 'No meal for today'
                : rowData.exportHighlight === 'paused'
                  ? 'Customer not available'
                  : dishNamesForCell(rowData.dishNames)
            const row = worksheet.getRow(startRow + index)
            row.getCell(1).value = index + 1
            row.getCell(2).value = formatDateExport(rowData.date)
            row.getCell(3).value = deliveryTimeForExport(rowData)
            row.getCell(4).value = rowData.customerName
            row.getCell(5).value = rowData.exportHighlight === 'paused' ? '' : instructions
            row.getCell(6).value = dishText
            row.getCell(7).value = contactNoForRow(rowData)
            row.getCell(8).value = rowData.customer.address || ''
            if (rowData.exportHighlight === 'paused') applyPausedRowStyle(row, chefLastCol)
            else if (rowData.exportHighlight === 'skipped_day') applySkippedDayRowStyle(row, chefLastCol)
            else applyNormalDataRowFill(row, chefLastCol)
            applyChefInstructionsRedFont(row)
          })
        }
      } else {
        // Fallback: create new sheet if template doesn't exist (same column order as template.xlsx).
        const worksheet = workbook.addWorksheet('Chef')
        worksheet.getRow(1).values = [
          'Sr.NO',
          'Date',
          'Delivery Time',
          'Customer Name',
          'Instructions',
          'Dish Name',
          'Contact Number',
          'Delivery Address',
        ]
        const chefWidths = [6, 14, 14, 22, 38, 28, 14, 32]
        chefWidths.forEach((w, i) => worksheet.getColumn(i + 1).width = w)

        const chefLastCol = 8
        allRows.forEach((rowData, index) => {
          const groupItems = rowData.items as ItemWithOptionalDish[]
          const instructions = groupItems.map(i => parseInstructions(i.customNote)).filter(Boolean).join('; ')
          const dishText =
            rowData.exportHighlight === 'skipped_day'
              ? 'No meal for today'
              : rowData.exportHighlight === 'paused'
                ? 'Customer not available'
                : dishNamesForCell(rowData.dishNames)
          const row = worksheet.getRow(2 + index)
          row.getCell(1).value = index + 1
          row.getCell(2).value = formatDateExport(rowData.date)
          row.getCell(3).value = deliveryTimeForExport(rowData)
          row.getCell(4).value = rowData.customerName
          row.getCell(5).value = rowData.exportHighlight === 'paused' ? '' : instructions
          row.getCell(6).value = dishText
          row.getCell(7).value = contactNoForRow(rowData)
          row.getCell(8).value = rowData.customer.address || ''
          if (rowData.exportHighlight === 'paused') applyPausedRowStyle(row, chefLastCol)
          else if (rowData.exportHighlight === 'skipped_day') applySkippedDayRowStyle(row, chefLastCol)
          else applyNormalDataRowFill(row, chefLastCol)
          applyChefInstructionsRedFont(row)
        })
      }

      const unscheduledRows = await getKitchenUnscheduledRows(date)
      const uws = workbook.addWorksheet('Unscheduled meals')
      uws.getCell('A1').value = `Unscheduled meals — ${formatDateExport(new Date(date))}`
      uws.mergeCells(1, 1, 1, 4)
      uws.getRow(2).values = ['Customer', 'Contact', 'Time slot', 'Meals for day']
      ;[26, 14, 22, 22].forEach((w, i) => {
        uws.getColumn(i + 1).width = w
      })
      let unscheduledRowNum = 3
      if (unscheduledRows.length === 0) {
        uws.getRow(unscheduledRowNum).getCell(1).value = 'No customers missing meals for this date.'
      } else {
        for (const ur of unscheduledRows) {
          const slotLabel =
            ur.defaultTimeSlots.length > 0
              ? ur.defaultTimeSlots.map((s) => formatTime12h(s) || s).join(', ')
              : '—'
          uws.getRow(unscheduledRowNum).values = [
            ur.customerName,
            ur.phone ?? '',
            slotLabel,
            `${ur.scheduledWithDishCount} / ${ur.mealsPerDay} with dish`,
          ]
          unscheduledRowNum++
        }
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
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : ''
    if (code === 'P1001' || code === 'P1008') {
      return NextResponse.json(
        {
          error:
            'Cannot reach the database (connection closed or host unreachable). If you use Neon, wake the project or check DATABASE_URL and network.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Failed to export kitchen planning data' }, { status: 500 })
  }
}

