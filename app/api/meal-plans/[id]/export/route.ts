import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { format, addDays } from 'date-fns'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCategory } from '@/lib/utils'
import fs from 'fs'
import path from 'path'

/** Convert 24h time string (e.g. "14:00") to 12h with AM/PM (e.g. "2:00 PM") */
function formatTime12h(timeSlot: string | null): string {
  if (!timeSlot || timeSlot === '-') return timeSlot || '-'
  const match = timeSlot.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return timeSlot
  const hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const d = new Date(2000, 0, 1, hours, minutes)
  return format(d, 'h:mm a')
}

function num(v: number | null | undefined): number {
  return v != null && !Number.isNaN(v) ? Number(v) : 0
}

/** Notes column: only the note text from meal plan item. customNote is JSON; note can be nested JSON string. */
function getNotesFromCustomNote(customNote: string | null): string {
  if (!customNote || !String(customNote).trim()) return ''
  let raw = String(customNote).trim()
  let depth = 0
  const maxDepth = 5
  while (depth < maxDepth) {
    try {
      if (!raw.startsWith('{')) return raw
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const value = parsed.note ?? parsed.instructions
      if (value == null) return ''
      if (typeof value !== 'string') return ''
      raw = value.trim()
      if (!raw) return ''
      depth++
    } catch {
      return raw.startsWith('{') ? '' : raw
    }
  }
  return raw
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid meal plan ID' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const weekParam = searchParams.get('week')
    const weekNumber = weekParam ? parseInt(weekParam, 10) : null

    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id },
      include: {
        customer: true,
        plan: true,
        mealPlanItems: {
          orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
        },
      },
    })

    if (!mealPlan) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }

    let items = mealPlan.mealPlanItems
    let title = 'Meal Plan'
    let filenameSuffix = format(new Date(), 'yyyy-MM-dd')

    if (weekNumber !== null && weekNumber >= 1 && mealPlan.startDate) {
      const planStart = new Date(mealPlan.startDate)
      const weekStart = addDays(planStart, (weekNumber - 1) * 7)
      const weekEnd = addDays(weekStart, 6)
      const weekStartStr = format(weekStart, 'yyyy-MM-dd')
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd')
      items = mealPlan.mealPlanItems.filter((item) => {
        const d = format(new Date(item.date), 'yyyy-MM-dd')
        return d >= weekStartStr && d <= weekEndStr
      })
      title = `Meal Plan - Week ${weekNumber}`
      filenameSuffix = `week-${weekNumber}-${weekStartStr}-to-${weekEndStr}`
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    // A4 landscape: 297 x 210 mm
    const pageWidth = 297
    const pageHeight = 210
    let y = 14

    // Logo (if public/nutrafi_logo.png or nutrafi_logo.jpg exists)
    let logoPath = path.join(process.cwd(), 'public', 'nutrafi_logo.png')
    if (!fs.existsSync(logoPath)) {
      logoPath = path.join(process.cwd(), 'public', 'nutrafi_logo.jpg')
    }
    let logoWidth = 0
    const blockHeight = 7 + 5 + 5 + 5 + 5 // title + 4 description lines
    const logoHeight = blockHeight
    try {
      if (fs.existsSync(logoPath)) {
        const imgBase64 = fs.readFileSync(logoPath).toString('base64')
        const isJpeg = logoPath.toLowerCase().endsWith('.jpg') || logoPath.toLowerCase().endsWith('.jpeg')
        const imgData = isJpeg ? `data:image/jpeg;base64,${imgBase64}` : `data:image/png;base64,${imgBase64}`
        const imgFormat = isJpeg ? 'JPEG' : 'PNG'
        logoWidth = 36
        const gap = 8
        const logoColumnWidth = logoWidth + gap
        const logoLeft = 14 + (logoColumnWidth - logoWidth) / 2
        const logoTop = 14
        doc.addImage(imgData, imgFormat, logoLeft, logoTop, logoWidth, logoHeight)
      }
    } catch {
      // Skip logo if read fails
    }

    // Header – Nutrafi Kitchen style; text top-aligned with logo
    const headerX = 14 + logoWidth + (logoWidth > 0 ? 8 : 0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Nutrafi Kitchen Abu Dhabi', headerX, y)
    y += 7
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Customer Name: ${mealPlan.customer.fullName}`, headerX, y)
    y += 5
    doc.text(`Subscription type: ${mealPlan.planType}`, headerX, y)
    y += 5
    const dateRange =
      mealPlan.startDate && mealPlan.endDate
        ? `${format(new Date(mealPlan.startDate), 'd MMM yyyy')} – ${format(new Date(mealPlan.endDate), 'd MMM yyyy')}`
        : ''
    const mealsPerDayLine = `Meals per day: ${mealPlan.mealsPerDay}${dateRange ? `  |  ${dateRange}` : ''}`
    doc.text(mealsPerDayLine, headerX, y)
    y += 5
    const totalMeals = items.length
    const remainingMeals = items.filter((i) => !i.isDelivered).length
    doc.text(`Total meals: ${totalMeals}  |  Remaining meals: ${remainingMeals}`, headerX, y)
    y += 8

    // Table: Day/Date | Time | Item | Ingredients | Allergens | Calories | Protein | Carbs | Fats | Notes (per meal) | Status
    const tableHead = [
      [
        'Day / Date',
        'Time',
        'Item',
        'Ingredients',
        'Allergens',
        'Calories (Kcal)',
        'Protein (Gms)',
        'Carbs (Gms)',
        'Fats (Gms)',
        'Notes',
        'Status',
      ],
    ]
    const itemsByDate = new Map<string, typeof items>()
    for (const item of items) {
      const key = format(new Date(item.date), 'yyyy-MM-dd')
      if (!itemsByDate.has(key)) itemsByDate.set(key, [])
      itemsByDate.get(key)!.push(item)
    }

    type CellStyle = {
      fillColor?: [number, number, number]
      textColor?: number
      fontStyle?: 'bold' | 'normal'
      halign?: 'left' | 'center' | 'right'
      valign?: 'top' | 'middle' | 'bottom'
    }
    type CellInput = string | number | { content: string; rowSpan?: number; colSpan?: number; styles?: CellStyle }
    type BodyRow = CellInput[] | Record<string, string | number>
    const tableBodyFinal: BodyRow[] = []
    const LIGHT_GREY: [number, number, number] = [248, 248, 248]
    const WHITE: [number, number, number] = [255, 255, 255]
    const HEADER_GREEN: [number, number, number] = [114, 141, 83]

    for (const [, dateItems] of itemsByDate) {
      const dateLabel = format(new Date(dateItems[0].date), 'EEEE, d MMM yyyy')
      let sumCal = 0
      let sumP = 0
      let sumC = 0
      let sumF = 0

      dateItems.forEach((item, i) => {
        sumCal += num(item.calories)
        sumP += num(item.protein)
        sumC += num(item.carbs)
        sumF += num(item.fats)
        const status = item.isSkipped ? 'Skipped' : item.isDelivered ? 'Delivered' : 'Scheduled'
        const time = formatTime12h(item.timeSlot || null)
        const dish = item.dishName || (item.isSkipped ? '—' : 'Not set')
        const ingredients = item.ingredients || (item.isSkipped ? '—' : '')
        const allergens = item.allergens || (item.isSkipped ? '—' : '')
        const cal = item.calories != null ? String(item.calories) : '—'
        const p = item.protein != null ? String(Math.round(item.protein)) : '—'
        const c = item.carbs != null ? String(Math.round(item.carbs)) : '—'
        const f = item.fats != null ? String(Math.round(item.fats)) : '—'
        const instructions = (() => {
          if (item.isSkipped) return '—'
          const notes = getNotesFromCustomNote(item.customNote)
          return notes.trim() || ''
        })()

        if (i === 0) {
          tableBodyFinal.push([
            { content: dateLabel, rowSpan: dateItems.length + 1, styles: { fillColor: HEADER_GREEN, textColor: 255, fontStyle: 'bold' as const, halign: 'center', valign: 'middle' } },
            time,
            dish,
            ingredients,
            allergens,
            cal,
            p,
            c,
            f,
            instructions,
            status,
          ])
        } else {
          tableBodyFinal.push({
            1: time,
            2: dish,
            3: ingredients,
            4: allergens,
            5: cal,
            6: p,
            7: c,
            8: f,
            9: instructions,
            10: status,
          })
        }
      })

      // TOTAL row — column 0 is Day/Date (rowSpan); merge 1–4 for "TOTAL"; then Cal,P,C,F; then 9–10
      tableBodyFinal.push([
        { content: 'TOTAL', colSpan: 4, styles: { fillColor: HEADER_GREEN, textColor: 255, fontStyle: 'bold', halign: 'center' } },
        sumCal > 0 ? String(sumCal) : '—',
        sumP > 0 ? String(Math.round(sumP)) : '—',
        sumC > 0 ? String(Math.round(sumC)) : '—',
        sumF > 0 ? String(Math.round(sumF)) : '—',
        { content: '', colSpan: 2, styles: { fillColor: HEADER_GREEN } },
      ])

    }

    autoTable(doc, {
      head: tableHead,
      body: tableBodyFinal,
      startY: y,
      theme: 'grid',
      headStyles: { fillColor: [114, 141, 83], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fillColor: LIGHT_GREY, fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT_GREY },
      margin: { left: 14, right: 14 },
      tableLineColor: [200, 200, 200],
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 16 },
        2: { cellWidth: 34 },
        3: { cellWidth: 50 },
        4: { cellWidth: 22 },
        5: { cellWidth: 18 },
        6: { cellWidth: 16 },
        7: { cellWidth: 14 },
        8: { cellWidth: 14 },
        9: { cellWidth: 24 },
        10: { cellWidth: 18 },
      },
      didParseCell: (data) => {
        const body = tableBodyFinal as BodyRow[]
        const rowData = body[data.row.index]
        if (!rowData || !Array.isArray(rowData)) return
        const isTotalRow = rowData.some(
          (c) => c === 'TOTAL' || (typeof c === 'object' && c !== null && 'content' in c && (c as { content: string }).content === 'TOTAL')
        )
        if (isTotalRow) {
          data.cell.styles.fillColor = [114, 141, 83]
          data.cell.styles.textColor = 255
          if (data.column.index >= 1 && data.column.index <= 4) data.cell.styles.fontStyle = 'bold'
        }
        // Remove bottom border from Day/Date column (column 0) in body
        if (data.section === 'body' && data.column.index === 0) {
          data.cell.styles.lineWidth = { top: 0.1, right: 0.1, bottom: 0, left: 0.1 }
        }
      },
    })

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    y = finalY + 8

    // Footer note (like reference PDF)
    if (y < pageHeight - 24) {
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      const note1 =
        'Calories and macro values are calculated in accordance with standard nutritional guidelines and accepted calculation practices. Figures are provided as approximate guidance.'
      const note2 =
        'Allergen information is provided as a general reference. Some ingredients or sauces may contain or come into contact with allergens such as dairy, nuts, gluten, soy, or others depending on sourcing and preparation.'
      const maxW = pageWidth - 28
      const lines1 = doc.splitTextToSize(note1, maxW)
      const lines2 = doc.splitTextToSize(note2, maxW)
      doc.text(lines1, 14, y)
      y += lines1.length * 3.5 + 2
      doc.text(lines2, 14, y)
    }

    const filename = `meal-plan-${mealPlan.customer.fullName.replace(/\s+/g, '-')}-${filenameSuffix}.pdf`
    const pdfBuffer = Buffer.from(doc.output('arraybuffer') as ArrayBuffer)

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (error) {
    console.error('Error exporting meal plan PDF:', error)
    return NextResponse.json({ error: 'Failed to export meal plan' }, { status: 500 })
  }
}
