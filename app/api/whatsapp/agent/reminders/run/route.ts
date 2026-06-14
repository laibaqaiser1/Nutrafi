import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { runMealReminders } from '@/lib/whatsapp/agent/run-meal-reminders'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  /** yyyy-MM-dd — default: tomorrow (agent timezone) */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Only these customers (must still be missing meals on target date) */
  customerIds: z.array(z.number().int().positive()).optional(),
  /**
   * When true (default) and customerIds omitted, uses WHATSAPP_AGENT_CRON_REMINDER_CUSTOMER_IDS from env.
   * Set false to test all eligible customers.
   */
  useEnvAllowlist: z.boolean().optional().default(true),
})

/**
 * Manually run meal reminders from the dashboard (testing / pilot).
 * Same logic as cron — does not use meal-plan dashboard APIs.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = bodySchema.parse(await request.json())

    const result = await runMealReminders({
      targetDateYmd: parsed.date,
      customerIds: parsed.customerIds,
      ignoreEnvAllowlist: parsed.useEnvAllowlist === false,
    })

    return NextResponse.json({ ok: result.ok, result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('[whatsapp agent reminders run]', error)
    return NextResponse.json({ error: 'Reminder run failed' }, { status: 500 })
  }
}

/** Preview who would be targeted (no messages sent). */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')?.trim()
    const targetDateYmd =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined

    const customerIdsParam = searchParams.get('customerIds')?.trim()
    const customerIds = customerIdsParam
      ? customerIdsParam
          .split(/[,;\s]+/)
          .map((s) => parseInt(s, 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      : undefined

    const useEnvAllowlist = searchParams.get('useEnvAllowlist') !== 'false'

    const { getKitchenUnscheduledRows } = await import('@/lib/kitchen-unscheduled-rows')
    const { whatsappAgentConfig } = await import('@/lib/whatsapp/agent/config')
    const { tomorrowYmdInTz } = await import('@/lib/whatsapp/agent/run-meal-reminders')
    const cfg = whatsappAgentConfig()
    const ymd = targetDateYmd ?? tomorrowYmdInTz(cfg.timezone)

    let rows = await getKitchenUnscheduledRows(ymd)
    const total = rows.length

    const allowlistFromQuery =
      customerIds && customerIds.length > 0 ? new Set(customerIds) : null
    const allowlist =
      allowlistFromQuery ??
      (useEnvAllowlist ? cfg.cronReminderCustomerIds : null)

    if (allowlist && allowlist.size > 0) {
      rows = rows.filter((r) => allowlist.has(parseInt(r.customerId, 10)))
    }

    return NextResponse.json({
      reminderDateYmd: ymd,
      totalCandidates: total,
      allowlistActive: allowlist != null && allowlist.size > 0,
      allowlistCustomerIds: allowlist ? [...allowlist].sort((a, b) => a - b) : null,
      wouldRemind: rows.map((r) => ({
        customerId: parseInt(r.customerId, 10),
        customerName: r.customerName,
        phone: r.phone,
        scheduledWithDishCount: r.scheduledWithDishCount,
        mealsPerDay: r.mealsPerDay,
      })),
    })
  } catch (error) {
    console.error('[whatsapp agent reminders preview]', error)
    return NextResponse.json({ error: 'Preview failed' }, { status: 500 })
  }
}
