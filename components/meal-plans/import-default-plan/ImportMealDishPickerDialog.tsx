'use client'

import { useMemo, useState } from 'react'
import { formatCategory } from '@/lib/utils'
import type { MenuDishOption } from './import-meal-edit-helpers'

interface ImportMealDishPickerDialogProps {
  open: boolean
  dishes: MenuDishOption[]
  currentDishId?: string
  onClose: () => void
  onSelect: (dish: MenuDishOption) => void
}

export function ImportMealDishPickerDialog({
  open,
  dishes,
  currentDishId,
  onClose,
  onSelect,
}: ImportMealDishPickerDialogProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return dishes.slice(0, 20)
    return dishes
      .filter(
        (d) =>
          d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q)
      )
      .slice(0, 20)
  }, [dishes, query])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/40">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dish-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 id="import-dish-picker-title" className="text-base font-semibold text-gray-900">
            Choose dish
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-4 border-b border-gray-100">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dishes…"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            autoFocus
          />
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-sm text-gray-500 text-center">No dishes found</li>
          ) : (
            filtered.map((dish) => (
              <li key={dish.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(dish)
                    onClose()
                    setQuery('')
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                    currentDishId === dish.id ? 'bg-[#f0f4e8] text-nutrafi-dark' : ''
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900">{dish.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{formatCategory(dish.category)}</div>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
