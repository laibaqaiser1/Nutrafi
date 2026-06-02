'use client'

import { useCallback, useEffect, useState } from 'react'
import { useNotification } from '@/components/notifications/NotificationContext'
import {
  CustomerLocationFormFields,
  CustomerLocationIcon,
  emptyLocationDraft,
  type CustomerLocationDraft,
} from '@/components/customers/CustomerLocationFormFields'
import type { LocationIconKey } from '@/lib/customer-location-icons'
import { HOME_LABEL } from '@/lib/customer-location'

export interface CustomerLocationRow extends CustomerLocationDraft {
  id: number
  isActive: boolean
}

interface CustomerLocationsPanelProps {
  customerId: number
  canEdit?: boolean
  /** Hide the default Home row — use when Home is edited elsewhere on the form */
  excludeHome?: boolean
  title?: string
  description?: string
}

function rowToDraft(loc: CustomerLocationRow): CustomerLocationDraft {
  return {
    label: loc.label,
    icon: (loc.icon || 'pin') as LocationIconKey,
    address: loc.address,
    deliveryArea: loc.deliveryArea,
    isDefault: loc.isDefault,
  }
}

export function CustomerLocationsPanel({
  customerId,
  canEdit = true,
  excludeHome = false,
  title = 'Delivery locations',
  description,
}: CustomerLocationsPanelProps) {
  const toast = useNotification()
  const [locations, setLocations] = useState<CustomerLocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CustomerLocationDraft>(emptyLocationDraft())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<CustomerLocationDraft>(emptyLocationDraft())

  const loadLocations = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/locations`)
      if (res.ok) {
        setLocations(await res.json())
      }
    } catch {
      toast.error('Failed to load locations')
    } finally {
      setLoading(false)
    }
  }, [customerId, toast])

  useEffect(() => {
    void loadLocations()
  }, [loadLocations])

  const visibleLocations = excludeHome
    ? locations.filter((loc) => loc.label !== HOME_LABEL)
    : locations

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.label.trim() || !form.address.trim() || !form.deliveryArea.trim()) {
      toast.warning('Label, address, and delivery area are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success('Location added')
        setForm(emptyLocationDraft())
        setShowForm(false)
        await loadLocations()
      } else {
        const err = await res.json()
        toast.error(err?.error || 'Failed to add location')
      }
    } catch {
      toast.error('Failed to add location')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (locationId: number) => {
    if (!editForm.label.trim() || !editForm.address.trim() || !editForm.deliveryArea.trim()) {
      toast.warning('Label, address, and delivery area are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/locations/${locationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editForm.label.trim(),
          icon: editForm.icon,
          address: editForm.address.trim(),
          deliveryArea: editForm.deliveryArea.trim(),
          isDefault: editForm.isDefault,
        }),
      })
      if (res.ok) {
        toast.success('Location updated')
        setEditingId(null)
        await loadLocations()
      } else {
        const err = await res.json()
        toast.error(err?.error || 'Failed to update location')
      }
    } catch {
      toast.error('Failed to update location')
    } finally {
      setSaving(false)
    }
  }

  const setAsDefault = async (locationId: number) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/locations/${locationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      if (res.ok) {
        toast.success('Default location updated')
        await loadLocations()
      } else {
        toast.error('Failed to update default location')
      }
    } catch {
      toast.error('Failed to update default location')
    } finally {
      setSaving(false)
    }
  }

  const deactivateLocation = async (locationId: number) => {
    if (!confirm('Deactivate this location? It will no longer appear when assigning meals.')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/locations/${locationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      })
      if (res.ok) {
        toast.success('Location deactivated')
        setEditingId(null)
        await loadLocations()
      } else {
        toast.error('Failed to deactivate location')
      }
    } catch {
      toast.error('Failed to deactivate location')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded p-3">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {description ? <p className="text-xs text-gray-500 mt-0.5">{description}</p> : null}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v)
              if (showForm) setForm(emptyLocationDraft())
              setEditingId(null)
            }}
            className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
          >
            {showForm ? 'Cancel' : 'Add location'}
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <form onSubmit={handleCreate} className="mb-4 p-3 bg-gray-50 rounded border border-gray-200 space-y-3">
          <CustomerLocationFormFields value={form} onChange={setForm} idPrefix="panel-loc-new" />
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-nutrafi-primary text-white rounded hover:bg-nutrafi-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save location'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading locations…</p>
      ) : visibleLocations.length === 0 ? (
        <p className="text-sm text-gray-500">No locations yet.</p>
      ) : (
        <ul className="space-y-3">
          {visibleLocations.map((loc) => {
            const isEditing = editingId === loc.id
            return (
              <li key={loc.id} className="p-3 border border-gray-200 rounded text-sm">
                {isEditing && canEdit ? (
                  <div className="space-y-3">
                    <CustomerLocationFormFields
                      value={editForm}
                      onChange={setEditForm}
                      idPrefix={`panel-loc-edit-${loc.id}`}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleUpdate(loc.id)}
                        className="px-3 py-1.5 text-sm bg-nutrafi-primary text-white rounded hover:bg-nutrafi-dark disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <CustomerLocationIcon iconKey={loc.icon} label={loc.label} className="text-lg" />
                      <span className="font-medium text-gray-900">{loc.label}</span>
                      {loc.isDefault && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[#f0f4e8] text-nutrafi-dark">Default</span>
                      )}
                      {!loc.isActive && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Inactive</span>
                      )}
                      {canEdit && (
                        <div className="flex items-center gap-2 ml-auto">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => {
                              setEditingId(loc.id)
                              setEditForm(rowToDraft(loc))
                              setShowForm(false)
                            }}
                            className="text-xs text-nutrafi-primary hover:underline"
                          >
                            Edit
                          </button>
                          {!loc.isDefault && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void setAsDefault(loc.id)}
                              className="text-xs text-gray-600 hover:underline"
                            >
                              Set default
                            </button>
                          )}
                          {loc.isActive && loc.label !== HOME_LABEL && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void deactivateLocation(loc.id)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-gray-600">{loc.deliveryArea}</p>
                    <p className="text-gray-700 whitespace-pre-wrap mt-1">{loc.address}</p>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
