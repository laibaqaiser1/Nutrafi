/**
 * One-off / idempotent maintenance:
 * - MealPlan: set totalMeals = days × mealsPerDay where totalMeals is null
 * - Plan: sync totalMeals = days × mealsPerDay for all catalog rows
 *
 * Run: npx tsx scripts/backfill-total-meals.ts
 */
import * as dotenv from 'dotenv'
import { prisma } from '../lib/prisma'

dotenv.config()

async function main() {
  const mealPlansNull = await prisma.mealPlan.findMany({
    where: { totalMeals: null },
    select: { id: true, days: true, mealsPerDay: true },
  })

  let mealPlansUpdated = 0
  for (const row of mealPlansNull) {
    const total = Math.max(0, row.days * row.mealsPerDay)
    await prisma.mealPlan.update({
      where: { id: row.id },
      data: { totalMeals: total },
    })
    mealPlansUpdated++
  }

  const plans = await prisma.plan.findMany({ select: { id: true, days: true, mealsPerDay: true } })
  let plansUpdated = 0
  for (const row of plans) {
    const total = Math.max(0, row.days * row.mealsPerDay)
    await prisma.plan.update({
      where: { id: row.id },
      data: { totalMeals: total },
    })
    plansUpdated++
  }

  console.log(`MealPlan rows with null totalMeals found: ${mealPlansNull.length}`)
  console.log(`MealPlan rows updated: ${mealPlansUpdated}`)
  console.log(`Plan rows synced: ${plansUpdated}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
