import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { formatCategory } from '@/lib/utils'
import { getCustomerActivityReport } from '@/lib/reports-customer-activity'
import ExcelJS from 'exceljs'
import { eachDayOfInterval, format, startOfDay } from 'date-fns'

function getDateRange(searchParams: URLSearchParams): { from: Date; to: Date } | null {
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')
  if (!fromStr || !toStr) return null
  const from = new Date(fromStr)
  const to = new Date(toStr)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null
  from.setHours(0, 0, 0, 0)
  to.setHours(23, 59, 59, 999)
  return from <= to ? { from, to } : null
}

async function workbookCustomerActivityOnly(dateRange: { from: Date; to: Date }) {
  const customerRows = await getCustomerActivityReport(dateRange.from, dateRange.to)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Nutrafi Kitchen'
  /*
   * Customer activity sheet — documentation (not exported on the sheet):
   *
   * Who is included
   * • The customer has at least one meal plan that overlaps the report dates, and that plan also satisfies either:
   *   (a) its start date falls on a day within the report range, or
   *   (b) it has at least one non-skipped meal scheduled on a day within the report range.
   * • If a plan only overlaps the range but has neither (a) nor (b), it is not used for this report.
   *
   * What each column means
   * • Meal plan start — earliest start date among the meal plans counted for that customer.
   * • Total meals — sum of totalMeals on counted plans; when totalMeals is missing for a plan, that plan uses the count of non-skipped slots scheduled in this range only.
   * • Meals delivered (from - to in column header, e.g. 21 Apr - 28 Apr) — all-time count of meals marked delivered for that customer (every plan, any scheduled date); skipped items and wrong-delivery lines are excluded.
   */
  const custSheet = workbook.addWorksheet('Customer activity', { views: [{ state: 'frozen', ySplit: 2 }] })
  const rangeLabel = `${format(dateRange.from, 'd MMM yyyy')} – ${format(dateRange.to, 'd MMM yyyy')}`
  const mealsDeliveredHeader = `Meals delivered (${format(dateRange.from, 'd MMM')} - ${format(dateRange.to, 'd MMM')})`
  custSheet.getCell('A1').value = `Customer activity — ${rangeLabel}`
  custSheet.mergeCells(1, 1, 1, 10)
  custSheet.getRow(1).font = { bold: true, size: 12 }
  const widths = [26, 16, 24, 12, 18, 32, 28, 14, 16, 34]
  widths.forEach((w, i) => {
    custSheet.getColumn(i + 1).width = w
  })
  custSheet.getRow(2).values = [
    'Customer name',
    'Phone',
    'Meal plan start',
    'Meal plans',
    'Total payment (AED)',
    'Payment completed (AED)',
    'Payment pending (AED)',
    'Payment status',
    'Total meals',
    mealsDeliveredHeader,
  ]
  custSheet.getRow(2).font = { bold: true }
  customerRows.forEach((r, i) => {
    const row = custSheet.getRow(3 + i)
    row.getCell(1).value = r.fullName
    row.getCell(2).value = r.phone
    row.getCell(3).value = r.mealPlanStartDateDisplay ?? '—'
    row.getCell(4).value = r.mealPlanCount
    row.getCell(5).value = r.paymentTotalDisplay
    row.getCell(6).value = r.paymentCompletedDisplay
    row.getCell(7).value = r.paymentPendingDisplay
    row.getCell(8).value = r.paymentStatusSummary
    row.getCell(9).value = r.totalMeals
    row.getCell(10).value = r.mealsDelivered
  })
  await appendDeliveredByScheduledDaySheet(workbook, dateRange)
  return workbook
}

