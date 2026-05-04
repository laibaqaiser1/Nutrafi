import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const paymentSchema = z.object({
  customerId: z.union([z.string(), z.number()]).transform((v) => {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10)
    if (Number.isNaN(n) || n < 1) throw new z.ZodError([{ code: 'custom', path: ['customerId'], message: 'Invalid customer ID' }])
    return n
  }),
  mealPlanId: z.union([z.string(), z.number()]).transform((v) => {
    if (v === '' || v === null || v === undefined) return undefined
    const n = typeof v === 'number' ? v : parseInt(String(v), 10)
    return Number.isNaN(n) ? undefined : n
  }).optional(),
  planId: z.union([z.string(), z.number()]).transform((v) => {
    if (v === '' || v === null || v === undefined) return undefined
    const n = typeof v === 'number' ? v : parseInt(String(v), 10)
    return Number.isNaN(n) ? undefined : n
  }).optional(),
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
    if (customerId) {
      const cid = parseInt(customerId, 10)
      if (!Number.isNaN(cid)) where.customerId = cid
    }
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
    if (!session || !sessionHasPermission(session, PK.modulePayments)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = paymentSchema.parse({
      ...body,
      paymentDate: body.paymentDate || new Date().toISOString(),
    })

    const payment = await prisma.payment.create({
      data: {
        customerId: data.customerId,
        mealPlanId: data.mealPlanId ?? null,
        planId: data.planId ?? null,
        amount: data.amount,
        paymentDate: data.paymentDate ?? new Date(),
        paymentMethod: data.paymentMethod ?? null,
        status: data.status,
        notes: data.notes ?? null,
      },
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

