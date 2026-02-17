import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const paymentSchema = z.object({
  customerId: z.string(),
  mealPlanId: z.string().optional(),
  planId: z.string().optional(),
  amount: z.number().min(0),
  paymentDate: z.string().transform((str) => new Date(str)).optional(),
  paymentMethod: z.string().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED']).default('PENDING'),
  notes: z.string().optional(),
})

// GET - List payments
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')
    const status = searchParams.get('status')

    const where: any = {}
    if (customerId) where.customerId = customerId
    if (status) where.status = status

    const payments = await prisma.payment.findMany({
      where,
      include: {
        customer: true,
        mealPlan: true,
        plan: true,
      },
      orderBy: { paymentDate: 'desc' },
    })

    return NextResponse.json(payments)
  } catch (error) {
    console.error('Error fetching payments:', error)
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

// POST - Create payment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = paymentSchema.parse({
      ...body,
      paymentDate: body.paymentDate || new Date().toISOString(),
    })

    const payment = await prisma.payment.create({
      data,
      include: {
        customer: true,
        mealPlan: true,
        plan: true,
      },
    })

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error creating payment:', error)
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }
}

