import { prisma } from '../lib/prisma'
import * as dotenv from 'dotenv'

dotenv.config()

// List of customer names to keep (case-insensitive)
const ALLOWED_CUSTOMER_NAMES = [
  'dua',
  'Ahmed aldehari',
  'Juliana',
  'Ossama',
  'Fatima Media City',
  'Garry',
  'Jeboi'
]

async function cleanupCustomers() {
  try {
    console.log('Starting customer cleanup...\n')
    console.log('Keeping customers:', ALLOWED_CUSTOMER_NAMES.join(', '))
    console.log('')
    
    // Normalize names for case-insensitive comparison
    const allowedNamesLower = ALLOWED_CUSTOMER_NAMES.map(name => name.toLowerCase().trim())
    
    // Find all customers
    const allCustomers = await prisma.customer.findMany({
      select: {
        id: true,
        fullName: true,
        phone: true,
      }
    })
    
    console.log(`Total customers found: ${allCustomers.length}`)
    
    // Find customers to delete (not in allowed list)
    const customersToDelete = allCustomers.filter(customer => {
      const nameLower = customer.fullName.toLowerCase().trim()
      return !allowedNamesLower.includes(nameLower)
    })
    
    console.log(`Customers to keep: ${allCustomers.length - customersToDelete.length}`)
    console.log(`Customers to delete: ${customersToDelete.length}`)
    
    if (customersToDelete.length === 0) {
      console.log('\n✓ No customers to delete. All customers are in the allowed list.')
      return
    }
    
    // Show customers that will be deleted
    console.log('\nCustomers that will be deleted:')
    customersToDelete.forEach(customer => {
      console.log(`  - ${customer.fullName} (${customer.phone})`)
    })
    
    // Get customer IDs to delete
    const customerIdsToDelete = customersToDelete.map(c => c.id)
    
    // Count related records that will be cascade deleted
    const mealPlansCount = await prisma.mealPlan.count({
      where: {
        customerId: { in: customerIdsToDelete }
      }
    })
    
    const paymentsCount = await prisma.payment.count({
      where: {
        customerId: { in: customerIdsToDelete }
      }
    })
    
    console.log(`\nRelated records that will be deleted:`)
    console.log(`  - Meal Plans: ${mealPlansCount}`)
    console.log(`  - Payments: ${paymentsCount}`)
    
    // Confirm deletion
    console.log(`\n⚠️  WARNING: This will permanently delete ${customersToDelete.length} customers and all their related data!`)
    console.log('Proceeding with deletion...\n')
    
    // Delete customers (cascade will handle meal plans, meal plan items, and payments)
    const result = await prisma.customer.deleteMany({
      where: {
        id: { in: customerIdsToDelete }
      }
    })
    
    console.log(`✓ Deleted ${result.count} customers`)
    console.log(`✓ Cascade deleted ${mealPlansCount} meal plans and their items`)
    console.log(`✓ Cascade deleted ${paymentsCount} payments`)
    console.log(`\n✓ Cleanup completed successfully!`)
    
  } catch (error: any) {
    console.error('Cleanup failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

cleanupCustomers()





