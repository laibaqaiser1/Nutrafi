import AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'
import { prisma } from '../lib/prisma'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config()

interface MealPlanRow {
  customerName: string
  planType: 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
  days: number
  mealsPerDay: number
  baseAmount: number
  vatAmount: number
  totalAmount: number
  startDate: string | null
  endDate: string | null
  totalMeals: number | null
  remainingMeals: number | null
}

function getCellText(cell: any): string | null {
  if (!cell) return null
  
  if (cell['text:p']) {
    if (Array.isArray(cell['text:p'])) {
      return cell['text:p'].map((p: any) => p._ || p).join(' ')
    }
    return cell['text:p']._ || cell['text:p'] || null
  }
  
  if (cell['text:span']) {
    if (Array.isArray(cell['text:span'])) {
      return cell['text:span'].map((span: any) => span._ || span).join(' ')
    }
    return cell['text:span']._ || cell['text:span'] || null
  }
  
  return null
}

function getCellNumber(cell: any): number | null {
  if (!cell) return null
  
  const value = cell.$?.['office:value']
  if (value !== undefined) {
    return parseFloat(value)
  }
  
  return null
}

function parsePlanType(typeStr: string): 'WEEKLY' | 'MONTHLY' | 'CUSTOM' {
  const type = typeStr?.toUpperCase().trim() || ''
  if (type === 'WEEKLY') return 'WEEKLY'
  if (type === 'MONTHLY') return 'MONTHLY'
  return 'CUSTOM'
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null
  
  // Handle formats like "24-Dec-25", "6-Dec-25", "30-Dec-99"
  const parts = dateStr.trim().split('-')
  if (parts.length !== 3) return null
  
  const day = parseInt(parts[0], 10)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = monthNames.indexOf(parts[1])
  let year = parseInt(parts[2], 10)
  
  // Handle 2-digit years: 25 = 2025, 99 = 1999 (probably means 2099 or error)
  if (year < 50) {
    year = 2000 + year
  } else if (year < 100) {
    year = 1900 + year
  }
  
  if (isNaN(day) || month === -1 || isNaN(year)) return null
  
  return new Date(year, month, day)
}

