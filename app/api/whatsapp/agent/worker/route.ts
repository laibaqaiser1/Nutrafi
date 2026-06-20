import { NextRequest, NextResponse } from 'next/server'
import { cronAuthConfigured, verifyCronRequest } from '@/lib/whatsapp/agent/cron-auth'
import { recordAgentFailureIfMissing } from '@/lib/whatsapp/agent/audit-log'
import { processInboundAgentMessage } from '@/lib/whatsapp/agent/handle-inbound'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
/** Agent may run classify + parse + dish match + apply + WhatsApp send. */
export const maxDuration = 60

const bodySchema = z.object({
  conversationId: z.number().int().positive(),
  inboundMessageId: z.number().int().positive(),
  phoneE164: z.string().min(1),
  body: z.string(),
})

/**
 * Internal worker invoked from the webhook after the 200 response.
 * Uses a fresh serverless invocation so processing is not cut off when the webhook returns.
 */
export async function POST(request: NextRequest) {
  if (!cronAuthConfigured() || !verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch (error) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    const started = Date.now()
    const result = await processInboundAgentMessage(parsed)
    if (process.env.WHATSAPP_AGENT_DEBUG_TIMING === 'true') {
      console.info('[whatsapp agent worker] done', {
        inboundMessageId: parsed.inboundMessageId,
        ms: Date.now() - started,
        status: result?.status,
      })
    }
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[whatsapp agent worker]', error)
    await recordAgentFailureIfMissing({
      conversationId: parsed.conversationId,
      inboundMessageId: parsed.inboundMessageId,
      rawMessageBody: parsed.body,
      errorMessage: msg,
      payload: { source: 'worker' },
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
