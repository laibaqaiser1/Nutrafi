import { prisma } from '@/lib/prisma'
import { parseMealPlanTimeSlots } from '@/lib/meal-plan-time-slots'
import { mealPlanDateYmd } from '@/lib/meal-plan-calendar-date'

export interface AgentMealPlanContext {
  id: number
  customerId: number
  mealsPerDay: number
  timeSlots: string[]
  days: number
  totalMeals: number | null
  remainingMeals: number | null
  startDateYmd: string | null
}

export async function resolveActiveMealPlanForCustomer(
  customerId: number
): Promise<AgentMealPlanContext | null> {
  const now = new Date()
  const plan = await prisma.mealPlan.findFirst({
    where: {
      customerId,
      status: 'ACTIVE',
      OR: [{ remainingMeals: null }, { remainingMeals: { gt: 0 } }],
      AND: [
        {
          OR: [{ startDate: null }, { startDate: { lte: now } }],
        },
      ],
    },
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      customerId: true,
      mealsPerDay: true,
      timeSlots: true,
      days: true,
      totalMeals: true,
      remainingMeals: true,
      startDate: true,
    },
  })

  if (!plan) return null

  const slots = parseMealPlanTimeSlots(plan.timeSlots)
  const defaultSlots =
    slots.length > 0
      ? slots
      : Array.from({ length: Math.max(1, plan.mealsPerDay) }, (_, i) => {
          const hour = 8 + i * 5
          return `${hour.toString().padStart(2, '0')}:00`
        })

  return {
    id: plan.id,
    customerId: plan.customerId,
    mealsPerDay: plan.mealsPerDay,
    timeSlots: defaultSlots,
    days: plan.days,
    totalMeals: plan.totalMeals,
    remainingMeals: plan.remainingMeals,
    startDateYmd: plan.startDate ? mealPlanDateYmd(plan.startDate) : null,
  }
}
