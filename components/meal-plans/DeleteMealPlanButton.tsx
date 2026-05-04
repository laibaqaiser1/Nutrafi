'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useNotification } from '@/components/notifications/NotificationContext'
import { PK, hasPermissionKey } from '@/lib/permission-keys'

type Props = {
  mealPlanId: string
  customerName: string
  /** e.g. header row vs danger zone */
  className?: string
}

export function DeleteMealPlanButton({ mealPlanId, customerName, className = '' }: Props) {
  const { data: session } = useSession()
  const keys = session?.user?.permissionKeys ?? []
  const canDelete = hasPermissionKey(keys, PK.moduleMealPlans)

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const toast = useNotification()

  if (!canDelete) return null

  const handleDelete = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/meal-plans/${mealPlanId}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof body.error === 'string' ? body.error : 'Failed to delete meal plan')
        return
      }
      toast.success('Meal plan deleted')
      router.push('/meal-plans')
    } catch {
      toast.error('Failed to delete meal plan')
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          'px-3 py-1.5 lg:px-4 lg:py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium'
        }
      >
        Delete plan
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-2 lg:p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" aria-hidden />
          <div
            className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-4 lg:p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="delete-meal-plan-title"
            aria-modal="true"
          >
            <h3 id="delete-meal-plan-title" className="text-lg font-semibold text-gray-900">
              Delete this meal plan?
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently remove the plan for <strong>{customerName}</strong> and all scheduled
              meals.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? 'Deleting…' : 'Delete meal plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
