import AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'
import { prisma } from '../lib/prisma'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

interface CustomerRow {
  customerId?: string
  fullName?: string
  address?: string
  phone?: string
  paymentStatus?: string
  paymentAmount?: number
  paymentDate?: string
  remainingMeals?: number
  notes?: string
}

// Parse text content from XML cell
function getCellText(cell: any): string {
  if (!cell) return ''
  
  if (typeof cell === 'string') {
    return cell.trim()
  }
  
  if (cell['text:p']) {
    if (Array.isArray(cell['text:p'])) {
      return cell['text:p'].map((p: any) => {
        if (typeof p === 'string') return p
        return p._ || p
      }).join(' ').trim()
    }
    if (typeof cell['text:p'] === 'string') {
      return cell['text:p'].trim()
    }
    return (cell['text:p']._ || cell['text:p']).trim()
  }
  
  if (cell._) {
    return cell._.trim()
  }
  
  return ''
}

// Parse numeric value from XML cell
function getCellNumber(cell: any): number | undefined {
  if (!cell) return undefined
  
  const attrs = cell.$ || {}
  const value = attrs['office:value'] || attrs.value
  if (value !== undefined && value !== null && value !== '') {
    const num = parseFloat(String(value))
    if (!isNaN(num)) {
      return num
    }
  }
  
  const text = getCellText(cell)
  if (text) {
    const num = parseFloat(text)
    return isNaN(num) ? undefined : num
  }
  
  return undefined
}

// Parse date from string (e.g., "26-Jan-26" or "7-Jan-26")
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null
  
  try {
    // Handle formats like "26-Jan-26", "7-Jan-26"
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const day = parseInt(parts[0])
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const month = monthNames.indexOf(parts[1])
      const year = 2000 + parseInt(parts[2]) // Assuming 20xx
      
      if (!isNaN(day) && month >= 0 && !isNaN(year)) {
        return new Date(year, month, day)
      }
    }
    
    // Try standard date parsing
    const date = new Date(dateStr)
    if (!isNaN(date.getTime())) {
      return date
    }
  } catch (e) {
    // Ignore parsing errors
  }
  
  return null
}

// Parse time string (e.g., "10:00:00 AM")
function parseTime(timeStr: string): string | null {
  if (!timeStr) return null
  return timeStr.trim()
}

