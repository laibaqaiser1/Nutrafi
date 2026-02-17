import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const session = await auth()
  const pathname = request.nextUrl.pathname

  const isAuthPage = pathname.startsWith('/login')
  const isDashboardRoute = pathname.startsWith('/dashboard') || 
                          pathname.startsWith('/menu') ||
                          pathname.startsWith('/customers') ||
                          pathname.startsWith('/meal-plans') ||
                          pathname.startsWith('/kitchen-planning') ||
                          pathname.startsWith('/plans') ||
                          pathname.startsWith('/production') ||
                          pathname.startsWith('/reports')

  // Redirect authenticated users away from login page
  if (isAuthPage && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Protect dashboard routes
  if (isDashboardRoute && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Role-based access control
  if (session && isDashboardRoute) {
    const role = (session.user as any)?.role
    const path = pathname

    // Admin-only routes
    if (path.startsWith('/users') && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Manager and Admin can access most routes
    // Chef can only access production dashboard
    if (role === 'CHEF' && !path.startsWith('/production')) {
      return NextResponse.redirect(new URL('/production', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/menu/:path*', '/customers/:path*', '/meal-plans/:path*', '/kitchen-planning/:path*', '/plans/:path*', '/production/:path*', '/reports/:path*', '/login/:path*'],
  runtime: 'nodejs',
}
