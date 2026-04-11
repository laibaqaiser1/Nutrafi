/**
 * Re-copy dish snapshot fields onto MealPlanItem rows (ingredients, allergens, macros, name, etc.).
 * Uses only `prisma.mealPlanItem.update` — no deletes, no creates.
 *
 * Default scope: items whose `dishId` is between 67 and 83 (Protein Bowls sheet range). Override with flags.
 *
 * Examples:
 *   npx tsx scripts/sync-meal-plan-items-from-dishes.ts --dry-run
 *   npx tsx scripts/sync-meal-plan-items-from-dishes.ts --min-dish-id 67 --max-dish-id 83
 *   npx tsx scripts/sync-meal-plan-items-from-dishes.ts --min-dish-id 67
 *   npx tsx scripts/sync-meal-plan-items-from-dishes.ts --meal-plan-id-gte 100 --min-dish-id 67 --max-dish-id 83
 */
import * as dotenv from 'dotenv'
import type { Prisma } from '../lib/generated/prisma/client'
import { prisma } from '../lib/prisma'

dotenv.config()

function parseArgs(argv: string[]) {
  let minDishId = 67
  let maxDishId: number | undefined = 83
  let mealPlanIdGte: number | undefined
  let dryRun = false

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') dryRun = true
    else if (a === '--min-dish-id' && argv[i + 1]) minDishId = parseInt(argv[++i], 10)
    else if (a === '--max-dish-id' && argv[i + 1]) maxDishId = parseInt(argv[++i], 10)
    else if (a === '--no-max-dish-id') maxDishId = undefined
    else if (a === '--meal-plan-id-gte' && argv[i + 1]) mealPlanIdGte = parseInt(argv[++i], 10)
  }

  if (Number.isNaN(minDishId) || minDishId < 1) throw new Error('Invalid --min-dish-id')
  if (maxDishId !== undefined && (Number.isNaN(maxDishId) || maxDishId < minDishId)) {
    throw new Error('Invalid --max-dish-id (must be >= min-dish-id)')
  }

  return { minDishId, maxDishId, mealPlanIdGte, dryRun }
}

function itemWhere(opts: ReturnType<typeof parseArgs>): Prisma.MealPlanItemWhereInput {
  const dishIdFilter: Prisma.IntFilter =
    opts.maxDishId !== undefined
      ? { gte: opts.minDishId, lte: opts.maxDishId }
      : { gte: opts.minDishId }

  return {
    dishId: dishIdFilter,
    ...(opts.mealPlanIdGte !== undefined ? { mealPlanId: { gte: opts.mealPlanIdGte } } : {}),
  }
}

function dishToItemData(d: {
  name: string
  description: string | null
  category: string
  ingredients: string | null
  allergens: string | null
  calories: number
  protein: number
  carbs: number
  fats: number
  price: number | null
}): Prisma.MealPlanItemUpdateInput {
  return {
    dishName: d.name,
    dishDescription: d.description,
    dishCategory: d.category as Prisma.MealPlanItemUpdateInput['dishCategory'],
    ingredients: d.ingredients,
    allergens: d.allergens,
    calories: d.calories,
    protein: d.protein,
    carbs: d.carbs,
    fats: d.fats,
    price: d.price ?? undefined,
  }
}

const BATCH = 25

async function main() {
  const opts = parseArgs(process.argv)
  const where = itemWhere(opts)

  const count = await prisma.mealPlanItem.count({ where })
  console.log(
    'sync-meal-plan-items-from-dishes: update-only (no deletes). ' +
      `Matching items: ${count}. dishId ${opts.minDishId}${opts.maxDishId !== undefined ? `–${opts.maxDishId}` : '+'}` +
      (opts.mealPlanIdGte !== undefined ? `, mealPlanId >= ${opts.mealPlanIdGte}` : '')
  )

  if (count === 0) {
    console.log('Nothing to do.')
    return
  }

  if (opts.dryRun) {
    const sample = await prisma.mealPlanItem.findMany({
      where,
      take: 5,
      select: { id: true, mealPlanId: true, dishId: true, dishName: true, calories: true },
    })
    console.log('[dry-run] sample rows:', sample)
    console.log(`[dry-run] would update ${count} meal plan items`)
    return
  }

  const items = await prisma.mealPlanItem.findMany({
    where,
    select: { id: true, dishId: true },
  })

  const dishIds = [...new Set(items.map((i) => i.dishId).filter((id): id is number => id != null))]
  const dishes = await prisma.dish.findMany({
    where: { id: { in: dishIds } },
  })
  const dishById = new Map(dishes.map((d) => [d.id, d]))

  let missingDish = 0
  let updated = 0

  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH)
    const ops: ReturnType<typeof prisma.mealPlanItem.update>[] = []
    for (const item of chunk) {
      const d = item.dishId != null ? dishById.get(item.dishId) : undefined
      if (!d) {
        missingDish++
        console.warn(`[skip] item ${item.id} dishId ${item.dishId}: dish not found`)
        continue
      }
      ops.push(
        prisma.mealPlanItem.update({
          where: { id: item.id },
          data: dishToItemData(d),
        })
      )
    }
    if (ops.length > 0) {
      await prisma.$transaction(ops)
      updated += ops.length
    }
    if (i + BATCH >= items.length || (i + BATCH) % 200 === 0) {
      console.log(`Progress: ${Math.min(i + BATCH, items.length)} / ${items.length}`)
    }
  }

  if (missingDish > 0) {
    console.warn(`Warning: ${missingDish} item(s) skipped (no matching Dish).`)
  }
  console.log(`Done. Updated ${updated} meal plan item(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
