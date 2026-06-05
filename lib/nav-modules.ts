import { PK, hasPermissionKey } from '@/lib/permission-keys'

/** Sidebar / route segments aligned with `Permission.key` (`module.*`). */
export const NAV_MODULE_DEFINITIONS = [
  { key: 'dashboard', name: 'Dashboard', href: '/dashboard', permissionKey: PK.moduleDashboard },
  { key: 'menu', name: 'Menu', href: '/menu', permissionKey: PK.moduleMenu },
  { key: 'customers', name: 'Customers', href: '/customers', permissionKey: PK.moduleCustomers },
  { key: 'whatsapp', name: 'WhatsApp', href: '/whatsapp', permissionKey: PK.moduleCustomers },
  { key: 'meal-plans', name: 'Meal Plans', href: '/meal-plans', permissionKey: PK.moduleMealPlans },
  {
    key: 'kitchen-planning',
    name: 'Kitchen Planning',
    href: '/kitchen-planning',
    permissionKey: PK.moduleKitchenPlanning,
  },
  { key: 'plans', name: 'Plans', href: '/plans', permissionKey: PK.modulePlans },
  { key: 'reports', name: 'Reports', href: '/reports', permissionKey: PK.moduleReports },
] as const

export type NavModuleKey = (typeof NAV_MODULE_DEFINITIONS)[number]['key']

export function filterNavByPermissions(permissionKeys: string[]) {
  if (permissionKeys.includes(PK.wildcard)) {
    return [...NAV_MODULE_DEFINITIONS]
  }
  const set = new Set(permissionKeys)
  return NAV_MODULE_DEFINITIONS.filter((d) => set.has(d.permissionKey))
}

/** Longest href match wins (e.g. `/meal-plans/foo` → meal-plans). */
export function permissionRequiredForPathname(pathname: string): string | null {
  let best: { permissionKey: string; len: number } | null = null
  for (const def of NAV_MODULE_DEFINITIONS) {
    if (pathname === def.href || pathname.startsWith(def.href + '/')) {
      if (!best || def.href.length > best.len) {
        best = { permissionKey: def.permissionKey, len: def.href.length }
      }
    }
  }
  return best?.permissionKey ?? null
}

export function pathnameAllowedForPermissions(pathname: string, permissionKeys: string[]): boolean {
  if (permissionKeys.length === 0) {
    return pathname === '/dashboard' || pathname.startsWith('/dashboard/')
  }
  if (permissionKeys.includes(PK.wildcard)) return true
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    return hasPermissionKey(permissionKeys, PK.moduleSettings)
  }
  const required = permissionRequiredForPathname(pathname)
  if (!required) return true
  return hasPermissionKey(permissionKeys, required)
}

export function defaultLandingPath(permissionKeys: string[]): string {
  if (permissionKeys.length === 0) return '/dashboard'
  if (permissionKeys.includes(PK.wildcard)) return '/dashboard'
  const set = new Set(permissionKeys)
  for (const def of NAV_MODULE_DEFINITIONS) {
    if (set.has(def.permissionKey)) return def.href
  }
  return '/dashboard'
}
