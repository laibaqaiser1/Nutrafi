import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { CustomerStatus } from '@/lib/generated/prisma/enums'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'

// POST - Pause customer subscription
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 })
    }
    const customer = await prisma.customer.update({
      where: { id },
      data: { status: CustomerStatus.PAUSED },
    })

    // Also pause active meal plans
    await prisma.mealPlan.updateMany({
      where: {
        customerId: id,
        status: 'ACTIVE',
      },
      data: { status: 'PAUSED' },
    })

    return NextResponse.json(customer)
  } catch (error) {
    console.error('Error pausing customer:', error)
    return NextResponse.json({ error: 'Failed to pause customer' }, { status: 500 })
  }
}

