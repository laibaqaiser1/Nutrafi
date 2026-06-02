'use client'

import {
  LOCATION_ICON_OPTIONS,
  LOCATION_LABEL_PRESETS,
  defaultIconForLabel,
  locationIconEmoji,
  type LocationIconKey,
} from '@/lib/customer-location-icons'

export interface CustomerLocationDraft {
  label: string
  icon: LocationIconKey
  address: string
  deliveryArea: string
  isDefault: boolean
}

interface CustomerLocationIconPickerProps {
  value: LocationIconKey
  onChange: (icon: LocationIconKey) => void
  disabled?: boolean
}

export function CustomerLocationIconPicker({
  value,
  onChange,
  disabled,
}: CustomerLocationIconPickerProps) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1.5">Icon</p>
      <div className="flex flex-wrap gap-1.5">
        {LOCATION_ICON_OPTIONS.map((option) => {
          const selected = value === option.key
          return (
            <button
              key={option.key}
              type="button"
              disabled={disabled}
              title={option.label}
              onClick={() => onChange(option.key)}
              className={`h-9 w-9 rounded-md border text-lg leading-none flex items-center justify-center transition-colors ${
                selected
                  ? 'border-nutrafi-primary bg-nutrafi-primary/10 ring-1 ring-nutrafi-primary'
                  : 'border-gray-300 bg-white hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              {option.emoji}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface CustomerLocationFormFieldsProps {
  value: CustomerLocationDraft
  onChange: (next: CustomerLocationDraft) => void
  showDefaultToggle?: boolean
  disabled?: boolean
  idPrefix?: string
}

export function CustomerLocationFormFields({
  value,
  onChange,
  showDefaultToggle = true,
  disabled,
  idPrefix = 'loc',
}: CustomerLocationFormFieldsProps) {
  const applyPreset = (label: string, icon: LocationIconKey) => {
    onChange({ ...value, label, icon })
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-gray-600 mb-1.5">Label</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {LOCATION_LABEL_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(preset.label, preset.icon)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border ${
                value.label === preset.label
                  ? 'border-nutrafi-primary bg-nutrafi-primary/10 text-nutrafi-dark'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{locationIconEmoji(preset.icon)}</span>
              {preset.label}
            </button>
          ))}
        </div>
        <input
          id={`${idPrefix}-label`}
          type="text"
          disabled={disabled}
          placeholder="Custom label"
          value={value.label}
          onChange={(e) => {
            const label = e.target.value
            onChange({
              ...value,
              label,
              icon: value.label === label ? value.icon : defaultIconForLabel(label),
            })
          }}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
        />
      </div>

      <CustomerLocationIconPicker
        value={value.icon}
        onChange={(icon) => onChange({ ...value, icon })}
        disabled={disabled}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${idPrefix}-area`} className="block text-xs font-medium text-gray-600 mb-1">
            Delivery area
          </label>
          <input
            id={`${idPrefix}-area`}
            type="text"
            disabled={disabled}
            value={value.deliveryArea}
            onChange={(e) => onChange({ ...value, deliveryArea: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
          />
        </div>
        {showDefaultToggle && (
          <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.isDefault}
              onChange={(e) => onChange({ ...value, isDefault: e.target.checked })}
            />
            Default location
          </label>
        )}
      </div>

      <div>
        <label htmlFor={`${idPrefix}-address`} className="block text-xs font-medium text-gray-600 mb-1">
          Address
        </label>
        <textarea
          id={`${idPrefix}-address`}
          disabled={disabled}
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          rows={2}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
        />
      </div>
    </div>
  )
}

export function CustomerLocationIcon({
  iconKey,
  label,
  className,
}: {
  iconKey?: string | null
  label?: string
  className?: string
}) {
  return (
    <span className={className} aria-hidden>
      {locationIconEmoji(iconKey, label)}
    </span>
  )
}

export function emptyLocationDraft(overrides?: Partial<CustomerLocationDraft>): CustomerLocationDraft {
  return {
    label: '',
    icon: 'pin',
    address: '',
    deliveryArea: '',
    isDefault: false,
    ...overrides,
  }
}

export function homeLocationDraftFromCustomer(address: string, deliveryArea: string): CustomerLocationDraft {
  return {
    label: 'Home',
    icon: 'home',
    address,
    deliveryArea,
    isDefault: true,
  }
}
