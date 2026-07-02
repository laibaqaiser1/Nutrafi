import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { parseIdParam } from '@/lib/parse-id'
import { format } from 'date-fns'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import fs from 'fs'
import path from 'path'
import {
  buildMealPlanExportExcelBuffer,
  contentDispositionAttachment,
  formatMealPlanExportTime12h,
  getNotesFromCustomNote,
  groupMealPlanItemsByDate,
  HEADER_GREEN_RGB,
  loadMealPlanExportBundle,
  mealPlanExportExcelFilename,
  mealPlanExportPdfFilename,
  mealPlanItemStatus,
  numExport,
  type MealPlanExportBundle,
} from '@/lib/meal-plan-export'

function buildMealPlanPdf(bundle: MealPlanExportBundle) {
  const { mealPlan, items } = bundle

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = 297
  const pageHeight = 210
  let y = 14

  let logoPath = path.join(process.cwd(), 'public', 'nutrafi_logo.png')
  if (!fs.existsSync(logoPath)) {
    logoPath = path.join(process.cwd(), 'public', 'nutrafi_logo.jpg')
  }
  let logoWidth = 0
  const blockHeight = 7 + 5 + 5 + 5 + 5
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
      doc.addImage(imgData, imgFormat, logoLeft, 14, logoWidth, logoHeight)
    }
  } catch {
    // Skip logo if read fails
  }

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
  doc.text(`Meals per day: ${mealPlan.mealsPerDay}${dateRange ? `  |  ${dateRange}` : ''}`, headerX, y)
  y += 5
  const totalLine =
    mealPlan.totalMeals != null ? String(mealPlan.totalMeals) : String(items.length)
  const remainingLine =
    mealPlan.remainingMeals != null ? String(mealPlan.remainingMeals) : '—'
  doc.text(`Total meals: ${totalLine}  |  Remaining meals: ${remainingLine}`, headerX, y)
  y += 8

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

  type CellStyle = {
    fillColor?: [number, number, number]
    textColor?: number
    fontStyle?: 'bold' | 'normal'
    halign?: 'left' | 'center' | 'right'
    valign?: 'top' | 'middle' | 'bottom'
  }
  type CellInput =
    | string
    | number
    | { content: string; rowSpan?: number; colSpan?: number; styles?: CellStyle }
  type BodyRow = CellInput[] | Record<string, string | number>

  const itemsByDate = groupMealPlanItemsByDate(items)
  const tableBodyFinal: BodyRow[] = []
  const LIGHT_GREY: [number, number, number] = [248, 248, 248]

  for (const [, dateItems] of itemsByDate) {
    const dateLabel = format(new Date(dateItems[0]!.date), 'EEEE, d MMM yyyy')
    let sumCal = 0
    let sumP = 0
    let sumC = 0
    let sumF = 0

    dateItems.forEach((item, i) => {
      sumCal += numExport(item.calories)
      sumP += numExport(item.protein)
      sumC += numExport(item.carbs)
      sumF += numExport(item.fats)
      const status = mealPlanItemStatus(item)
      const time = formatMealPlanExportTime12h(item.timeSlot || null)
      const dish = item.dishName || (item.isSkipped ? '—' : 'Not set')
      const ingredients = item.ingredients || (item.isSkipped ? '—' : '')
      const allergens = item.allergens || (item.isSkipped ? '—' : '')
      const cal = item.calories != null ? String(item.calories) : '—'
      const p = item.protein != null ? String(Math.round(item.protein)) : '—'
      const c = item.carbs != null ? String(Math.round(item.carbs)) : '—'
      const f = item.fats != null ? String(Math.round(item.fats)) : '—'
      const instructions = item.isSkipped
        ? '—'
        : getNotesFromCustomNote(item.customNote).trim() || ''

      if (i === 0) {
        tableBodyFinal.push([
          {
            content: dateLabel,
            rowSpan: dateItems.length + 1,
            styles: {
              fillColor: HEADER_GREEN_RGB,
              textColor: 255,
              fontStyle: 'bold',
              halign: 'center',
              valign: 'middle',
            },
          },
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

    tableBodyFinal.push([
      {
        content: 'TOTAL',
        colSpan: 4,
        styles: {
          fillColor: HEADER_GREEN_RGB,
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
        },
      },
      sumCal > 0 ? String(sumCal) : '—',
      sumP > 0 ? String(Math.round(sumP)) : '—',
      sumC > 0 ? String(Math.round(sumC)) : '—',
      sumF > 0 ? String(Math.round(sumF)) : '—',
      { content: '', colSpan: 2, styles: { fillColor: HEADER_GREEN_RGB } },
    ])
  }

  autoTable(doc, {
    head: tableHead,
    body: tableBodyFinal,
    startY: y,
    theme: 'grid',
    headStyles: {
      fillColor: HEADER_GREEN_RGB,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
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
        (c) =>
          c === 'TOTAL' ||
          (typeof c === 'object' &&
            c !== null &&
            'content' in c &&
            (c as { content: string }).content === 'TOTAL')
      )
      if (isTotalRow) {
        data.cell.styles.fillColor = HEADER_GREEN_RGB
        data.cell.styles.textColor = 255
        if (data.column.index >= 1 && data.column.index <= 4) {
          data.cell.styles.fontStyle = 'bold'
        }
      }
      if (data.section === 'body' && data.column.index === 0) {
        data.cell.styles.lineWidth = { top: 0.1, right: 0.1, bottom: 0, left: 0.1 }
      }
    },
  })

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  y = finalY + 8

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

  return Buffer.from(doc.output('arraybuffer') as ArrayBuffer)
}

/**
 * Export meal plan as PDF or Excel.
 *
 * Query:
 *   format=pdf | xlsx (default: pdf)
 *   week=N — optional plan week (1-based)
 */
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
    const formatParam = (searchParams.get('format') ?? 'pdf').toLowerCase()

    const bundle = await loadMealPlanExportBundle(
      id,
      weekNumber !== null && !Number.isNaN(weekNumber) ? weekNumber : null
    )

    if (!bundle) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }

    if (formatParam === 'xlsx' || formatParam === 'excel') {
      const buffer = await buildMealPlanExportExcelBuffer(bundle)
      const filename = mealPlanExportExcelFilename(bundle)
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': contentDispositionAttachment(filename),
          'Content-Length': String(buffer.length),
        },
      })
    }

    const pdfBuffer = buildMealPlanPdf(bundle)
    const filename = mealPlanExportPdfFilename(bundle)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDispositionAttachment(filename),
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (error) {
    console.error('Error exporting meal plan:', error)
    return NextResponse.json({ error: 'Failed to export meal plan' }, { status: 500 })
  }
}
