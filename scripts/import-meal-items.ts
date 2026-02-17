import AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'
import { prisma } from '../lib/prisma'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config()

interface MealItemRow {
  day?: string
  dishName: string
  ingredients?: string
  allergens?: string
  calories?: number
  protein?: number
  carbs?: number
  fats?: number
  instructions?: string
  rowIndex?: number // Track row position for time slot assignment
}

function getCellText(cell: any): string | null {
  if (!cell) return null
  
  if (cell['text:p']) {
    if (Array.isArray(cell['text:p'])) {
      return cell['text:p'].map((p: any) => p._ || p).join(' ').trim()
    }
    return (cell['text:p']._ || cell['text:p'] || '').trim()
  }
  
  if (cell['text:span']) {
    if (Array.isArray(cell['text:span'])) {
      return cell['text:span'].map((span: any) => span._ || span).join(' ').trim()
    }
    return (cell['text:span']._ || cell['text:span'] || '').trim()
  }
  
  return null
}

function getCellNumber(cell: any): number | null {
  if (!cell) return null
  
  const value = cell.$?.['office:value']
  if (value !== undefined) {
    return parseFloat(value)
  }
  
  // Try to parse text as number
  const text = getCellText(cell)
  if (text) {
    const num = parseFloat(text)
    if (!isNaN(num)) return num
  }
  
  return null
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null
  
  // Handle various date formats
  const date = new Date(dateStr)
  if (!isNaN(date.getTime())) {
    return date
  }
  
  // Handle formats like "24-Dec-25", "6-Dec-25"
  const parts = dateStr.trim().split('-')
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = monthNames.indexOf(parts[1])
    let year = parseInt(parts[2], 10)
    
    if (year < 50) {
      year = 2000 + year
    } else if (year < 100) {
      year = 1900 + year
    }
    
    if (!isNaN(day) && month !== -1 && !isNaN(year)) {
      return new Date(year, month, day)
    }
  }
  
  return null
}

