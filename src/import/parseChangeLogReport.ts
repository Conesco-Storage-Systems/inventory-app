import * as XLSX from 'xlsx'

export interface ParsedChangeLogChange {
  // Lowercased, whitespace-normalized suffix shared by an "Old X" / "New X"
  // header pair, e.g. "extended description", "locncode", "quantity".
  field: string
  oldValue: string
  newValue: string
}

export interface ParsedChangeLogRow {
  soNumber: string
  warehouseCode: string
  changeAction: string
  // Epoch ms from "Audit Date" — the precise timestamp of this one event
  // (distinct from "Line Timestamp", which reads as the order's overall
  // last-modified time).
  auditDate: number
  // SalesPad's internal per-line sequence number ("Audit Line Seq"), or
  // null if the sheet has no such column. See SalesOrderLineItem.lineSeq.
  lineSeq: number | null
  batchId: string
  description: string
  changes: ParsedChangeLogChange[]
}

export interface SoChangeLogParseResult {
  rows: ParsedChangeLogRow[]
  skippedRows: number
}

function normalizeHeader(cell: unknown): string {
  return String(cell ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function findHeaderRowIndex(rows: unknown[][]): number {
  const searchLimit = Math.min(rows.length, 25)
  for (let i = 0; i < searchLimit; i++) {
    const normalized = rows[i].map(normalizeHeader)
    if (normalized.includes('sales doc num') && normalized.includes('change action') && normalized.includes('audit date')) {
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

// The Old/New field pairs aren't hardcoded to a fixed list — whatever "Old
// X" / "New X" header pair exists in the sheet is picked up automatically,
// so this keeps working if the export's set of tracked fields changes.
function findOldNewPairs(headerRow: unknown[]): { field: string; oldCol: number; newCol: number }[] {
  const normalized = headerRow.map(normalizeHeader)
  const pairs: { field: string; oldCol: number; newCol: number }[] = []
  normalized.forEach((header, oldCol) => {
    if (!header.startsWith('old ')) return
    const field = header.slice(4)
    const newCol = normalized.indexOf(`new ${field}`)
    if (newCol !== -1) pairs.push({ field, oldCol, newCol })
  })
  return pairs
}

function parseAuditDate(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  if (!value) return 0
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function cellText(value: unknown): string {
  if (value instanceof Date) return value.toLocaleDateString()
  return String(value ?? '').trim()
}

export async function getChangeLogSheetNames(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  return workbook.SheetNames
}

export async function parseSoChangeLogWorkbook(file: File, sheetName: string): Promise<SoChangeLogParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Sheet "${sheetName}" was not found in this file.`)

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const headerRowIndex = findHeaderRowIndex(rawRows)
  if (headerRowIndex === -1) {
    throw new Error('Could not find the header row (expected "Sales Doc Num", "Change Action", and "Audit Date" columns).')
  }

  const headerRow = rawRows[headerRowIndex]
  const columnMap = buildColumnMap(headerRow)
  const oldNewPairs = findOldNewPairs(headerRow)

  const soNumberCol = columnMap.get('sales doc num')
  const warehouseCodeCol = columnMap.get('warehouse code')
  const changeActionCol = columnMap.get('change action')
  const auditDateCol = columnMap.get('audit date')
  const lineSeqCol = columnMap.get('audit line seq')
  const batchIdCol = columnMap.get('batch id')
  const descriptionCol = columnMap.get('extended description')

  if (soNumberCol === undefined || changeActionCol === undefined || auditDateCol === undefined) {
    throw new Error('Could not find the expected columns in this sheet.')
  }

  const rows: ParsedChangeLogRow[] = []
  let skippedRows = 0

  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i]
    const soNumber = String(row[soNumberCol] ?? '').trim()
    const changeAction = String(row[changeActionCol] ?? '').trim().toUpperCase()
    if (!soNumber || !changeAction) {
      skippedRows++
      continue
    }

    const changes: ParsedChangeLogChange[] = []
    for (const pair of oldNewPairs) {
      const oldValue = cellText(row[pair.oldCol])
      const newValue = cellText(row[pair.newCol])
      if (!oldValue && !newValue) continue
      changes.push({ field: pair.field, oldValue, newValue })
    }

    const lineSeqRaw = lineSeqCol !== undefined ? row[lineSeqCol] : undefined
    const lineSeq =
      lineSeqRaw !== undefined && lineSeqRaw !== '' && Number.isFinite(Number(lineSeqRaw)) ? Number(lineSeqRaw) : null

    rows.push({
      soNumber,
      warehouseCode: warehouseCodeCol !== undefined ? String(row[warehouseCodeCol] ?? '').trim() : '',
      changeAction,
      auditDate: parseAuditDate(row[auditDateCol]),
      lineSeq,
      batchId: batchIdCol !== undefined ? String(row[batchIdCol] ?? '').trim() : '',
      description: descriptionCol !== undefined ? String(row[descriptionCol] ?? '').trim() : '',
      changes,
    })
  }

  return { rows, skippedRows }
}
