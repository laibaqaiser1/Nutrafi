import type { AppliedImportMeal } from '@/lib/import-default-plan/types'

export interface MenuDishOption {
  id: string
  name: string
  description?: string | null
  category: string
  ingredients?: string | null
  allergens?: string | null
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fats?: number | null
  price?: number | null
}

export function importMealKey(meal: Pick<AppliedImportMeal, 'date' | 'slotIndex'>): string {
  return `${meal.date}:${meal.slotIndex}`
}

export function dishFieldsFromMenu(dish: MenuDishOption) {
  return {
    dishId: dish.id,
    dishName: dish.name,
    dishDescription: dish.description ?? undefined,
    dishCategory: dish.category,
    ingredients: dish.ingredients ?? undefined,
    allergens: dish.allergens ?? undefined,
    calories: dish.calories ?? undefined,
    protein: dish.protein ?? undefined,
    carbs: dish.carbs ?? undefined,
    fats: dish.fats ?? undefined,
    price: dish.price ?? undefined,
  }
}

export function patchImportMeal(
  meals: AppliedImportMeal[],
  key: string,
  patch: Partial<AppliedImportMeal>
): AppliedImportMeal[] {
  return meals.map((m) => (importMealKey(m) === key ? { ...m, ...patch } : m))
}

export function moveImportMealsDate(
  meals: AppliedImportMeal[],
  fromYmd: string,
  toYmd: string
): AppliedImportMeal[] {
  return meals.map((m) => (m.date === fromYmd ? { ...m, date: toYmd } : m))
}
