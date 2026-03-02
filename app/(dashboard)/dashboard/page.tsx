import { prisma } from '@/lib/prisma'
import { getServerSession } from '@/lib/auth-helpers'
import { redirect } from 'next/navigation'
import { startOfDay, format } from 'date-fns'
import { DashboardCharts } from '@/components/dashboard/DashboardCharts'
import { customerStatusLabel } from '@/lib/utils'

async function getDashboardStats() {
  const [activeCustomers, totalDishes, activeMealPlans, todayMeals] = await Promise.all([
    prisma.customer.count({ where: { status: 'ACTIVE' } }),
    prisma.dish.count({ where: { status: 'ACTIVE' } }),
    prisma.mealPlan.count({ where: { status: 'ACTIVE' } }),
    prisma.mealPlanItem.count({
      where: {
        date: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
        isSkipped: false,
      },
    }),
  ])

  return {
    activeCustomers,
    totalDishes,
    activeMealPlans,
    todayMeals,
  }
}

async function getChartData() {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)
  const start = new Date(todayStart)
  start.setDate(start.getDate() - 6)

  const [mealItems, customerCounts] = await Promise.all([
    prisma.mealPlanItem.findMany({
      where: {
        date: { gte: start, lte: todayEnd },
        isSkipped: false,
      },
      select: { date: true },
    }),
    prisma.customer.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
  ])

  const dayMap = new Map<string, number>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart)
    d.setDate(d.getDate() - i)
    dayMap.set(format(d, 'yyyy-MM-dd'), 0)
  }
  for (const item of mealItems) {
    const itemDate = new Date(item.date)
    const key = itemDate >= todayStart && itemDate <= todayEnd
      ? format(todayStart, 'yyyy-MM-dd')
      : format(startOfDay(itemDate), 'yyyy-MM-dd')
    if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + 1)
  }

  const sortedDates = Array.from(dayMap.keys()).sort()
  const mealsPerDay = sortedDates.map((date) => {
    const [y, m, day] = date.split('-').map(Number)
    const dateObj = new Date(y, m - 1, day)
    return {
      date,
      meals: dayMap.get(date) ?? 0,
      label: format(dateObj, 'EEE'),
    }
  })

  const customersByStatus = (() => {
    const active = customerCounts.find((c) => c.status === 'ACTIVE')?._count.id ?? 0
    const disabled = customerCounts.find((c) => c.status === 'PAUSED')?._count.id ?? 0
    const inactive =
      (customerCounts.find((c) => c.status === 'INACTIVE')?._count.id ?? 0) +
      (customerCounts.find((c) => c.status === 'CANCELLED')?._count.id ?? 0)
    const result: { status: string; count: number }[] = []
    if (active > 0) result.push({ status: customerStatusLabel('ACTIVE'), count: active })
    if (inactive > 0) result.push({ status: customerStatusLabel('INACTIVE'), count: inactive })
    if (disabled > 0) result.push({ status: customerStatusLabel('PAUSED'), count: disabled })
    return result
  })()

  return { mealsPerDay, customersByStatus }
}

export default async function DashboardPage() {
  const session = await getServerSession()
  if (!session) {
    redirect('/login')
  }

  const stats = await getDashboardStats()
  const chartData = await getChartData()

  return (
    <div>
      <h1 className="text-lg lg:text-2xl font-bold text-gray-900 mb-3 lg:mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 gap-2 lg:gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded lg:rounded-lg border-l-4 border-nutrafi-primary">
          <div className="p-3 lg:p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 lg:h-6 lg:w-6 text-nutrafi-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="ml-3 lg:ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs lg:text-sm font-medium text-gray-500 truncate">Active Customers</dt>
                  <dd className="text-base lg:text-lg font-medium text-gray-900">{stats.activeCustomers}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded lg:rounded-lg border-l-4 border-nutrafi-primary-alt">
          <div className="p-3 lg:p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 lg:h-6 lg:w-6 text-nutrafi-primary-alt" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="ml-3 lg:ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs lg:text-sm font-medium text-gray-500 truncate">Total Dishes</dt>
                  <dd className="text-base lg:text-lg font-medium text-gray-900">{stats.totalDishes}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded lg:rounded-lg border-l-4 border-nutrafi-dark">
          <div className="p-3 lg:p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 lg:h-6 lg:w-6 text-nutrafi-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="ml-3 lg:ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs lg:text-sm font-medium text-gray-500 truncate">Active Meal Plans</dt>
                  <dd className="text-base lg:text-lg font-medium text-gray-900">{stats.activeMealPlans}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded lg:rounded-lg border-l-4 border-nutrafi-light">
          <div className="p-3 lg:p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 lg:h-6 lg:w-6 text-nutrafi-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3 lg:ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs lg:text-sm font-medium text-gray-500 truncate">Today&apos;s Meals</dt>
                  <dd className="text-base lg:text-lg font-medium text-gray-900">{stats.todayMeals}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DashboardCharts
        mealsPerDay={chartData.mealsPerDay}
        customersByStatus={chartData.customersByStatus}
      />
    </div>
  )
}

