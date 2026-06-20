import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import type {
  WhatsAppAgentRunStatus,
  WhatsAppAgentTrigger,
} from '@/lib/generated/prisma/client'

export async function inboundMessageAlreadyHandled(
  inboundMessageId: number
): Promise<boolean> {
  const replied = await prisma.whatsAppAgentAction.findFirst({
    where: {
      run: { inboundMessageId },
      actionType: 'SEND_REPLY',
      status: 'OK',
    },
    select: { id: true },
  })
  return replied != null
}

/** @deprecated Prefer inboundMessageAlreadyHandled — runs without a reply blocked retries. */
export async function agentRunExistsForMessage(
  inboundMessageId: number
): Promise<boolean> {
  return inboundMessageAlreadyHandled(inboundMessageId)
}

export async function createAgentRun(params: {
  conversationId?: number
  customerId?: number
  mealPlanId?: number
  inboundMessageId?: number
  parentRunId?: number
  pendingActionId?: number
  trigger: WhatsAppAgentTrigger
  status: WhatsAppAgentRunStatus
  rawMessageBody?: string
  parsedIntent?: unknown
  model?: string
  modelRawResponse?: unknown
  errorMessage?: string
  payload?: unknown
}) {
  return prisma.whatsAppAgentRun.create({
    data: {
      conversationId: params.conversationId,
      customerId: params.customerId,
      mealPlanId: params.mealPlanId,
      inboundMessageId: params.inboundMessageId,
      parentRunId: params.parentRunId,
      pendingActionId: params.pendingActionId,
      trigger: params.trigger,
      status: params.status,
      rawMessageBody: params.rawMessageBody,
      parsedIntent: params.parsedIntent as Prisma.InputJsonValue,
      model: params.model,
      modelRawResponse: params.modelRawResponse as Prisma.InputJsonValue,
      errorMessage: params.errorMessage,
      payload: params.payload as Prisma.InputJsonValue,
    },
  })
}

export async function updateAgentRun(
  runId: number,
  data: {
    status?: WhatsAppAgentRunStatus
    parsedIntent?: unknown
    errorMessage?: string | null
    payload?: unknown
    customerId?: number
    mealPlanId?: number
    model?: string
    modelRawResponse?: unknown
  }
) {
  return prisma.whatsAppAgentRun.update({
    where: { id: runId },
    data: {
      status: data.status,
      parsedIntent: data.parsedIntent as Prisma.InputJsonValue | undefined,
      errorMessage: data.errorMessage,
      payload: data.payload as Prisma.InputJsonValue | undefined,
      customerId: data.customerId,
      mealPlanId: data.mealPlanId,
      model: data.model,
      modelRawResponse: data.modelRawResponse as Prisma.InputJsonValue | undefined,
    },
  })
}

export async function logAgentAction(params: {
  runId: number
  actionType: string
  status: string
  input?: unknown
  output?: unknown
  confidence?: number
  beforeSnapshot?: unknown
  afterSnapshot?: unknown
}) {
  return prisma.whatsAppAgentAction.create({
    data: {
      runId: params.runId,
      actionType: params.actionType,
      status: params.status,
      input: params.input as Prisma.InputJsonValue,
      output: params.output as Prisma.InputJsonValue,
      confidence: params.confidence,
      beforeSnapshot: params.beforeSnapshot as Prisma.InputJsonValue,
      afterSnapshot: params.afterSnapshot as Prisma.InputJsonValue,
    },
  })
}

export async function appendRunPayload(
  runId: number,
  patch: Record<string, unknown>
) {
  const run = await prisma.whatsAppAgentRun.findUnique({
    where: { id: runId },
    select: { payload: true },
  })
  const existing =
    run?.payload && typeof run.payload === 'object' && !Array.isArray(run.payload)
      ? (run.payload as Record<string, unknown>)
      : {}
  await prisma.whatsAppAgentRun.update({
    where: { id: runId },
    data: {
      payload: { ...existing, ...patch } as Prisma.InputJsonValue,
    },
  })
}
