import AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'
import * as fs from 'fs'
import * as path from 'path'

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

async function parseCustomersODS(filePath: string) {
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
  
  const rows: any[] = []
  
  const spreadsheet = result['office:document-content']?.['office:body']?.[0]?.['office:spreadsheet']?.[0]
  const tables = spreadsheet?.['table:table'] || []
  
  console.log(`Found ${tables.length} table(s) in the spreadsheet\n`)
  
  // Process each table
  for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
    const table = tables[tableIndex]
    const tableName = table.$?.['table:name'] || `Table ${tableIndex + 1}`
    const tableRows = table['table:table-row'] || []
    
    console.log(`\n=== ${tableName} ===`)
    console.log('Total rows:', tableRows.length)
    console.log('\n=== First 10 rows structure ===\n')
  
  for (let i = 0; i < Math.min(5, tableRows.length); i++) {
    const row = tableRows[i]
    const cells = row['table:table-cell'] || []
    
    console.log(`Row ${i}:`)
    let cellIndex = 0
    for (const cell of cells) {
      const repeat = parseInt(cell.$?.['table:number-columns-repeated'] || '1', 10)
      const text = getCellText(cell)
      const num = getCellNumber(cell)
      
      if (text || num !== undefined) {
        console.log(`  Column ${cellIndex}: "${text}" ${num !== undefined ? `(number: ${num})` : ''}`)
      }
      
      cellIndex += repeat
      if (cellIndex > 20) break // Limit to first 20 columns
    }
    console.log('')
  }
  
    // Try to parse actual data rows (assuming header is in first 1-2 rows)
    console.log('\n=== Parsing data rows ===\n')
    
    for (let i = 2; i < Math.min(15, tableRows.length); i++) {
    const row = tableRows[i]
    const cells = row['table:table-cell'] || []
    
    if (cells.length === 0) continue
    
    const rowData: any = {}
    let cellIndex = 0
    
    for (const cell of cells) {
      const repeat = parseInt(cell.$?.['table:number-columns-repeated'] || '1', 10)
      
      if (repeat > 100) {
        cellIndex += repeat
        continue
      }
      
      const text = getCellText(cell)
      const num = getCellNumber(cell)
      
      // Store first 20 columns
      if (cellIndex < 20) {
        rowData[`col${cellIndex}`] = text || num
      }
      
      cellIndex += repeat
      if (cellIndex > 20) break
    }
    
    if (Object.keys(rowData).length > 0) {
      rows.push(rowData)
      console.log(`Row ${i}:`, JSON.stringify(rowData, null, 2))
    }
    }
  }
}

async function main() {
  try {
    const filePath = path.join(process.cwd(), 'nutrafi customers.ods')
    
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      process.exit(1)
    }
    
    console.log('Parsing customer ODS file...\n')
    await parseCustomersODS(filePath)
    
  } catch (error: any) {
    console.error('Parse failed:', error)
    process.exit(1)
  }
}

main()