async function parseMealItemsODS(filePath: string): Promise<MealItemRow[]> {
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
  const mealItems: MealItemRow[] = []
  
  const spreadsheet = result['office:document-content']?.['office:body']?.[0]?.['office:spreadsheet']?.[0]
  const table = spreadsheet?.['table:table']?.[0]
  const tableRows = table?.['table:table-row'] || []
  
  // Skip header row (first row) - look for row with "DAY" in first column
  let headerRowIndex = 0
  for (let i = 0; i < Math.min(5, tableRows.length); i++) {
    const row = tableRows[i]
    const cells = row['table:table-cell'] || []
    if (cells.length > 0) {
      const firstCellText = getCellText(cells[0])
      if (firstCellText && firstCellText.toUpperCase().includes('DAY')) {
        headerRowIndex = i
        break
      }
    }
  }
  
  // Start parsing from row after header
  for (let i = headerRowIndex + 1; i < tableRows.length; i++) {
    const row = tableRows[i]
    
    // Skip rows with number-rows-repeated (empty rows)
    if (row.$?.['table:number-rows-repeated']) {
      continue
    }
    
    const cells = row['table:table-cell'] || []
    
    // Skip empty rows
    if (cells.length === 0) continue
    
    let cellIndex = 0
    const rowData: Partial<MealItemRow> = {}
    
    for (const cell of cells) {
      const repeat = parseInt(cell.$?.['table:number-columns-repeated'] || '1', 10)
      
      // Skip very large repeats (empty cells)
      if (repeat > 100) {
        cellIndex += repeat
        continue
      }
      
      const text = getCellText(cell)
      const number = getCellNumber(cell)
      
      // Map columns based on actual structure:
      // Column 0: DAY
      // Column 1: Item (Dish Name)
      // Column 2: Ingredients
      // Column 3: Allergens
      // Column 4: Calories (Kcal)
      // Column 5: Protein (Gms)
      // Column 6: Carbs (Gms)
      // Column 7: Fats (Gms)
      // Column 8: Instructions
      
      // Handle DAY column - can be empty for continuation rows
      if (cellIndex === 0) {
        if (text && text.toUpperCase() !== 'TOTAL') {
          // Check if this looks like a day name or a dish name
          const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
          const textLower = text.toLowerCase()
          if (dayNames.includes(textLower)) {
            rowData.day = text
          } else {
            // If not a day name, this might be the dish name (when DAY column is empty)
            // Check if it looks like a dish name (not ingredients)
            const looksLikeIngredients = textLower.includes(',') && 
                                        (textLower.includes('chicken breast') || textLower.length > 50)
            if (!looksLikeIngredients && !rowData.dishName) {
              rowData.dishName = text
            }
          }
        }
        // If DAY is empty, we'll use the previous day when grouping
      } else if (cellIndex === 1 && text) {
        // Dish name column
        const textLower = text.toLowerCase()
        // Check if this looks like ingredients (has commas and ingredient keywords)
        const looksLikeIngredients = textLower.includes(',') && 
                                    (textLower.includes('chicken breast') || 
                                     textLower.includes('whole wheat') ||
                                     textLower.includes('shrimp') ||
                                     textLower.length > 50)
        
        if (!looksLikeIngredients) {
          // This is a valid dish name
          if (!rowData.dishName) {
            rowData.dishName = text
          }
        } else {
          // This is ingredients, store it
          if (!rowData.ingredients) {
            rowData.ingredients = text
          }
        }
      } else if (cellIndex === 2 && text) {
        // Ingredients column
        if (!rowData.ingredients) {
          rowData.ingredients = text
        }
        // If we still don't have a dish name, check if this could be it
        if (!rowData.dishName && !text.includes(',')) {
          rowData.dishName = text
        }
      } else if (cellIndex === 3 && text) {
        rowData.allergens = text
      } else if (cellIndex === 4 && number !== null) {
        rowData.calories = Math.round(number)
      } else if (cellIndex === 5 && number !== null) {
        rowData.protein = number
      } else if (cellIndex === 6 && number !== null) {
        rowData.carbs = number
      } else if (cellIndex === 7 && number !== null) {
        rowData.fats = number
      } else if (cellIndex === 8 && text) {
        rowData.instructions = text
      }
      
      // If we have calories but no dish name yet, and column 1 text looks like ingredients,
      // try to find dish name in a different way or use ingredients as fallback
      if (cellIndex >= 4 && rowData.calories && !rowData.dishName && text && cellIndex === 1) {
        // This is a fallback - if we have calories but dish name column has ingredients,
        // the structure might be different. For now, we'll need to handle this in validation.
      }
      
      cellIndex += repeat
      
      // Stop if we've processed enough columns
      if (cellIndex > 15) break
    }
    
    // Only add rows that have at least a dish name and valid data
    // Skip: TOTAL rows, header rows, note/disclaimer rows, and rows that look like ingredients
    const dishNameUpper = rowData.dishName?.toUpperCase() || ''
    const dishNameLower = rowData.dishName?.toLowerCase() || ''
    
    // Check if this is a valid meal item row
    // Skip TOTAL rows - they have numeric dish names matching total calories (> 1000)
    const isTotalRow = rowData.dishName && /^\d+$/.test(rowData.dishName.trim()) && 
                      parseInt(rowData.dishName.trim()) > 1000
    
    const isValidDishName = rowData.dishName && 
        rowData.dishName.length > 2 &&
        !isTotalRow &&
        dishNameUpper !== 'TOTAL' &&
        dishNameUpper !== 'ITEM' &&
        !dishNameUpper.includes('CALORIES AND MACRO') &&
        !dishNameUpper.includes('ALLERGEN INFORMATION') &&
        !dishNameUpper.includes('NOTE') &&
        !dishNameLower.match(/^(chicken breast|shrimp|beef|salmon),/) && // Skip ingredient lists
        !dishNameLower.includes('calories and macro') // Additional check
    
    // Must have calories to be a valid meal item (check in column 4)
    const hasCalories = rowData.calories !== undefined && rowData.calories > 0
    
    if (isValidDishName && hasCalories) {
      rowData.rowIndex = i
      mealItems.push(rowData as MealItemRow)
      console.log(`  Parsed row ${i}: ${rowData.dishName} (Day: ${rowData.day || 'empty'}, Calories: ${rowData.calories})`)
    } else if (rowData.dishName) {
      console.log(`  Skipped row ${i}: "${rowData.dishName}" - isValid: ${isValidDishName}, hasCalories: ${hasCalories}, calories: ${rowData.calories}`)
    }
  }
  
  return mealItems
}

