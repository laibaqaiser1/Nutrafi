import ExcelJS from 'exceljs'
import { addDays, format } from 'date-fns'
import type { DishCategory, MealPlan, MealPlanItem, Customer, Plan } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { getMondayOfPlanWeek } from '@/lib/meal-plan-weeks'
import { formatCategory } from '@/lib/utils'

const HEADER_GREEN = 'FF728F53'
const HEADER_GREEN_RGB: [number, number, number] = [114, 141, 83]
const LIGHT_GREY = 'FFF8F8F8'
const WHITE = 'FFFFFFFF'

export type MealPlanExportBundle = {
  mealPlan: MealPlan & { customer: Customer; plan: Plan | null }
  items: MealPlanItem[]
  title: string
  filenameSuffix: string
}

/** Convert 24h time string (e.g. "14:00") to 12h with AM/PM (e.g. "2:00 PM") */
export function formatMealPlanExportTime12h(timeSlot: string | null): string {
  if (!timeSlot || timeSlot === '-') return timeSlot || '-'
  const match = timeSlot.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return timeSlot
  const hours = parseInt(match[1]!, 10)
  const minutes = parseInt(match[2]!, 10)
  const d = new Date(2000, 0, 1, hours, minutes)
  return format(d, 'h:mm a')
}

export function numExport(v: number | null | undefined): number {
  return v != null && !Number.isNaN(v) ? Number(v) : 0
}

/** Strip bidi / invisible chars often pasted into names; breaks HTTP header ByteString if left in. */
export function stripInvisibleAndControlChars(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
}

