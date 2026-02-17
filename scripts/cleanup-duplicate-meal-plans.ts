import { prisma } from '../lib/prisma'
import * as dotenv from 'dotenv'

dotenv.config()

async function cleanupDuplicates() {
  try {
    console.log('Finding duplicate meal plans...\n')
    
    // Find all meal plans grouped by customer and key fields
    const allMealPlans = await prisma.mealPlan.findMany({
      include: {
        customer: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    
    // Group by customerId, planType, days, mealsPerDay, and startDate
    const grouped = new Map<string, any[]>()
    
    for (const plan of allMealPlans) {
      if (!plan.startDate) continue
      const key = `${plan.customerId}-${plan.planType}-${plan.days}-${plan.mealsPerDay}-${plan.startDate.toISOString().split('T')[0]}`
      
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(plan)
    }
    
    // Find duplicates (groups with more than 1 plan)
    // Keep the most recent one, mark others as duplicates
    const duplicates: Array<{ duplicate: any, planToKeep: any, key: string }> = []
    for (const [key, plans] of grouped.entries()) {
      if (plans.length > 1) {
        // Sort by createdAt desc to keep the most recent
        const sorted = [...plans].sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        const planToKeep = sorted[0]
        for (let i = 1; i < sorted.length; i++) {
          duplicates.push({ duplicate: sorted[i], planToKeep, key })
        }
      }
    }
    
    console.log(`Found ${duplicates.length} duplicate meal plans\n`)
    
    if (duplicates.length === 0) {
      console.log('No duplicates found!')
      return
    }
    
    // Delete duplicates (merge payments and items to the kept plan)
    let deleted = 0
    let merged = 0
    for (const { duplicate, planToKeep } of duplicates) {
      // Check if it has meal plan items or payments
      const hasItems = await prisma.mealPlanItem.count({
        where: { mealPlanId: duplicate.id }
      })
      
      const hasPayments = await prisma.payment.count({
        where: { mealPlanId: duplicate.id }
      })
      
      // Merge payments to the plan we're keeping
      if (hasPayments > 0) {
        await prisma.payment.updateMany({
          where: { mealPlanId: duplicate.id },
          data: { mealPlanId: planToKeep.id }
        })
        merged += hasPayments
        console.log(`  → Moved ${hasPayments} payment(s) from duplicate to main plan for ${duplicate.customer.fullName}`)
      }
      
      // Only delete if it has no meal plan items (items are harder to merge)
      if (hasItems === 0) {
        await prisma.mealPlan.delete({
          where: { id: duplicate.id }
        })
        deleted++
        console.log(`✓ Deleted duplicate meal plan for ${duplicate.customer.fullName} (${duplicate.planType}, ${duplicate.days} days)`)
      } else {
        console.log(`⚠ Skipping meal plan ${duplicate.id} for ${duplicate.customer.fullName} - has ${hasItems} meal plan items`)
      }
    }
    
    console.log(`\n=== Cleanup Summary ===`)
    console.log(`Found: ${duplicates.length} duplicates`)
    console.log(`Deleted: ${deleted}`)
    console.log(`Merged payments: ${merged}`)
    console.log(`Skipped: ${duplicates.length - deleted} (have meal plan items)`)
    
    // Get final count
    const finalCount = await prisma.mealPlan.count()
    console.log(`\nTotal meal plans remaining: ${finalCount}`)
    
  } catch (error: any) {
    console.error('Cleanup failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

cleanupDuplicates()