async function parseCustomersODS(filePath: string): Promise<CustomerRow[]> {
  const zip = new AdmZip(filePath)
  const contentXml = zip.readAsText('content.xml')
  
  const parseOptions = {
    explicitArray: true,
    mergeAttrs: true,
    explicitCharkey: true,
    charkey: '_',
    attrkey: '$'
  }
  
  const result = await parseStringPromise(contentXml, parseOptions)
  const rows: CustomerRow[] = []
  
  const spreadsheet = result['office:document-content']?.['office:body']?.[0]?.['office:spreadsheet']?.[0]
  const tables = spreadsheet?.['table:table'] || []
  
    // Process first table (main customer data)
    if (tables.length > 0) {
      const table = tables[0]
      const tableRows = table['table:table-row'] || []
      
      // Skip first 2 rows (header rows)
      // Row 0: "Column 1", "Customer Name", etc.
      // Row 1: May contain placeholder data
      for (let i = 2; i < tableRows.length; i++) {
      const row = tableRows[i]
      const cells = row['table:table-cell'] || []
      
      if (cells.length === 0) continue
      
      const rowData: CustomerRow = {}
      let cellIndex = 0
      
      for (const cell of cells) {
        const repeat = parseInt(cell.$?.['table:number-columns-repeated'] || '1', 10)
        
        if (repeat > 100) {
          cellIndex += repeat
          continue
        }
        
        const text = getCellText(cell)
        const num = getCellNumber(cell)
        
        // Map columns based on structure:
        // Column 0: Customer ID/Serial
        // Column 1: Customer Name
        // Column 2: Delivery Time
        // Column 3: Delivery Location
        // Column 4: Contact Number
        // Column 5: Payment status
        // Column 6: Payment amount
        // Column 7: Payment Date
        // Column 8: Meals Remaining
        // Column 9: Remarks
        
        if (cellIndex === 0) {
          rowData.customerId = text || String(num)
        } else if (cellIndex === 1) {
          rowData.fullName = text
        } else if (cellIndex === 2) {
          // Skip deliveryTime column (moved to meal plan items)
        } else if (cellIndex === 3) {
          rowData.address = text
        } else if (cellIndex === 4) {
          rowData.phone = text || String(num)
        } else if (cellIndex === 5) {
          rowData.paymentStatus = text
        } else if (cellIndex === 6) {
          rowData.paymentAmount = num
        } else if (cellIndex === 7) {
          rowData.paymentDate = text
        } else if (cellIndex === 8) {
          rowData.remainingMeals = num
        } else if (cellIndex === 9) {
          rowData.notes = text
        }
        
        cellIndex += repeat
        if (cellIndex > 10) break
      }
      
      // Only add rows with at least a name, and skip placeholder/header rows
      if (rowData.fullName) {
        // Skip rows that look like headers or placeholders
        const nameLower = (rowData.fullName || '').toLowerCase().trim()
        const phoneLower = (rowData.phone || '').toLowerCase().trim()
        const addressLower = (rowData.address || '').toLowerCase().trim()
        
        // More comprehensive placeholder detection
        const isPlaceholder = 
          nameLower === 'customer name' ||
          nameLower === 'name' ||
          nameLower.includes('customer name') ||
          nameLower === 'column 1' ||
          nameLower === 'column1' ||
          (nameLower === 'name' && phoneLower.includes('contact')) ||
          phoneLower === 'contact number' ||
          phoneLower === 'contact' ||
          phoneLower === 'number' ||
          phoneLower.includes('contact number') ||
          addressLower === 'delivery location' ||
          addressLower === 'location' ||
          addressLower.includes('delivery location') ||
          // Check if all fields are placeholder-like
          (nameLower.length < 2 && phoneLower.length < 5 && addressLower.length < 5)
        
        if (!isPlaceholder && nameLower.length >= 2) {
          rows.push(rowData)
        } else {
          console.log(`⚠ Skipping placeholder row: "${rowData.fullName}" / "${rowData.phone}" / "${rowData.address}"`)
        }
      }
    }
  }
  
  return rows
}

