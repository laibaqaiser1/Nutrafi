import { NextRequest, NextResponse } from 'next/server'
import {
  cronAuthConfigured,
  cronAuthDiagnostics,
  cronAuthFailureReason,
  isVercelCronInvocation,
  verifyCronRequest,
} from '@/lib/whatsapp/agent/cron-auth'
import { runMealReminders } from '@/lib/whatsapp/agent/run-meal-reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LOG = '[whatsapp agent cron reminders]'

/**
 * Cron: remind customers to add tomorrow's meals (WhatsApp template).
 *
 * Auth: Authorization: Bearer <WHATSAPP_AGENT_CRON_SECRET>
 *       (also accepts Vercel CRON_SECRET, x-cron-secret, or ?secret=)
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
  const startedAt = Date.now()
  const vercelCron = isVercelCronInvocation(request)

  console.error(LOG, 'invoked', {
    method: request.method,
    vercelCron,
    hasAuthHeader: Boolean(request.headers.get('authorization')),
    dateParam: request.nextUrl.searchParams.get('date'),
    customerIdsParam: request.nextUrl.searchParams.get('customerIds'),
    env: cronAuthDiagnostics(),
  })

  if (!cronAuthConfigured()) {
    const hint = cronAuthFailureReason(request)
    console.error(LOG, 'cron secret not configured', { hint, env: cronAuthDiagnostics() })
    return NextResponse.json(
      {
        error: 'Cron secret not configured',
        hint,
        vercelCronHeader: vercelCron,
        env: cronAuthDiagnostics(),
      },
      { status: 503 }
    )
  }

  if (!verifyCronRequest(request)) {
    const reason = cronAuthFailureReason(request)
    console.error(LOG, 'auth failed', {
      vercelCron,
      hasAuthHeader: Boolean(request.headers.get('authorization')),
      hasToken: Boolean(
        request.headers.get('authorization') ||
          request.headers.get('x-cron-secret') ||
          request.nextUrl.searchParams.get('secret')
      ),
      reason,
      env: cronAuthDiagnostics(),
    })
    return NextResponse.json(
      {
        error: 'Unauthorized',
        hint: reason,
      },
      { status: 401 }
    )
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

    console.error(LOG, 'starting runMealReminders', {
      targetDateYmd: targetDateYmd ?? '(default tomorrow)',
      customerIds: customerIds ?? '(from env allowlist or all)',
    })

    const result = await runMealReminders({ targetDateYmd, customerIds })

    const level = result.failed > 0 || result.warnings.length > 0 ? 'completed with issues' : 'completed'
    console.error(LOG, level, {
      durationMs: Date.now() - startedAt,
      reminderDateYmd: result.reminderDateYmd,
      candidates: result.candidates,
      allowlistActive: result.allowlistActive,
      allowlistCustomerIds: result.allowlistCustomerIds,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      warnings: result.warnings,
      details: result.details,
    })

    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (error) {
    console.error(LOG, 'unhandled error', {
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      { error: 'Cron job failed', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
