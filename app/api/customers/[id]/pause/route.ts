import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// POST - Pause customer subscription
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const customer = await prisma.customer.update({
      where: { id },
      data: { status: 'PAUSED' },
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

