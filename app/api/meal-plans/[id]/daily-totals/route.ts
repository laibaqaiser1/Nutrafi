import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// GET - Get daily totals for a meal plan
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    const { id } = await params
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    if (!date) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 })
    }

    const items = await prisma.mealPlanItem.findMany({
      where: {
        mealPlanId: id,
        date: new Date(date),
        isSkipped: false,
      },
    })

    const totals = items.reduce(
      (acc, item) => {
        // Use dish data directly from MealPlanItem (customized per customer)
        acc.calories += item.calories ?? 0
        acc.protein += item.protein ?? 0
        acc.carbs += item.carbs ?? 0
        acc.fats += item.fats ?? 0
        return acc
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    )

    return NextResponse.json(totals)
  } catch (error) {
    console.error('Error calculating daily totals:', error)
    return NextResponse.json({ error: 'Failed to calculate daily totals' }, { status: 500 })
  }
}

