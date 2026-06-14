import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** Single agent run with full action audit trail. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idParam } = await params
    const id = parseIdParam(idParam)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })
    }

    const run = await prisma.whatsAppAgentRun.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        conversation: { select: { id: true, phoneE164: true, contactName: true } },
        mealPlan: { select: { id: true, planType: true, mealsPerDay: true } },
        inboundMessage: {
          select: { id: true, body: true, timestamp: true, externalId: true },
        },
        parentRun: { select: { id: true, status: true, rawMessageBody: true } },
        followUpRuns: {
          select: { id: true, status: true, rawMessageBody: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        pendingAction: true,
        actions: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    return NextResponse.json({ run })
  } catch (error) {
    console.error('[whatsapp agent run detail]', error)
    return NextResponse.json({ error: 'Failed to load run' }, { status: 500 })
  }
}
