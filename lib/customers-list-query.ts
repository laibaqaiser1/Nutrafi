import type { Prisma } from '@/lib/generated/prisma/client'

/** Shared filters for customer list and export. */
export function buildCustomerListWhere(searchParams: URLSearchParams): Prisma.CustomerWhereInput {
  const search = searchParams.get('search')
  const status = searchParams.get('status')
  const planType = searchParams.get('planType')
  const deliveryArea = searchParams.get('deliveryArea')

  const where: Prisma.CustomerWhereInput = {}

  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { deliveryArea: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (status) {
    if (status === 'INACTIVE') {
      where.status = { in: ['INACTIVE', 'CANCELLED'] }
    } else {
      where.status = status as Prisma.EnumCustomerStatusFilter['equals']
    }
  }

  if (deliveryArea) {
    where.deliveryArea = { contains: deliveryArea, mode: 'insensitive' }
  }

  if (planType) {
    where.mealPlans = {
      some: {
        status: 'ACTIVE',
        planType: planType as Prisma.EnumPlanTypeFilter['equals'],
      },
    }
  }

  return where
}
