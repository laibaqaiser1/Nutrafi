import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { syncMealPlanRemainingMeals } from '@/lib/meal-plan-balance'
import { z } from 'zod'

const mealPlanItemUpdateSchema = z.object({
  date: z.string().transform((str) => new Date(str)).optional(),
  timeSlot: z.string().optional(),
  dishId: z.union([z.string(), z.number()]).transform((v) => {
    if (v === '' || v === null || v === undefined) return null
    const n = typeof v === 'number' ? v : parseInt(String(v), 10)
    return Number.isNaN(n) ? null : n
  }).optional().nullable(),
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
  /** True = not counted toward balance (clears delivery). False = clear the flag only. */
  wrongDelivery: z.boolean().optional(),
  customNote: z.string().optional().nullable(),
})

// PATCH - Update meal plan item by id (e.g. change timeSlot or dish without creating duplicate)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam, itemId: itemIdParam } = await params
    const id = parseIdParam(idParam)
    const itemId = parseIdParam(itemIdParam)
    if (id === null || itemId === null) {
      return NextResponse.json({ error: 'Invalid meal plan or item ID' }, { status: 400 })
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

    // customNote = plain text only. deliveryType and location in their own columns.
    const updatePayload: Record<string, unknown> = {
      ...(data.date !== undefined && { date: data.date }),
      ...(data.timeSlot !== undefined && { timeSlot: data.timeSlot }),
      ...(data.deliveryTime !== undefined && { deliveryTime: data.deliveryTime }),
      ...(data.deliveryType !== undefined && { deliveryType: data.deliveryType }),
      ...(data.location !== undefined && { deliveryLocation: data.location }),
      ...(data.customNote !== undefined && { customNote: data.customNote === null || (typeof data.customNote === 'string' && data.customNote.trim() === '') ? null : String(data.customNote).trim() }),
      ...(data.isSkipped !== undefined && { isSkipped: data.isSkipped }),
      ...dishData,
    }

    if (data.wrongDelivery === true && (item.isSkipped || data.isSkipped === true)) {
      return NextResponse.json(
        { error: 'Skipped meals cannot be marked as wrong delivery' },
        { status: 400 }
      )
    }

    if (data.isSkipped === true) {
      updatePayload.wrongDelivery = false
      updatePayload.isDelivered = false
      updatePayload.deliveredAt = null
    }

    if (data.wrongDelivery === true) {
      updatePayload.wrongDelivery = true
      updatePayload.isDelivered = false
      updatePayload.deliveredAt = null
    } else if (data.wrongDelivery === false) {
      updatePayload.wrongDelivery = false
    }

    const syncBalance = data.wrongDelivery !== undefined

    if (syncBalance) {
      const { updated, remainingMeals } = await prisma.$transaction(async (tx) => {
        const updated = await tx.mealPlanItem.update({
          where: { id: itemId },
          data: updatePayload,
        })
        const remainingMeals = await syncMealPlanRemainingMeals(tx, id)
        return { updated, remainingMeals }
      })
      return NextResponse.json({ ...updated, remainingMeals })
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
    const { id: idParam, itemId: itemIdParam } = await params
    const id = parseIdParam(idParam)
    const itemId = parseIdParam(itemIdParam)
    if (id === null || itemId === null) {
      return NextResponse.json({ error: 'Invalid meal plan or item ID' }, { status: 400 })
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