async function parseMealPlansODS(filePath: string): Promise<MealPlanRow[]> {
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
  const mealPlans: MealPlanRow[] = []
  
  const spreadsheet = result['office:document-content']?.['office:body']?.[0]?.['office:spreadsheet']?.[0]
  const tables = spreadsheet?.['table:table'] || []
  
  // Helper function to get cell value at a specific column index
  function getCellAtColumn(cells: any[], columnIndex: number): { text: string | null, number: number | null } {
    let currentCol = 0
    for (const cell of cells) {
      const repeat = parseInt(cell.$?.['table:number-columns-repeated'] || '1', 10)
      
      if (columnIndex >= currentCol && columnIndex < currentCol + repeat) {
        return {
          text: getCellText(cell),
          number: getCellNumber(cell)
        }
      }
      currentCol += repeat
    }
    return { text: null, number: null }
  }
  
  // Process first table
  if (tables.length > 0) {
    const table = tables[0]
    const tableRows = table['table:table-row'] || []
    
    // Find sections: Each section starts with "Customer Name" row
    // Section structure:
    // Row 1: Customer Name
    // Row 2: Meal Plan Type
    // Row 3: Days per Plan
    // Row 4: Meals per Day
    // Row 5: Base Amount (AED)
    // Row 6: VAT (5%)
    // Row 7: Total After VAT (AED)
    // Row 8: Start Date
    // Row 9: End Date
    // Row 10: Total Meals
    // Row 11: Remaining meal plans
    
    const sections: number[] = []
    for (let i = 0; i < tableRows.length; i++) {
      const row = tableRows[i]
      const cells = row['table:table-cell'] || []
      if (cells.length > 0) {
        const firstCellText = getCellText(cells[0])
        if (firstCellText && firstCellText.toLowerCase() === 'customer name') {
          sections.push(i)
        }
      }
    }
    
    console.log(`Found ${sections.length} section(s) in the file`)
    
    // Process each section
    for (const sectionStart of sections) {
      if (sectionStart + 11 >= tableRows.length) continue
      
      const customerRow = tableRows[sectionStart]     // Customer Name
      const planTypeRow = tableRows[sectionStart + 1] // Meal Plan Type
      const daysRow = tableRows[sectionStart + 2]     // Days per Plan
      const mealsPerDayRow = tableRows[sectionStart + 3] // Meals per Day
      const baseAmountRow = tableRows[sectionStart + 4]  // Base Amount
      const vatRow = tableRows[sectionStart + 5]         // VAT
      const totalRow = tableRows[sectionStart + 6]       // Total After VAT
      const startDateRow = tableRows[sectionStart + 7]   // Start Date
      const endDateRow = tableRows[sectionStart + 8]     // End Date
      const totalMealsRow = tableRows[sectionStart + 9]   // Total Meals
      const remainingMealsRow = tableRows[sectionStart + 10] // Remaining meal plans
      
      const customerCells = customerRow['table:table-cell'] || []
      const planTypeCells = planTypeRow['table:table-cell'] || []
      const daysCells = daysRow['table:table-cell'] || []
      const mealsPerDayCells = mealsPerDayRow['table:table-cell'] || []
      const baseAmountCells = baseAmountRow['table:table-cell'] || []
      const vatCells = vatRow['table:table-cell'] || []
      const totalCells = totalRow['table:table-cell'] || []
      const startDateCells = startDateRow['table:table-cell'] || []
      const endDateCells = endDateRow['table:table-cell'] || []
      const totalMealsCells = totalMealsRow['table:table-cell'] || []
      const remainingMealsCells = remainingMealsRow['table:table-cell'] || []
      
      // Find the maximum column index
      let maxColumn = 0
      const allRows = [customerRow, planTypeRow, daysRow, mealsPerDayRow, baseAmountRow, vatRow, totalRow, startDateRow, endDateRow, totalMealsRow, remainingMealsRow]
      for (const row of allRows) {
        const cells = row['table:table-cell'] || []
        let col = 0
        for (const cell of cells) {
          const repeat = parseInt(cell.$?.['table:number-columns-repeated'] || '1', 10)
          col += repeat
        }
        maxColumn = Math.max(maxColumn, col)
      }
      
      // Process each column starting from column 1 (skip column 0 which has labels)
      for (let col = 1; col < maxColumn; col++) {
        const customerData = getCellAtColumn(customerCells, col)
        const customerName = customerData.text?.trim()
        
        // Skip if no customer name or if it's a header
        if (!customerName || customerName.toLowerCase() === 'customer name') {
          continue
        }
        
        const planTypeData = getCellAtColumn(planTypeCells, col)
        const planType = planTypeData.text?.trim() || ''
        
        const daysData = getCellAtColumn(daysCells, col)
        const days = daysData.number || parseFloat(daysData.text || '0')
        
        const mealsPerDayData = getCellAtColumn(mealsPerDayCells, col)
        const mealsPerDay = mealsPerDayData.number || parseFloat(mealsPerDayData.text || '0')
        
        const baseAmountData = getCellAtColumn(baseAmountCells, col)
        const baseAmount = baseAmountData.number || parseFloat(baseAmountData.text || '0')
        
        const vatData = getCellAtColumn(vatCells, col)
        const vatAmount = vatData.number || parseFloat(vatData.text || '0')
        
        const totalData = getCellAtColumn(totalCells, col)
        const totalAmount = totalData.number || parseFloat(totalData.text || '0')
        
        const startDateData = getCellAtColumn(startDateCells, col)
        const startDate = startDateData.text?.trim() || null
        
        const endDateData = getCellAtColumn(endDateCells, col)
        const endDate = endDateData.text?.trim() || null
        
        const totalMealsData = getCellAtColumn(totalMealsCells, col)
        const totalMeals = totalMealsData.number || parseFloat(totalMealsData.text || '0') || null
        
        const remainingMealsData = getCellAtColumn(remainingMealsCells, col)
        const remainingMeals = remainingMealsData.number || parseFloat(remainingMealsData.text || '0') || null
        
        // Only add if we have valid data
        if (customerName && days > 0 && mealsPerDay > 0 && baseAmount > 0) {
          mealPlans.push({
            customerName: customerName,
            planType: parsePlanType(planType),
            days: Math.round(days),
            mealsPerDay: Math.round(mealsPerDay),
            baseAmount: baseAmount,
            vatAmount: vatAmount,
            totalAmount: totalAmount || baseAmount + vatAmount,
            startDate: startDate,
            endDate: endDate,
            totalMeals: totalMeals && totalMeals > 0 ? Math.round(totalMeals) : null,
            remainingMeals: remainingMeals !== null && remainingMeals >= 0 ? Math.round(remainingMeals) : null,
          })
        }
      }
    }
  }
  
  return mealPlans
}

