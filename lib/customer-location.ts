import type { Prisma, PrismaClient } from '@/lib/generated/prisma/client'
import { normalizeLocationIcon } from '@/lib/customer-location-icons'

export const HOME_LABEL = 'Home'

export type CustomerLocationSnapshot = {
  id?: number
  label: string
  icon?: string
  address: string
  deliveryArea: string
  isDefault?: boolean
  isActive?: boolean
}

export type CustomerAddressFallback = {
  address: string
  deliveryArea: string
}

type DbClient = PrismaClient | Prisma.TransactionClient

export function pickDefaultLocationFromList(
  locations: CustomerLocationSnapshot[]
): CustomerLocationSnapshot | null {
  const active = locations.filter((l) => l.isActive !== false)
  return (
    active.find((l) => l.isDefault) ??
    active.find((l) => l.label === HOME_LABEL) ??
    active[0] ??
    null
  )
}

export function pickDefaultLocationId(locations: CustomerLocationSnapshot[]): number | null {
  return pickDefaultLocationFromList(locations)?.id ?? null
}

export async function getDefaultCustomerLocationId(
  db: DbClient,
  customerId: number
): Promise<number | null> {
  const home = await db.customerLocation.findFirst({
    where: { customerId, label: HOME_LABEL, isActive: true },
    select: { id: true },
    orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
  })
  if (home) return home.id

  const fallback = await db.customerLocation.findFirst({
    where: { customerId, isActive: true },
    select: { id: true },
    orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
  })
  return fallback?.id ?? null
}

export async function resolveCustomerLocationIdForWrite(
  db: DbClient,
  customerId: number,
  customerLocationId?: number | null
): Promise<number | null> {
  if (customerLocationId != null && customerLocationId > 0) {
    const loc = await db.customerLocation.findFirst({
      where: { id: customerLocationId, customerId, isActive: true },
      select: { id: true },
    })
    if (!loc) {
      throw new Error('INVALID_LOCATION')
    }
    return loc.id
  }
  return getDefaultCustomerLocationId(db, customerId)
}

export function resolveItemDeliveryArea(
  item: {
    isDelivered?: boolean
    deliveredLocation?: string | null
    deliveredAddress?: string | null
    customerLocation?: CustomerLocationSnapshot | null
  },
  customer: CustomerAddressFallback
): string {
  if (item.isDelivered && item.deliveredLocation?.trim()) {
    return item.deliveredLocation.trim()
  }
  if (item.customerLocation?.deliveryArea) {
    return item.customerLocation.deliveryArea
  }
  return customer.deliveryArea || ''
}

export function resolveItemDeliveryAddress(
  item: {
    isDelivered?: boolean
    deliveredLocation?: string | null
    deliveredAddress?: string | null
    customerLocation?: CustomerLocationSnapshot | null
  },
  customer: CustomerAddressFallback
): string {
  if (item.isDelivered && item.deliveredAddress?.trim()) {
    return item.deliveredAddress.trim()
  }
  if (item.customerLocation?.address) {
    return item.customerLocation.address
  }
  return customer.address || ''
}

export type MealPlanItemLocationView = {
  heading: 'Delivered location' | 'Delivery location'
  iconKey: string
  label: string | null
  area: string
  address: string
}

export function getMealPlanItemLocationView(
  item: {
    isDelivered?: boolean
    deliveryType?: string | null
    deliveredLocation?: string | null
    deliveredAddress?: string | null
    customerLocation?: CustomerLocationSnapshot | null
    customerLocationId?: number | null
  },
  customer: CustomerAddressFallback,
  locations: CustomerLocationSnapshot[] = []
): MealPlanItemLocationView | null {
  if (item.deliveryType === 'pickup') return null

  const linked =
    item.customerLocation ??
    locations.find((l) => l.id === item.customerLocationId) ??
    null

  const area = resolveItemDeliveryArea({ ...item, customerLocation: linked }, customer)
  const address = resolveItemDeliveryAddress({ ...item, customerLocation: linked }, customer)
  if (!area && !address && !linked?.label) return null

  return {
    heading: item.isDelivered ? 'Delivered location' : 'Delivery location',
    iconKey: normalizeLocationIcon(linked?.icon, linked?.label ?? ''),
    label: linked?.label ?? null,
    area,
    address,
  }
}

export type DeliverySnapshotFields = {
  deliveredLocation?: string
  deliveredAddress?: string
}

export async function deliverySnapshotsForItem(
  db: DbClient,
  itemId: number
): Promise<DeliverySnapshotFields> {
  const item = await db.mealPlanItem.findUnique({
    where: { id: itemId },
    select: {
      customerLocation: {
        select: { address: true, deliveryArea: true, label: true, icon: true },
      },
      mealPlan: {
        select: {
          customer: { select: { address: true, deliveryArea: true } },
        },
      },
    },
  })
  if (!item) return {}

  const customer = item.mealPlan.customer
  const area = resolveItemDeliveryArea(
    { isDelivered: false, customerLocation: item.customerLocation },
    customer
  )
  const address = resolveItemDeliveryAddress(
    { isDelivered: false, customerLocation: item.customerLocation },
    customer
  )

  return {
    ...(area ? { deliveredLocation: area } : {}),
    ...(address ? { deliveredAddress: address } : {}),
  }
}

export async function ensureDefaultHomeLocation(
  db: DbClient,
  customer: { id: number; address: string; deliveryArea: string }
): Promise<void> {
  const existing = await db.customerLocation.findFirst({
    where: { customerId: customer.id, label: HOME_LABEL },
    select: { id: true },
  })
  if (existing) return

  await db.customerLocation.create({
    data: {
      customerId: customer.id,
      label: HOME_LABEL,
      icon: 'home',
      address: customer.address,
      deliveryArea: customer.deliveryArea,
      isDefault: true,
      isActive: true,
    },
  })
}

export async function createCustomerLocation(
  db: DbClient,
  customerId: number,
  input: {
    label: string
    icon?: string
    address: string
    deliveryArea: string
    isDefault?: boolean
    isActive?: boolean
  }
) {
  const label = input.label.trim()
  const icon = normalizeLocationIcon(input.icon, label)
  const makeDefault = input.isDefault === true

  if (makeDefault) {
    await db.customerLocation.updateMany({
      where: { customerId, isDefault: true },
      data: { isDefault: false },
    })
  }

  const count = await db.customerLocation.count({ where: { customerId } })
  return db.customerLocation.create({
    data: {
      customerId,
      label,
      icon,
      address: input.address.trim(),
      deliveryArea: input.deliveryArea.trim(),
      isDefault: makeDefault || count === 0,
      isActive: input.isActive ?? true,
    },
  })
}

export async function syncDefaultHomeFromCustomer(
  db: DbClient,
  customer: { id: number; address: string; deliveryArea: string }
): Promise<void> {
  await db.customerLocation.updateMany({
    where: { customerId: customer.id, label: HOME_LABEL, isDefault: true },
    data: {
      address: customer.address,
      deliveryArea: customer.deliveryArea,
    },
  })
}

