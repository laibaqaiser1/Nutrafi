import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'
import { getServerSession } from '@/lib/auth-helpers'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'
import { buildCustomerListWhere } from '@/lib/customers-list-query'
import { buildCustomersExportWorkbook } from '@/lib/customers-export'

export const dynamic = 'force-dynamic'

/** Export customers (and related locations, meal plans, payments) as Excel. */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !sessionHasPermission(session, PK.moduleCustomers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const where = buildCustomerListWhere(searchParams)
    const workbook = await buildCustomersExportWorkbook(where)
    const buffer = await workbook.xlsx.writeBuffer()
    const stamp = format(new Date(), 'yyyy-MM-dd')
    const filename = `customers-export-${stamp}.xlsx`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Error exporting customers:', error)
    return NextResponse.json({ error: 'Failed to export customers' }, { status: 500 })
  }
}
