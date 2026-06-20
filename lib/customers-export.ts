import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import ExcelJS from 'exceljs'
import { format } from 'date-fns'

function fmtDate(d: Date | null | undefined): string {
  if (!d) return ''
  return format(d, 'yyyy-MM-dd')
}

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return ''
  return format(d, 'yyyy-MM-dd HH:mm')
}

function setHeaderRow(sheet: ExcelJS.Worksheet, row: number, headers: string[]) {
  sheet.getRow(row).values = headers
  sheet.getRow(row).font = { bold: true }
}

function autoWidth(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w
  })
}

export async function buildCustomersExportWorkbook(
  where: Prisma.CustomerWhereInput
): Promise<ExcelJS.Workbook> {
  const customers = await prisma.customer.findMany({
    where,
    orderBy: { fullName: 'asc' },
    include: {
      locations: { orderBy: [{ isDefault: 'desc' }, { label: 'asc' }] },
      mealPlans: { orderBy: { createdAt: 'desc' } },
      payments: { orderBy: { paymentDate: 'desc' } },
    },
  })

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Nutrafi Kitchen'
  const exportedAt = format(new Date(), 'd MMM yyyy HH:mm')

  const custSheet = workbook.addWorksheet('Customers', { views: [{ state: 'frozen', ySplit: 2 }] })
  custSheet.getCell('A1').value = `Customers export — ${exportedAt} (${customers.length} rows)`
  custSheet.mergeCells(1, 1, 1, 12)
  custSheet.getRow(1).font = { bold: true, size: 12 }
  autoWidth(custSheet, [8, 26, 16, 28, 36, 24, 12, 32, 32, 20, 20, 10])
  setHeaderRow(custSheet, 2, [
    'ID',
    'Full name',
    'Phone',
    'Email',
    'Address',
    'Delivery area',
    'Status',
    'Notes',
    'Instructions',
    'Created',
    'Updated',
    'Locations',
  ])
  customers.forEach((c, i) => {
    const row = custSheet.getRow(3 + i)
    row.getCell(1).value = c.id
    row.getCell(2).value = c.fullName
    row.getCell(3).value = c.phone
    row.getCell(4).value = c.email ?? ''
    row.getCell(5).value = c.address
    row.getCell(6).value = c.deliveryArea
    row.getCell(7).value = c.status
    row.getCell(8).value = c.notes ?? ''
    row.getCell(9).value = c.instructions ?? ''
    row.getCell(10).value = fmtDateTime(c.createdAt)
    row.getCell(11).value = fmtDateTime(c.updatedAt)
    row.getCell(12).value = c.locations.length
  })

  const locSheet = workbook.addWorksheet('Locations', { views: [{ state: 'frozen', ySplit: 1 }] })
  autoWidth(locSheet, [8, 8, 22, 12, 10, 36, 24, 10, 10])
  setHeaderRow(locSheet, 1, [
    'Customer ID',
    'Location ID',
    'Customer name',
    'Label',
    'Icon',
    'Address',
    'Delivery area',
    'Default',
    'Active',
  ])
  let locRow = 2
  for (const c of customers) {
    for (const loc of c.locations) {
      const row = locSheet.getRow(locRow++)
      row.getCell(1).value = c.id
      row.getCell(2).value = loc.id
      row.getCell(3).value = c.fullName
      row.getCell(4).value = loc.label
      row.getCell(5).value = loc.icon
      row.getCell(6).value = loc.address
      row.getCell(7).value = loc.deliveryArea
      row.getCell(8).value = loc.isDefault ? 'Yes' : 'No'
      row.getCell(9).value = loc.isActive ? 'Yes' : 'No'
    }
  }

  const planSheet = workbook.addWorksheet('Meal plans', { views: [{ state: 'frozen', ySplit: 1 }] })
  autoWidth(planSheet, [
    8, 8, 22, 10, 10, 12, 12, 12, 8, 10, 12, 12, 12, 12, 12, 14, 24, 20,
  ])
  setHeaderRow(planSheet, 1, [
    'Customer ID',
    'Meal plan ID',
    'Customer name',
    'Plan type',
    'Status',
    'Start date',
    'End date',
    'Meals/day',
    'Days',
    'Total meals',
    'Remaining meals',
    'Total amount (AED)',
    'Base amount (AED)',
    'VAT (AED)',
    'Avg meal rate (AED)',
    'Weekly skip days',
    'Notes',
    'Created',
  ])
  let planRow = 2
  for (const c of customers) {
    for (const p of c.mealPlans) {
      const row = planSheet.getRow(planRow++)
      row.getCell(1).value = c.id
      row.getCell(2).value = p.id
      row.getCell(3).value = c.fullName
      row.getCell(4).value = p.planType
      row.getCell(5).value = p.status
      row.getCell(6).value = fmtDate(p.startDate)
      row.getCell(7).value = fmtDate(p.endDate)
      row.getCell(8).value = p.mealsPerDay
      row.getCell(9).value = p.days
      row.getCell(10).value = p.totalMeals ?? ''
      row.getCell(11).value = p.remainingMeals ?? ''
      row.getCell(12).value = p.totalAmount ?? ''
      row.getCell(13).value = p.baseAmount ?? ''
      row.getCell(14).value = p.vatAmount ?? ''
      row.getCell(15).value = p.averageMealRate ?? ''
      row.getCell(16).value =
        p.weeklySkipDays.length > 0 ? p.weeklySkipDays.join(',') : ''
      row.getCell(17).value = p.notes ?? ''
      row.getCell(18).value = fmtDateTime(p.createdAt)
    }
  }

  const paySheet = workbook.addWorksheet('Payments', { views: [{ state: 'frozen', ySplit: 1 }] })
  autoWidth(paySheet, [8, 8, 22, 10, 10, 14, 14, 16, 12, 32, 20])
  setHeaderRow(paySheet, 1, [
    'Customer ID',
    'Payment ID',
    'Customer name',
    'Meal plan ID',
    'Plan template ID',
    'Amount (AED)',
    'Payment date',
    'Method',
    'Status',
    'Notes',
    'Created',
  ])
  let payRow = 2
  for (const c of customers) {
    for (const p of c.payments) {
      const row = paySheet.getRow(payRow++)
      row.getCell(1).value = c.id
      row.getCell(2).value = p.id
      row.getCell(3).value = c.fullName
      row.getCell(4).value = p.mealPlanId ?? ''
      row.getCell(5).value = p.planId ?? ''
      row.getCell(6).value = p.amount
      row.getCell(7).value = fmtDateTime(p.paymentDate)
      row.getCell(8).value = p.paymentMethod ?? ''
      row.getCell(9).value = p.status
      row.getCell(10).value = p.notes ?? ''
      row.getCell(11).value = fmtDateTime(p.createdAt)
    }
  }

  if (customers.length > 0) {
    const summarySheet = workbook.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 1 }] })
    autoWidth(summarySheet, [28, 16])
    setHeaderRow(summarySheet, 1, ['Metric', 'Value'])
    const totalLocations = customers.reduce((s, c) => s + c.locations.length, 0)
    const totalPlans = customers.reduce((s, c) => s + c.mealPlans.length, 0)
    const totalPayments = customers.reduce((s, c) => s + c.payments.length, 0)
    const activeCustomers = customers.filter((c) => c.status === 'ACTIVE').length
    ;[
      ['Customers exported', customers.length],
      ['Active customers', activeCustomers],
      ['Saved locations', totalLocations],
      ['Meal plans', totalPlans],
      ['Payments', totalPayments],
    ].forEach(([label, value], i) => {
      const row = summarySheet.getRow(2 + i)
      row.getCell(1).value = label as string
      row.getCell(2).value = value as number
    })
  }

  return workbook
}
