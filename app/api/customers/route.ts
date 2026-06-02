import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'
import { createCustomerLocation, ensureDefaultHomeLocation } from '@/lib/customer-location'
import { z } from 'zod'

const additionalLocationSchema = z.object({
  label: z.string().min(1).max(80),
  icon: z.string().optional(),
  address: z.string().min(1),
  deliveryArea: z.string().min(1),
  isDefault: z.boolean().optional(),
})

const customerSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().min(1),
  deliveryArea: z.string().min(1),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PAUSED', 'CANCELLED']).default('ACTIVE'),
  notes: z.string().optional(),
  instructions: z.string().max(4000).optional(),
  additionalLocations: z.array(additionalLocationSchema).optional(),
})

// GET - List customers with filtering
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
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
      if (status === 'INACTIVE') {
        where.status = { in: ['INACTIVE', 'CANCELLED'] }
      } else {
        where.status = status
      }
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
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = customerSchema.parse({
      ...body,
      email: body.email || undefined,
    })

    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          fullName: data.fullName,
          phone: data.phone,
          email: data.email || null,
          address: data.address,
          deliveryArea: data.deliveryArea,
          status: data.status,
          notes: data.notes,
          instructions: data.instructions?.trim() ? data.instructions.trim() : null,
        },
      })

      await ensureDefaultHomeLocation(tx, created)

      const extras = data.additionalLocations ?? []
      for (const loc of extras) {
        const label = loc.label.trim()
        if (label.toLowerCase() === 'home') continue
        await createCustomerLocation(tx, created.id, {
          label,
          icon: loc.icon,
          address: loc.address,
          deliveryArea: loc.deliveryArea,
          isDefault: loc.isDefault,
        })
      }

      return created
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

