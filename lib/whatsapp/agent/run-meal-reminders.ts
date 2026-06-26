import { addDays, format, parse, parseISO } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { getKitchenUnscheduledRows } from '@/lib/kitchen-unscheduled-rows'
import { sendAddMealsReminder } from '@/lib/whatsapp/client'
import { WHATSAPP_TEMPLATES } from '@/lib/whatsapp/templates'
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/normalize-phone'
import { whatsappAgentConfig } from './config'
import { createAgentRun, logAgentAction } from './audit-log'

const LOG = '[whatsapp agent cron reminders]'

function calendarTodayInTz(timezone: string): Date {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  return parse(`${y}-${m}-${d}`, 'yyyy-MM-dd', new Date())
}

export function tomorrowYmdInTz(timezone: string): string {
  return format(addDays(calendarTodayInTz(timezone), 1), 'yyyy-MM-dd')
}

export function formatReminderDateLabel(dateYmd: string): string {
  try {
    return format(parseISO(dateYmd), 'EEEE, d MMMM yyyy')
  } catch {
    return dateYmd
  }
}

async function reminderAlreadySent(
  customerId: number,
  reminderDateYmd: string
): Promise<boolean> {
  const since = addDays(calendarTodayInTz(whatsappAgentConfig().timezone), 0)
  since.setHours(0, 0, 0, 0)

  const runs = await prisma.whatsAppAgentRun.findMany({
    where: {
      customerId,
      trigger: 'CRON_REMINDER',
      status: 'SUCCESS',
      createdAt: { gte: since },
    },
    select: { payload: true },
    take: 20,
  })

  return runs.some((run) => {
    if (!run.payload || typeof run.payload !== 'object' || Array.isArray(run.payload)) {
      return false
    }
    return (run.payload as { reminderDateYmd?: string }).reminderDateYmd === reminderDateYmd
  })
}

async function upsertConversationForPhone(params: {
  phoneE164: string
  customerId: number
  preview: string
}): Promise<number> {
  const existing = await prisma.whatsAppConversation.findUnique({
    where: { phoneE164: params.phoneE164 },
    select: { id: true },
  })
  if (existing) {
    await prisma.whatsAppConversation.update({
      where: { id: existing.id },
      data: {
        customerId: params.customerId,
        lastMessageAt: new Date(),
        lastMessagePreview: params.preview.slice(0, 120),
      },
    })
    return existing.id
  }
  const created = await prisma.whatsAppConversation.create({
    data: {
      phoneE164: params.phoneE164,
      customerId: params.customerId,
      lastMessageAt: new Date(),
      lastMessagePreview: params.preview.slice(0, 120),
      unreadCount: 0,
    },
  })
  return created.id
}

export interface MealReminderCronResult {
  ok: boolean
  reminderDateYmd: string
  /** All customers missing meals on target date */
  candidates: number
  /** Restricted to allowlist when pilot mode is active */
  allowlistActive: boolean
  allowlistCustomerIds: number[] | null
  sent: number
  skipped: number
  failed: number
  warnings: string[]
  details: Array<{
    customerId: number
    customerName: string
    status: 'sent' | 'skipped' | 'failed'
    reason?: string
  }>
}

/**
 * Send WhatsApp template reminders to customers missing tomorrow's meals.
 * Uses approved `daily_meals_reminder` template (outside 24h session).
 */
