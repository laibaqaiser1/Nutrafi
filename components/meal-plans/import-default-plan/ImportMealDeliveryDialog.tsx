'use client'

import { useEffect, useState } from 'react'

export interface ImportMealDeliveryValues {
  deliveryType: 'delivery' | 'pickup'
  timeSlot: string
  deliveryTime: string
  location: string
}

interface ImportMealDeliveryDialogProps {
  open: boolean
  initial: ImportMealDeliveryValues
  defaultLocation?: string
  onClose: () => void
  onSave: (values: ImportMealDeliveryValues) => void
}

function timeInputFromSlot(timeSlot: string, deliveryTime?: string): string {
  if (deliveryTime) {
    const m = deliveryTime.match(/(\d{1,2}):(\d{2})/)
    if (m) return `${m[1]!.padStart(2, '0')}:${m[2]!}`
  }
  const m = timeSlot.match(/(\d{1,2}):(\d{2})/)
  if (m) return `${m[1]!.padStart(2, '0')}:${m[2]!}`
  return '12:00'
}

export function ImportMealDeliveryDialog({
  open,
  initial,
  defaultLocation,
  onClose,
  onSave,
}: ImportMealDeliveryDialogProps) {
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>(initial.deliveryType)
  const [time, setTime] = useState(timeInputFromSlot(initial.timeSlot, initial.deliveryTime))
  const [location, setLocation] = useState(initial.location || defaultLocation || '')

  useEffect(() => {
    if (!open) return
    setDeliveryType(initial.deliveryType)
    setTime(timeInputFromSlot(initial.timeSlot, initial.deliveryTime))
    setLocation(initial.location || defaultLocation || '')
  }, [open, initial, defaultLocation])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/40">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-delivery-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 id="import-delivery-title" className="text-base font-semibold text-gray-900">
            Time &amp; address
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
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Delivery type</label>
            <select
              value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value as 'delivery' | 'pickup')}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
            >
              <option value="delivery">Delivery</option>
              <option value="pickup">Pickup</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
            />
          </div>
          {deliveryType === 'delivery' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={defaultLocation || 'Delivery address'}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
            </div>
          )}
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
            onClick={() => {
              onSave({
                deliveryType,
                timeSlot: time,
                deliveryTime: `${time}:00`,
                location: deliveryType === 'delivery' ? location : '',
              })
              onClose()
            }}
            className="px-3 py-1.5 text-sm bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
