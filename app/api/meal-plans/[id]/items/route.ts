import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const mealPlanItemSchema = z.object({
  date: z.string().transform((str) => new Date(str)),
  timeSlot: z.string(),
  dishId: z.string().optional(), // Reference to menu dish (template)
  // Custom dish details (can be customized per customer)
  dishName: z.string().optional(),
  dishDescription: z.string().optional(),
  dishCategory: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'LUNCH_DINNER', 'SNACK', 'SMOOTHIE', 'JUICE']).optional(),
  ingredients: z.string().optional(),
  allergens: z.string().optional(),
  calories: z.number().int().optional(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fats: z.number().optional(),
  price: z.number().optional(),
  deliveryTime: z.string().optional(),
  deliveryType: z.enum(['delivery', 'pickup']).optional(),
  location: z.string().optional(),
  isSkipped: z.boolean().optional(),
  customNote: z.string().optional(),
})

// POST - Update or create meal plan item
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    const { id } = await params
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = mealPlanItemSchema.parse(body)

    // If dishId is provided, fetch the dish to copy its data
    let dishData: any = {}
    if (data.dishId) {
      const dish = await prisma.dish.findUnique({
        where: { id: data.dishId },
      })
      if (dish) {
        // Copy dish data as defaults, but allow customization
        dishData = {
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
    } else if (data.dishName) {
      // Custom dish without menu reference
      dishData = {
        dishName: data.dishName,
        dishDescription: data.dishDescription,
        dishCategory: data.dishCategory || 'CUSTOM',
        ingredients: data.ingredients,
        allergens: data.allergens,
        calories: data.calories || 0,
        protein: data.protein || 0,
        carbs: data.carbs || 0,
        fats: data.fats || 0,
        price: data.price,
      }
    }

    // Find existing meal plan item
    const existingItem = await prisma.mealPlanItem.findUnique({
      where: {
        mealPlanId_date_timeSlot: {
          mealPlanId: id,
          date: data.date,
          timeSlot: data.timeSlot,
        },
      },
    })

    // Prepare custom note - merge user notes with delivery info
    const customNoteObj: any = {}
    if (data.deliveryType) customNoteObj.deliveryType = data.deliveryType
    if (data.location) customNoteObj.location = data.location
    if (data.customNote) customNoteObj.note = data.customNote

    const updateData: any = {
      ...dishData,
      deliveryTime: data.deliveryTime || undefined,
      customNote: Object.keys(customNoteObj).length > 0 ? JSON.stringify(customNoteObj) : undefined,
      isSkipped: data.isSkipped !== undefined ? data.isSkipped : undefined,
    }

    if (existingItem) {
      // Update existing item - merge with existing dish data if not provided
      const updated = await prisma.mealPlanItem.update({
        where: { id: existingItem.id },
        data: updateData,
      })
      return NextResponse.json(updated)
    } else {
      // Create new item
      const created = await prisma.mealPlanItem.create({
        data: {
          mealPlanId: id,
          date: data.date,
          timeSlot: data.timeSlot,
          isSkipped: data.isSkipped || false,
          ...updateData,
        },
      })
      return NextResponse.json(created)
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error updating meal plan item:', error)
    return NextResponse.json({ error: 'Failed to update meal plan item' }, { status: 500 })
  }
}
