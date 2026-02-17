import AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'
import { prisma } from '../lib/prisma'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

interface ParsedRow {
  serialNumber?: number
  name?: string
  labels?: string
  ingredients?: string
  allergens?: string
  calories?: number
  protein?: number
  carbs?: number
  fats?: number
  categoryIndicator?: string
}

// Map category indicators and dish names to DishCategory enum
function determineCategory(name: string, indicator?: string): 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'LUNCH_DINNER' | 'SNACK' | 'SMOOTHIE' | 'JUICE' {
  const nameLower = name.toLowerCase()
  const indicatorUpper = indicator?.toUpperCase() || ''

  // Check category indicator first
  if (indicatorUpper.includes('B') || nameLower.includes('breakfast')) {
    return 'BREAKFAST'
  }
  if (indicatorUpper.includes('S') && !indicatorUpper.includes('P')) {
    return 'SNACK'
  }
  if (nameLower.includes('smoothie')) {
    return 'SMOOTHIE'
  }
  if (nameLower.includes('juice')) {
    return 'JUICE'
  }
  
  // Check for LUNCH/DINNER indicator (L/D or both L and D)
  if (indicatorUpper.includes('L') && indicatorUpper.includes('D')) {
    return 'LUNCH_DINNER'
  }
  
  // Default to LUNCH for main dishes, DINNER for heavier meals
  if (nameLower.includes('pasta') || nameLower.includes('burger') || nameLower.includes('biryani')) {
    return 'DINNER'
  }
  
  return 'LUNCH'
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
  
  // Try to get value from office:value attribute (with or without namespace prefix)
  const attrs = cell.$ || {}
  const value = attrs['office:value'] || attrs.value
  if (value !== undefined && value !== null && value !== '') {
    const num = parseFloat(String(value))
    if (!isNaN(num)) {
      return num
    }
  }
  
  // Fallback to text content
  const text = getCellText(cell)
  if (text) {
    const num = parseFloat(text)
    return isNaN(num) ? undefined : num
  }
  
  return undefined
}

async function parseODSFile(filePath: string): Promise<ParsedRow[]> {
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
  
  const rows: ParsedRow[] = []
  
  // Navigate through the XML structure
  const spreadsheet = result['office:document-content']?.['office:body']?.[0]?.['office:spreadsheet']?.[0]
  const table = spreadsheet?.['table:table']?.[0]
  const tableRows = table?.['table:table-row'] || []
  
  // Skip header rows (first 2 rows)
  for (let i = 2; i < tableRows.length; i++) {
    const row = tableRows[i]
    
    // Skip rows with number-rows-repeated (empty rows)
    if (row.$?.['table:number-rows-repeated']) {
      continue
    }
    
    const cells = row['table:table-cell'] || []
    
    // Skip empty rows
    if (cells.length === 0) continue
    
    // Extract data from cells
    // Column 0: Serial Number
    // Column 1: Name
    // Column 2: Labels (description)
    // Column 3: Ingredients
    // Column 4: Allergens
    // Column 5: Calories
    // Column 6: Protein
    // Column 7: Carbs
    // Column 8: Fats
    // Column 9: Category Indicator (B/S/P)
    
    let cellIndex = 0
    const rowData: ParsedRow = {}
    
    for (const cell of cells) {
      // Handle repeated cells - skip if it's a large repeat (empty columns)
      const repeat = parseInt(cell.$?.['table:number-columns-repeated'] || '1', 10)
      
      // Skip large repeated empty columns
      if (repeat > 100) {
        cellIndex += repeat
        continue
      }
      
      // Only process cells in our target column range (0-9)
      if (cellIndex <= 9) {
        if (cellIndex === 0) {
          // Serial number
          const num = getCellNumber(cell)
          if (num !== undefined) {
            rowData.serialNumber = num
          }
        } else if (cellIndex === 1) {
          // Name
          const text = getCellText(cell)
          if (text) {
            rowData.name = text
          }
        } else if (cellIndex === 2) {
          // Labels (description)
          const text = getCellText(cell)
          if (text) {
            rowData.labels = text
          }
        } else if (cellIndex === 3) {
          // Ingredients
          const text = getCellText(cell)
          if (text) {
            rowData.ingredients = text
          }
        } else if (cellIndex === 4) {
          // Allergens
          const text = getCellText(cell)
          if (text) {
            rowData.allergens = text
          }
        } else if (cellIndex === 5) {
          // Calories
          const num = getCellNumber(cell)
          if (num !== undefined) {
            rowData.calories = Math.round(num)
          }
        } else if (cellIndex === 6) {
          // Protein
          const num = getCellNumber(cell)
          if (num !== undefined) {
            rowData.protein = num
          }
        } else if (cellIndex === 7) {
          // Carbs
          const num = getCellNumber(cell)
          if (num !== undefined) {
            rowData.carbs = num
          }
        } else if (cellIndex === 8) {
          // Fats
          const num = getCellNumber(cell)
          if (num !== undefined) {
            rowData.fats = num
          }
        } else if (cellIndex === 9) {
          // Category Indicator
          const text = getCellText(cell)
          if (text) {
            rowData.categoryIndicator = text
          }
        }
      }
      
      cellIndex += repeat
      
      // Stop if we've processed all relevant columns
      if (cellIndex > 9) break
    }
    
    // Only add rows that have at least a name and calories
    if (rowData.name && rowData.calories !== undefined) {
      // Validate that we have at least some nutritional data
      if (rowData.protein === undefined && rowData.carbs === undefined && rowData.fats === undefined) {
        console.log(`⚠ Warning: Row "${rowData.name}" has calories but no macro nutrients`)
      }
      rows.push(rowData)
    }
  }
  
  return rows
}

