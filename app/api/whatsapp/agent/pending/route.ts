import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** Open pending meal-agent actions (multi-turn dish choice, etc.). */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')
    const status = searchParams.get('status') ?? 'OPEN'

    const pending = await prisma.whatsAppPendingAction.findMany({
      where: {
        status: status as never,
        ...(conversationId
          ? { conversationId: parseInt(conversationId, 10) }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        conversation: { select: { id: true, phoneE164: true } },
        mealPlan: { select: { id: true } },
      },
    })

    return NextResponse.json({ pending })
  } catch (error) {
    console.error('[whatsapp agent pending]', error)
    return NextResponse.json({ error: 'Failed to load pending' }, { status: 500 })
  }
}