/** Counts items scheduled on each calendar day in the range that are marked delivered (by `date`, not `deliveredAt`). */
async function appendDeliveredByScheduledDaySheet(
  workbook: ExcelJS.Workbook,
  dateRange: { from: Date; to: Date },
) {
  const rows = await prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
    SELECT DATE("date") AS day, COUNT(*)::bigint AS count
    FROM "MealPlanItem"
    WHERE "isDelivered" = true
      AND COALESCE("wrongDelivery", false) = false
      AND "isSkipped" = false
      AND "date" >= ${dateRange.from}
      AND "date" <= ${dateRange.to}
    GROUP BY DATE("date")
    ORDER BY 1 ASC
  `

  const countByYmd = new Map<string, number>()
  for (const r of rows) {
    const key = format(new Date(r.day), 'yyyy-MM-dd')
    countByYmd.set(key, Number(r.count))
  }

  const days = eachDayOfInterval({
    start: startOfDay(dateRange.from),
    end: startOfDay(dateRange.to),
  }).map((d) => {
    const ymd = format(d, 'yyyy-MM-dd')
    return { date: ymd, count: countByYmd.get(ymd) ?? 0 }
  })
  const total = days.reduce((sum, d) => sum + d.count, 0)

  const sheet = workbook.addWorksheet('Delivered by schedule date', {
    views: [{ state: 'frozen', ySplit: 3 }],
  })
  const rangeLabel = `${format(dateRange.from, 'd MMM yyyy')} – ${format(dateRange.to, 'd MMM yyyy')}`
  sheet.getCell('A1').value = `Meals marked delivered (by scheduled day) — ${rangeLabel}`
  sheet.mergeCells(1, 1, 1, 2)
  sheet.getRow(1).font = { bold: true, size: 12 }
  sheet.getCell('A2').value =
    'For each calendar day: count of meals scheduled that day that are marked delivered. Skipped and wrong-delivery items are excluded.'
  sheet.mergeCells(2, 1, 2, 2)
  sheet.getRow(2).font = { size: 10, italic: true }
  sheet.getRow(2).alignment = { wrapText: true, vertical: 'top' }
  sheet.getColumn(1).width = 26
  sheet.getColumn(2).width = 18
  sheet.getRow(3).values = ['Scheduled date', 'Meals marked delivered']
  sheet.getRow(3).font = { bold: true }
  days.forEach((row, i) => {
    const r = sheet.getRow(4 + i)
    r.getCell(1).value = format(new Date(row.date + 'T12:00:00'), 'EEE, d MMM yyyy')
    r.getCell(2).value = row.count
  })
  const totalRow = sheet.getRow(4 + days.length)
  totalRow.getCell(1).value = 'Total (scheduled days in range)'
  totalRow.getCell(2).value = total
  totalRow.font = { bold: true }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateRange = getDateRange(searchParams)

    if (searchParams.get('customerOnly') === '1') {
      if (!dateRange) {
        return NextResponse.json(
          { error: 'Query params from and to (YYYY-MM-DD) are required for the customer report.' },
          { status: 400 }
        )
      }
      const workbook = await workbookCustomerActivityOnly(dateRange)
      const buffer = await workbook.xlsx.writeBuffer()
      const fromStr = dateRange.from.toISOString().slice(0, 10)
      const toStr = dateRange.to.toISOString().slice(0, 10)
      const filename = `customer-activity-${fromStr}-to-${toStr}.xlsx`
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    const paymentWhere = dateRange
      ? { status: 'COMPLETED' as const, paymentDate: { gte: dateRange.from, lte: dateRange.to } }
      : { status: 'COMPLETED' as const }

    const [activeCustomers, totalDishes, activeMealPlans, totalPayments, revenueResult] = await Promise.all([
      prisma.customer.count({ where: { status: 'ACTIVE' } }),
      prisma.dish.count({ where: { status: 'ACTIVE' } }),
      prisma.mealPlan.count({ where: { status: 'ACTIVE' } }),
      prisma.payment.count({ where: paymentWhere }),
      prisma.payment.aggregate({
        where: paymentWhere,
        _sum: { amount: true },
      }),
    ])
    const revenue = revenueResult._sum.amount || 0

    const itemWhere: { dishId: { not: null }; isSkipped: false; date?: { gte: Date; lte: Date } } = {
      dishId: { not: null },
      isSkipped: false,
    }
    if (dateRange) {
      itemWhere.date = { gte: dateRange.from, lte: dateRange.to }
    }

    const popularDishesGroup = await prisma.mealPlanItem.groupBy({
      by: ['dishId'],
      where: itemWhere,
      _count: { dishId: true },
      orderBy: { _count: { dishId: 'desc' } },
      take: 50,
    })
    const dishIds = popularDishesGroup.map(d => d.dishId).filter((id): id is number => id != null)
    const dishes = await prisma.dish.findMany({ where: { id: { in: dishIds } } })
    const popularDishes = popularDishesGroup.map(pd => ({
      dish: dishes.find(d => d.id === pd.dishId),
      count: pd._count.dishId,
    })).filter(r => r.dish)

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Nutrafi Kitchen'

    const summarySheet = workbook.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 1 }] })
    summarySheet.columns = [
      { header: 'Metric', width: 22 },
      { header: 'Value', width: 16 },
    ]
    summarySheet.getRow(1).font = { bold: true }
    const summaryData = [
      ['Active Customers', activeCustomers],
      ['Total Dishes', totalDishes],
      ['Active Meal Plans', activeMealPlans],
      ['Total Payments', totalPayments],
      ['Total Revenue (AED)', revenue.toFixed(2)],
    ]
    summaryData.forEach(([metric, value], i) => {
      const row = summarySheet.getRow(i + 2)
      row.getCell(1).value = metric
      row.getCell(2).value = value
    })

    const dishesSheet = workbook.addWorksheet('Most Ordered Dishes', { views: [{ state: 'frozen', ySplit: 1 }] })
    dishesSheet.columns = [
      { header: 'Dish Name', width: 28 },
      { header: 'Category', width: 18 },
      { header: 'Total Orders', width: 14 },
    ]
    dishesSheet.getRow(1).font = { bold: true }
    popularDishes.forEach((item, i) => {
      const row = dishesSheet.getRow(i + 2)
      row.getCell(1).value = item.dish?.name ?? 'N/A'
      row.getCell(2).value = item.dish?.category ? formatCategory(item.dish.category) : 'N/A'
      row.getCell(3).value = item.count
    })

    if (dateRange) {
      await appendDeliveredByScheduledDaySheet(workbook, dateRange)
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const fromStr = dateRange ? dateRange.from.toISOString().slice(0, 10) : 'all'
    const toStr = dateRange ? dateRange.to.toISOString().slice(0, 10) : 'all'
    const filename = `reports-${fromStr}-to-${toStr}.xlsx`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Error exporting reports:', error)
    return NextResponse.json({ error: 'Failed to export reports' }, { status: 500 })
  }
}
