import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** List WhatsApp meal agent runs (audit history). */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const customerId = searchParams.get('customerId')
    const conversationId = searchParams.get('conversationId')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

    const runs = await prisma.whatsAppAgentRun.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(customerId ? { customerId: parseInt(customerId, 10) } : {}),
        ...(conversationId
          ? { conversationId: parseInt(conversationId, 10) }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        conversation: { select: { id: true, phoneE164: true } },
        mealPlan: { select: { id: true, planType: true } },
        _count: { select: { actions: true } },
      },
    })

    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        trigger: r.trigger,
        rawMessageBody: r.rawMessageBody,
        parsedIntent: r.parsedIntent,
        errorMessage: r.errorMessage,
        payload: r.payload,
        createdAt: r.createdAt,
        customer: r.customer,
        conversation: r.conversation,
        mealPlan: r.mealPlan,
        actionCount: r._count.actions,
      })),
    })
  } catch (error) {
    console.error('[whatsapp agent runs]', error)
    return NextResponse.json({ error: 'Failed to load runs' }, { status: 500 })
  }
}
