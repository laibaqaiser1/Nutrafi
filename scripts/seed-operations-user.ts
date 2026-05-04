/**
 * Optional: create or update a single OPERATIONS user (e.g. operations@nutrafikitchen.com).
 * Other roles / users are not seeded here — add them later (DB, Prisma Studio, or your own scripts).
 *
 *   OPS_PASSWORD='your-secure-password' npx tsx scripts/seed-operations-user.ts
 *   OPS_EMAIL=ops@example.com OPS_PASSWORD='...' npx tsx scripts/seed-operations-user.ts
 */
import { PrismaClient } from '../lib/generated/prisma/client'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  const email = process.env.OPS_EMAIL ?? 'operations@nutrafikitchen.com'
  const password = process.env.OPS_PASSWORD
  if (!password || password.length < 8) {
    console.error('Set OPS_PASSWORD (min 8 chars), e.g. OPS_PASSWORD=... npx tsx scripts/seed-operations-user.ts')
    process.exit(1)
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      name: 'Operations',
      role: 'OPERATIONS',
    },
    create: {
      email,
      password: hashedPassword,
      name: 'Operations',
      role: 'OPERATIONS',
    },
  })

  console.log('Done:', user.email, user.role)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
