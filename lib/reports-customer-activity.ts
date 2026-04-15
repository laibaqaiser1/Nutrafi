import { endOfDay, format, startOfDay } from 'date-fns'
import { prisma } from '@/lib/prisma'

export type CustomerActivityReportRow = {
  customerId: number
  fullName: string
  phone: string
  /** Earliest `startDate` among meal plans that qualify (all lie in the report range), ISO date */
  mealPlanStartDate: string | null
  /** Same, formatted e.g. `8 April 2026` */
  mealPlanStartDateDisplay: string | null
  /** Meal plans whose `startDate` is in the report range */
  mealPlanCount: number
  /** Sum of completed meal-plan payments for those plans (any payment date) */
  paymentAmountCompleted: number
  /** Formatted total (same as `paymentAmountCompleted`) */
  paymentCompletedDisplay: string
  /** `Completed` | `Pending` | `Mixed` | `—` from those payments */
  paymentStatusSummary: string
  /** Sum of pending meal-plan payments for those plans (any payment date) */
  paymentPendingAmount: number
  /** Formatted total (same as `paymentPendingAmount`) */
  paymentPendingDisplay: string
  /** Sum of all meal-plan payment amounts for those plans (any status, any payment date) */
  paymentTotalAmount: number
  /** Formatted total (same as `paymentTotalAmount`) */
  paymentTotalDisplay: string
  /** Sum of `totalMeals` for qualifying plans; falls back to in-window slots if null */
  totalMeals: number
  /** Delivered non-skipped meals with `date` in range, on qualifying plans only */
  mealsDelivered: number
}

type Acc = {
  mealPlanIds: Set<number>
  completedSum: number
  pendingSum: number
  /** All linked payment amounts regardless of status */
  paymentTotalSum: number
  mealsDelivered: number
}

function emptyAcc(): Acc {
  return {
    mealPlanIds: new Set(),
    completedSum: 0,
    pendingSum: 0,
    paymentTotalSum: 0,
    mealsDelivered: 0,
  }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function fmtAed(n: number): string {
  return roundMoney(n).toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function aggregatePaymentStatus(completed: number, pending: number): string {
  const c = completed > 0.0005
  const p = pending > 0.0005
  if (c && p) return 'Mixed'
  if (p) return 'Pending'
  if (c) return 'Completed'
  return '—'
}

/**
 * Customers who have at least one meal plan whose **startDate** lies in [from, to] (calendar days).
 * Payments: all meal-plan-linked rows for those plans (**paymentDate** ignored).
 * Delivered / slot fallback: meal items whose **date** is in that same range, on those plans only.
 */
export async function getCustomerActivityReport(from: Date, to: Date): Promise<CustomerActivityReportRow[]> {
  const fromDay = new Date(from)
  fromDay.setHours(0, 0, 0, 0)
  const toDay = new Date(to)
  toDay.setHours(23, 59, 59, 999)
  const reportRangeStart = startOfDay(fromDay)
  const reportRangeEnd = endOfDay(toDay)

  const qualifyingPlans = await prisma.mealPlan.findMany({
    where: {
      startDate: {
        gte: reportRangeStart,
        lte: reportRangeEnd,
      },
    },
    select: { id: true, customerId: true, startDate: true, totalMeals: true },
  })

  if (qualifyingPlans.length === 0) return []

  const planIdsQualifying = qualifyingPlans.map((p) => p.id)
  const planById = new Map(qualifyingPlans.map((p) => [p.id, p]))

  const byCustomer = new Map<number, Acc>()
  const ensure = (customerId: number): Acc => {
    let a = byCustomer.get(customerId)
    if (!a) {
      a = emptyAcc()
      byCustomer.set(customerId, a)
    }
    return a
  }

  for (const plan of qualifyingPlans) {
    const a = ensure(plan.customerId)
    a.mealPlanIds.add(plan.id)
  }

  const payments = await prisma.payment.findMany({
    where: { mealPlanId: { in: planIdsQualifying } },
    select: {
      customerId: true,
      mealPlanId: true,
      amount: true,
      status: true,
      mealPlan: { select: { customerId: true } },
    },
  })

  for (const p of payments) {
    const planId = p.mealPlanId!
    if (!planById.has(planId) || !p.mealPlan) continue
    const ownerId = p.mealPlan.customerId
    const a = ensure(ownerId)
    a.paymentTotalSum += p.amount
    const st = (p.status || 'UNKNOWN').toUpperCase()
    if (st === 'COMPLETED') {
      a.completedSum += p.amount
    } else if (st === 'PENDING') {
      a.pendingSum += p.amount
    }
  }

  const items = await prisma.mealPlanItem.findMany({
    where: {
      mealPlanId: { in: planIdsQualifying },
      date: { gte: fromDay, lte: toDay },
    },
    select: {
      isSkipped: true,
      isDelivered: true,
      mealPlanId: true,
      mealPlan: { select: { customerId: true } },
    },
  })

  for (const it of items) {
    const a = ensure(it.mealPlan.customerId)
    if (!it.isSkipped && it.isDelivered) a.mealsDelivered += 1
  }

  const ids = [...byCustomer.keys()]
  if (ids.length === 0) return []

  const slotsInPeriodForPlan = (mealPlanId: number, customerId: number) =>
    items.filter(
      (it) =>
        it.mealPlanId === mealPlanId && it.mealPlan.customerId === customerId && !it.isSkipped
    ).length

  const customers = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, phone: true },
    orderBy: { fullName: 'asc' },
  })

  return customers.map((c) => {
    const a = byCustomer.get(c.id)!
    let totalContractMeals = 0
    const starts: Date[] = []

    for (const pid of a.mealPlanIds) {
      const plan = planById.get(pid)
      if (!plan || plan.customerId !== c.id) continue
      if (plan.startDate) starts.push(startOfDay(new Date(plan.startDate)))
      if (plan.totalMeals != null && Number.isFinite(plan.totalMeals)) {
        totalContractMeals += plan.totalMeals
      } else {
        totalContractMeals += slotsInPeriodForPlan(pid, c.id)
      }
    }

    const earliestStart =
      starts.length > 0 ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null

    const completed = roundMoney(a.completedSum)
    const pending = roundMoney(a.pendingSum)
    const totalPay = roundMoney(a.paymentTotalSum)

    return {
      customerId: c.id,
      fullName: c.fullName,
      phone: c.phone,
      mealPlanStartDate: earliestStart ? format(earliestStart, 'yyyy-MM-dd') : null,
      mealPlanStartDateDisplay: earliestStart ? format(earliestStart, 'd MMMM yyyy') : null,
      mealPlanCount: a.mealPlanIds.size,
      paymentAmountCompleted: completed,
      paymentCompletedDisplay: fmtAed(completed),
      paymentStatusSummary: aggregatePaymentStatus(completed, pending),
      paymentPendingAmount: pending,
      paymentPendingDisplay: fmtAed(pending),
      paymentTotalAmount: totalPay,
      paymentTotalDisplay: fmtAed(totalPay),
      totalMeals: totalContractMeals,
      mealsDelivered: a.mealsDelivered,
    }
  })
}
