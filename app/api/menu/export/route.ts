import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dishes = await prisma.dish.findMany({
      orderBy: { name: 'asc' },
    })

    // Prepare data for Excel
    const excelData = dishes.map(dish => ({
      'Dish ID': dish.id,
      'Name': dish.name,
      'Description': dish.description || '',
      'Category': dish.category,
      'Ingredients': dish.ingredients || '',
      'Allergens': dish.allergens || '',
      'Calories (kcal)': dish.calories,
      'Protein (g)': dish.protein,
      'Carbs (g)': dish.carbs,
      'Fats (g)': dish.fats,
      'Price (AED)': dish.price || '',
      'Status': dish.status,
      'Created At': dish.createdAt.toISOString(),
    }))

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)
    XLSX.utils.book_append_sheet(wb, ws, 'Menu')

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // Return as downloadable file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="nutrafi-menu-${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Error exporting menu:', error)
    return NextResponse.json({ error: 'Failed to export menu' }, { status: 500 })
  }
}

