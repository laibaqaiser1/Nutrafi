import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const customerSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().min(1),
  deliveryArea: z.string().min(1),
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']).default('ACTIVE'),
  notes: z.string().optional(),
})

// GET - List customers with filtering
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const status = searchParams.get('status')
    const planType = searchParams.get('planType')
    const deliveryArea = searchParams.get('deliveryArea')
    const timeSlot = searchParams.get('timeSlot')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const skip = (page - 1) * limit

    const where: any = {}

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { deliveryArea: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (status) {
      where.status = status
    }

    if (deliveryArea) {
      where.deliveryArea = { contains: deliveryArea, mode: 'insensitive' }
    }

    // If planType filter is provided, filter customers by their active meal plans
    if (planType) {
      where.mealPlans = {
        some: {
          status: 'ACTIVE',
          planType: planType as any,
        },
      }
    }

    // Get total count
    const total = await prisma.customer.count({ where })

    // Get paginated customers
    const customers = await prisma.customer.findMany({
      where,
      include: {
        mealPlans: {
          where: planType 
            ? { status: 'ACTIVE', planType: planType as any }
            : { status: 'ACTIVE' },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    })

    // Log for debugging
    console.log(`Fetched ${customers.length} customers (page ${page}, total: ${total})`)

    return NextResponse.json({
      customers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching customers:', error)
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
  }
}

// POST - Create new customer
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = customerSchema.parse({
      ...body,
      email: body.email || undefined,
    })

    const customer = await prisma.customer.create({
      data: {
        ...data,
        email: data.email || null,
      },
    })

    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error creating customer:', error)
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 })
  }
}

