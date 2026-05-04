import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { parseIdParam } from '@/lib/parse-id'
import { z } from 'zod'
import type { UserRole } from '@/lib/generated/prisma/client'

const patchSchema = z.object({
  name: z.string().min(1).max(120).trim().optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'CHEF', 'OPERATIONS']).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleSettings)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })
    }

    const body = await request.json()
    const data = patchSchema.parse(body)

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No changes' }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.role !== undefined ? { role: data.role as UserRole } : {}),
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    })

    return NextResponse.json(user)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 })
    }
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    console.error('PATCH admin user:', e)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
