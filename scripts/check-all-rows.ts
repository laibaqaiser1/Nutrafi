import AdmZip from 'adm-zip'
import { parseStringPromise } from 'xml2js'
import * as fs from 'fs'
import * as path from 'path'

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

async function checkRows() {
  const zip = new AdmZip('meal plans.ods')
  const contentXml = zip.readAsText('content.xml')
  const result = await parseStringPromise(contentXml, {
    explicitArray: true,
    mergeAttrs: true,
    explicitCharkey: true,
    charkey: '_',
    attrkey: '$'
  })

  const spreadsheet = result['office:document-content']?.['office:body']?.[0]?.['office:spreadsheet']?.[0]
  const tables = spreadsheet?.['table:table'] || []
  const table = tables[0]
  const tableRows = table['table:table-row'] || []

  console.log('Total rows:', tableRows.length)
  for (let i = 0; i < Math.min(30, tableRows.length); i++) {
    const row = tableRows[i]
    const cells = row['table:table-cell'] || []
    if (cells.length === 0) continue
    let cellIndex = 0
    let firstCell = null
    for (const cell of cells) {
      const repeat = parseInt(cell.$?.['table:number-columns-repeated'] || '1', 10)
      if (cellIndex === 0) {
        firstCell = getCellText(cell)
      }
      cellIndex += repeat
      if (cellIndex > 1) break
    }
    console.log(`Row ${i}: ${firstCell || '(empty)'}`)
  }
}

checkRows().catch(console.error)

