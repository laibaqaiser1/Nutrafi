import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { parseIdParam } from '@/lib/parse-id'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  agentMode: z.enum(['AUTO', 'MANUAL']),
})

/** Toggle meal agent AUTO/MANUAL for a conversation. */
export async function PATCH(
  request: NextRequest,
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
      return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 })
    }

    const { agentMode } = patchSchema.parse(await request.json())

    const updated = await prisma.whatsAppConversation.update({
      where: { id },
      data: { agentMode },
      select: { id: true, agentMode: true, phoneE164: true },
    })

    return NextResponse.json({ conversation: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('[whatsapp agent conversation mode]', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
