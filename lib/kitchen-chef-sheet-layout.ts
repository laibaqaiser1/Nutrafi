/**
 * Exact layout from templates/chef.pdf (A3 portrait, Excel print of chef sheet).
 *
 * Page: 841.92 × 1190.52 pt (A3). Content left ≈ 15.6, right ≈ 830.
 *
 * Header labels and data share the same column left edges for cols 4–8.
 * Cols 1–3 headers are centered in-cell (Sr#, Date, Delivery Time), so the
 * label text can sit inward of the cell left while data/date wraps stay on
 * the same column boundaries — headings look offset from data, but widths match.
 *
 * Measured column left edges (pt) → widths:
 *   Sr# 15.6 | Date 43.6 | Delivery Time 80.9 | Customer 126.1 |
 *   Instructions 267.0 | Dish 407.9 | Contact 619.1 | Address 678.2 | end 830
 *
 * Row heights (Excel / PDF):
 *   Title 25.5 | Header labels ~22–28 (two-line Delivery Time / Contact Number) |
 *   Data row pitch ≈ 82 (template row height 78)
 */

export const CHEF_PDF_PAGE = {
  width: 841.92,
  height: 1190.52,
  /** Left margin matching sample content start */
  marginLeft: 15.6,
  /** Right inset so table ends near sample content max (~828) */
  marginRight: 11.9,
  marginTop: 8,
  marginBottom: 12,
} as const

/** Column widths in PDF points (sum ≈ 814.4). */
export const CHEF_PDF_COL_WIDTHS_PT = [
  28.0, // Sr#
  48.0, // Date (day / month / year on separate lines)
  45.2, // Delivery Time — keep sample width (do not shrink)
  135.5, // Customer Name
  135.5, // Instructions
  211.2, // Dish Name
  59.1, // Contact Number
  151.9, // Delivery Address
] as const

export const CHEF_PDF_ROW = {
  titleHeight: 25.5,
  /** Enough for wrapped “Delivery Time” / “Contact Number” like the sample */
  headerHeight: 28,
  /** Template data row height; PDF row pitch ≈ 82 */
  dataMinHeight: 78,
} as const

/**
 * Excel character widths preserving chef PDF column ratios
 * (same total ≈ 201.28 as templates/template.xlsx A–H).
 */
export const CHEF_EXCEL_COL_WIDTHS = [
  6.92, // Sr#
  11.87, // Date
  11.18, // Delivery Time
  33.51, // Customer Name
  33.51, // Instructions
  52.24, // Dish Name
  14.62, // Contact Number
  37.57, // Delivery Address
] as const

export const CHEF_SHEET_HEADERS = [
  'Sr#',
  'Date',
  'Delivery Time',
  'Customer Name',
  'Instructions',
  'Dish Name',
  'Contact Number',
  'Delivery Address',
] as const

export const CHEF_PDF_COLORS = {
  /** template.xlsx title fill FF8ED973 */
  titleFill: [142, 217, 115] as [number, number, number],
  /** template.xlsx header fill FFD9F2D0 */
  headerFill: [217, 242, 208] as [number, number, number],
  headerText: [0, 0, 0] as [number, number, number],
  normalFill: [255, 255, 255] as [number, number, number],
  pausedFill: [255, 107, 107] as [number, number, number],
  skippedFill: [255, 217, 102] as [number, number, number],
  instructionsText: [17, 24, 39] as [number, number, number],
  grid: [0, 0, 0] as [number, number, number],
}
