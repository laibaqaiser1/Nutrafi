import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const dishCategoryEnum = z.enum([
  'BREAKFAST',
  'LUNCH',
  'DINNER',
  'LUNCH_DINNER',
  'SNACK',
  'SMOOTHIE',
  'JUICE',
])

const itemSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  slotIndex: z.number().int().min(0).max(4),
  isSkipped: z.boolean().optional(),
  dishId: z.number().int().positive().optional().nullable(),
  dishName: z.string().optional().nullable(),
  dishDescription: z.string().optional().nullable(),
  dishCategory: dishCategoryEnum.optional().nullable(),
  ingredients: z.string().optional().nullable(),
  allergens: z.string().optional().nullable(),
  calories: z.number().int().optional().nullable(),
  protein: z.number().optional().nullable(),
  carbs: z.number().optional().nullable(),
  fats: z.number().optional().nullable(),
  price: z.number().optional().nullable(),
  customNote: z.string().optional().nullable(),
})

const putBodySchema = z.object({
  items: z.array(itemSchema),
})

// PUT — replace all template items
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleMealPlans)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 })
    }

    const body = await request.json()
    const { items } = putBodySchema.parse(body)

    const template = await prisma.mealPlanTemplate.findUnique({ where: { id } })
    if (!template) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    for (const row of items) {
      if (row.slotIndex >= template.mealsPerDay) {
        return NextResponse.json(
          { error: `slotIndex must be < mealsPerDay (${template.mealsPerDay})` },
          { status: 400 }
        )
      }
    }

    const keys = new Set<string>()
    for (const row of items) {
      const k = `${row.weekday}-${row.slotIndex}`
      if (keys.has(k)) {
        return NextResponse.json({ error: 'Duplicate weekday + slotIndex in payload' }, { status: 400 })
      }
      keys.add(k)
    }

    await prisma.$transaction(async (tx) => {
      await tx.mealPlanTemplateItem.deleteMany({ where: { templateId: id } })
      if (items.length === 0) return
      await tx.mealPlanTemplateItem.createMany({
        data: items.map((row) => ({
          templateId: id,
          weekday: row.weekday,
          slotIndex: row.slotIndex,
          isSkipped: row.isSkipped ?? false,
          dishId: row.dishId ?? null,
          dishName: row.dishName ?? null,
          dishDescription: row.dishDescription ?? null,
          dishCategory: row.dishCategory ?? null,
          ingredients: row.ingredients ?? null,
          allergens: row.allergens ?? null,
          calories: row.calories ?? null,
          protein: row.protein ?? null,
          carbs: row.carbs ?? null,
          fats: row.fats ?? null,
          price: row.price ?? null,
          customNote: row.customNote ?? null,
        })),
      })
    })

    const updated = await prisma.mealPlanTemplate.findUnique({
      where: { id },
      include: { items: { orderBy: [{ weekday: 'asc' }, { slotIndex: 'asc' }] } },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error saving template items:', error)
    return NextResponse.json({ error: 'Failed to save template items' }, { status: 500 })
  }
}