async function importMealItems() {
  try {
    const filePath = path.join(process.cwd(), 'dua meal item.ods')
    
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      process.exit(1)
    }
    
    console.log('Parsing meal items ODS file...')
    const mealItems = await parseMealItemsODS(filePath)
    console.log(`Found ${mealItems.length} meal item records\n`)
    
    // Find customer "dua" (case-insensitive)
    const customer = await prisma.customer.findFirst({
      where: {
        fullName: {
          contains: 'dua',
          mode: 'insensitive'
        }
      }
    })
    
    if (!customer) {
      console.error('Customer "dua" not found. Please create the customer first.')
      console.log('\nAvailable customers:')
      const allCustomers = await prisma.customer.findMany({
        select: { fullName: true },
        take: 20
      })
      allCustomers.forEach(c => console.log(`  - ${c.fullName}`))
      process.exit(1)
    }
    
    console.log(`Found customer: ${customer.fullName} (${customer.id})\n`)
    
    // Find active meal plan for this customer
    let mealPlan = await prisma.mealPlan.findFirst({
      where: {
        customerId: customer.id,
        status: 'ACTIVE'
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    
    if (!mealPlan) {
      console.log('No active meal plan found. Creating a new meal plan...')
      // Create a basic meal plan
      mealPlan = await prisma.mealPlan.create({
        data: {
          customerId: customer.id,
          planType: 'CUSTOM',
          startDate: new Date(),
          endDate: new Date(),
          days: 1,
          mealsPerDay: 3,
          status: 'ACTIVE',
        }
      })
      console.log(`Created meal plan: ${mealPlan.id}\n`)
    } else {
      console.log(`Using existing meal plan: ${mealPlan.id}\n`)
    }
    
    // Group items by day - track current day as we iterate
    const itemsByDay: Array<{ day: string; items: MealItemRow[] }> = []
    let currentDay = ''
    let currentDayItems: MealItemRow[] = []
    
    console.log(`\nGrouping ${mealItems.length} items by day...`)
    
    for (const item of mealItems) {
      // If item has a day, start a new day group
      if (item.day && item.day.trim() && item.day.toUpperCase() !== 'TOTAL') {
        // Save previous day if it has items
        if (currentDay && currentDayItems.length > 0) {
          itemsByDay.push({ day: currentDay, items: currentDayItems })
          console.log(`  Grouped ${currentDayItems.length} items for ${currentDay}`)
        }
        // Start new day
        currentDay = item.day.trim()
        currentDayItems = [item]
      } else if (currentDay) {
        // Item belongs to current day (empty DAY cell means same day)
        currentDayItems.push(item)
      } else {
        // No day specified yet - this might be the first item, try to use it
        if (item.dishName && item.calories) {
          // Assume it's Monday if no day specified
          currentDay = 'Monday'
          currentDayItems = [item]
          console.log(`  No day specified for "${item.dishName}", assuming Monday`)
        } else {
          console.log(`⚠ Skipping item "${item.dishName}": No day specified and invalid data`)
        }
      }
    }
    
    // Save last day
    if (currentDay && currentDayItems.length > 0) {
      itemsByDay.push({ day: currentDay, items: currentDayItems })
      console.log(`  Grouped ${currentDayItems.length} items for ${currentDay}`)
    }
    
    console.log(`\nTotal days with items: ${itemsByDay.length}`)
    itemsByDay.forEach(({ day, items }) => {
      console.log(`  ${day}: ${items.length} items`)
    })
    console.log('')
    
    // Helper function to get date from day name
    function getDateFromDayName(dayName: string, startDate: Date = new Date()): Date {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const targetDay = dayName.toLowerCase().trim()
      const dayIndex = dayNames.indexOf(targetDay)
      
      if (dayIndex === -1) {
        // If not a day name, try to parse as date
        const parsed = parseDate(dayName)
        return parsed || startDate
      }
      
      // Find next occurrence of this day
      const currentDay = startDate.getDay()
      let daysToAdd = dayIndex - currentDay
      if (daysToAdd < 0) {
        daysToAdd += 7 // Next week
      }
      
      const targetDate = new Date(startDate)
      targetDate.setDate(targetDate.getDate() + daysToAdd)
      return targetDate
    }
    
    // Get meal plan start date or use current week's Monday
    const mealPlanStartDate = mealPlan.startDate || new Date()
    const monday = new Date(mealPlanStartDate)
    monday.setDate(monday.getDate() - monday.getDay() + 1) // Get Monday of the week
    
    let imported = 0
    let updated = 0
    let skipped = 0
    let errors = 0
    
    const deliveryLocation = 'Muroor Road Mushrif Area'
    
    for (const { day: dayName, items: dayItems } of itemsByDay) {
      if (!dayName || dayItems.length === 0) continue
      
      const mealDate = getDateFromDayName(dayName, monday)
      
      for (let idx = 0; idx < dayItems.length; idx++) {
        const item = dayItems[idx]
        
        try {
          if (!item.dishName) {
            console.log(`⚠ Skipping: Missing dish name`)
            skipped++
            continue
          }
          
          // Assign time slot based on row position (first item = lunch, second = dinner)
          let timeSlot: string
          if (idx === 0) {
            timeSlot = '10:00' // Lunch - 10:00 AM
          } else if (idx === 1) {
            timeSlot = '19:00' // Dinner - 7:00 PM
          } else {
            // For additional items, alternate or use default
            timeSlot = idx % 2 === 0 ? '10:00' : '19:00'
          }
          
          // Find or create dish
          let dish = await prisma.dish.findFirst({
            where: {
              name: {
                equals: item.dishName,
                mode: 'insensitive'
              }
            }
          })
          
          if (!dish) {
            // Determine category based on time slot
            const category = idx === 0 ? 'LUNCH' : 'DINNER'
            
            // Create dish with basic info
            dish = await prisma.dish.create({
              data: {
                name: item.dishName,
                category: category,
                calories: item.calories || 0,
                protein: item.protein || 0,
                carbs: item.carbs || 0,
                fats: item.fats || 0,
                ingredients: item.ingredients || null,
                allergens: item.allergens || null,
                status: 'ACTIVE',
              }
            })
            console.log(`✓ Created dish: ${item.dishName}`)
          }
          
          // Prepare custom note with ingredients, allergens, instructions, and delivery info
          const customNote: any = {}
          if (item.ingredients) {
            customNote.ingredients = item.ingredients
          }
          if (item.allergens) {
            customNote.allergens = item.allergens
          }
          if (item.instructions) {
            customNote.instructions = item.instructions
          }
          customNote.deliveryLocation = deliveryLocation
          customNote.deliveryType = 'delivery'
          
          // Find existing meal plan item
          const existingItem = await prisma.mealPlanItem.findUnique({
            where: {
              mealPlanId_date_timeSlot: {
                mealPlanId: mealPlan.id,
                date: mealDate,
                timeSlot: timeSlot,
              }
            }
          })
          
          if (existingItem) {
            // Update existing item with custom values
            await prisma.mealPlanItem.update({
              where: { id: existingItem.id },
              data: {
                dishId: dish.id,
                dishName: item.dishName || dish.name,
                dishDescription: dish.description,
                dishCategory: dish.category,
                ingredients: item.ingredients !== undefined ? item.ingredients : dish.ingredients,
                allergens: item.allergens !== undefined ? item.allergens : dish.allergens,
                calories: item.calories !== undefined ? Math.round(item.calories) : dish.calories,
                protein: item.protein !== undefined ? item.protein : dish.protein,
                carbs: item.carbs !== undefined ? item.carbs : dish.carbs,
                fats: item.fats !== undefined ? item.fats : dish.fats,
                customNote: Object.keys(customNote).length > 0 ? JSON.stringify(customNote) : undefined,
              }
            })
            updated++
            console.log(`↻ Updated meal item: ${item.dishName} on ${mealDate.toLocaleDateString()} at ${timeSlot}`)
          } else {
            // Create new meal plan item
            await prisma.mealPlanItem.create({
              data: {
                mealPlanId: mealPlan.id,
                dishId: dish.id,
                dishName: item.dishName || dish.name,
                dishDescription: dish.description,
                dishCategory: dish.category,
                ingredients: item.ingredients !== undefined ? item.ingredients : dish.ingredients,
                allergens: item.allergens !== undefined ? item.allergens : dish.allergens,
                date: mealDate,
                timeSlot: timeSlot,
                calories: item.calories !== undefined ? Math.round(item.calories) : dish.calories,
                protein: item.protein !== undefined ? item.protein : dish.protein,
                carbs: item.carbs !== undefined ? item.carbs : dish.carbs,
                fats: item.fats !== undefined ? item.fats : dish.fats,
                customNote: Object.keys(customNote).length > 0 ? JSON.stringify(customNote) : undefined,
                isSkipped: false,
              }
            })
            imported++
            console.log(`✓ Created meal item: ${item.dishName} on ${mealDate.toLocaleDateString()} at ${timeSlot}`)
          }
        } catch (error: any) {
          console.error(`✗ Error processing "${item.dishName}":`, error.message)
          errors++
        }
      }
    }
    
    console.log(`\n=== Import Summary ===`)
    console.log(`Imported: ${imported}`)
    console.log(`Updated: ${updated}`)
    console.log(`Skipped: ${skipped}`)
    console.log(`Errors: ${errors}`)
    console.log(`Total processed: ${imported + updated + skipped + errors}`)
    
  } catch (error: any) {
    console.error('Import failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

importMealItems()