async function importCustomers() {
  try {
    const filePath = path.join(process.cwd(), 'nutrafi customers.ods')
    
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      process.exit(1)
    }
    
    console.log('Parsing customer ODS file...')
    const rows = await parseCustomersODS(filePath)
    console.log(`Found ${rows.length} customer records\n`)
    
    let imported = 0
    let updated = 0
    let skipped = 0
    let errors = 0
    
    for (const row of rows) {
      try {
        // Validate required fields
        if (!row.fullName) {
          console.log(`⚠ Skipping row: Missing customer name`)
          skipped++
          continue
        }
        
        // Additional validation to skip placeholder data
        const nameLower = row.fullName.toLowerCase().trim()
        const phoneLower = (row.phone || '').toLowerCase().trim()
        const addressLower = (row.address || '').toLowerCase().trim()
        
        // Check for placeholder patterns
        const isPlaceholderName = 
          nameLower === 'customer name' ||
          nameLower === 'name' ||
          nameLower.includes('customer name') ||
          (nameLower === 'column 1' || nameLower === 'column1')
        
        const isPlaceholderPhone = 
          phoneLower === 'contact number' ||
          phoneLower === 'contact' ||
          phoneLower === 'number' ||
          phoneLower.includes('contact number')
        
        const isPlaceholderAddress = 
          addressLower === 'delivery location' ||
          addressLower === 'location' ||
          addressLower.includes('delivery location')
        
        // Skip if any field is a placeholder
        if (isPlaceholderName || isPlaceholderPhone || isPlaceholderAddress) {
          console.log(`⚠ Skipping placeholder row: "${row.fullName}" / "${row.phone}" / "${row.address}"`)
          skipped++
          continue
        }
        
        // Validate name is real (not too short, not just numbers)
        if (nameLower.length < 2 || /^\d+$/.test(nameLower)) {
          console.log(`⚠ Skipping "${row.fullName}": Invalid name`)
          skipped++
          continue
        }
        
        // Validate phone is real (not placeholder, has proper length, is numeric)
        if (!row.phone || isPlaceholderPhone || row.phone.length < 5 || !/^\d+$/.test(row.phone.replace(/\s+/g, ''))) {
          console.log(`⚠ Skipping "${row.fullName}": Invalid phone number "${row.phone}"`)
          skipped++
          continue
        }
        
        // Validate address is real
        if (!row.address || isPlaceholderAddress || addressLower.length < 5) {
          console.log(`⚠ Skipping "${row.fullName}": Invalid address "${row.address}"`)
          skipped++
          continue
        }
        
        // Extract delivery area from address (first part or use full address)
        const deliveryArea = row.address.split(',')[0].trim() || row.address.substring(0, 50)
        
        // Check if customer already exists
        // Only match if BOTH name AND phone match exactly (to avoid false matches)
        // This ensures we create new customers when data doesn't match exactly
        let customer = await prisma.customer.findFirst({
          where: {
            AND: [
              {
                fullName: {
                  equals: row.fullName,
                  mode: 'insensitive'
                }
              },
              { phone: row.phone }
            ]
          }
        })
        
        // If no exact match, create new customer (don't match by name or phone alone)
        // This prevents false matches when phone numbers are duplicates in the file
        
        // Create or update customer
        if (customer) {
          customer = await prisma.customer.update({
            where: { id: customer.id },
            data: {
              fullName: row.fullName,
              phone: row.phone, // Update phone in case it was wrong
              address: row.address,
              deliveryArea: deliveryArea,
              notes: row.notes || undefined,
            }
          })
          updated++
          console.log(`↻ Updated customer: ${customer.fullName}`)
        } else {
          customer = await prisma.customer.create({
            data: {
              fullName: row.fullName,
              phone: row.phone,
              address: row.address,
              deliveryArea: deliveryArea,
              notes: row.notes || undefined,
              status: 'ACTIVE',
            }
          })
          imported++
          console.log(`✓ Created customer: ${customer.fullName}`)
        }
        
        // Create meal plan if we have payment/meal data
        if (row.paymentAmount || row.remainingMeals !== undefined) {
          // Calculate dates (use payment date as start date, or current date)
          const startDate = row.paymentDate ? parseDate(row.paymentDate) : new Date()
          const endDate = startDate ? new Date(startDate) : new Date()
          
          // Determine meals per day and plan type based on data
          // Try to infer from remaining meals and payment amount
          let mealsPerDay = 2 // Default
          let planType: 'WEEKLY' | 'MONTHLY' | 'CUSTOM' = 'WEEKLY' // Default
          
          // If we have remaining meals, estimate meals per day
          if (row.remainingMeals !== undefined && row.remainingMeals > 0) {
            // Estimate based on common patterns:
            // - If remaining meals is large (>60), likely 3 meals/day
            // - If payment is high, might be 3 meals/day
            if (row.remainingMeals > 60 || (row.paymentAmount && row.paymentAmount > 2000)) {
              mealsPerDay = 3
            } else {
              mealsPerDay = 2
            }
          }
          
          // Calculate estimated days from remaining meals
          let estimatedDays = 30 // Default
          if (row.remainingMeals !== undefined && row.remainingMeals > 0) {
            estimatedDays = Math.ceil(row.remainingMeals / mealsPerDay)
          }
          
          // Determine plan type based on estimated days
          if (estimatedDays >= 20 && estimatedDays <= 30) {
            planType = 'MONTHLY'
          } else if (estimatedDays >= 5 && estimatedDays <= 7) {
            planType = 'WEEKLY'
          } else {
            planType = 'CUSTOM'
          }
          
          // Calculate end date
          if (row.remainingMeals !== undefined && row.remainingMeals > 0) {
            const daysToAdd = estimatedDays
            endDate.setDate(endDate.getDate() + daysToAdd)
          } else {
            // Default to 30 days if no remaining meals info
            endDate.setDate(endDate.getDate() + 30)
            estimatedDays = 30
          }
          
          // Calculate total meals
          let totalMeals = row.remainingMeals !== undefined ? row.remainingMeals : undefined
          // If we have days and meals per day, calculate total meals
          if (!totalMeals && estimatedDays && mealsPerDay) {
            totalMeals = estimatedDays * mealsPerDay
          }
          
          // Calculate VAT (5% in UAE) and base amount
          // Payment amount is total (including VAT), so calculate base
          const paymentAmount = row.paymentAmount || 0
          const totalAmount = paymentAmount > 0 ? paymentAmount : undefined
          const baseAmount = totalAmount ? totalAmount / 1.05 : undefined // Remove VAT to get base
          const vatAmount = baseAmount && totalAmount ? totalAmount - baseAmount : undefined
          
          // Calculate average meal rate if we have both total amount and total meals
          const averageMealRate = totalAmount && totalMeals && totalMeals > 0 
            ? totalAmount / totalMeals 
            : undefined
          
          // Check if meal plan already exists for this customer with same start date
          const existingMealPlan = await prisma.mealPlan.findFirst({
            where: {
              customerId: customer.id,
              startDate: startDate || new Date(),
              status: 'ACTIVE'
            }
          })
          
          if (!existingMealPlan) {
            // Create meal plan with calculated values
            const mealPlan = await prisma.mealPlan.create({
              data: {
                customerId: customer.id,
                planType: planType, // Determined from data
                startDate: startDate || new Date(),
                endDate: endDate,
                days: estimatedDays,
                mealsPerDay: mealsPerDay, // Determined from data
                baseAmount: baseAmount,
                vatAmount: vatAmount,
                totalAmount: totalAmount,
                remainingMeals: row.remainingMeals,
                totalMeals: totalMeals,
                averageMealRate: averageMealRate,
                status: 'ACTIVE',
                notes: row.notes || undefined,
              }
            })
            
            console.log(`  → Created meal plan: ${mealPlan.id} for customer ${customer.fullName}`)
            
            // Create payment record if payment info exists
            if (row.paymentAmount && row.paymentDate && row.paymentStatus === 'Done') {
              const paymentDate = parseDate(row.paymentDate) || new Date()
              
              // Check if payment already exists
              const existingPayment = await prisma.payment.findFirst({
                where: {
                  customerId: customer.id,
                  mealPlanId: mealPlan.id,
                  amount: row.paymentAmount,
                  paymentDate: paymentDate
                }
              })
              
              if (!existingPayment) {
                await prisma.payment.create({
                  data: {
                    customerId: customer.id,
                    mealPlanId: mealPlan.id,
                    amount: row.paymentAmount,
                    paymentDate: paymentDate,
                    paymentMethod: 'CASH', // Default
                    status: 'COMPLETED',
                  }
                })
                
                console.log(`  → Created payment: AED ${row.paymentAmount} for customer ${customer.fullName}`)
              } else {
                console.log(`  → Payment already exists for customer ${customer.fullName}`)
              }
            }
          } else {
            console.log(`  → Meal plan already exists for customer ${customer.fullName}`)
          }
        }
        
        console.log('')
        
      } catch (error: any) {
        console.error(`✗ Error importing ${row.fullName || 'unknown'}:`, error.message)
        if (error.code === 'P2002') {
          console.error(`  → Duplicate entry`)
        }
        errors++
      }
    }
    
    console.log('\n=== Import Summary ===')
    console.log(`Created: ${imported}`)
    console.log(`Updated: ${updated}`)
    console.log(`Skipped: ${skipped}`)
    console.log(`Errors: ${errors}`)
    
  } catch (error: any) {
    console.error('Import failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the import
importCustomers()

