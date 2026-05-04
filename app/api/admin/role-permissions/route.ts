import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { sessionHasPermission, setRolePermissions } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import type { UserRole } from '@/lib/generated/prisma/client'
import { ALL_USER_ROLES } from '@/lib/user-roles'
import { z } from 'zod'

const EXCLUDED_FOR_NON_ADMIN = new Set(['*', PK.moduleSettings, 'module.production'])

const putSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'CHEF', 'OPERATIONS']),
  permissionIds: z.array(z.number().int().positive()),
})

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleSettings)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const allPermissions = await prisma.permission.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, key: true, name: true },
    })

    const bindings = await prisma.rolePermission.findMany({
      select: { role: true, permissionId: true },
    })

    const byRole: Record<string, number[]> = {}
    for (const r of ALL_USER_ROLES) {
      byRole[r] = []
    }
    for (const b of bindings) {
      const key = b.role as string
      if (!(key in byRole)) continue
      byRole[key].push(b.permissionId)
    }

    return NextResponse.json({
      allPermissions,
      byRole,
      roles: [...ALL_USER_ROLES],
    })
  } catch (e) {
    console.error('GET role-permissions:', e)
    return NextResponse.json({ error: 'Failed to load permissions' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleSettings)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = putSchema.parse(body)

    const starPerm = await prisma.permission.findUnique({
      where: { key: PK.wildcard },
      select: { id: true },
    })
    if (!starPerm) {
      return NextResponse.json({ error: 'Wildcard permission (*) missing' }, { status: 500 })
    }

    if (data.role === 'ADMIN' && !data.permissionIds.includes(starPerm.id)) {
      return NextResponse.json(
        { error: 'ADMIN must include the full-access (*) permission.' },
        { status: 400 }
      )
    }

    if (data.role !== 'ADMIN') {
      const forbidden = await prisma.permission.findMany({
        where: { key: { in: [...EXCLUDED_FOR_NON_ADMIN] } },
        select: { id: true },
      })
      const forbiddenIds = new Set(forbidden.map((p) => p.id))
      for (const id of data.permissionIds) {
        if (forbiddenIds.has(id)) {
          return NextResponse.json({ error: 'This permission cannot be assigned to that role.' }, { status: 400 })
        }
      }
    }

    const validIds = new Set(
      (await prisma.permission.findMany({ select: { id: true } })).map((p) => p.id)
    )
    for (const id of data.permissionIds) {
      if (!validIds.has(id)) {
        return NextResponse.json({ error: `Invalid permission id: ${id}` }, { status: 400 })
      }
    }

    await setRolePermissions(data.role as UserRole, data.permissionIds)

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 })
    }
    console.error('PUT role-permissions:', e)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }
}
