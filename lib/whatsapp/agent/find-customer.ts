import { prisma } from '@/lib/prisma'
import { exactPhoneKeys, phonesMatchExact } from './phone-match-exact'

export interface AgentCustomerMatch {
  id: number
  fullName: string
  phone: string
  matchedKeys: string[]
}

/**
 * Match customer phone using exact canonical forms only
 * (971…, 0…, bare national digits — no partial/substring match).
 */
export async function findCustomerByPhoneExact(
  phone: string
): Promise<AgentCustomerMatch | null> {
  const trimmed = phone.trim()
  if (!trimmed) return null

  const customers = await prisma.customer.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, fullName: true, phone: true },
  })

  for (const customer of customers) {
    if (phonesMatchExact(trimmed, customer.phone)) {
      return {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        matchedKeys: [...exactMatchOverlap(trimmed, customer.phone)],
      }
    }
  }
  return null
}

function exactMatchOverlap(a: string, b: string): Set<string> {
  const ka = exactPhoneKeys(a)
  const kb = exactPhoneKeys(b)
  const overlap = new Set<string>()
  for (const k of ka) {
    if (kb.has(k)) overlap.add(k)
  }
  return overlap
}
