'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { MealPlanHistoryList } from '@/components/meal-plans/MealPlanHistoryList'

export default function MealPlanHistoryPage() {
  const params = useParams()
  const idParam = params.id
  const mealPlanId =
    typeof idParam === 'string' ? parseInt(idParam, 10) : Array.isArray(idParam) ? parseInt(idParam[0], 10) : NaN

  const [customerName, setCustomerName] = useState<string | null>(null)

  useEffect(() => {
    if (!Number.isFinite(mealPlanId) || mealPlanId < 1) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/meal-plans/${mealPlanId}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setCustomerName(data.customer?.fullName ?? null)
        }
      } catch {
        // ignore — title still works without name
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mealPlanId])

  if (!Number.isFinite(mealPlanId) || mealPlanId < 1) {
    return (
      <div className="p-4 lg:p-6">
        <p className="text-sm text-red-600">Invalid meal plan.</p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="mb-4 lg:mb-6">
        <Link
          href={`/meal-plans/${mealPlanId}`}
          className="text-sm text-nutrafi-primary hover:underline"
        >
          ← Back to meal plan
        </Link>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 mt-2">Meal plan history</h1>
        <p className="text-sm text-gray-600 mt-1">
          {customerName ? (
            <>
              Balance &amp; schedule timeline for <strong>{customerName}</strong>
            </>
          ) : (
            'Balance & schedule timeline after each change'
          )}
        </p>
      </div>

      <MealPlanHistoryList mealPlanId={mealPlanId} />
    </div>
  )
}
