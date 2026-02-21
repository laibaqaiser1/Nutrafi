import { prisma } from '../lib/prisma'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const plans = [
  // Weekly Plans
  {
    name: '2 Meals/Day for 5 Days',
    planType: 'WEEKLY' as const,
    days: 5,
    mealsPerDay: 2,
    price: 280,
    description: 'Original price: 350 AED, Save 70 AED',
    isActive: true,
  },
  {
    name: '3 Meals/Day for 5 Days',
    planType: 'WEEKLY' as const,
    days: 5,
    mealsPerDay: 3,
    price: 384,
    description: 'Original price: 480 AED, Save 96 AED',
    isActive: true,
  },
  {
    name: '2 Meals/Day for 7 Days',
    planType: 'WEEKLY' as const,
    days: 7,
    mealsPerDay: 2,
    price: 392,
    description: 'Original price: 490 AED, Save 98 AED',
    isActive: true,
  },
  {
    name: '3 Meals/Day for 7 Days',
    planType: 'WEEKLY' as const,
    days: 7,
    mealsPerDay: 3,
    price: 537,
    description: 'Original price: 672 AED, Save 135 AED',
    isActive: true,
  },
  // Monthly/Extended Plans
  {
    name: '2 Meals/Day for 22 Days',
    planType: 'MONTHLY' as const,
    days: 22,
    mealsPerDay: 2,
    price: 960,
    description: 'Original price: 1199 AED, Save 239 AED',
    isActive: true,
  },
  {
    name: '3 Meals/Day for 22 Days',
    planType: 'MONTHLY' as const,
    days: 22,
    mealsPerDay: 3,
    price: 1439,
    description: 'Original price: 1799 AED, Save 360 AED',
    isActive: true,
  },
  {
    name: '2 Meals/Day for 26 Days',
    planType: 'MONTHLY' as const,
    days: 26,
    mealsPerDay: 2,
    price: 1120,
    description: 'Original price: 1400 AED, Save 280 AED',
    isActive: true,
  },
  {
    name: '3 Meals/Day for 26 Days',
    planType: 'MONTHLY' as const,
    days: 26,
    mealsPerDay: 3,
    price: 1680,
    description: 'Original price: 2100 AED, Save 420 AED',
    isActive: true,
  },
]

async function seedPlans() {
  try {
    console.log('Seeding plans...\n')

    let created = 0
    let skipped = 0

    for (const planData of plans) {
      // Check if plan already exists (by name)
      const existing = await prisma.plan.findFirst({
        where: {
          name: planData.name,
        },
      })

      if (existing) {
        console.log(`⊘ Skipping existing plan: ${planData.name}`)
        skipped++
        continue
      }

      // Create the plan
      const plan = await prisma.plan.create({
        data: planData,
      })

      console.log(`✓ Created: ${plan.name}`)
      console.log(`  Type: ${plan.planType} | Days: ${plan.days} | Meals/Day: ${plan.mealsPerDay}`)
      console.log(`  Price: ${plan.price} AED | ${plan.description}`)
      console.log('')

      created++
    }

    console.log('\n=== Seed Summary ===')
    console.log(`Created: ${created}`)
    console.log(`Skipped: ${skipped}`)
    console.log(`Total: ${plans.length}`)
  } catch (error: any) {
    console.error('Seed failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the seed
seedPlans()






