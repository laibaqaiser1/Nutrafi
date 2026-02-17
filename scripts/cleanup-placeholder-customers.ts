import { prisma } from '../lib/prisma'
import * as dotenv from 'dotenv'

dotenv.config()

async function cleanupPlaceholders() {
  try {
    console.log('Cleaning up placeholder customers...\n')
    
    // Find and delete placeholder customers
    const placeholderCustomers = await prisma.customer.findMany({
      where: {
        OR: [
          { fullName: { equals: 'Customer Name', mode: 'insensitive' } },
          { phone: { equals: 'Contact Number', mode: 'insensitive' } },
          { address: { equals: 'Delivery Location', mode: 'insensitive' } },
          { 
            AND: [
              { fullName: { contains: 'Customer Name', mode: 'insensitive' } },
              { phone: { contains: 'Contact', mode: 'insensitive' } }
            ]
          }
        ]
      }
    })
    
    console.log(`Found ${placeholderCustomers.length} placeholder customers to delete`)
    
    for (const customer of placeholderCustomers) {
      console.log(`Deleting: ${customer.fullName} (${customer.phone})`)
      await prisma.customer.delete({
        where: { id: customer.id }
      })
    }
    
    console.log(`\n✓ Deleted ${placeholderCustomers.length} placeholder customers`)
    
    // Count remaining customers
    const totalCustomers = await prisma.customer.count()
    console.log(`\nTotal customers in database: ${totalCustomers}`)
    
  } catch (error: any) {
    console.error('Cleanup failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

cleanupPlaceholders()





