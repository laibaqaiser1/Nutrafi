import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'

/** GET - Meal plan balance / schedule history (newest first) */
export async function GET(
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
      return NextResponse.json({ error: 'Invalid meal plan ID' }, { status: 400 })
    }

    const plan = await prisma.mealPlan.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!plan) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }

    const history = await prisma.mealPlanHistory.findMany({
      where: { mealPlanId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ history })
  } catch (error) {
    console.error('Error fetching meal plan history:', error)
    return NextResponse.json({ error: 'Failed to fetch meal plan history' }, { status: 500 })
  }
}
