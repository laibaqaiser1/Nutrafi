import { prisma } from '../lib/prisma'

async function migrateMealPlanItemData() {
  try {
    console.log('Starting migration of meal plan item data...')

    // Get all meal plan items that have a dishId
    const itemsWithDish = await prisma.mealPlanItem.findMany({
      where: {
        dishId: { not: null },
      },
      include: {
        dish: true,
      },
    })

    console.log(`Found ${itemsWithDish.length} meal plan items with dish references`)

    // Update each item with dish data
    for (const item of itemsWithDish) {
      if (item.dish) {
        await prisma.mealPlanItem.update({
          where: { id: item.id },
          data: {
            dishName: item.dish.name,
            dishDescription: item.dish.description,
            dishCategory: item.dish.category,
            ingredients: item.dish.ingredients,
            allergens: item.dish.allergens,
            calories: item.dish.calories,
            protein: item.dish.protein,
            carbs: item.dish.carbs,
            fats: item.dish.fats,
            price: item.dish.price,
          },
        })
        console.log(`✓ Updated item ${item.id} with dish data from ${item.dish.name}`)
      }
    }

    // Get all meal plan items without dishId (need to set defaults)
    const itemsWithoutDish = await prisma.mealPlanItem.findMany({
      where: {
        OR: [
          { dishId: null },
          { dishName: null },
        ],
      },
    })

    console.log(`Found ${itemsWithoutDish.length} meal plan items without dish data`)

    // Set default values for items without dish
    for (const item of itemsWithoutDish) {
      await prisma.mealPlanItem.update({
        where: { id: item.id },
        data: {
          dishName: item.dishName || 'Custom Meal',
          dishCategory: item.dishCategory || 'LUNCH_DINNER',
          calories: item.calories || 0,
          protein: item.protein || 0,
          carbs: item.carbs || 0,
          fats: item.fats || 0,
        },
      })
      console.log(`✓ Set default values for item ${item.id}`)
    }

    console.log('✓ Migration completed successfully!')
  } catch (error) {
    console.error('Error migrating data:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

migrateMealPlanItemData()



