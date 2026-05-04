/** Stable permission keys — must match `Permission.key` in the database. */
export const PK = {
  /** Admin wildcard: grants every module / API check (see `hasPermissionKey`). */
  wildcard: '*',
  moduleDashboard: 'module.dashboard',
  moduleMenu: 'module.menu',
  moduleCustomers: 'module.customers',
  moduleMealPlans: 'module.meal-plans',
  moduleKitchenPlanning: 'module.kitchen-planning',
  modulePlans: 'module.plans',
  moduleReports: 'module.reports',
  modulePayments: 'module.payments',
  moduleSettings: 'module.settings',
} as const

export type PermissionKey = (typeof PK)[keyof typeof PK]

/** Client-safe: no Prisma. `*` matches any permission key. */
export function hasPermissionKey(
  keys: string[] | undefined | null,
  permissionKey: string
): boolean {
  if (!Array.isArray(keys) || keys.length === 0) return false
  if (keys.includes(PK.wildcard)) return true
  return keys.includes(permissionKey)
}
