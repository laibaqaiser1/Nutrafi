import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { getKitchenUnscheduledRows } from '@/lib/kitchen-unscheduled-rows'

/**
 * ACTIVE meal plans that cover the given calendar day, where the customer still needs
 * at least one non-skipped meal with a dish (same bar as kitchen "scheduled").
 * Excludes "all items skipped" days (handled on the scheduled tab as skipped-day rows).
 * One row per customer: first incomplete plan (lowest id) is used for the editor link.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    if (!date) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 })
    }

    const rows = await getKitchenUnscheduledRows(date)

    return NextResponse.json({
      rows,
      date,
      total: rows.length,
    })
  } catch (error) {
    console.error('Error fetching unscheduled kitchen rows:', error)
    return NextResponse.json({ error: 'Failed to load unscheduled meals' }, { status: 500 })
  }
}
