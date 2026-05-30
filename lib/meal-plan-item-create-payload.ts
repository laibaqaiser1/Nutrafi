import type { Dish, DishCategory } from '@/lib/generated/prisma/client'

export interface MealPlanItemCreateInput {
  dishId?: number
  dishName?: string
  dishDescription?: string
  dishCategory?: DishCategory
  ingredients?: string
  allergens?: string
  calories?: number
  protein?: number
  carbs?: number
  fats?: number
  price?: number
  deliveryTime?: string
  deliveryType?: string
  location?: string
  isSkipped?: boolean
  customNote?: string
}

export function resolveDishDataForItem(
  data: MealPlanItemCreateInput,
  dish: Dish | null
): Record<string, unknown> {
  if (dish && data.dishId) {
    return {
      dishId: data.dishId,
      dishName: data.dishName || dish.name,
      dishDescription: data.dishDescription !== undefined ? data.dishDescription : dish.description,
      dishCategory: data.dishCategory || dish.category,
      ingredients: data.ingredients !== undefined ? data.ingredients : dish.ingredients,
      allergens: data.allergens !== undefined ? data.allergens : dish.allergens,
      calories: data.calories !== undefined ? data.calories : dish.calories,
      protein: data.protein !== undefined ? data.protein : dish.protein,
      carbs: data.carbs !== undefined ? data.carbs : dish.carbs,
      fats: data.fats !== undefined ? data.fats : dish.fats,
      price: data.price !== undefined ? data.price : dish.price,
    }
  }
  if (data.dishName) {
    return {
      dishName: data.dishName,
      dishDescription: data.dishDescription,
      dishCategory: data.dishCategory || 'LUNCH_DINNER',
      ingredients: data.ingredients,
      allergens: data.allergens,
      calories: data.calories ?? 0,
      protein: data.protein ?? 0,
      carbs: data.carbs ?? 0,
      fats: data.fats ?? 0,
      price: data.price,
    }
  }
  return {}
}

export function deliveryTimeFromSlot(timeSlot: string, explicit?: string): string | undefined {
  const trimmed = explicit?.trim()
  if (trimmed) return trimmed
  const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]!, 10)
    const minutes = timeMatch[2]!
    return `${hours.toString().padStart(2, '0')}:${minutes}:00`
  }
  return timeSlot || undefined
}
