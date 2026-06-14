import { NextRequest, NextResponse } from 'next/server'
import { cronAuthConfigured, verifyCronRequest } from '@/lib/whatsapp/agent/cron-auth'
import { runMealReminders } from '@/lib/whatsapp/agent/run-meal-reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Cron: remind customers to add tomorrow's meals (WhatsApp template).
 *
 * Auth: Authorization: Bearer <WHATSAPP_AGENT_CRON_SECRET>
 *       (also accepts Vercel CRON_SECRET, x-cron-secret, ?secret=)
 *
 * Optional query:
 *   ?date=yyyy-MM-dd — target reminder day (default: tomorrow)
 *   ?customerIds=12,45 — this run only (overrides env allowlist)
 */
export async function GET(request: NextRequest) {
  return handleCron(request)
}

export async function POST(request: NextRequest) {
  return handleCron(request)
}

async function handleCron(request: NextRequest) {
  if (!cronAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          'Cron secret not configured. Set WHATSAPP_AGENT_CRON_SECRET in environment.',
      },
      { status: 503 }
    )
  }

  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const dateParam = request.nextUrl.searchParams.get('date')?.trim()
    const targetDateYmd =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined

    const customerIdsParam = request.nextUrl.searchParams.get('customerIds')?.trim()
    const customerIds = customerIdsParam
      ? customerIdsParam
          .split(/[,;\s]+/)
          .map((s) => parseInt(s, 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      : undefined

    const result = await runMealReminders({ targetDateYmd, customerIds })

    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (error) {
    console.error('[whatsapp agent cron reminders]', error)
    return NextResponse.json(
      { error: 'Cron job failed', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
