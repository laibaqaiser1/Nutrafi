import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { ALL_USER_ROLES } from '@/lib/user-roles'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { UserRole } from '@/lib/generated/prisma/client'

const createSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120).trim(),
  role: z.enum(['ADMIN', 'MANAGER', 'CHEF', 'OPERATIONS']),
})

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleSettings)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ users, roles: [...ALL_USER_ROLES] })
  } catch (e) {
    console.error('GET admin users:', e)
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleSettings)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = createSchema.parse(body)

    const hashed = await bcrypt.hash(data.password, 10)

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashed,
        name: data.name,
        role: data.role as UserRole,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    })

    return NextResponse.json(user, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 })
    }
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    console.error('POST admin users:', e)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
