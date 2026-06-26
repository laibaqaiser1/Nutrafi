import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  defaultLandingPath,
  pathnameAllowedForPermissions,
} from '@/lib/nav-modules'

export async function middleware(request: NextRequest) {
  const session = await auth()
  const pathname = request.nextUrl.pathname

  // Public static files (e.g. WhatsApp menu PDF) — Meta fetches without auth cookies
  if (pathname.endsWith('.pdf')) {
    return NextResponse.next()
  }

  const isAuthPage = pathname.startsWith('/login')
  const isDashboardRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/menu') ||
    pathname.startsWith('/customers') ||
    pathname.startsWith('/whatsapp') ||
    pathname.startsWith('/meal-plans') ||
    pathname.startsWith('/kitchen-planning') ||
    pathname.startsWith('/plans') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/settings')

  // Redirect authenticated users away from login page
  if (isAuthPage && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Protect dashboard routes
  if (isDashboardRoute && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && isDashboardRoute) {
    const permissionKeys = session.user?.permissionKeys ?? []
    if (!pathnameAllowedForPermissions(pathname, permissionKeys)) {
      const fallback = defaultLandingPath(permissionKeys)
      if (pathname !== fallback) {
        return NextResponse.redirect(new URL(fallback, request.url))
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/menu/:path*',
    '/customers/:path*',
    '/whatsapp/:path*',
    '/meal-plans/:path*',
    '/kitchen-planning/:path*',
    '/plans/:path*',
    '/reports/:path*',
    '/settings/:path*',
    '/login/:path*',
  ],
  runtime: 'nodejs',
}
