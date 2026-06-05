import { prisma } from '@/lib/prisma'
import { digitsOnlyPhone, normalizeWhatsAppPhone, phoneMatchVariants } from './normalize-phone'

export async function findCustomerByWhatsAppPhone(phone: string) {
  const variants = phoneMatchVariants(phone)
  if (variants.length === 0) return null

  const customers = await prisma.customer.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, fullName: true, phone: true },
  })

  const variantSet = new Set(variants)
  for (const c of customers) {
    const stored = digitsOnlyPhone(c.phone)
    const storedNorm = normalizeWhatsAppPhone(c.phone)
    if (variantSet.has(stored) || variantSet.has(storedNorm)) {
      return c
    }
  }
  return null
}
