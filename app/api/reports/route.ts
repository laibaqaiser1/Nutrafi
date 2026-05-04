import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'

// Parse optional from/to (YYYY-MM-DD) into Date range for filtering
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

// GET - Get reports data
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleReports)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get('type') || 'summary'
    const dateRange = getDateRange(searchParams)

    if (reportType === 'summary') {
      const paymentWhere = dateRange
        ? { status: 'COMPLETED' as const, paymentDate: { gte: dateRange.from, lte: dateRange.to } }
        : { status: 'COMPLETED' as const }

      const [activeCustomers, totalDishes, activeMealPlans, totalPayments, revenue] = await Promise.all([
        prisma.customer.count({ where: { status: 'ACTIVE' } }),
        prisma.dish.count({ where: { status: 'ACTIVE' } }),
        prisma.mealPlan.count({ where: { status: 'ACTIVE' } }),
        prisma.payment.count({ where: paymentWhere }),
        prisma.payment.aggregate({
          where: paymentWhere,
          _sum: { amount: true },
        }),
      ])

      return NextResponse.json({
        activeCustomers,
        totalDishes,
        activeMealPlans,
        totalPayments,
        revenue: revenue._sum.amount || 0,
      })
    }

    if (reportType === 'popular-dishes') {
      const itemWhere: { dishId: { not: null }; isSkipped: false; date?: { gte: Date; lte: Date } } = {
        dishId: { not: null },
        isSkipped: false,
      }
      if (dateRange) {
        itemWhere.date = { gte: dateRange.from, lte: dateRange.to }
      }

      const popularDishes = await prisma.mealPlanItem.groupBy({
        by: ['dishId'],
        where: itemWhere,
        _count: {
          dishId: true,
        },
        orderBy: {
          _count: {
            dishId: 'desc',
          },
        },
        take: 10,
      })

      const dishIds = popularDishes.map(d => d.dishId).filter((id): id is number => id != null)
      const dishes = await prisma.dish.findMany({
        where: { id: { in: dishIds } },
      })

      const result = popularDishes.map(pd => ({
        dish: dishes.find(d => d.id === pd.dishId),
        count: pd._count.dishId,
      })).filter(r => r.dish)

      return NextResponse.json(result)
    }

    if (reportType === 'weekly-production') {
      const startOfWeek = new Date()
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      startOfWeek.setHours(0, 0, 0, 0)

      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(endOfWeek.getDate() + 7)

      const weeklyMeals = await prisma.mealPlanItem.count({
        where: {
          date: {
            gte: startOfWeek,
            lt: endOfWeek,
          },
          isSkipped: false,
        },
      })

      return NextResponse.json({
        weekStart: startOfWeek.toISOString(),
        weekEnd: endOfWeek.toISOString(),
        totalMeals: weeklyMeals,
      })
    }

    return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
  } catch (error) {
    console.error('Error generating report:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}

