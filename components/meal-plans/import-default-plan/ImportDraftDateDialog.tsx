'use client'

import { useEffect, useState } from 'react'

interface ImportDraftDateDialogProps {
  open: boolean
  initialDate: string
  onClose: () => void
  onSave: (dateYmd: string) => void
}

export function ImportDraftDateDialog({
  open,
  initialDate,
  onClose,
  onSave,
}: ImportDraftDateDialogProps) {
  const [dateYmd, setDateYmd] = useState(initialDate)

  useEffect(() => {
    if (open) setDateYmd(initialDate)
  }, [open, initialDate])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/40">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-date-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 id="import-date-title" className="text-base font-semibold text-gray-900">
            Change date
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
        <div className="p-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">Meal date</label>
          <input
            type="date"
            value={dateYmd}
            onChange={(e) => setDateYmd(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
            autoFocus
          />
        </div>
        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!dateYmd}
            onClick={() => {
              onSave(dateYmd)
              onClose()
            }}
            className="px-3 py-1.5 text-sm bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
