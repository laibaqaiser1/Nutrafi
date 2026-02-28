import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { formatCategory } from '@/lib/utils'
import ExcelJS from 'exceljs'

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

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateRange = getDateRange(searchParams)

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
