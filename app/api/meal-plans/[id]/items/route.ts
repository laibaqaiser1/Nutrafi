import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { parseMealPlanTimeSlots } from '@/lib/meal-plan-time-slots'
import { z } from 'zod'

const mealPlanItemSchema = z.object({
  date: z.string().transform((str) => new Date(str)),
  /** Optional when MealPlan.timeSlots is set — server picks next slot for that date */
  timeSlot: z.string().optional().nullable(),
  dishId: z.union([z.string(), z.number()]).transform((v) => {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10)
    return Number.isNaN(n) ? undefined : n
  }).optional(),
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
    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid meal plan ID' }, { status: 400 })
    }
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = mealPlanItemSchema.parse(body)

    const mealPlanRow = await prisma.mealPlan.findUnique({ where: { id } })
    if (!mealPlanRow) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }

    const requestedSlot =
      typeof data.timeSlot === 'string' && data.timeSlot.trim().length > 0
        ? data.timeSlot.trim()
        : undefined
    let timeSlot = requestedSlot
    if (!timeSlot) {
      const slots = parseMealPlanTimeSlots(mealPlanRow.timeSlots)
      const countSameDay = await prisma.mealPlanItem.count({
        where: { mealPlanId: id, date: data.date },
      })
      if (slots.length > 0) {
        timeSlot = slots[countSameDay % slots.length]!
      } else {
        timeSlot = '12:00'
      }
    }

    let deliveryTime = data.deliveryTime?.trim() || undefined
    if (!deliveryTime && timeSlot) {
      const timeMatch = timeSlot.match(/(\d{1,2}):(\d{2})/)
      if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10)
        const minutes = timeMatch[2]
        deliveryTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`
      } else {
        deliveryTime = timeSlot
      }
    }

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
        dishCategory: data.dishCategory || 'LUNCH_DINNER',
        ingredients: data.ingredients,
        allergens: data.allergens,
        calories: data.calories || 0,
        protein: data.protein || 0,
        carbs: data.carbs || 0,
        fats: data.fats || 0,
        price: data.price,
      }
    }

    // customNote = plain text only. deliveryType and location stored in their own columns.
    const updateData: any = {
      ...dishData,
      deliveryTime: deliveryTime || undefined,
      deliveryType: data.deliveryType || undefined,
      deliveryLocation: data.location ?? undefined,
      customNote: data.customNote != null && String(data.customNote).trim() !== '' ? String(data.customNote).trim() : undefined,
      isSkipped: data.isSkipped !== undefined ? data.isSkipped : undefined,
    }

    // Always create a new item (allows multiple meals per date+timeSlot, e.g. duplicate week)
    const created = await prisma.mealPlanItem.create({
      data: {
        mealPlanId: id,
        date: data.date,
        timeSlot,
        isSkipped: data.isSkipped || false,
        ...updateData,
      },
    })
    return NextResponse.json(created)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error updating meal plan item:', error)
    return NextResponse.json({ error: 'Failed to update meal plan item' }, { status: 500 })
  }
}

// DELETE - Delete all meal plan items for a given date (remove day from schedule)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid meal plan ID' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date')
    if (!dateStr) {
      return NextResponse.json({ error: 'Query parameter date is required (YYYY-MM-DD)' }, { status: 400 })
    }
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const result = await prisma.mealPlanItem.deleteMany({
      where: {
        mealPlanId: id,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    })

    return NextResponse.json({ message: 'Day removed from schedule', count: result.count })
  } catch (error) {
    console.error('Error deleting meal plan items by date:', error)
    return NextResponse.json({ error: 'Failed to remove day' }, { status: 500 })
  }
}
