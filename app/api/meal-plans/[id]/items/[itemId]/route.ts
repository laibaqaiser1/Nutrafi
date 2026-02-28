import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const mealPlanItemUpdateSchema = z.object({
  date: z.string().transform((str) => new Date(str)).optional(),
  timeSlot: z.string().optional(),
  dishId: z.string().optional().nullable(),
  dishName: z.string().optional().nullable(),
  dishDescription: z.string().optional().nullable(),
  dishCategory: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'LUNCH_DINNER', 'SNACK', 'SMOOTHIE', 'JUICE']).optional().nullable(),
  ingredients: z.string().optional().nullable(),
  allergens: z.string().optional().nullable(),
  calories: z.number().int().optional().nullable(),
  protein: z.number().optional().nullable(),
  carbs: z.number().optional().nullable(),
  fats: z.number().optional().nullable(),
  price: z.number().optional().nullable(),
  deliveryTime: z.string().optional().nullable(),
  deliveryType: z.enum(['delivery', 'pickup']).optional(),
  location: z.string().optional(),
  isSkipped: z.boolean().optional(),
  customNote: z.string().optional().nullable(),
})

// PATCH - Update meal plan item by id (e.g. change timeSlot or dish without creating duplicate)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getServerSession()
    const { id, itemId } = await params
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const item = await prisma.mealPlanItem.findUnique({
      where: { id: itemId },
    })
    if (!item || item.mealPlanId !== id) {
      return NextResponse.json({ error: 'Meal plan item not found' }, { status: 404 })
    }

    const body = await request.json()
    const data = mealPlanItemUpdateSchema.parse(body)

    let dishData: Record<string, unknown> = {}
    if (data.dishId) {
      const dish = await prisma.dish.findUnique({ where: { id: data.dishId } })
      if (dish) {
        dishData = {
          dishId: data.dishId,
          dishName: data.dishName ?? dish.name,
          dishDescription: data.dishDescription !== undefined ? data.dishDescription : dish.description,
          dishCategory: data.dishCategory ?? dish.category,
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
      dishData = {
        dishId: null,
        dishName: data.dishName,
        dishDescription: data.dishDescription ?? undefined,
        dishCategory: data.dishCategory ?? 'LUNCH_DINNER',
        ingredients: data.ingredients ?? undefined,
        allergens: data.allergens ?? undefined,
        calories: data.calories ?? undefined,
        protein: data.protein ?? undefined,
        carbs: data.carbs ?? undefined,
        fats: data.fats ?? undefined,
        price: data.price ?? undefined,
      }
    }

    const customNoteObj: Record<string, string> = {}
    if (data.deliveryType) customNoteObj.deliveryType = data.deliveryType
    if (data.location !== undefined) customNoteObj.location = data.location
    if (typeof data.customNote === 'string') customNoteObj.note = data.customNote

    const updatePayload: Record<string, unknown> = {
      ...(data.date !== undefined && { date: data.date }),
      ...(data.timeSlot !== undefined && { timeSlot: data.timeSlot }),
      ...(data.deliveryTime !== undefined && { deliveryTime: data.deliveryTime }),
      ...(data.isSkipped !== undefined && { isSkipped: data.isSkipped }),
      ...(Object.keys(customNoteObj).length > 0 && { customNote: JSON.stringify(customNoteObj) }),
      ...dishData,
    }

    const updated = await prisma.mealPlanItem.update({
      where: { id: itemId },
      data: updatePayload,
    })
    return NextResponse.json(updated)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    // Unique constraint on (mealPlanId, date, timeSlot) - another item already has this slot
    const prismaError = error as { code?: string; meta?: { target?: string[] } }
    if (prismaError?.code === 'P2002' && Array.isArray(prismaError?.meta?.target) && prismaError.meta.target.includes('timeSlot')) {
      return NextResponse.json(
        { error: 'Another meal already exists for this date and time slot. Please choose a different time slot or update the other meal first.' },
        { status: 409 }
      )
    }
    console.error('Error updating meal plan item:', error)
    return NextResponse.json({ error: 'Failed to update meal plan item' }, { status: 500 })
  }
}

// DELETE - Delete meal plan item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getServerSession()
    const { id, itemId } = await params
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the item belongs to this meal plan
    const item = await prisma.mealPlanItem.findUnique({
      where: { id: itemId },
    })

    if (!item || item.mealPlanId !== id) {
      return NextResponse.json({ error: 'Meal plan item not found' }, { status: 404 })
    }

    // Delete the item
    await prisma.mealPlanItem.delete({
      where: { id: itemId },
    })

    return NextResponse.json({ message: 'Meal plan item deleted successfully' })
  } catch (error) {
    console.error('Error deleting meal plan item:', error)
    return NextResponse.json({ error: 'Failed to delete meal plan item' }, { status: 500 })
  }
}






