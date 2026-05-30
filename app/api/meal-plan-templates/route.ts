import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'
import { normalizeWeeklySkipDays } from '@/lib/meal-plan-skip-days'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/** Default meal plan templates: week pattern (Mon–Sun items) for easy copy to customers; `planType`/`days` kept for future monthly/custom contracts. */

const createTemplateSchema = z.object({
  label: z.string().min(1),
  planType: z.enum(['WEEKLY', 'MONTHLY', 'CUSTOM']),
  days: z.number().int().min(1).max(366),
  mealsPerDay: z.number().int().min(1).max(5),
  timeSlots: z.array(z.string()).optional(),
  weeklySkipDays: z
    .array(z.number().int().min(0).max(7))
    .transform((arr) => normalizeWeeklySkipDays(arr))
    .optional(),
  notes: z.string().optional().nullable(),
})

// GET — list templates
export async function GET() {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const templates = await prisma.mealPlanTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { items: true } },
      },
    })

    return NextResponse.json(templates, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' },
    })
  } catch (error) {
    console.error('Error fetching meal plan templates:', error)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

// POST — create template shell (menu edited on detail page)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleMealPlans)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = createTemplateSchema.parse(body)

    const slots = (data.timeSlots ?? []).filter((s) => typeof s === 'string' && s.trim().length > 0)

    const template = await prisma.mealPlanTemplate.create({
      data: {
        label: data.label.trim(),
        planType: data.planType,
        days: data.days,
        mealsPerDay: data.mealsPerDay,
        ...(slots.length > 0 ? { timeSlots: slots } : {}),
        ...(data.weeklySkipDays !== undefined ? { weeklySkipDays: data.weeklySkipDays } : {}),
        notes: data.notes?.trim() || null,
      },
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error creating meal plan template:', error)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}
