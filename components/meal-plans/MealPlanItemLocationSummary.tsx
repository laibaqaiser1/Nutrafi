'use client'

import { getMealPlanItemLocationView, type CustomerLocationSnapshot } from '@/lib/customer-location'
import { locationIconEmoji } from '@/lib/customer-location-icons'

type MealPlanItemLocationSummaryProps = {
  item: {
    isDelivered?: boolean
    deliveryType?: string | null
    deliveredLocation?: string | null
    deliveredAddress?: string | null
    customerLocationId?: number | null
    customerLocation?: CustomerLocationSnapshot | null
  }
  customer: { address: string; deliveryArea: string }
  locations?: CustomerLocationSnapshot[]
  compact?: boolean
}

export function MealPlanItemLocationSummary({
  item,
  customer,
  locations = [],
  compact = false,
}: MealPlanItemLocationSummaryProps) {
  const view = getMealPlanItemLocationView(item, customer, locations)
  if (!view) return null

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-600" title={`${view.area}${view.address ? ` — ${view.address}` : ''}`}>
        <span>{locationIconEmoji(view.iconKey, view.label ?? undefined)}</span>
        <span className="truncate max-w-[140px]">{view.area || view.label || '—'}</span>
      </span>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-500">{view.heading}</p>
        <p className="text-sm text-gray-900">
          {locationIconEmoji(view.iconKey, view.label ?? undefined)}
          {view.label ? ` ${view.label}` : ''}
        </p>
        {view.area ? <p className="text-sm text-gray-600">{view.area}</p> : null}
      </div>
      {view.address ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500">
            {item.isDelivered ? 'Delivered address' : 'Delivery address'}
          </p>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{view.address}</p>
        </div>
      ) : null}
    </div>
  )
}
