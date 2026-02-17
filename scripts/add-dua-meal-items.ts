import { prisma } from '../lib/prisma'
import * as dotenv from 'dotenv'
import { startOfWeek, addDays, format } from 'date-fns'

dotenv.config()

// Meal plan data from the table
const mealPlanData = [
  {
    day: 'Monday',
    meals: [
      {
        dishName: 'Tender Chicken Clean Bowl',
        timeSlot: '13:00', // Lunch
        ingredients: 'chicken breast, Olive oil, chickpeas and corn, rice',
        allergens: 'None',
        calories: 635,
        protein: 52,
        carbs: 56,
        fats: 20,
        instructions: 'no tomatoes, 50 g additional Rice',
      },
      {
        dishName: 'Spicy Tender Chicken Wrap',
        timeSlot: '18:00', // Dinner
        ingredients: 'chicken breast, whole wheat wrap, lettuce, cheese',
        allergens: 'Dairy, Gluten',
        calories: 495,
        protein: 47,
        carbs: 37,
        fats: 17,
        instructions: 'no tomatoes',
      },
    ],
  },
  {
    day: 'Tuesday',
    meals: [
      {
        dishName: 'Grilled Salmon Bowl',
        timeSlot: '13:00',
        ingredients: 'salmon, rice, chickpeas and corn',
        allergens: 'Fish',
        calories: 575,
        protein: 39,
        carbs: 55,
        fats: 21,
        instructions: 'no tomatoes, 50 g additional Rice',
      },
      {
        dishName: 'Club Sandwich',
        timeSlot: '18:00',
        ingredients: 'chicken breast, egg, whole wheat bread, lettuce, tomato, light mayo, cream cheese, bacon.',
        allergens: 'Dairy, Eggs, Gluten',
        calories: 565,
        protein: 45,
        carbs: 41,
        fats: 26,
        instructions: 'no tomatoes',
      },
    ],
  },
  {
    day: 'Wednesday',
    meals: [
      {
        dishName: 'Chicken Thai With Rice',
        timeSlot: '13:00',
        ingredients: 'chicken breast, rice, Thai curry sauce, cucumber and carrot.',
        allergens: 'None',
        calories: 520,
        protein: 50,
        carbs: 57,
        fats: 7,
        instructions: 'no tomatoes, 50 g additional Rice',
      },
      {
        dishName: 'Shrimp Dynamite with Rice',
        timeSlot: '18:00',
        ingredients: 'shrimp, rice, dynamite sauce, breadcrumbs, cucumber and carrot',
        allergens: 'Gluten, Shellfish',
        calories: 576,
        protein: 44,
        carbs: 56,
        fats: 12,
        instructions: 'no tomatoes',
      },
    ],
  },
  {
    day: 'Thursday',
    meals: [
      {
        dishName: 'Beef Mongolian with Rice',
        timeSlot: '13:00',
        ingredients: 'Beef, rice, Mongolian sauce, cucumber and carrot, sesame seed',
        allergens: 'Sesame',
        calories: 495,
        protein: 45,
        carbs: 55,
        fats: 9,
        instructions: 'no tomatoes, 50 g additional Rice',
      },
      {
        dishName: 'Chicken Pasta Mix Sauce',
        timeSlot: '18:00',
        ingredients: 'chicken breast, whole wheat pasta, cream cheese and mushroom, Parmesan cheese, and red sauce.',
        allergens: 'Dairy, Gluten',
        calories: 590,
        protein: 63,
        carbs: 41,
        fats: 20,
        instructions: 'no tomatoes',
      },
    ],
  },
  {
    day: 'Friday',
    meals: [
      {
        dishName: 'Beef Tortilla',
        timeSlot: '13:00',
        ingredients: 'beef, whole wheat tortilla, cheese, peppers, onion, cream cheese and mayonnaise.',
        allergens: 'Dairy, Gluten',
        calories: 580,
        protein: 41,
        carbs: 35,
        fats: 31,
        instructions: 'no tomatoes',
      },
      {
        dishName: 'Chicken Pasta White Sauce',
        timeSlot: '18:00',
        ingredients: 'chicken breast, whole wheat pasta, white sauce (contains cream cheese and mushroom), parmesan cheese',
        allergens: 'Dairy, Gluten',
        calories: 515,
        protein: 58,
        carbs: 34,
        fats: 17,
        instructions: 'no tomatoes',
      },
    ],
  },
]