export async function runMealReminders(options?: {
  targetDateYmd?: string
  /** This run only — overrides env allowlist when set */
  customerIds?: number[]
  /** When true, ignore WHATSAPP_AGENT_CRON_REMINDER_CUSTOMER_IDS and message all eligible */
  ignoreEnvAllowlist?: boolean
}): Promise<MealReminderCronResult> {
  const cfg = whatsappAgentConfig()
  const reminderDateYmd =
    options?.targetDateYmd ?? tomorrowYmdInTz(cfg.timezone)
  const dateLabel = formatReminderDateLabel(reminderDateYmd)

  const allowlistFromOptions =
    options?.customerIds && options.customerIds.length > 0
      ? new Set(options.customerIds.filter((id) => id > 0))
      : null
  const allowlist =
    allowlistFromOptions ??
    (options?.ignoreEnvAllowlist ? null : cfg.cronReminderCustomerIds)
  const allowlistActive = allowlist != null && allowlist.size > 0

  let rows = await getKitchenUnscheduledRows(reminderDateYmd)
  const totalCandidates = rows.length
  const warnings: string[] = []

  if (allowlistActive) {
    const before = rows.length
    rows = rows.filter((row) => allowlist.has(parseInt(row.customerId, 10)))
    if (before > 0 && rows.length === 0) {
      warnings.push(
        `Allowlist active (${[...allowlist].join(', ')}) but none of those customers need meals on ${reminderDateYmd}. Clear WHATSAPP_AGENT_CRON_REMINDER_CUSTOMER_IDS to remind everyone.`
      )
    }
  }

  if (totalCandidates === 0) {
    warnings.push(`No active customers missing meals on ${reminderDateYmd}.`)
  }

  console.error(LOG, 'candidates loaded', {
    reminderDateYmd,
    timezone: cfg.timezone,
    dateLabel,
    totalCandidates,
    afterAllowlist: rows.length,
    allowlistActive,
    allowlistCustomerIds: allowlistActive ? [...allowlist!].sort((a, b) => a - b) : null,
    candidatePreview: rows.slice(0, 10).map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName,
      phone: r.phone ? `${r.phone.slice(0, 4)}…` : null,
      scheduledWithDishCount: r.scheduledWithDishCount,
      mealsPerDay: r.mealsPerDay,
    })),
  })

  const result: MealReminderCronResult = {
    ok: true,
    reminderDateYmd,
    candidates: totalCandidates,
    allowlistActive,
    allowlistCustomerIds: allowlistActive ? [...allowlist].sort((a, b) => a - b) : null,
    sent: 0,
    skipped: 0,
    failed: 0,
    warnings,
    details: [],
  }

  if (!cfg.enabled) {
    console.error(LOG, 'agent disabled — WHATSAPP_AGENT_ENABLED=false')
    return {
      ...result,
      ok: false,
      warnings: [...warnings, 'WHATSAPP_AGENT_ENABLED=false'],
      details: [
        {
          customerId: 0,
          customerName: '',
          status: 'skipped',
          reason: 'WHATSAPP_AGENT_ENABLED=false',
        },
      ],
    }
  }

  if (warnings.length > 0) {
    console.error(LOG, 'pre-run warnings', { warnings })
  }

  for (const row of rows) {
    const customerId = parseInt(row.customerId, 10)
    const detail = {
      customerId,
      customerName: row.customerName,
      status: 'skipped' as 'sent' | 'skipped' | 'failed',
      reason: undefined as string | undefined,
    }

    if (!row.phone?.trim()) {
      detail.reason = 'no phone'
      console.error(LOG, 'skipped customer', { customerId, customerName: row.customerName, reason: detail.reason })
      result.skipped++
      result.details.push(detail)
      continue
    }

    const phoneE164 = normalizeWhatsAppPhone(row.phone)
    if (!phoneE164) {
      detail.reason = 'invalid phone'
      console.error(LOG, 'skipped customer', {
        customerId,
        customerName: row.customerName,
        reason: detail.reason,
        rawPhone: row.phone,
      })
      result.skipped++
      result.details.push(detail)
      continue
    }

    if (await reminderAlreadySent(customerId, reminderDateYmd)) {
      detail.reason = 'already reminded today'
      console.error(LOG, 'skipped customer', { customerId, customerName: row.customerName, reason: detail.reason })
      result.skipped++
      result.details.push(detail)
      continue
    }

    console.error(LOG, 'sending reminder', {
      customerId,
      customerName: row.customerName,
      phoneE164: `${phoneE164.slice(0, 4)}…`,
      reminderDateYmd,
      template: WHATSAPP_TEMPLATES.daily_meals_reminder,
    })

    const run = await createAgentRun({
      customerId,
      mealPlanId: row.mealPlanId,
      trigger: 'CRON_REMINDER',
      status: 'SKIPPED',
      rawMessageBody: `Reminder: add meals for ${dateLabel}`,
      payload: {
        reminderDateYmd,
        scheduledWithDishCount: row.scheduledWithDishCount,
        mealsPerDay: row.mealsPerDay,
      },
    })

    const sendResult = await sendAddMealsReminder(
      phoneE164,
      row.customerName,
      dateLabel
    )

    await logAgentAction({
      runId: run.id,
      actionType: 'SEND_REMINDER',
      status: sendResult.ok ? 'OK' : 'FAILED',
      input: {
        phoneE164,
        customerName: row.customerName,
        reminderDateYmd,
        template: WHATSAPP_TEMPLATES.daily_meals_reminder,
      },
      output: sendResult,
    })

    if (sendResult.ok) {
      const preview = `Reminder: add meals for ${dateLabel}`
      const conversationId = await upsertConversationForPhone({
        phoneE164,
        customerId,
        preview,
      })

      await prisma.whatsAppMessage.create({
        data: {
          conversationId,
          externalId: sendResult.messageId ?? null,
          direction: 'OUTBOUND',
          messageType: 'template',
          body: preview,
          status: 'SENT',
          timestamp: new Date(),
        },
      })

      await prisma.whatsAppAgentRun.update({
        where: { id: run.id },
        data: {
          conversationId,
          status: 'SUCCESS',
        },
      })

      detail.status = 'sent'
      result.sent++
      console.error(LOG, 'reminder sent', {
        customerId,
        customerName: row.customerName,
        messageId: sendResult.messageId,
      })
    } else {
      await prisma.whatsAppAgentRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          errorMessage: sendResult.error ?? 'Send failed',
        },
      })
      detail.status = 'failed'
      detail.reason = sendResult.error
      result.failed++
      console.error(LOG, 'reminder send failed', {
        customerId,
        customerName: row.customerName,
        error: sendResult.error,
        errorCode: sendResult.errorCode,
        fbtraceId: sendResult.fbtraceId,
      })
    }

    result.details.push(detail)
  }

  result.ok = result.failed === 0
  console.error(LOG, 'run finished', {
    reminderDateYmd,
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
    ok: result.ok,
    warnings: result.warnings,
  })
  return result
}
