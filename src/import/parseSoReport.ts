import * as XLSX from 'xlsx'

export interface ParsedSoLineItem {
  soNumber: string
  description: string
  warehouseCode: string
  quantity: number
}

export interface SoReportParseResult {
  lineItems: ParsedSoLineItem[]
  skippedRows: number
}

function normalizeHeader(cell: unknown): string {
  return String(cell ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// SalesPad's SO export always seems to have the header on row 0, but this
// is found by content rather than assumed, same reasoning as the
// inventory import parser — safer if a future export adds a title row.
function findHeaderRowIndex(rows: unknown[][]): number {
  const searchLimit = Math.min(rows.length, 25)
  for (let i = 0; i < searchLimit; i++) {
    const normalized = rows[i].map(normalizeHeader)
    if (
      normalized.includes('sales doc num') &&
      normalized.includes('quantity') &&
      normalized.includes('warehouse code')
    ) {
      return i
    }
  }
  return -1
}

function buildColumnMap(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cell)
    if (key && !map.has(key)) map.set(key, index)
  })
  return map
}

export async function getSoReportSheetNames(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  return workbook.SheetNames
}

export async function parseSoReportWorkbook(file: File, sheetName: string): Promise<SoReportParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Sheet "${sheetName}" was not found in this file.`)

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const headerRowIndex = findHeaderRowIndex(rows)
  if (headerRowIndex === -1) {
    throw new Error(
      'Could not find the header row (expected "Sales Doc Num", "Quantity", and "Warehouse Code" columns).',
    )
  }

  const columnMap = buildColumnMap(rows[headerRowIndex])
  const soNumberCol = columnMap.get('sales doc num')
  const descriptionCol = columnMap.get('extended description')
  const warehouseCodeCol = columnMap.get('warehouse code')
  const quantityCol = columnMap.get('quantity')

  if (soNumberCol === undefined || warehouseCodeCol === undefined || quantityCol === undefined) {
    throw new Error('Could not find the expected columns in this sheet.')
  }

  const lineItems: ParsedSoLineItem[] = []
  let skippedRows = 0

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    const soNumber = String(row[soNumberCol] ?? '').trim()
    if (!soNumber) continue

    const quantity = Number(row[quantityCol])
    if (!Number.isFinite(quantity) || quantity <= 0) {
      skippedRows++
      continue
    }

    lineItems.push({
      soNumber,
      description: descriptionCol !== undefined ? String(row[descriptionCol] ?? '').trim() : '',
      warehouseCode: String(row[warehouseCodeCol] ?? '').trim(),
      quantity,
    })
  }

  return { lineItems, skippedRows }
}
