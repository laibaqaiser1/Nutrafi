import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { prisma } from '@/lib/prisma'
import { formatPhoneDisplay } from '@/lib/whatsapp/normalize-phone'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim().toLowerCase() ?? ''

    const rows = await prisma.whatsAppConversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
      },
    })

    const filtered = q
      ? rows.filter((r) => {
          const name = r.customer?.fullName?.toLowerCase() ?? ''
          const contact = r.contactName?.toLowerCase() ?? ''
          const phone = r.phoneE164
          return name.includes(q) || contact.includes(q) || phone.includes(q.replace(/\D/g, ''))
        })
      : rows

    const totalUnread = filtered.reduce((s, r) => s + r.unreadCount, 0)
    const matchedCustomers = filtered.filter((r) => r.customerId != null).length
    const unknown = filtered.filter((r) => !r.customerId).length

    return NextResponse.json({
      summary: {
        totalConversations: filtered.length,
        totalUnread,
        matchedCustomers,
        unknownNumbers: unknown,
      },
      conversations: filtered.map((r) => ({
        id: r.id,
        phoneE164: r.phoneE164,
        phoneDisplay: formatPhoneDisplay(r.phoneE164),
        contactName: r.contactName,
        customer: r.customer,
        lastMessageAt: r.lastMessageAt,
        lastMessagePreview: r.lastMessagePreview,
        unreadCount: r.unreadCount,
      })),
    })
  } catch (error) {
    console.error('WhatsApp conversations list error:', error)
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 })
  }
}