async function importMealPlans() {
  try {
    const filePath = path.join(process.cwd(), 'meal plans.ods')
    
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      process.exit(1)
    }
    
    // First, clear all existing meal plans
    console.log('Clearing all existing meal plans...')
    const deleteResult = await prisma.mealPlan.deleteMany({})
    console.log(`✓ Deleted ${deleteResult.count} existing meal plans\n`)
    
    // Update payments to remove meal plan references
    const paymentUpdate = await prisma.payment.updateMany({
      where: {
        mealPlanId: { not: null }
      },
      data: {
        mealPlanId: null
      }
    })
    console.log(`✓ Updated ${paymentUpdate.count} payments (removed meal plan references)\n`)
    
    console.log('Parsing meal plans ODS file...')
    const mealPlanRows = await parseMealPlansODS(filePath)
    console.log(`Found ${mealPlanRows.length} meal plan records\n`)
    
    let imported = 0
    let skipped = 0
    let errors = 0
    
    for (const row of mealPlanRows) {
      try {
        // Find customer by name (case-insensitive, handle variations)
        // Normalize names for better matching
        const normalizeName = (name: string) => name.toLowerCase().trim().replace(/\s+/g, ' ')
        
        const searchName = normalizeName(row.customerName)
        
        // First try exact match
        let customer = await prisma.customer.findFirst({
          where: {
            fullName: {
              equals: row.customerName,
              mode: 'insensitive'
            }
          }
        })
        
        // If not found, try partial match (contains)
        if (!customer) {
          customer = await prisma.customer.findFirst({
            where: {
              fullName: {
                contains: row.customerName,
                mode: 'insensitive'
              }
            }
          })
        }
        
        // If still not found, try reverse (customer name contains search term)
        if (!customer && row.customerName.length > 3) {
          const allCustomers = await prisma.customer.findMany({
            where: {
              fullName: {
                mode: 'insensitive'
              }
            }
          })
          
          // Try to find by partial match in reverse or normalized match
          customer = allCustomers.find(c => {
            const customerNameNorm = normalizeName(c.fullName)
            return customerNameNorm === searchName ||
                   customerNameNorm.includes(searchName) ||
                   searchName.includes(customerNameNorm) ||
                   // Handle common variations
                   (searchName.includes('souleiman') && customerNameNorm.includes('suleiman')) ||
                   (searchName.includes('umer') && customerNameNorm.includes('umar')) ||
                   (searchName.includes('ghazline') && customerNameNorm.includes('ghizlane')) ||
                   (searchName.includes('muhammad brocooli') && customerNameNorm.includes('muhammad brocolli'))
          }) || null
        }
        
        if (!customer) {
          // Create customer with just the name if not found
          // User will add remaining details later
          customer = await prisma.customer.create({
            data: {
              fullName: row.customerName,
              phone: `TEMP-${Date.now()}`, // Temporary phone, user will update
              address: 'To be updated', // Temporary address, user will update
              deliveryArea: 'To be updated', // Temporary area, user will update
              status: 'ACTIVE',
            }
          })
          console.log(`✓ Created customer "${row.customerName}" (will need to add phone, address, etc.)`)
        }
        
        // Parse dates from ODS file - leave empty if not provided
        let startDate: Date | null = null
        let endDate: Date | null = null
        
        if (row.startDate) {
          const parsedStart = parseDate(row.startDate)
          if (parsedStart) {
            startDate = parsedStart
          }
        }
        
        if (row.endDate) {
          const parsedEnd = parseDate(row.endDate)
          if (parsedEnd) {
            endDate = parsedEnd
          }
        }
        
        // If we have days but no dates, we can calculate end date from start date
        // But only if start date exists
        if (startDate && !endDate && row.days > 0) {
          endDate = new Date(startDate)
          endDate.setDate(endDate.getDate() + row.days)
        }
        
        // Use total meals from file, or calculate
        const totalMeals = row.totalMeals || (row.days * row.mealsPerDay)
        const remainingMeals = row.remainingMeals !== null ? row.remainingMeals : totalMeals
        const averageMealRate = row.totalAmount && totalMeals > 0 ? row.totalAmount / totalMeals : undefined
        
        // Since we cleared all meal plans, just create new ones
        // Create meal plan with all data from ODS file
        // Only include dates if they were provided
        const mealPlanData: any = {
          customerId: customer.id,
          planType: row.planType,
          days: row.days,
          mealsPerDay: row.mealsPerDay,
        }
        
        if (startDate) {
          mealPlanData.startDate = startDate
        }
        
        if (endDate) {
          mealPlanData.endDate = endDate
        }
        
        await prisma.mealPlan.create({
          data: {
            ...mealPlanData,
            baseAmount: row.baseAmount,
            vatAmount: row.vatAmount,
            totalAmount: row.totalAmount,
            totalMeals: totalMeals,
            remainingMeals: remainingMeals,
            averageMealRate: averageMealRate,
            timeSlots: JSON.stringify(["10:00:00 AM"]), // Default time slot
            status: 'ACTIVE',
          }
        })
        imported++
        console.log(`✓ Created meal plan for: ${customer.fullName} (${row.planType}, ${row.days} days, ${row.mealsPerDay} meals/day, ${totalMeals} total meals, ${remainingMeals} remaining)`)
      } catch (error: any) {
        console.error(`✗ Error processing "${row.customerName}":`, error.message)
        errors++
      }
    }
    
    console.log(`\n=== Import Summary ===`)
    console.log(`Created: ${imported}`)
    console.log(`Skipped: ${skipped} (customers not found)`)
    console.log(`Errors: ${errors}`)
    
    // Show final count
    const finalCount = await prisma.mealPlan.count()
    console.log(`\nTotal meal plans in database: ${finalCount}`)
    
  } catch (error: any) {
    console.error('Import failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

importMealPlans()

