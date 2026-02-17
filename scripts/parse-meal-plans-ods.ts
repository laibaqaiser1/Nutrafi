import AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'
import * as fs from 'fs'
import * as path from 'path'

function getCellText(cell: any): string | null {
  if (!cell) return null
  
  // Check for text content
  if (cell['text:p']) {
    if (Array.isArray(cell['text:p'])) {
      return cell['text:p'].map((p: any) => p._ || p).join(' ')
    }
    return cell['text:p']._ || cell['text:p'] || null
  }
  
  // Check for text:span
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

async function parseMealPlansODS(filePath: string) {
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
  
  const spreadsheet = result['office:document-content']?.['office:body']?.[0]?.['office:spreadsheet']?.[0]
  const tables = spreadsheet?.['table:table'] || []
  
  console.log(`\nFound ${tables.length} table(s) in the spreadsheet\n`)
  
  // Process first table
  if (tables.length > 0) {
    const table = tables[0]
    const tableRows = table['table:table-row'] || []
    
    console.log(`=== Table 1 ===`)
    console.log(`Total rows: ${tableRows.length}\n`)
    
    console.log(`=== First 10 rows structure ===\n`)
    
    for (let i = 0; i < Math.min(10, tableRows.length); i++) {
      const row = tableRows[i]
      const cells = row['table:table-cell'] || []
      
      if (cells.length === 0) continue
      
      console.log(`Row ${i}:`)
      let cellIndex = 0
      
      for (const cell of cells) {
        const repeat = parseInt(cell.$?.['table:number-columns-repeated'] || '1', 10)
        
        if (repeat > 100) {
          cellIndex += repeat
          continue
        }
        
        const text = getCellText(cell)
        const num = getCellNumber(cell)
        
        if (text || num !== null) {
          const display = text ? `"${text}"` : ''
          const numDisplay = num !== null ? ` (number: ${num})` : ''
          console.log(`  Column ${cellIndex}: ${display}${numDisplay}`)
        }
        
        cellIndex += repeat
        if (cellIndex > 20) break
      }
      console.log('')
    }
  }
}

const filePath = path.join(process.cwd(), 'meal plans.ods')

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

parseMealPlansODS(filePath).catch(console.error)

