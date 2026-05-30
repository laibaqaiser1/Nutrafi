import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { normalizeWeeklySkipDays } from '@/lib/meal-plan-skip-days'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchTemplateSchema = z.object({
  label: z.string().min(1).optional(),
  planType: z.enum(['WEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
  days: z.number().int().min(1).max(366).optional(),
  mealsPerDay: z.number().int().min(1).max(5).optional(),
  timeSlots: z.array(z.string()).optional(),
  weeklySkipDays: z
    .array(z.number().int().min(0).max(7))
    .transform((arr) => normalizeWeeklySkipDays(arr))
    .optional(),
  notes: z.string().optional().nullable(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 })
    }

    const template = await prisma.mealPlanTemplate.findUnique({
      where: { id },
      include: {
        items: { orderBy: [{ weekday: 'asc' }, { slotIndex: 'asc' }] },
      },
    })

    if (!template) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(template, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' },
    })
  } catch (error) {
    console.error('Error fetching meal plan template:', error)
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 })
  }
}

export async function PATCH(
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
    const data = patchTemplateSchema.parse(body)

    const existing = await prisma.mealPlanTemplate.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const nextMealsPerDay = data.mealsPerDay ?? existing.mealsPerDay

    const template = await prisma.$transaction(async (tx) => {
      const slots =
        data.timeSlots !== undefined
          ? data.timeSlots.filter((s) => typeof s === 'string' && s.trim().length > 0)
          : undefined

      const updated = await tx.mealPlanTemplate.update({
        where: { id },
        data: {
          ...(data.label !== undefined ? { label: data.label.trim() } : {}),
          ...(data.planType !== undefined ? { planType: data.planType } : {}),
          ...(data.days !== undefined ? { days: data.days } : {}),
          ...(data.mealsPerDay !== undefined ? { mealsPerDay: data.mealsPerDay } : {}),
          ...(data.weeklySkipDays !== undefined ? { weeklySkipDays: data.weeklySkipDays } : {}),
          ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
          ...(slots !== undefined ? { timeSlots: slots.length > 0 ? slots : undefined } : {}),
        },
      })

      await tx.mealPlanTemplateItem.deleteMany({
        where: {
          templateId: id,
          slotIndex: { gte: nextMealsPerDay },
        },
      })

      return updated
    })

    return NextResponse.json(template)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error updating meal plan template:', error)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
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

    await prisma.mealPlanTemplate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting meal plan template:', error)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