async function addDuaMealItems() {
  try {
    console.log('Finding customer "dua"...\n')
    
    // Find customer "dua" (case-insensitive)
    const customer = await prisma.customer.findFirst({
      where: {
        fullName: {
          contains: 'dua',
          mode: 'insensitive',
        },
      },
      include: {
        mealPlans: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!customer) {
      console.error('Customer "dua" not found. Please create the customer first.')
      process.exit(1)
    }

    console.log(`✓ Found customer: ${customer.fullName} (${customer.id})\n`)

    // Get active meal plan or create one
    let mealPlan = customer.mealPlans[0]

    if (!mealPlan) {
      console.log('No active meal plan found. Creating a new meal plan...\n')
      
      // Create a meal plan for this week (Monday to Friday)
      const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
      const thisFriday = addDays(thisMonday, 4)
      
      mealPlan = await prisma.mealPlan.create({
        data: {
          customerId: customer.id,
          planType: 'WEEKLY',
          startDate: thisMonday,
          endDate: thisFriday,
          days: 5,
          mealsPerDay: 2,
          timeSlots: JSON.stringify(['13:00', '18:00']),
          status: 'ACTIVE',
          totalMeals: 10,
          remainingMeals: 10,
        },
      })
      console.log(`✓ Created meal plan: ${mealPlan.id}\n`)
    } else {
      console.log(`✓ Using existing meal plan: ${mealPlan.id}\n`)
    }

    // Delete all existing meal plan items
    console.log('Deleting existing meal plan items...')
    const deleteResult = await prisma.mealPlanItem.deleteMany({
      where: {
        mealPlanId: mealPlan.id,
      },
    })
    console.log(`✓ Deleted ${deleteResult.count} existing meal plan items\n`)

    // Determine the week start date (this Monday or next Monday)
    const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 })
    const dayOffsets: Record<string, number> = {
      Monday: 0,
      Tuesday: 1,
      Wednesday: 2,
      Thursday: 3,
      Friday: 4,
    }

    // Create meal plan items
    console.log('Creating meal plan items...\n')
    let created = 0

    for (const dayData of mealPlanData) {
      const date = addDays(thisMonday, dayOffsets[dayData.day])
      
      for (const meal of dayData.meals) {
        // Try to find the dish by name
        let dish = await prisma.dish.findFirst({
          where: {
            name: {
              contains: meal.dishName,
              mode: 'insensitive',
            },
          },
        })

        // If dish not found, try partial match
        if (!dish) {
          const searchTerms = meal.dishName.split(' ').filter(w => w.length > 3)
          for (const term of searchTerms) {
            dish = await prisma.dish.findFirst({
              where: {
                name: {
                  contains: term,
                  mode: 'insensitive',
                },
              },
            })
            if (dish) break
          }
        }

        // Create meal plan item
        const customNote: any = {}
        if (meal.instructions) {
          customNote.instructions = meal.instructions
        }

        const mealPlanItem = await prisma.mealPlanItem.create({
          data: {
            mealPlanId: mealPlan.id,
            date: date,
            timeSlot: meal.timeSlot,
            dishId: dish?.id || undefined,
            customNote: Object.keys(customNote).length > 0 ? JSON.stringify(customNote) : undefined,
            // Store custom dish data
            dishName: meal.dishName,
            ingredients: meal.ingredients,
            allergens: meal.allergens,
            calories: meal.calories,
            protein: meal.protein,
            carbs: meal.carbs,
            fats: meal.fats,
          },
        })

        console.log(`✓ Created: ${format(date, 'EEE, MMM dd')} ${meal.timeSlot} - ${meal.dishName}${dish ? ` (dish: ${dish.name})` : ' (no dish match)'}`)
        created++
      }
    }

    console.log(`\n✓ Successfully created ${created} meal plan items for ${customer.fullName}`)
    console.log(`  Meal Plan ID: ${mealPlan.id}`)
    console.log(`  Week: ${format(thisMonday, 'MMM dd')} - ${format(addDays(thisMonday, 4), 'MMM dd, yyyy')}`)

  } catch (error: any) {
    console.error('Error adding meal items:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

addDuaMealItems()

