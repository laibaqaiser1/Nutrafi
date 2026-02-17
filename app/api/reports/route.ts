import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// GET - Get reports data
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get('type') || 'summary'

    if (reportType === 'summary') {
      const [activeCustomers, totalDishes, activeMealPlans, totalPayments, revenue] = await Promise.all([
        prisma.customer.count({ where: { status: 'ACTIVE' } }),
        prisma.dish.count({ where: { status: 'ACTIVE' } }),
        prisma.mealPlan.count({ where: { status: 'ACTIVE' } }),
        prisma.payment.count({ where: { status: 'COMPLETED' } }),
        prisma.payment.aggregate({
          where: { status: 'COMPLETED' },
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
      const popularDishes = await prisma.mealPlanItem.groupBy({
        by: ['dishId'],
        where: {
          dishId: { not: null },
          isSkipped: false,
        },
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

      const dishIds = popularDishes.map(d => d.dishId).filter(Boolean) as string[]
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

