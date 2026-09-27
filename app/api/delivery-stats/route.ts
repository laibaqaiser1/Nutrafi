import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { getDeliveryStats } from '@/lib/delivery-stats'
import { endOfDay, parseISO, startOfDay, subDays } from 'date-fns'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleReports)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    const now = new Date()
    let from = fromParam ? startOfDay(parseISO(fromParam)) : startOfDay(now)
    let to = toParam ? startOfDay(parseISO(toParam)) : startOfDay(now)

    // Cap range at 62 days to keep queries light (covers ~2 months)
    const maxSpanMs = 62 * 24 * 60 * 60 * 1000
    if (to.getTime() - from.getTime() > maxSpanMs) {
      from = startOfDay(subDays(to, 61))
    }
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: 'Invalid from/to date' }, { status: 400 })
    }
    if (from > to) {
      return NextResponse.json({ error: 'from must be on or before to' }, { status: 400 })
    }

    const stats = await getDeliveryStats(from, endOfDay(to))
    return NextResponse.json(stats)
  } catch (error) {
    console.error('delivery-stats error:', error)
    return NextResponse.json({ error: 'Failed to load delivery stats' }, { status: 500 })
  }
}
