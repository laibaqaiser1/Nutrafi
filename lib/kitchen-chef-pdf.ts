import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  CHEF_PDF_COLORS,
  CHEF_PDF_COL_WIDTHS_PT,
  CHEF_PDF_PAGE,
  CHEF_PDF_ROW,
} from '@/lib/kitchen-chef-sheet-layout'

export type ChefPdfHighlight = 'normal' | 'paused' | 'skipped_day'

export type ChefPdfRow = {
  sr: number
  date: string
  deliveryTime: string
  customerName: string
  instructions: string
  dishNames: string
  contact: string
  address: string
  highlight: ChefPdfHighlight
}

export function buildChefSheetPdfBuffer(rows: ChefPdfRow[], title = 'Nutrafi Kitchen Abu Dhabi'): ArrayBuffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a3',
  })

  const { marginLeft, marginRight, marginTop, marginBottom } = CHEF_PDF_PAGE
  const pageWidth = doc.internal.pageSize.getWidth()
  const tableWidth = pageWidth - marginLeft - marginRight

  // Title band (matches Excel row 1 height / green fill)
  doc.setFillColor(...CHEF_PDF_COLORS.titleFill)
  doc.rect(marginLeft, marginTop, tableWidth, CHEF_PDF_ROW.titleHeight, 'F')
  doc.setDrawColor(...CHEF_PDF_COLORS.grid)
  doc.setLineWidth(0.5)
  doc.rect(marginLeft, marginTop, tableWidth, CHEF_PDF_ROW.titleHeight, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(0, 0, 0)
  doc.text(title, marginLeft + tableWidth / 2, marginTop + CHEF_PDF_ROW.titleHeight / 2 + 5, {
    align: 'center',
  })

  const startY = marginTop + CHEF_PDF_ROW.titleHeight

  const body = rows.map((r) => [
    String(r.sr),
    // Explicit line breaks — day / month / year each on its own line
    { content: r.date, styles: { halign: 'center' as const, valign: 'middle' as const, fontSize: 8 } },
    r.deliveryTime,
    r.customerName,
    r.instructions,
    r.dishNames,
    r.contact,
    r.address,
  ])

  const columnStyles: Record<
    number,
    { cellWidth: number; halign?: 'left' | 'center'; valign?: 'middle'; fontSize?: number }
  > = {}
  CHEF_PDF_COL_WIDTHS_PT.forEach((w, i) => {
    columnStyles[i] = {
      cellWidth: w,
      // Sample: Sr#, Date, Delivery Time centered; rest left
      halign: i <= 2 ? 'center' : 'left',
      valign: 'middle',
    }
  })

  autoTable(doc, {
    head: [
      [
        'Sr#',
        'Date',
        'Delivery\nTime',
        'Customer Name',
        'Instructions',
        'Dish Name',
        'Contact\nNumber',
        'Delivery Address',
      ],
    ],
    body,
    startY,
    theme: 'grid',
    tableWidth,
    margin: { left: marginLeft, right: marginRight, bottom: marginBottom },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: CHEF_PDF_COLORS.grid,
      lineWidth: 0.4,
      minCellHeight: CHEF_PDF_ROW.dataMinHeight,
    },
    headStyles: {
      fillColor: CHEF_PDF_COLORS.headerFill,
      textColor: CHEF_PDF_COLORS.headerText,
      fontStyle: 'bold',
      fontSize: 9,
      minCellHeight: CHEF_PDF_ROW.headerHeight,
      valign: 'middle',
      cellPadding: 2,
    },
    bodyStyles: {
      fillColor: CHEF_PDF_COLORS.normalFill,
      textColor: 0,
      minCellHeight: CHEF_PDF_ROW.dataMinHeight,
    },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === 'head') {
        if (data.column.index <= 2) {
          data.cell.styles.halign = 'center'
        }
        // Keep two-word headers on clean line breaks (not mid-word)
        if (data.column.index === 2) {
          data.cell.text = ['Delivery', 'Time']
        }
        if (data.column.index === 6) {
          data.cell.text = ['Contact', 'Number']
        }
        return
      }
      if (data.section !== 'body') return
      const row = rows[data.row.index]
      if (!row) return
      if (row.highlight === 'paused') {
        data.cell.styles.fillColor = CHEF_PDF_COLORS.pausedFill
      } else if (row.highlight === 'skipped_day') {
        data.cell.styles.fillColor = CHEF_PDF_COLORS.skippedFill
      }
      if (data.column.index === 4) {
        data.cell.styles.textColor = CHEF_PDF_COLORS.instructionsText
      }
      // Force date into three separate lines (day / month / year)
      if (data.column.index === 1) {
        data.cell.styles.halign = 'center'
        data.cell.styles.valign = 'middle'
        data.cell.styles.fontSize = 8
        data.cell.styles.overflow = 'linebreak'
        const parts = String(row.date).split(/\r?\n/).filter(Boolean)
        if (parts.length >= 3) {
          data.cell.text = [parts[0], parts[1], parts[2]]
        } else {
          data.cell.text = String(row.date).split(/\r?\n/)
        }
      }
    },
  })

  return doc.output('arraybuffer')
}
