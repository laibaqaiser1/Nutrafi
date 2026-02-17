'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useSession } from 'next-auth/react'
import { useState } from 'react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', roles: ['ADMIN', 'MANAGER', 'CHEF'] },
  { name: 'Menu', href: '/menu', roles: ['ADMIN', 'MANAGER'] },
  { name: 'Customers', href: '/customers', roles: ['ADMIN', 'MANAGER'] },
  { name: 'Meal Plans', href: '/meal-plans', roles: ['ADMIN', 'MANAGER', 'CHEF'] },
  { name: 'Kitchen Planning', href: '/kitchen-planning', roles: ['ADMIN', 'MANAGER', 'CHEF'] },
  { name: 'Plans', href: '/plans', roles: ['ADMIN', 'MANAGER'] },
  { name: 'Reports', href: '/reports', roles: ['ADMIN', 'MANAGER'] },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Filter navigation by user role
  const userRole = session?.user?.role as string | undefined
  
  const filteredNavigation = navigation.filter(item => {
    // If no role is available yet, show all items (will be filtered once session loads)
    if (!userRole && status === 'loading') {
      return true
    }
    // If role is available, filter by role (case-insensitive comparison)
    if (userRole) {
      const normalizedRole = userRole.toUpperCase()
      return item.roles.some(role => role.toUpperCase() === normalizedRole)
    }
    // If session loaded but no role, show only Dashboard
    return item.name === 'Dashboard'
  })

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`bg-white shadow-lg border-r border-[#e8ede0] transition-all duration-300 ${
        sidebarOpen ? 'w-64' : 'w-20'
      }`}>
        <div className="flex flex-col h-screen">
          {/* Logo */}
          <div className="flex items-center justify-between p-4 border-b border-[#e8ede0]">
            <Link href="/dashboard" className="flex items-center space-x-3">
              <Image
                src="/nutrafi_logo.png"
                alt="Nutrafi Kitchen"
                width={40}
                height={40}
                className="h-10 w-auto"
              />
              {sidebarOpen && (
                <h1 className="text-xl font-bold text-nutrafi-primary">Nutrafi Kitchen</h1>
              )}
            </Link>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 rounded-md hover:bg-gray-100 text-gray-600 hover:text-gray-900"
              aria-label="Toggle sidebar"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {sidebarOpen ? (
                  <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                ) : (
                  <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                )}
              </svg>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            <div className="px-2 space-y-1">
              {filteredNavigation.length === 0 ? (
                <div className="px-4 py-2 text-xs text-gray-500">
                  No modules available for your role
                </div>
              ) : (
                filteredNavigation.map((item) => {
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-[#f0f4e8] text-nutrafi-dark font-semibold border-l-4 border-nutrafi-primary'
                          : 'text-gray-700 hover:bg-[#f0f4e8] hover:text-nutrafi-primary'
                      }`}
                    >
                      <span className="flex-1">{item.name}</span>
                    </Link>
                  )
                })
              )}
            </div>
          </nav>

          {/* User Info & Sign Out */}
          <div className="border-t border-[#e8ede0] p-4">
            <div className="mb-3">
              {sidebarOpen && (
                <div className="text-xs text-gray-500 mb-1">
                  <div className="font-medium text-gray-700">{session?.user?.name}</div>
                  <div className="text-gray-500">{session?.user?.role}</div>
                </div>
              )}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full rounded-md bg-nutrafi-primary px-3 py-2 text-sm font-semibold text-white hover:bg-nutrafi-dark transition-colors flex items-center justify-center space-x-2"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {sidebarOpen && <span>Sign out</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar (optional, can be removed if not needed) */}
        <header className="bg-white shadow-sm border-b border-[#e8ede0] h-16 flex items-center justify-end px-6">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700 hidden md:block">
              {session?.user?.name} ({session?.user?.role})
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

