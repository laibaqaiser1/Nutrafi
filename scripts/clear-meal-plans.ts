import { prisma } from '../lib/prisma'
import * as dotenv from 'dotenv'

dotenv.config()

async function clearMealPlans() {
  try {
    console.log('Clearing all meal plans...\n')
    
    // Count existing meal plans
    const count = await prisma.mealPlan.count()
    console.log(`Found ${count} meal plans to delete\n`)
    
    if (count === 0) {
      console.log('No meal plans to delete.')
      return
    }
    
    // Delete all meal plans (cascade will handle meal plan items)
    // Payments will have mealPlanId set to null
    const result = await prisma.mealPlan.deleteMany({})
    
    console.log(`✓ Deleted ${result.count} meal plans`)
    
    // Update payments to remove meal plan references
    const paymentUpdate = await prisma.payment.updateMany({
      where: {
        mealPlanId: { not: null }
      },
      data: {
        mealPlanId: null
      }
    })
    
    console.log(`✓ Updated ${paymentUpdate.count} payments (removed meal plan references)`)
    
    console.log(`\n✓ All meal plans cleared successfully!`)
    console.log(`\nYou can now run: npm run db:import-meal-plans`)
    
  } catch (error: any) {
    console.error('Clear failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

clearMealPlans()






