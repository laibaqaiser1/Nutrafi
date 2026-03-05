import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { format, addDays } from 'date-fns'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCategory } from '@/lib/utils'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid meal plan ID' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const weekParam = searchParams.get('week')
    const weekNumber = weekParam ? parseInt(weekParam, 10) : null

    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id },
      include: {
        customer: true,
        plan: true,
        mealPlanItems: {
          orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
        },
      },
    })

    if (!mealPlan) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }

    let items = mealPlan.mealPlanItems
    let title = 'Meal Plan'
    let filenameSuffix = format(new Date(), 'yyyy-MM-dd')

    if (weekNumber !== null && weekNumber >= 1 && mealPlan.startDate) {
      const planStart = new Date(mealPlan.startDate)
      const weekStart = addDays(planStart, (weekNumber - 1) * 7)
      const weekEnd = addDays(weekStart, 6)
      const weekStartStr = format(weekStart, 'yyyy-MM-dd')
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd')
      items = mealPlan.mealPlanItems.filter((item) => {
        const d = format(new Date(item.date), 'yyyy-MM-dd')
        return d >= weekStartStr && d <= weekEndStr
      })
      title = `Meal Plan - Week ${weekNumber}`
      filenameSuffix = `week-${weekNumber}-${weekStartStr}-to-${weekEndStr}`
    }

    const totalDisplay = mealPlan.totalMeals ?? mealPlan.days * mealPlan.mealsPerDay
    const remainingDisplay = mealPlan.remainingMeals ?? '-'

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    let y = 18

    // Title
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(title, 14, y)
    y += 10

    // Summary (same as full plan)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const summary = [
      `Customer: ${mealPlan.customer.fullName}`,
      `Plan Type: ${mealPlan.planType}  |  Meals per day: ${mealPlan.mealsPerDay}`,
      `Start: ${mealPlan.startDate ? format(new Date(mealPlan.startDate), 'd MMM yyyy') : '-'}  |  End: ${mealPlan.endDate ? format(new Date(mealPlan.endDate), 'd MMM yyyy') : '-'}`,
      `Total Meals: ${totalDisplay}  |  Remaining: ${remainingDisplay}  |  Status: ${mealPlan.status}`,
    ]
    summary.forEach((line) => {
      doc.text(line, 14, y)
      y += 6
    })
    y += 8

    // Meals table - Date column shows day name + date (e.g. Monday, 3 Mar 2026)
    const tableHead = [['Day / Date', 'Time', 'Dish', 'Category', 'Status']]
    const tableBody = items.map((item) => {
      const status = item.isSkipped ? 'Skipped' : item.isDelivered ? 'Delivered' : 'Scheduled'
      return [
        format(new Date(item.date), 'EEEE, d MMM yyyy'),
        item.timeSlot || '-',
        item.dishName || (item.isSkipped ? '—' : 'Not set'),
        item.dishCategory ? formatCategory(item.dishCategory) : '-',
        status,
      ]
    })

    autoTable(doc, {
      head: tableHead,
      body: tableBody,
      startY: y,
      theme: 'striped',
      headStyles: { fillColor: [114, 141, 83], textColor: 255, fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
      columnStyles: {
        0: { cellWidth: 46 },
        1: { cellWidth: 28 },
        2: { cellWidth: 42 },
        3: { cellWidth: 32 },
        4: { cellWidth: 28 },
      },
    })

    const filename = `meal-plan-${mealPlan.customer.fullName.replace(/\s+/g, '-')}-${filenameSuffix}.pdf`

    const pdfBuffer = Buffer.from(doc.output('arraybuffer') as ArrayBuffer)

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (error) {
    console.error('Error exporting meal plan PDF:', error)
    return NextResponse.json({ error: 'Failed to export meal plan' }, { status: 500 })
  }
}
