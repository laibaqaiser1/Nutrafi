import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const dishSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'LUNCH_DINNER', 'SNACK', 'SMOOTHIE', 'JUICE']).optional(),
  ingredients: z.string().optional(),
  allergens: z.string().optional(),
  calories: z.number().int().min(0).optional(),
  protein: z.number().min(0).optional(),
  carbs: z.number().min(0).optional(),
  fats: z.number().min(0).optional(),
  price: z.number().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
})

// GET - Get single dish
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

    const dish = await prisma.dish.findUnique({
      where: { id },
    })

    if (!dish) {
      return NextResponse.json({ error: 'Dish not found' }, { status: 404 })
    }

    return NextResponse.json(dish)
  } catch (error) {
    console.error('Error fetching dish:', error)
    return NextResponse.json({ error: 'Failed to fetch dish' }, { status: 500 })
  }
}

// PUT - Update dish
export async function PUT(
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
    const data = dishSchema.parse(body)

    const dish = await prisma.dish.update({
      where: { id },
      data,
    })

    return NextResponse.json(dish)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error updating dish:', error)
    return NextResponse.json({ error: 'Failed to update dish' }, { status: 500 })
  }
}

// DELETE - Delete dish
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    const { id } = await params
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.dish.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Dish deleted successfully' })
  } catch (error) {
    console.error('Error deleting dish:', error)
    return NextResponse.json({ error: 'Failed to delete dish' }, { status: 500 })
  }
}

