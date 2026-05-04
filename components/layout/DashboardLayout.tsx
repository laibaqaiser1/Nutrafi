'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useSession } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import { SettingsGearIcon } from '@/components/icons/SettingsGearIcon'
import { filterNavByPermissions } from '@/lib/nav-modules'
import { hasPermissionKey, PK } from '@/lib/permission-keys'

function HeaderUserMenu({
  name,
  role,
  canOpenSettings,
  pathname,
}: {
  name: string
  role?: string | null
  canOpenSettings: boolean
  pathname: string | null
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex max-w-[min(100vw-2rem,16rem)] items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-xs text-gray-800 transition hover:border-[#e8ede0] hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-nutrafi-primary focus-visible:ring-offset-1 lg:max-w-xs lg:px-3 lg:py-2 lg:text-sm"
      >
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="hidden shrink-0 text-gray-500 sm:inline">{role ? `(${role})` : ''}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 z-50 mt-1 w-52 origin-top-right rounded-xl border border-[#e8ede0] bg-white p-1.5 shadow-lg ring-1 ring-black/5"
        >
          {canOpenSettings ? (
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-[#f0f4e8] hover:text-nutrafi-dark"
            >
              <SettingsGearIcon className="h-5 w-5 shrink-0 text-nutrafi-dark" />
              Settings
            </Link>
          ) : null}
          {canOpenSettings ? <div className="mx-2 my-1 h-px bg-[#e8ede0]" role="separator" /> : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              void signOut({ callbackUrl: '/login' })
            }}
            className="flex w-full items-center gap-3 rounded-lg bg-nutrafi-primary px-3 py-2.5 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-nutrafi-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-nutrafi-primary focus-visible:ring-offset-2"
          >
            <svg
              className="h-4 w-4 shrink-0 text-white/95"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const permissionKeys = session?.user?.permissionKeys ?? []
  const filteredNavigation =
    status === 'loading' && !session ? [] : filterNavByPermissions(permissionKeys)
  const canOpenSettings = hasPermissionKey(permissionKeys, PK.moduleSettings)

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`bg-white shadow-lg border-r border-[#e8ede0] transition-all duration-300 flex-shrink-0 ${
          sidebarOpen ? 'w-52 lg:w-64' : 'w-14 lg:w-20'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-2 lg:p-4 border-b border-[#e8ede0] flex-shrink-0">
            <Link href="/dashboard" className="flex items-center space-x-2 lg:space-x-3">
              <Image
                src="/nutrafi_logo.png"
                alt="Nutrafi Kitchen"
                width={32}
                height={32}
                className="h-8 w-auto lg:h-10 lg:w-10"
              />
              {sidebarOpen && (
                <h1 className="text-base lg:text-xl font-bold text-nutrafi-primary">Nutrafi Kitchen</h1>
              )}
            </Link>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-0.5 lg:p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 rounded-md"
              aria-label="Toggle sidebar"
            >
              <svg
                className="h-5 w-5 lg:h-6 lg:w-6"
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
          <nav className="flex-1 py-2 lg:py-4 overflow-hidden">
            <div className="px-1 lg:px-2 space-y-0.5 lg:space-y-1">
              {status === 'loading' ? (
                <div className="px-2 lg:px-4 py-1 lg:py-2 text-xs text-gray-500">Loading…</div>
              ) : filteredNavigation.length === 0 ? (
                <div className="px-2 lg:px-4 py-1 lg:py-2 text-xs text-gray-500">
                  No modules available for your role
                </div>
              ) : (
                filteredNavigation.map((item) => {
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center px-2 lg:px-4 py-2 lg:py-3 text-xs lg:text-sm font-medium rounded lg:rounded-lg transition-colors ${
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

          {/* User info + settings (inline), Sign out */}
          <div className="border-t border-[#e8ede0] p-2 lg:p-4 flex-shrink-0">
            {(sidebarOpen || canOpenSettings) && (
              <div
                className={`mb-2 flex items-center gap-2 lg:mb-3 ${!sidebarOpen && canOpenSettings ? 'justify-center' : ''}`}
              >
                {sidebarOpen && (
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="truncate font-medium text-gray-900">{session?.user?.name}</div>
                    <div className="truncate text-gray-500">{session?.user?.role}</div>
                  </div>
                )}
                {canOpenSettings && (
                  <Link
                    href="/settings"
                    title="Settings"
                    aria-label="Settings"
                    className={`inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 text-nutrafi-dark transition hover:bg-[#f0f4e8] hover:text-nutrafi-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-nutrafi-primary focus-visible:ring-offset-1 ${
                      pathname === '/settings' || pathname?.startsWith('/settings/')
                        ? 'bg-[#f0f4e8] text-nutrafi-dark ring-1 ring-nutrafi-primary/30'
                        : 'text-nutrafi-dark/90'
                    }`}
                  >
                    <SettingsGearIcon className="h-5 w-5" />
                  </Link>
                )}
              </div>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full rounded lg:rounded-md bg-nutrafi-primary px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-semibold text-white hover:bg-nutrafi-dark transition-colors flex items-center justify-center space-x-1 lg:space-x-2"
            >
              <svg
                className="h-3.5 w-3.5 lg:h-4 lg:w-4"
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="relative z-10 flex h-10 flex-shrink-0 items-center justify-end border-b border-[#e8ede0] bg-white px-3 shadow-sm lg:h-16 lg:px-6">
          <div className="flex items-center gap-2 lg:gap-4">
            {status === 'loading' ? (
              <span className="text-xs text-gray-500 lg:text-sm">Loading…</span>
            ) : session?.user?.name ? (
              <HeaderUserMenu
                name={session.user.name}
                role={session.user.role}
                canOpenSettings={canOpenSettings}
                pathname={pathname}
              />
            ) : null}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="mx-auto max-w-7xl px-2 py-3 sm:px-3 lg:px-8 lg:py-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
