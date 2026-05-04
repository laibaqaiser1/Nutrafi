'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ALL_USER_ROLES, type AllUserRole } from '@/lib/user-roles'

type UserRow = {
  id: number
  email: string
  name: string
  role: string
  createdAt: string
}

export default function SettingsUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [newUserRole, setNewUserRole] = useState<AllUserRole>('OPERATIONS')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(typeof j.error === 'string' ? j.error : res.statusText)
      }
      const data = (await res.json()) as { users: UserRow[] }
      setUsers(data.users)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim(),
          role: newUserRole,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof j.error === 'string'
            ? j.error
            : Array.isArray(j.error)
              ? j.error.map((x: { message?: string }) => x.message).filter(Boolean).join(', ')
              : res.statusText
        throw new Error(msg || 'Create failed')
      }
      setMessage('User created.')
      setEmail('')
      setPassword('')
      setName('')
      setNewUserRole('OPERATIONS')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  const patchRole = async (id: number, role: AllUserRole) => {
    setUpdatingId(id)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : res.statusText)
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)))
      setMessage('Role updated.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
      await load()
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="max-w-4xl">
      <nav className="mb-4">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm font-medium text-nutrafi-primary hover:text-nutrafi-dark"
        >
          <span aria-hidden>←</span> Settings
        </Link>
      </nav>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Users</h1>
        <p className="mt-1 text-sm text-gray-500">Create accounts and assign a role. Fine-grained access is under Role access.</p>
      </div>

      <div className="mb-10 overflow-hidden rounded-xl border border-[#e8ede0] bg-white shadow-sm">
        <div className="border-b border-[#e8ede0] bg-[#f8faf5] px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-nutrafi-dark">Add user</h2>
        </div>
        <form onSubmit={createUser} className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Name</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Role</span>
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as AllUserRole)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {ALL_USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Password (min 8 characters)</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-nutrafi-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-nutrafi-dark disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      </div>

      {message && <p className="mb-4 text-sm font-medium text-green-700">{message}</p>}
      {error && <p className="mb-4 text-sm font-medium text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-[#e8ede0] bg-white shadow-sm">
        <div className="border-b border-[#e8ede0] bg-[#f8faf5] px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-nutrafi-dark">All users</h2>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-gray-500">Loading…</p>
        ) : users.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">No users yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#e8ede0] text-sm">
              <thead className="bg-[#fafbf8]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Role</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8ede0]">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-800">{u.email}</td>
                    <td className="px-4 py-3 text-gray-900">{u.name}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={updatingId === u.id}
                        onChange={(e) => void patchRole(u.id, e.target.value as AllUserRole)}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium disabled:opacity-50"
                      >
                        {ALL_USER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
