'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PK } from '@/lib/permission-keys'
import { ALL_USER_ROLES, type AllUserRole } from '@/lib/user-roles'

type PermissionRow = { id: number; key: string; name: string }

const NON_ADMIN_EXCLUDED = new Set<string>(['*', PK.moduleSettings, 'module.production'])

const ROLE_LABELS: Record<AllUserRole, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  CHEF: 'Chef',
  OPERATIONS: 'Operations',
}

function PermissionToggle({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean
  disabled?: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label}: ${on ? 'on' : 'off'}`}
      disabled={disabled}
      onClick={onToggle}
      className={`inline-flex h-7 w-12 shrink-0 items-center self-center rounded-full border-0 p-0 px-[3px] leading-none transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-nutrafi-primary focus-visible:ring-offset-2 ${
        on ? 'justify-end bg-nutrafi-primary' : 'justify-start bg-gray-200'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <span
        className="pointer-events-none size-5 shrink-0 rounded-full bg-white shadow-md"
        aria-hidden
      />
    </button>
  )
}

export default function RolePermissionsPage() {
  const [allPermissions, setAllPermissions] = useState<PermissionRow[]>([])
  const [byRole, setByRole] = useState<Record<string, number[]>>({})
  const [selectedRole, setSelectedRole] = useState<AllUserRole>('OPERATIONS')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (selectedRole === 'ADMIN') return allPermissions
    return allPermissions.filter((p) => !NON_ADMIN_EXCLUDED.has(p.key))
  }, [allPermissions, selectedRole])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/role-permissions')
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(typeof j.error === 'string' ? j.error : res.statusText)
      }
      const data = (await res.json()) as {
        allPermissions: PermissionRow[]
        byRole: Record<string, number[]>
      }
      setAllPermissions(data.allPermissions)
      setByRole(data.byRole ?? {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const ids = byRole[selectedRole] ?? []
    setSelectedIds(new Set(ids))
  }, [selectedRole, byRole])

  const toggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (selectedRole === 'ADMIN') {
        const star = allPermissions.find((p) => p.key === PK.wildcard)
        if (star && id === star.id && next.has(id)) {
          return next
        }
      }
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/role-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: selectedRole,
          permissionIds: Array.from(selectedIds),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : res.statusText)
      setMessage('Saved.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl">
      <nav className="mb-4">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm font-medium text-nutrafi-primary hover:text-nutrafi-dark"
        >
          <span aria-hidden>←</span> Settings
        </Link>
      </nav>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Role access</h1>
        <p className="mt-1 text-sm text-gray-500">
          Choose a role, adjust access below, then save. Switching role loads that role&apos;s last saved settings.
        </p>
      </div>

      <div className="mb-6">
        <label htmlFor="role-select" className="mb-2 block text-sm font-semibold text-gray-800">
          Role
        </label>
        <div className="relative max-w-xs">
          <select
            id="role-select"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as AllUserRole)}
            className="block w-full cursor-pointer appearance-none rounded-xl border border-[#d4dcc8] bg-white py-3 pl-4 pr-11 text-sm font-medium text-gray-900 shadow-sm transition hover:border-nutrafi-primary/50 focus:border-nutrafi-primary focus:outline-none focus:ring-2 focus:ring-nutrafi-primary/25"
          >
            {ALL_USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <span
            className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-500"
            aria-hidden
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500 shadow-sm">
          Loading…
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-[#e8ede0] bg-white shadow-sm">
            <div className="border-b border-[#e8ede0] bg-[#f8faf5] px-5 py-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-nutrafi-dark">Permissions</h2>
              {selectedRole === 'ADMIN' ? (
                <p className="mt-1 text-xs text-gray-500">
                  Full access stays on for Admin. Settings stays limited to admins.
                </p>
              ) : null}
            </div>
            <ul className="divide-y divide-[#e8ede0]" role="list">
              {rows.map((p) => {
                const on = selectedIds.has(p.id)
                const starLocked = selectedRole === 'ADMIN' && p.key === PK.wildcard
                return (
                  <li key={p.id}>
                    <div className="flex items-center justify-between gap-4 bg-white px-5 py-4 transition hover:bg-[#fafbf8]">
                      <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-gray-900">
                        {p.name}
                      </span>
                      <PermissionToggle
                        on={on}
                        disabled={starLocked}
                        label={p.name}
                        onToggle={() => toggle(p.id)}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-nutrafi-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-nutrafi-dark disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {message && <span className="text-sm font-medium text-green-700">{message}</span>}
            {error && <span className="text-sm font-medium text-red-600">{error}</span>}
          </div>
        </>
      )}
    </div>
  )
}
