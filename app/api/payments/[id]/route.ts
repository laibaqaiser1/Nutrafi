import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const paymentUpdateSchema = z.object({
  amount: z.number().min(0).optional(),
  paymentDate: z.string().transform((str) => new Date(str)).optional(),
  paymentMethod: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED']).optional(),
  notes: z.string().optional().nullable(),
})

// PATCH - Update a payment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid payment ID' }, { status: 400 })
    }
    const body = await request.json()
    const data = paymentUpdateSchema.parse(body)

    const payment = await prisma.payment.findUnique({
      where: { id },
    })
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.paymentDate !== undefined && { paymentDate: data.paymentDate }),
        ...(data.paymentMethod !== undefined && { paymentMethod: data.paymentMethod }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        customer: true,
        mealPlan: true,
        plan: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error updating payment:', error)
    return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
  }
}
