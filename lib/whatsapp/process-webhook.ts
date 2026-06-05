import { prisma } from '@/lib/prisma'
import { findCustomerByWhatsAppPhone } from './match-customer'
import { normalizeWhatsAppPhone } from './normalize-phone'

function previewBody(body: string | null | undefined, max = 120): string {
  const t = (body ?? '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function messageBodyFromPayload(msg: Record<string, unknown>): string {
  const type = String(msg.type ?? 'text')
  if (type === 'text' && msg.text && typeof msg.text === 'object') {
    const body = (msg.text as { body?: string }).body
    return body ?? ''
  }
  if (type === 'button' && msg.button && typeof msg.button === 'object') {
    return (msg.button as { text?: string }).text ?? '[Button]'
  }
  if (type === 'interactive' && msg.interactive && typeof msg.interactive === 'object') {
    const i = msg.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } }
    return i.button_reply?.title ?? i.list_reply?.title ?? '[Interactive]'
  }
  if (type === 'image') return '[Image]'
  if (type === 'audio') return '[Audio]'
  if (type === 'video') return '[Video]'
  if (type === 'document') return '[Document]'
  if (type === 'location') return '[Location]'
  if (type === 'sticker') return '[Sticker]'
  return `[${type}]`
}

async function upsertInboundMessage(params: {
  from: string
  externalId: string
  messageType: string
  body: string
  timestamp: Date
  contactName?: string
  rawPayload: unknown
  direction: 'INBOUND' | 'OUTBOUND'
}) {
  const phoneE164 = normalizeWhatsAppPhone(params.from)
  if (!phoneE164) return

  const customer = await findCustomerByWhatsAppPhone(phoneE164)

  let conversation = await prisma.whatsAppConversation.findUnique({
    where: { phoneE164 },
  })

  if (!conversation) {
    conversation = await prisma.whatsAppConversation.create({
      data: {
        phoneE164,
        customerId: customer?.id ?? null,
        contactName: params.contactName ?? null,
        lastMessageAt: params.timestamp,
        lastMessagePreview: previewBody(params.body),
        unreadCount: params.direction === 'INBOUND' ? 1 : 0,
      },
    })
  } else {
    const updates: {
      lastMessageAt: Date
      lastMessagePreview: string
      unreadCount?: { increment: number }
      customerId?: number | null
      contactName?: string | null
    } = {
      lastMessageAt: params.timestamp,
      lastMessagePreview: previewBody(params.body),
    }
    if (params.direction === 'INBOUND') {
      updates.unreadCount = { increment: 1 }
    }
    if (customer && !conversation.customerId) {
      updates.customerId = customer.id
    }
    if (params.contactName && !conversation.contactName) {
      updates.contactName = params.contactName
    }
    conversation = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: updates,
    })
  }

  const existing = await prisma.whatsAppMessage.findUnique({
    where: { externalId: params.externalId },
  })
  if (existing) return

  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      externalId: params.externalId,
      direction: params.direction,
      messageType: params.messageType,
      body: params.body,
      status: params.direction === 'INBOUND' ? 'RECEIVED' : 'SENT',
      timestamp: params.timestamp,
      rawPayload: params.rawPayload as object,
    },
  })
}

async function applyStatusUpdate(status: Record<string, unknown>) {
  const id = status.id as string | undefined
  if (!id) return
  const st = String(status.status ?? '')
  const map: Record<string, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = {
    sent: 'SENT',
    delivered: 'DELIVERED',
    read: 'READ',
    failed: 'FAILED',
  }
  const mapped = map[st]
  if (!mapped) return
  await prisma.whatsAppMessage.updateMany({
    where: { externalId: id },
    data: { status: mapped },
  })
}

/** Process Meta WhatsApp webhook JSON body. */
export async function processWhatsAppWebhook(body: unknown): Promise<void> {
  if (!body || typeof body !== 'object') return
  const root = body as { object?: string; entry?: unknown[] }
  if (root.object !== 'whatsapp_business_account' || !Array.isArray(root.entry)) return

  for (const entry of root.entry) {
    if (!entry || typeof entry !== 'object') continue
    const changes = (entry as { changes?: unknown[] }).changes
    if (!Array.isArray(changes)) continue

    for (const change of changes) {
      if (!change || typeof change !== 'object') continue
      const value = (change as { value?: Record<string, unknown> }).value
      if (!value) continue

      const contacts = value.contacts as Array<{ wa_id?: string; profile?: { name?: string } }> | undefined
      const contactByWaId = new Map<string, string>()
      if (Array.isArray(contacts)) {
        for (const c of contacts) {
          if (c.wa_id && c.profile?.name) contactByWaId.set(c.wa_id, c.profile.name)
        }
      }

      const messages = value.messages as Record<string, unknown>[] | undefined
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          const from = String(msg.from ?? '')
          const id = String(msg.id ?? '')
          if (!from || !id) continue
          const ts = parseInt(String(msg.timestamp ?? '0'), 10)
          const timestamp = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date()
          await upsertInboundMessage({
            from,
            externalId: id,
            messageType: String(msg.type ?? 'text'),
            body: messageBodyFromPayload(msg),
            timestamp,
            contactName: contactByWaId.get(from),
            rawPayload: msg,
            direction: 'INBOUND',
          })
        }
      }

      // Messages sent from WhatsApp Business app (coexistence echo)
      const echoes = value.message_echoes as Record<string, unknown>[] | undefined
      if (Array.isArray(echoes)) {
        for (const msg of echoes) {
          const to = String(msg.to ?? '')
          const id = String(msg.id ?? '')
          if (!to || !id) continue
          const ts = parseInt(String(msg.timestamp ?? '0'), 10)
          const timestamp = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date()
          await upsertInboundMessage({
            from: to,
            externalId: id,
            messageType: String(msg.type ?? 'text'),
            body: messageBodyFromPayload(msg),
            timestamp,
            rawPayload: msg,
            direction: 'OUTBOUND',
          })
        }
      }

      const smbEchoes = value.smb_message_echoes as Record<string, unknown>[] | undefined
      if (Array.isArray(smbEchoes)) {
        for (const msg of smbEchoes) {
          const to = String(msg.to ?? '')
          const id = String(msg.id ?? '')
          if (!to || !id) continue
          const ts = parseInt(String(msg.timestamp ?? '0'), 10)
          const timestamp = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date()
          await upsertInboundMessage({
            from: to,
            externalId: id,
            messageType: String(msg.type ?? 'text'),
            body: messageBodyFromPayload(msg),
            timestamp,
            rawPayload: msg,
            direction: 'OUTBOUND',
          })
        }
      }

      const statuses = value.statuses as Record<string, unknown>[] | undefined
      if (Array.isArray(statuses)) {
        for (const st of statuses) {
          await applyStatusUpdate(st)
        }
      }
    }
  }
}
