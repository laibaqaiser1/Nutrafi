import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const dishSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'LUNCH_DINNER', 'SNACK', 'SMOOTHIE', 'JUICE']),
  ingredients: z.string().optional(),
  allergens: z.string().optional(),
  calories: z.number().int().min(0),
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fats: z.number().min(0),
  price: z.number().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
})

// GET - List dishes with filtering
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const minCalories = searchParams.get('minCalories')
    const maxCalories = searchParams.get('maxCalories')
    const minProtein = searchParams.get('minProtein')
    const maxProtein = searchParams.get('maxProtein')
    const allergen = searchParams.get('allergen')
    const ingredient = searchParams.get('ingredient')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const skip = (page - 1) * limit

    const where: any = {}

    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }

    if (category) {
      where.category = category
    }

    if (status) {
      where.status = status
    }

    if (minCalories || maxCalories) {
      where.calories = {}
      if (minCalories) where.calories.gte = parseInt(minCalories)
      if (maxCalories) where.calories.lte = parseInt(maxCalories)
    }

    if (minProtein || maxProtein) {
      where.protein = {}
      if (minProtein) where.protein.gte = parseFloat(minProtein)
      if (maxProtein) where.protein.lte = parseFloat(maxProtein)
    }

    if (allergen) {
      where.allergens = { contains: allergen, mode: 'insensitive' }
    }

    if (ingredient) {
      where.ingredients = { contains: ingredient, mode: 'insensitive' }
    }

    // Get total count
    const total = await prisma.dish.count({ where })

    // Get paginated dishes
    const dishes = await prisma.dish.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take: limit,
    })

    return NextResponse.json({
      dishes,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching dishes:', error)
    return NextResponse.json({ error: 'Failed to fetch dishes' }, { status: 500 })
  }
}

// POST - Create new dish
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = dishSchema.parse(body)

    const dish = await prisma.dish.create({
      data,
    })

    return NextResponse.json(dish, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('Error creating dish:', error)
    return NextResponse.json({ error: 'Failed to create dish' }, { status: 500 })
  }
}

