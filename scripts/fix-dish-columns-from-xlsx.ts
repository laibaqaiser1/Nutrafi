/**
 * Update existing Dish rows from an Excel sheet.
 *
 * Safety: uses only `prisma.dish.update` by primary key — never delete, create, or bulk-remove rows.
 *
 * Default: keeps the dish name in the DB unchanged; updates C–H from the sheet (ingredients, allergens,
 * calories, protein, carbs, fats). Use `--update-name` if you also want column B to overwrite `name`.
 *
 * Column layout (1-based Excel):
 *   B = name (optional; used for matching in by-name mode; only written with --update-name)
 *   C = ingredients
 *   D = allergens
 *   E = calories
 *   F = protein
 *   G = carbs
 *   H = fats
 *
 * Modes:
 *   sequential — Excel row `firstRow` maps to DB dish id `firstId`, next row → firstId+1, …
 *   by-name    — For each data row, find a dish whose name equals column B; update that dish by id.
 *
 * Examples:
 *   npx tsx scripts/fix-dish-columns-from-xlsx.ts --file "./Protein Bowls-with sweet potato.xlsx" --dry-run
 *   npx tsx scripts/fix-dish-columns-from-xlsx.ts --file "./Protein Bowls-with sweet potato.xlsx" --first-row 3 --first-id 67
 *   npx tsx scripts/fix-dish-columns-from-xlsx.ts --file "./sheet.xlsx" --first-row 19 --first-id 67
 *   npx tsx scripts/fix-dish-columns-from-xlsx.ts --file "./sheet.xlsx" --mode by-name --first-row 3
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as dotenv from 'dotenv'
import * as XLSX from 'xlsx'
import { prisma } from '../lib/prisma'

dotenv.config()

const COL = { name: 1, ingredients: 2, allergens: 3, calories: 4, protein: 5, carbs: 6, fats: 7 } as const

function strCell(row: unknown[], colIndex: number): string {
  const v = row[colIndex]
  if (v == null || v === '') return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return String(v).trim()
}

function parseFloatCell(s: string): number | undefined {
  const t = s.replace(/\s/g, '').replace(/,/g, '.')
  if (t === '') return undefined
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : undefined
}

function parseCalories(s: string): number | undefined {
  const n = parseFloatCell(s)
  if (n === undefined) return undefined
  return Math.round(n)
}

function parseArgs(argv: string[]) {
  let file = ''
  let sheet: string | number | undefined
  let firstRow = 3
  let firstId = 67
  let mode: 'sequential' | 'by-name' = 'sequential'
  let dryRun = false
  let endRow: number | undefined
  /** Default false: DB names stay as-is; only fix ingredients / allergens / macros from the sheet. */
  let updateName = false

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') dryRun = true
    else if (a === '--update-name') updateName = true
    else if (a === '--no-name') updateName = false
    else if (a === '--file' && argv[i + 1]) file = argv[++i]
    else if (a === '--sheet' && argv[i + 1]) {
      const v = argv[++i]
      const n = parseInt(v, 10)
      sheet = Number.isNaN(n) ? v : n
    } else if (a === '--first-row' && argv[i + 1]) firstRow = parseInt(argv[++i], 10)
    else if (a === '--first-id' && argv[i + 1]) firstId = parseInt(argv[++i], 10)
    else if (a === '--end-row' && argv[i + 1]) endRow = parseInt(argv[++i], 10)
    else if (a === '--mode' && argv[i + 1]) {
      const m = argv[++i]
      if (m !== 'sequential' && m !== 'by-name') throw new Error(`--mode must be sequential or by-name, got ${m}`)
      mode = m
    } else if (!a.startsWith('-') && !file) file = a
  }

  if (!file) throw new Error('Pass --file path/to.xlsx (or a positional path).')
  const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file)
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`)

  return { file: abs, sheet, firstRow, firstId, mode, dryRun, endRow, updateName }
}

type DishNutritionRow = {
  name: string
  ingredients: string | null
  allergens: string | null
  calories: number
  protein: number
  carbs: number
  fats: number
}

/** Excel overrides when a cell has a value; otherwise keep `existing`. */
function mergeRowFromExcel(row: unknown[], existing: DishNutritionRow, updateName: boolean): DishNutritionRow {
  const b = strCell(row, COL.name)
  const ingredients = strCell(row, COL.ingredients)
  const allergens = strCell(row, COL.allergens)
  const cal = parseCalories(strCell(row, COL.calories))
  const protein = parseFloatCell(strCell(row, COL.protein))
  const carbs = parseFloatCell(strCell(row, COL.carbs))
  const fats = parseFloatCell(strCell(row, COL.fats))

  return {
    name: updateName && b !== '' ? b : existing.name,
    ingredients: ingredients !== '' ? ingredients : existing.ingredients,
    allergens: allergens !== '' ? allergens : existing.allergens,
    calories: cal !== undefined ? cal : existing.calories,
    protein: protein !== undefined ? protein : existing.protein,
    carbs: carbs !== undefined ? carbs : existing.carbs,
    fats: fats !== undefined ? fats : existing.fats,
  }
}

async function main() {
  const opts = parseArgs(process.argv)
  console.log(
    'fix-dish-columns-from-xlsx: update-only (no deletes). ' +
      (opts.updateName ? 'Names will be synced from column B.' : 'Names are left unchanged; columns C–H applied where cells have values.')
  )
  const wb = XLSX.readFile(opts.file, { cellDates: true })
  const sheetName =
    typeof opts.sheet === 'number'
      ? wb.SheetNames[opts.sheet] ?? wb.SheetNames[0]
      : typeof opts.sheet === 'string'
        ? wb.SheetNames.includes(opts.sheet)
          ? opts.sheet
          : wb.SheetNames[0]
        : wb.SheetNames[0]

  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error('No worksheet found.')

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false }) as unknown[][]

  const startIdx = opts.firstRow - 1
  const endIdx = opts.endRow != null ? opts.endRow - 1 : matrix.length - 1

  let updated = 0
  let skipped = 0

  for (let r = startIdx; r <= endIdx; r++) {
    const row = matrix[r]
    if (!row || !Array.isArray(row)) {
      skipped++
      continue
    }

    if (opts.mode === 'sequential') {
      const dishId = opts.firstId + (r - startIdx)
      const existing = await prisma.dish.findUnique({ where: { id: dishId } })
      if (!existing) {
        console.warn(`[skip] row ${r + 1} → id ${dishId}: dish not found`)
        skipped++
        continue
      }
      const base: DishNutritionRow = {
        name: existing.name,
        ingredients: existing.ingredients,
        allergens: existing.allergens,
        calories: existing.calories,
        protein: existing.protein,
        carbs: existing.carbs,
        fats: existing.fats,
      }
      const data = mergeRowFromExcel(row, base, opts.updateName)
      if (opts.dryRun) {
        console.log(`[dry-run] row ${r + 1} id ${dishId}`, data)
        updated++
        continue
      }
      await prisma.dish.update({ where: { id: dishId }, data })
      console.log(`Updated dish id ${dishId} (row ${r + 1}) "${data.name}"`)
      updated++
    } else {
      const excelName = strCell(row, COL.name)
      if (!excelName) {
        skipped++
        continue
      }
      const matches = await prisma.dish.findMany({
        where: { name: { equals: excelName, mode: 'insensitive' } },
      })
      if (matches.length === 0) {
        console.warn(`[skip] row ${r + 1}: no dish named "${excelName}"`)
        skipped++
        continue
      }
      if (matches.length > 1) {
        console.warn(`[skip] row ${r + 1}: multiple dishes named "${excelName}" (ids: ${matches.map((m) => m.id).join(', ')})`)
        skipped++
        continue
      }
      const existing = matches[0]
      const base: DishNutritionRow = {
        name: existing.name,
        ingredients: existing.ingredients,
        allergens: existing.allergens,
        calories: existing.calories,
        protein: existing.protein,
        carbs: existing.carbs,
        fats: existing.fats,
      }
      const data = mergeRowFromExcel(row, base, opts.updateName)
      if (opts.dryRun) {
        console.log(`[dry-run] row ${r + 1} id ${existing.id}`, data)
        updated++
        continue
      }
      await prisma.dish.update({ where: { id: existing.id }, data })
      console.log(`Updated dish id ${existing.id} (row ${r + 1}) "${data.name}"`)
      updated++
    }
  }

  console.log(`Done. updated=${updated} skipped=${skipped}${opts.dryRun ? ' (dry-run)' : ''}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
