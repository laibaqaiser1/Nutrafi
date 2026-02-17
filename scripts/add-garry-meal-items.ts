import { prisma } from '../lib/prisma'
import * as dotenv from 'dotenv'
import { startOfWeek, addDays, format } from 'date-fns'

dotenv.config()

// Meal plan data from the table for Garry
const mealPlanData = [
  {
    day: 'Monday',
    meals: [
      {
        dishName: 'Quesadilla chicken wrap',
        timeSlot: '13:00', // Lunch
        ingredients: 'chicken, whole wheat tortilla, cheese, peppers, onion, cream cheese, Ketchup, corn, mushrooms, mozzarella, capsicum',
        allergens: 'Dairy, Gluten',
        calories: 555,
        protein: 53,
        carbs: 46,
        fats: 23,
        instructions: undefined,
      },
      {
        dishName: 'Chicken BBQ Light Cream (additional rice)',
        timeSlot: '18:00', // Dinner
        ingredients: 'chicken breast, rice, BBQ cream sauce, cucumber and carrot',
        allergens: 'Dairy',
        calories: 530,
        protein: 52,
        carbs: 55,
        fats: 9,
        instructions: '50 g additional rice',
      },
    ],
  },
  {
    day: 'Tuesday',
    meals: [
      {
        dishName: 'Shrimp Pasta Red Sauce',
        timeSlot: '13:00',
        ingredients: 'shrimp, whole wheat pasta, red sauce, Parmesan cheese',
        allergens: 'Dairy, Gluten, Shellfish',
        calories: 365,
        protein: 46,
        carbs: 37,
        fats: 7,
        instructions: undefined,
      },
      {
        dishName: 'Tender Chicken Clean Bowl',
        timeSlot: '18:00',
        ingredients: 'chicken breast, Olive oil, chickpeas and corn, rice',
        allergens: 'None',
        calories: 580,
        protein: 51,
        carbs: 44,
        fats: 20,
        instructions: undefined,
      },
    ],
  },
  {
    day: 'Wednesday',
    meals: [
      {
        dishName: 'Beef Mongolian with Rice (additional rice)',
        timeSlot: '13:00',
        ingredients: 'Beef, rice, Mongolian sauce, cucumber and carrot, sesame seed',
        allergens: 'Sesame',
        calories: 505,
        protein: 44,
        carbs: 57,
        fats: 9,
        instructions: '50 g additional rice',
      },
      {
        dishName: 'Chicken Korean with sweet Potatoes',
        timeSlot: '18:00',
        ingredients: 'chicken breast, rice, Korean sauce, cucumber and carrot',
        allergens: 'None',
        calories: 455,
        protein: 50,
        carbs: 47,
        fats: 6,
        instructions: '50 g additional sweet potatoes',
      },
    ],
  },
  {
    day: 'Thursday',
    meals: [
      {
        dishName: 'Chicken Buffalo Pizza',
        timeSlot: '13:00',
        ingredients: 'Chicken, buffalo sauce, lite mozzarella cheese, pizza dough',
        allergens: 'None',
        calories: 415,
        protein: 38,
        carbs: 33,
        fats: 14,
        instructions: undefined,
      },
      {
        dishName: 'Chicken Buffalo Tortilla',
        timeSlot: '18:00',
        ingredients: 'chicken breast, tortilla, buffalo sauce, lettuce, white onion, jalapeno, breadcrumbs, cheese slice',
        allergens: 'Dairy, Gluten',
        calories: 555,
        protein: 48,
        carbs: 51,
        fats: 17,
        instructions: undefined,
      },
    ],
  },
  {
    day: 'Friday',
    meals: [
      {
        dishName: 'Spicy Tender Chicken Wrap',
        timeSlot: '13:00',
        ingredients: 'chicken breast, whole wheat wrap, lettuce, cheese',
        allergens: 'Dairy, Gluten',
        calories: 495,
        protein: 47,
        carbs: 37,
        fats: 17,
        instructions: undefined,
      },
      {
        dishName: 'Chicken Mushroom with Rice (additional rice)',
        timeSlot: '18:00',
        ingredients: 'chicken breast, rice, mushrooms, light cream sauce, cucumber and carrot',
        allergens: 'Dairy',
        calories: 520,
        protein: 52,
        carbs: 51,
        fats: 9,
        instructions: '50 g additional rice',
      },
    ],
  },
]

async function addGarryMealItems() {
  try {
    console.log('Finding customer "Garry"...\n')
    
    // Find customer "Garry" (case-insensitive)
    const customer = await prisma.customer.findFirst({
      where: {
        fullName: {
          contains: 'garry',
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
      console.error('Customer "Garry" not found. Please create the customer first.')
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
          planType: 'MONTHLY',
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
            allergens: meal.allergens === 'None' ? null : meal.allergens,
            calories: meal.calories,
            protein: meal.protein,
            carbs: meal.carbs,
            fats: meal.fats,
            dishCategory: 'LUNCH_DINNER', // Default category
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

addGarryMealItems()

