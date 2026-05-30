export interface MealPlanTemplateListRow {
  id: number
  label: string
  planType: string
  days: number
  mealsPerDay: number
  timeSlots?: unknown
  weeklySkipDays?: number[]
  notes: string | null
}

export interface MealPlanTemplateItemRow {
  weekday: number
  slotIndex: number
  isSkipped: boolean
  dishId: number | null
  dishName: string | null
  dishDescription: string | null
  dishCategory: string | null
  ingredients: string | null
  allergens: string | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fats: number | null
  price: number | null
  customNote: string | null
}

export interface MealPlanTemplateDetail extends MealPlanTemplateListRow {
  items: MealPlanTemplateItemRow[]
}

/** One meal slot produced from template × calendar dates. */
export interface AppliedImportMeal {
  date: string
  slotIndex: number
  timeSlot: string
  dishId: string
  dishName?: string
  dishDescription?: string
  dishCategory?: string
  ingredients?: string
  allergens?: string
  calories?: number
  protein?: number
  carbs?: number
  fats?: number
  price?: number
  deliveryType: 'delivery' | 'pickup'
  deliveryTime?: string
  location: string
  isSkipped: boolean
  customNote?: string
}

export interface WizardMealRow {
  date: string
  timeSlot: string
  dishId: string
  dishName?: string
  dishDescription?: string
  dishCategory?: string
  ingredients?: string
  allergens?: string
  calories?: number
  protein?: number
  carbs?: number
  fats?: number
  price?: number
  deliveryType: 'delivery' | 'pickup'
  deliveryTime?: string
  location: string
  isSkipped: boolean
  showDishFields?: boolean
  customNote?: string
}
