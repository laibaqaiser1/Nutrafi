import { prisma } from '@/lib/prisma'
import { sendWhatsAppDocument, sendWhatsAppText } from '@/lib/whatsapp/client'
import { logAgentAction } from './audit-log'
import { whatsappAgentConfig } from './config'

export async function sendAgentReply(params: {
  runId: number
  phoneE164: string
  conversationId: number
  body: string
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const result = await sendWhatsAppText(params.phoneE164, params.body)

  if (result.ok) {
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: params.conversationId,
        externalId: result.messageId ?? null,
        direction: 'OUTBOUND',
        messageType: 'text',
        body: params.body,
        status: 'SENT',
        timestamp: new Date(),
      },
    })

    await prisma.whatsAppConversation.update({
      where: { id: params.conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: params.body.slice(0, 120),
      },
    })
  }

  await logAgentAction({
    runId: params.runId,
    actionType: 'SEND_REPLY',
    status: result.ok ? 'OK' : 'FAILED',
    input: { phoneE164: params.phoneE164 },
    output: {
      body: params.body,
      messageId: result.messageId,
      error: result.error,
    },
  })

  return result
}

export async function sendAgentDocument(params: {
  runId: number
  phoneE164: string
  conversationId: number
  documentUrl: string
  filename?: string
  caption?: string
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const result = await sendWhatsAppDocument({
    to: params.phoneE164,
    link: params.documentUrl,
    filename: params.filename,
    caption: params.caption,
  })

  const preview =
    params.caption?.trim() ||
    `[Document] ${params.filename ?? 'menu.pdf'}`

  if (result.ok) {
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: params.conversationId,
        externalId: result.messageId ?? null,
        direction: 'OUTBOUND',
        messageType: 'document',
        body: preview,
        status: 'SENT',
        timestamp: new Date(),
      },
    })

    await prisma.whatsAppConversation.update({
      where: { id: params.conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: preview.slice(0, 120),
      },
    })
  }

  await logAgentAction({
    runId: params.runId,
    actionType: 'SEND_REPLY',
    status: result.ok ? 'OK' : 'FAILED',
    input: {
      phoneE164: params.phoneE164,
      documentUrl: params.documentUrl,
      filename: params.filename,
    },
    output: {
      messageType: 'document',
      messageId: result.messageId,
      error: result.error,
    },
  })

  return result
}

/** Text menu help plus optional menu PDF (when WHATSAPP_AGENT_MENU_PDF_URL is set). */
export async function sendMenuHelpReply(params: {
  runId: number
  phoneE164: string
  conversationId: number
  body: string
}): Promise<{ ok: boolean; pdfSent: boolean; error?: string }> {
  const textResult = await sendAgentReply(params)
  const { menuPdfUrl, menuPdfFilename } = whatsappAgentConfig()

  if (!menuPdfUrl.startsWith('https://')) {
    console.error('[whatsapp agent menu help] PDF skipped — menu URL is not HTTPS', {
      menuPdfUrl,
    })
    return { ok: textResult.ok, pdfSent: false, error: textResult.error }
  }

  const pdfResult = await sendAgentDocument({
    runId: params.runId,
    phoneE164: params.phoneE164,
    conversationId: params.conversationId,
    documentUrl: menuPdfUrl,
    filename: menuPdfFilename,
    caption: 'Nutrafi Kitchen — full menu',
  })

  if (!pdfResult.ok) {
    console.error('[whatsapp agent menu help] PDF send failed', {
      documentUrl: menuPdfUrl,
      error: pdfResult.error,
    })
  }

  return {
    ok: textResult.ok && pdfResult.ok,
    pdfSent: pdfResult.ok,
    error: pdfResult.error ?? textResult.error,
  }
}
