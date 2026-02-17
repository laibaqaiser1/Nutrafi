import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

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




