import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { normalizeLocationIcon } from '@/lib/customer-location-icons'
import { z } from 'zod'

const locationUpdateSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  icon: z.string().optional(),
  address: z.string().min(1).optional(),
  deliveryArea: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const customerId = parseIdParam((await params).id)
    const locationId = parseIdParam((await params).locationId)
    if (customerId === null || locationId === null) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const existing = await prisma.customerLocation.findFirst({
      where: { id: locationId, customerId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const data = locationUpdateSchema.parse(await request.json())

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.customerLocation.updateMany({
          where: { customerId, isDefault: true, id: { not: locationId } },
          data: { isDefault: false },
        })
      }

      return tx.customerLocation.update({
        where: { id: locationId },
        data: {
          ...(data.label !== undefined && { label: data.label.trim() }),
          ...(data.icon !== undefined && { icon: normalizeLocationIcon(data.icon, data.label ?? existing.label) }),
          ...(data.address !== undefined && { address: data.address.trim() }),
          ...(data.deliveryArea !== undefined && { deliveryArea: data.deliveryArea.trim() }),
          ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
      })
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error updating customer location:', error)
    return NextResponse.json({ error: 'Failed to update location' }, { status: 500 })
  }
}