async function importMenu() {
  try {
    const filePath = path.join(process.cwd(), 'nutrafi menu.ods')
    
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      process.exit(1)
    }
    
    console.log('Parsing ODS file...')
    const rows = await parseODSFile(filePath)
    console.log(`Found ${rows.length} menu items`)
    
    let imported = 0
    let skipped = 0
    let errors = 0
    
    for (const row of rows) {
      try {
        // Validate required fields
        if (!row.name) {
          console.log(`⚠ Skipping row: Missing name`)
          skipped++
          continue
        }
        
        if (row.calories === undefined || row.calories === null) {
          console.log(`⚠ Skipping "${row.name}": Missing calories`)
          skipped++
          continue
        }
        
        // Validate nutritional values
        const protein = row.protein !== undefined && row.protein !== null ? row.protein : 0
        const carbs = row.carbs !== undefined && row.carbs !== null ? row.carbs : 0
        const fats = row.fats !== undefined && row.fats !== null ? row.fats : 0
        
        // Warn if nutritional values are missing
        if (protein === 0 && carbs === 0 && fats === 0) {
          console.log(`⚠ Warning: "${row.name}" has all nutritional values as 0`)
        }
        
        // Check if dish already exists
        const existing = await prisma.dish.findFirst({
          where: {
            name: {
              equals: row.name,
              mode: 'insensitive'
            }
          }
        })
        
        if (existing) {
          console.log(`⊘ Skipping existing dish: ${row.name}`)
          skipped++
          continue
        }
        
        // Determine category
        const category = determineCategory(row.name, row.categoryIndicator)
        
        // Clean and prepare ingredients
        const ingredients = row.ingredients 
          ? row.ingredients.trim().replace(/\s+/g, ' ') 
          : undefined
        
        // Clean allergens
        const allergens = row.allergens 
          ? row.allergens.trim() 
          : undefined
        
        // Create dish with all nutritional details
        const dish = await prisma.dish.create({
          data: {
            name: row.name.trim(),
            description: row.labels ? row.labels.trim() : undefined,
            category: category,
            ingredients: ingredients,
            allergens: allergens,
            calories: Math.round(row.calories),
            protein: parseFloat(protein.toFixed(1)),
            carbs: parseFloat(carbs.toFixed(1)),
            fats: parseFloat(fats.toFixed(1)),
            status: 'ACTIVE'
          }
        })
        
        // Log successful import with details
        console.log(`✓ Imported: ${dish.name}`)
        console.log(`  Category: ${dish.category}`)
        console.log(`  Calories: ${dish.calories} kcal`)
        console.log(`  Protein: ${dish.protein}g | Carbs: ${dish.carbs}g | Fats: ${dish.fats}g`)
        if (dish.ingredients) {
          console.log(`  Ingredients: ${dish.ingredients.substring(0, 60)}${dish.ingredients.length > 60 ? '...' : ''}`)
        }
        if (dish.allergens) {
          console.log(`  Allergens: ${dish.allergens}`)
        }
        console.log('')
        
        imported++
      } catch (error: any) {
        console.error(`✗ Error importing ${row.name || 'unknown'}:`, error.message)
        if (error.code === 'P2002') {
          console.error(`  → Duplicate entry (name already exists)`)
        }
        errors++
      }
    }
    
    console.log('\n=== Import Summary ===')
    console.log(`Imported: ${imported}`)
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
importMenu()