export function contentDispositionAttachment(filename: string): string {
  const cleaned = stripInvisibleAndControlChars(filename).trim()
  const asciiFallback =
    cleaned
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'download'
  const star = encodeURIComponent(cleaned)
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${star}`
}

/** Notes column: plain text from meal plan item customNote. */
export function getNotesFromCustomNote(customNote: string | null): string {
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

export function mealPlanItemStatus(item: MealPlanItem): string {
  if (item.isSkipped) return 'Skipped'
  if (item.wrongDelivery && !item.isDelivered) return 'Wrong delivery'
  if (item.isDelivered) return 'Delivered'
  return 'Scheduled'
}

export function groupMealPlanItemsByDate(items: MealPlanItem[]): Map<string, MealPlanItem[]> {
  const byDate = new Map<string, MealPlanItem[]>()
  for (const item of items) {
    const key = format(new Date(item.date), 'yyyy-MM-dd')
    const list = byDate.get(key) ?? []
    list.push(item)
    byDate.set(key, list)
  }
  return byDate
}

export async function loadMealPlanExportBundle(
  mealPlanId: number,
  weekNumber: number | null = null
): Promise<MealPlanExportBundle | null> {
  const mealPlan = await prisma.mealPlan.findUnique({
    where: { id: mealPlanId },
    include: {
      customer: true,
      plan: true,
      mealPlanItems: {
        orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }, { id: 'asc' }],
      },
    },
  })

  if (!mealPlan) return null

  let items = mealPlan.mealPlanItems
  let title = 'Meal Plan'
  let filenameSuffix = format(new Date(), 'yyyy-MM-dd')

  if (weekNumber !== null && weekNumber >= 1 && mealPlan.startDate) {
    const weekStart = getMondayOfPlanWeek(mealPlan.startDate, weekNumber)
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

  return { mealPlan, items, title, filenameSuffix }
}

function exportFilename(
  customerName: string,
  filenameSuffix: string,
  ext: 'pdf' | 'xlsx'
): string {
  const safeName = stripInvisibleAndControlChars(customerName).replace(/\s+/g, '-')
  return `meal-plan-${safeName}-${filenameSuffix}.${ext}`
}

export function mealPlanExportPdfFilename(bundle: MealPlanExportBundle): string {
  return exportFilename(bundle.mealPlan.customer.fullName, bundle.filenameSuffix, 'pdf')
}

export function mealPlanExportExcelFilename(bundle: MealPlanExportBundle): string {
  return exportFilename(bundle.mealPlan.customer.fullName, bundle.filenameSuffix, 'xlsx')
}

function styleHeaderRow(row: ExcelJS.Row, colCount: number) {
  row.height = 32
  row.font = { bold: true, color: { argb: WHITE }, size: 12 }
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_GREEN } }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFC8C8C8' } },
      left: { style: 'thin', color: { argb: 'FFC8C8C8' } },
      bottom: { style: 'thin', color: { argb: 'FFC8C8C8' } },
      right: { style: 'thin', color: { argb: 'FFC8C8C8' } },
    }
  }
}

function styleDataRow(
  row: ExcelJS.Row,
  colCount: number,
  shaded: boolean,
  fromCol = 1
) {
  row.alignment = { vertical: 'top', wrapText: true }
  for (let c = fromCol; c <= colCount; c++) {
    const cell = row.getCell(c)
    if (shaded) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GREY } }
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    }
  }
}

function styleTotalRow(row: ExcelJS.Row, colCount: number, fromCol = 1) {
  row.font = { bold: true, color: { argb: WHITE }, size: 10 }
  for (let c = fromCol; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_GREEN } }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFC8C8C8' } },
      left: { style: 'thin', color: { argb: 'FFC8C8C8' } },
      bottom: { style: 'thin', color: { argb: 'FFC8C8C8' } },
      right: { style: 'thin', color: { argb: 'FFC8C8C8' } },
    }
  }
}

function styleMergedDateCell(
  sheet: ExcelJS.Worksheet,
  topRow: number,
  bottomRow: number,
  dayIndex: number
) {
  sheet.mergeCells(topRow, 1, bottomRow, 1)
  const dateCell = sheet.getCell(topRow, 1)
  dateCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  dateCell.font = { bold: true, size: 10 }
  dateCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: dayIndex % 2 === 0 ? 'FFE8EFE0' : 'FFF0F4EB' },
  }
  dateCell.border = {
    top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
  }
}

const EXCEL_HEADERS = [
  'Date',
  'Meal',
  'Time',
  'Dish',
  'Category',
  'Ingredients',
  'Allergens',
  'Calories (kcal)',
  'Protein (g)',
  'Carbs (g)',
  'Fats (g)',
  'Notes',
  'Status',
] as const

const COL_WIDTHS = [18, 8, 12, 28, 14, 36, 18, 12, 12, 12, 12, 28, 14]

function categoryLabel(category: DishCategory | null | undefined): string {
  if (!category) return ''
  return formatCategory(category)
}

/** Build a formatted Excel workbook — one row per meal, grouped by day with day totals. */
export async function buildMealPlanExportWorkbook(
  bundle: MealPlanExportBundle
): Promise<ExcelJS.Workbook> {
  const { mealPlan, items, title } = bundle
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Nutrafi Kitchen'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Meal Plan', {
    views: [{ state: 'frozen', ySplit: 8, activeCell: 'A9' }],
  })

  COL_WIDTHS.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w
  })

  sheet.mergeCells(1, 1, 1, EXCEL_HEADERS.length)
  sheet.getCell(1, 1).value = 'Nutrafi Kitchen Abu Dhabi'
  sheet.getCell(1, 1).font = { bold: true, size: 14 }

  sheet.mergeCells(2, 1, 2, EXCEL_HEADERS.length)
  sheet.getCell(2, 1).value = title
  sheet.getCell(2, 1).font = { bold: true, size: 12 }

  const dateRange =
    mealPlan.startDate && mealPlan.endDate
      ? `${format(new Date(mealPlan.startDate), 'd MMM yyyy')} – ${format(new Date(mealPlan.endDate), 'd MMM yyyy')}`
      : ''

  sheet.mergeCells(3, 1, 3, EXCEL_HEADERS.length)
  sheet.getCell(3, 1).value = `Customer: ${mealPlan.customer.fullName}  |  Phone: ${mealPlan.customer.phone ?? '—'}  |  Plan: ${mealPlan.planType}`

  sheet.mergeCells(4, 1, 4, EXCEL_HEADERS.length)
  sheet.getCell(4, 1).value = `Meals per day: ${mealPlan.mealsPerDay}${dateRange ? `  |  ${dateRange}` : ''}`

  const totalMeals =
    mealPlan.totalMeals != null ? String(mealPlan.totalMeals) : String(items.length)
  const remaining =
    mealPlan.remainingMeals != null ? String(mealPlan.remainingMeals) : '—'
  sheet.mergeCells(5, 1, 5, EXCEL_HEADERS.length)
  sheet.getCell(5, 1).value = `Total meals: ${totalMeals}  |  Remaining: ${remaining}  |  Exported: ${format(new Date(), 'd MMM yyyy HH:mm')}`

  sheet.getRow(6).height = 6

  const headerRowNum = 7
  sheet.getRow(headerRowNum).values = [...EXCEL_HEADERS]
  styleHeaderRow(sheet.getRow(headerRowNum), EXCEL_HEADERS.length)

  const itemsByDate = groupMealPlanItemsByDate(items)
  let rowNum = headerRowNum + 1
  let dayIndex = 0

  for (const [, dateItems] of itemsByDate) {
    const dateLabel = format(new Date(dateItems[0]!.date), 'EEEE, d MMM yyyy')
    const dayStartRow = rowNum
    let sumCal = 0
    let sumP = 0
    let sumC = 0
    let sumF = 0

    dateItems.forEach((item, mealIndex) => {
      sumCal += numExport(item.calories)
      sumP += numExport(item.protein)
      sumC += numExport(item.carbs)
      sumF += numExport(item.fats)

      const row = sheet.getRow(rowNum)
      const shaded = mealIndex % 2 === 0
      if (mealIndex === 0) {
        row.getCell(1).value = dateLabel
      }
      row.getCell(2).value = mealIndex + 1
      row.getCell(3).value = formatMealPlanExportTime12h(item.timeSlot || null)
      row.getCell(4).value =
        item.dishName || (item.isSkipped ? '—' : 'Not set')
      row.getCell(5).value = item.isSkipped ? '—' : categoryLabel(item.dishCategory)
      row.getCell(6).value = item.ingredients || (item.isSkipped ? '—' : '')
      row.getCell(7).value = item.allergens || (item.isSkipped ? '—' : '')
      row.getCell(8).value = item.calories != null ? item.calories : '—'
      row.getCell(9).value =
        item.protein != null ? Math.round(item.protein) : '—'
      row.getCell(10).value = item.carbs != null ? Math.round(item.carbs) : '—'
      row.getCell(11).value = item.fats != null ? Math.round(item.fats) : '—'
      row.getCell(12).value = item.isSkipped
        ? '—'
        : getNotesFromCustomNote(item.customNote).trim() || ''
      row.getCell(13).value = mealPlanItemStatus(item)

      styleDataRow(row, EXCEL_HEADERS.length, shaded, 2)
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }
      rowNum++
    })

    const totalRow = sheet.getRow(rowNum)
    totalRow.getCell(2).value = 'Day total'
    totalRow.getCell(8).value = sumCal > 0 ? sumCal : '—'
    totalRow.getCell(9).value = sumP > 0 ? Math.round(sumP) : '—'
    totalRow.getCell(10).value = sumC > 0 ? Math.round(sumC) : '—'
    totalRow.getCell(11).value = sumF > 0 ? Math.round(sumF) : '—'
    styleTotalRow(totalRow, EXCEL_HEADERS.length, 2)
    totalRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' }

    if (dateItems.length > 0) {
      styleMergedDateCell(sheet, dayStartRow, rowNum, dayIndex)
    }

    rowNum++
    dayIndex++
  }

  sheet.getRow(rowNum + 1).values = [
    'Calories and macro values are approximate. Allergen information is provided as a general reference.',
  ]
  sheet.mergeCells(rowNum + 1, 1, rowNum + 1, EXCEL_HEADERS.length)
  sheet.getCell(rowNum + 1, 1).font = { italic: true, size: 9, color: { argb: 'FF666666' } }
  sheet.getCell(rowNum + 1, 1).alignment = { wrapText: true }

  return workbook
}

export async function buildMealPlanExportExcelBuffer(
  bundle: MealPlanExportBundle
): Promise<Buffer> {
  const workbook = await buildMealPlanExportWorkbook(bundle)
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

/** RGB for jsPDF tables — matches Excel header green. */
export { HEADER_GREEN_RGB }
