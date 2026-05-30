'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

interface TemplateRow {
  id: number
  label: string
  planType: string
  days: number
  mealsPerDay: number
  notes: string | null
  updatedAt: string
  _count: { items: number }
}

function planTypeLabel(t: string): string {
  if (t === 'WEEKLY') return 'Weekly'
  if (t === 'MONTHLY') return 'Monthly'
  return 'Custom'
}

export default function MealPlanTemplatesListPage() {
  const router = useRouter()
  const [rows, setRows] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/meal-plan-templates', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          setRows(Array.isArray(data) ? data : [])
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-3 lg:mb-6">
        <div>
          <h1 className="text-lg lg:text-2xl font-bold text-gray-900">Default meal plans</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/meal-plans"
            className="px-3 py-1.5 lg:px-4 lg:py-2 text-sm border border-gray-300 text-gray-800 rounded hover:bg-gray-50"
          >
            Customer meal plans
          </Link>
          <Link
            href="/meal-plans/templates/new"
            className="px-3 py-1.5 lg:px-4 lg:py-2 text-sm bg-nutrafi-primary text-white rounded hover:bg-nutrafi-dark"
          >
            Add new plan
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-4 text-sm">Loading...</div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded lg:rounded-md">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-nutrafi-primary">
              <tr>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                  Label
                </th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                  Type
                </th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                  Days
                </th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                  Meals / day
                </th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                  Menu slots saved
                </th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-2 lg:px-6 py-2 lg:py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/meal-plans/templates/${row.id}`)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-2 lg:px-6 py-2 lg:py-4 font-medium text-gray-900">{row.label}</td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 text-gray-600">{planTypeLabel(row.planType)}</td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 text-gray-600">{row.days}</td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 text-gray-600">{row.mealsPerDay}</td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 text-gray-600">{row._count.items}</td>
                  <td className="px-2 lg:px-6 py-2 lg:py-4 text-gray-500 whitespace-nowrap">
                    {format(new Date(row.updatedAt), 'MMM dd, yyyy')}
                  </td>
                  <td
                    className="px-2 lg:px-6 py-2 lg:py-4 font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link
                      href={`/meal-plans/templates/${row.id}`}
                      className="text-nutrafi-primary hover:text-nutrafi-dark text-xs"
                    >
                      View / edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-500">No default plans yet.</div>
          )}
        </div>
      )}
    </div>
  )
}
