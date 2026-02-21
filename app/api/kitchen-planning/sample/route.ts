import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import * as XLSX from 'xlsx'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sheet = searchParams.get('sheet') || 'chef' // 'chef' or 'rider'

    // Sample data with realistic examples
    let excelData: any[] = []
    let sheetName = 'Sample'

    if (sheet === 'chef') {
      // Chef Sheet - meal details and preparation info with sample data
      excelData = [
        {
          'Date': '02/21/2026',
          'Time Slot': '08:00',
          'Delivery Time': '08:00',
          'Customer Name': 'Garry',
          'Dish Name': 'Salmon Lemon Sauce with Rice',
          'Category': 'Lunch/Dinner',
          'Ingredients': 'salmon, rice, lemon sauce, broccoli',
          'Allergens': 'Fish',
          'Calories (kcal)': 530,
          'Protein (g)': 38.0,
          'Carbs (g)': 41.0,
          'Fats (g)': 21.0,
          'Instructions': 'Please ensure salmon is well-cooked',
          'Status': 'Active',
        },
        {
          'Date': '02/21/2026',
          'Time Slot': '10:00',
          'Delivery Time': '10:00',
          'Customer Name': 'Garry',
          'Dish Name': 'Shrimp Dynamite with Rice',
          'Category': 'Lunch/Dinner',
          'Ingredients': 'shrimp, rice, dynamite sauce, breadcrumbs, cucumber and carrot',
          'Allergens': 'Gluten, Shellfish',
          'Calories (kcal)': 576,
          'Protein (g)': 44.0,
          'Carbs (g)': 56.0,
          'Fats (g)': 12.0,
          'Instructions': 'Extra sauce on the side',
          'Status': 'Active',
        },
        {
          'Date': '02/22/2026',
          'Time Slot': '13:00',
          'Delivery Time': '13:00',
          'Customer Name': 'Dua',
          'Dish Name': 'Beef Tortilla',
          'Category': 'Lunch/Dinner',
          'Ingredients': 'beef, whole wheat tortilla, cheese, peppers, onion, cream cheese and mayonnaise',
          'Allergens': 'Dairy, Gluten',
          'Calories (kcal)': 580,
          'Protein (g)': 41.0,
          'Carbs (g)': 35.0,
          'Fats (g)': 31.0,
          'Instructions': 'No tomatoes',
          'Status': 'Active',
        },
        {
          'Date': '02/22/2026',
          'Time Slot': '18:00',
          'Delivery Time': '18:00',
          'Customer Name': 'Dua',
          'Dish Name': 'Chicken Pasta White Sauce',
          'Category': 'Lunch/Dinner',
          'Ingredients': 'chicken breast, whole wheat pasta, white sauce (contains cream cheese and mushroom), parmesan cheese',
          'Allergens': 'Dairy, Gluten',
          'Calories (kcal)': 515,
          'Protein (g)': 58.0,
          'Carbs (g)': 34.0,
          'Fats (g)': 17.0,
          'Instructions': 'Extra parmesan cheese',
          'Status': 'Active',
        },
      ]
      sheetName = 'Chef'
    } else if (sheet === 'rider') {
      // Rider Sheet - delivery information with sample data (matching sample sheet fields)
      excelData = [
        {
          'Date': '02/21/2026',
          'Delivery Time': '08:00',
          'Customer Name': 'Garry',
          'Contact Number': '569841248',
          'Delivery Address': '123 Business Bay, Dubai',
          'Delivery Area': 'near WTC mall',
          'Dish Name': 'Salmon Lemon Sauce with Rice',
        },
        {
          'Date': '02/21/2026',
          'Delivery Time': '10:00',
          'Customer Name': 'Garry',
          'Contact Number': '569841248',
          'Delivery Address': '123 Business Bay, Dubai',
          'Delivery Area': 'near WTC mall',
          'Dish Name': 'Shrimp Dynamite with Rice',
        },
        {
          'Date': '02/22/2026',
          'Delivery Time': '13:00',
          'Customer Name': 'Dua',
          'Contact Number': '501234567',
          'Delivery Address': '456 Marina Walk, Dubai',
          'Delivery Area': 'Dubai Marina',
          'Dish Name': 'Beef Tortilla',
        },
        {
          'Date': '02/22/2026',
          'Delivery Time': '18:00',
          'Customer Name': 'Dua',
          'Contact Number': '501234567',
          'Delivery Address': '456 Marina Walk, Dubai',
          'Delivery Area': 'Dubai Marina',
          'Dish Name': 'Chicken Pasta White Sauce',
        },
      ]
      sheetName = 'Rider'
    }

    // Create workbook with sample sheet
    const wb = XLSX.utils.book_new()
    
    // For Rider sheet, add header row "Nutrafi Kitchen Abu Dhabi" at the top
    if (sheet === 'rider' && excelData.length > 0) {
      // Create worksheet with header row
      const headerRow = [['Nutrafi Kitchen Abu Dhabi', '']]
      const dataRows = excelData.map(row => [
        row['Date'],
        row['Delivery Time'],
        row['Customer Name'],
        row['Contact Number'],
        row['Delivery Address'],
        row['Delivery Area'],
        row['Dish Name'],
        '' // Empty column to match sample format
      ])
      const allRows = [...headerRow, ...dataRows]
      const ws = XLSX.utils.aoa_to_sheet(allRows)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    } else {
      const ws = XLSX.utils.json_to_sheet(excelData)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    }

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // Generate filename
    const filename = `kitchen-planning-${sheet}-sample.xlsx`

    // Return as downloadable file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Error generating sample sheet:', error)
    return NextResponse.json({ error: 'Failed to generate sample sheet' }, { status: 500 })
  }
}

