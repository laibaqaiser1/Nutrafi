import type { Session } from 'next-auth'
import type { UserRole } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { hasPermissionKey } from '@/lib/permission-keys'

export async function getPermissionKeysForRole(role: UserRole): Promise<string[]> {
  const rows = await prisma.rolePermission.findMany({
    where: { role },
    select: { permission: { select: { key: true } } },
  })
  return rows.map((r) => r.permission.key)
}

export function sessionHasPermission(session: Session | null, permissionKey: string): boolean {
  return hasPermissionKey(session?.user?.permissionKeys, permissionKey)
}

/** Replace all role bindings (admin settings). */
export async function setRolePermissions(role: UserRole, permissionIds: number[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { role } })
    if (permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ role, permissionId })),
      })
    }
  })
}
