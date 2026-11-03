import type { BeamRow } from '../db/groupBeams'
import type { MiscItemRow } from '../db/groupMiscItems'
import type { UprightRow } from '../db/groupUprights'
import type { WireDeckRow } from '../db/groupWireDecks'
import type { ItemType } from '../models/types'

// The public, no-login "View Online" link for a grouped row's ids — reused
// by both export entry points (LocationDetail.tsx, AllInventory.tsx) to
// build the parallel hyperlink target list passed to exportSheetsToExcel.
// window.location.origin keeps this correct in both dev and production
// without hardcoding a URL.
export function shareLink(itemType: ItemType, ids: string[]): string {
  return `${window.location.origin}/share/${itemType}/${ids.join(',')}`
}

// One row per item, one column per field — a mix of the original per-field
// layout and the later "Size" column (kept, but limited to just the
// primary width x length/height, not the extra column size folded in).
// Every row gets every column (via blankRow below) so the combined sheet's
// headers — derived from the first row's keys — include every item type's
// fields, not just whichever type happens to be first; a field that
// doesn't apply to a given row's item type is just left blank.
export interface InventoryExportRow {
  [key: string]: string | number
  Quantity: number | string
  Item: string
  Size: string
  Style: string
  Color: string
  'Pin Count': string
  Step: string
  'Column Size': string
  'Footplate Size': string
  'Footplate Thickness': string
  'Anchor Hole Count': string
  'Hole Size': string
  Gauge: string
  'Number of Channels': string
  'Item Description': string
  Condition: string
  Stamp: string
  Stickers: string
  'Bundle Size': string
  Zone: string
  Notes: string
  'Cost Per': number | string
  'Sell Per': number | string
  Photos: number
  'View Online': string
}

// The full ordered set of column labels this unified row shape carries —
// reused wherever something needs to render every data point in a fixed,
// consistent order without hardcoding the list a second time (e.g. the
// Inventory Transfer screens' full line-item tables).
export const EXPORT_ROW_COLUMNS: string[] = [
  'Quantity',
  'Item',
  'Size',
  'Style',
  'Color',
  'Pin Count',
  'Step',
  'Column Size',
  'Footplate Size',
  'Footplate Thickness',
  'Anchor Hole Count',
  'Hole Size',
  'Gauge',
  'Number of Channels',
  'Item Description',
  'Condition',
  'Stamp',
  'Stickers',
  'Bundle Size',
  'Zone',
  'Notes',
  'Cost Per',
  'Sell Per',
  'Photos',
  'View Online',
]

// Per-item-type subsets of EXPORT_ROW_COLUMNS, matching exactly the fields
// each *ExportRow function below actually populates — used wherever line
// items are broken out into their own item-type section (so, e.g., an
// Uprights section doesn't show a blank "Pin Count" column that only Beams
// ever fill in). "Item" is left out of each since the section heading
// already says the type.
export const BEAM_EXPORT_COLUMNS: string[] = [
  'Quantity',
  'Size',
  'Style',
  'Color',
  'Pin Count',
  'Step',
  'Condition',
  'Stamp',
  'Stickers',
  'Bundle Size',
  'Zone',
  'Notes',
  'Cost Per',
  'Sell Per',
  'Photos',
  'View Online',
]

export const UPRIGHT_EXPORT_COLUMNS: string[] = [
  'Quantity',
  'Size',
  'Style',
  'Color',
  'Column Size',
  'Footplate Size',
  'Footplate Thickness',
  'Anchor Hole Count',
  'Hole Size',
  'Gauge',
  'Condition',
  'Stamp',
  'Bundle Size',
  'Zone',
  'Notes',
  'Cost Per',
  'Sell Per',
  'Photos',
  'View Online',
]

export const WIRE_DECK_EXPORT_COLUMNS: string[] = [
  'Quantity',
  'Size',
  'Style',
  'Number of Channels',
  'Condition',
  'Bundle Size',
  'Zone',
  'Notes',
  'Cost Per',
  'Sell Per',
  'Photos',
  'View Online',
]

export const MISC_EXPORT_COLUMNS: string[] = [
  'Quantity',
  'Style',
  'Item Description',
  'Condition',
  'Bundle Size',
  'Zone',
  'Notes',
  'Cost Per',
  'Sell Per',
  'Photos',
  'View Online',
]

const blankRow: InventoryExportRow = {
  Quantity: 0,
  Item: '',
  Size: '',
  Style: '',
  Color: '',
  'Pin Count': '',
  Step: '',
  'Column Size': '',
  'Footplate Size': '',
  'Footplate Thickness': '',
  'Anchor Hole Count': '',
  'Hole Size': '',
  Gauge: '',
  'Number of Channels': '',
  'Item Description': '',
  Condition: '',
  Stamp: '',
  Stickers: '',
  'Bundle Size': '',
  Zone: '',
  Notes: '',
  'Cost Per': '',
  'Sell Per': '',
  Photos: 0,
  'View Online': 'View Photos',
}

export function uprightExportRow(row: UprightRow): InventoryExportRow {
  return {
    ...blankRow,
    Quantity: row.quantity,
    Item: 'Upright',
    Size: row.widthByHeight,
    Style: row.style,
    Color: row.color,
    'Column Size': row.columnSizeDisplay,
    'Footplate Size': row.footplateSizeDisplay,
    'Footplate Thickness': row.footplateThickness,
    'Anchor Hole Count': row.anchorHoleCount,
    'Hole Size': row.holeSize,
    Gauge: row.gauge,
    Condition: row.condition,
    Stamp: row.stamp,
    'Bundle Size': row.bundleSize,
    Zone: row.zone,
    Notes: row.notes,
    'Cost Per': row.costPer,
    'Sell Per': row.sellPer,
    Photos: row.photoIds.length,
  }
}

export function beamExportRow(row: BeamRow): InventoryExportRow {
  return {
    ...blankRow,
    Quantity: row.quantity,
    Item: 'Beam',
    Size: row.widthByLength,
    Style: row.style,
    Color: row.color,
    'Pin Count': row.pinCount,
    Step: row.step,
    Condition: row.condition,
    Stamp: row.stamp,
    Stickers: row.stickers,
    'Bundle Size': row.bundleSize,
    Zone: row.zone,
    Notes: row.notes,
    'Cost Per': row.costPer,
    'Sell Per': row.sellPer,
    Photos: row.photoIds.length,
  }
}

export function wireDeckExportRow(row: WireDeckRow): InventoryExportRow {
  return {
    ...blankRow,
    Quantity: row.quantity,
    Item: 'Wire Deck',
    Size: row.widthByLength,
    Style: row.style.join(', '),
    'Number of Channels': row.channelCount,
    Condition: row.condition,
    'Bundle Size': row.bundleSize,
    Zone: row.zone,
    Notes: row.notes,
    'Cost Per': row.costPer,
    'Sell Per': row.sellPer,
    Photos: row.photoIds.length,
  }
}

export function miscExportRow(row: MiscItemRow): InventoryExportRow {
  return {
    ...blankRow,
    Quantity: row.quantity,
    Item: 'Other',
    Style: row.description,
    'Item Description': row.itemDescription,
    Condition: row.condition,
    'Bundle Size': row.bundleSize,
    Zone: row.zone,
    Notes: row.notes,
    'Cost Per': row.costPer,
    'Sell Per': row.sellPer,
    Photos: row.photoIds.length,
  }
}

// The condensed row shape actually written to Excel (LocationDetail.tsx /
// AllInventory.tsx only) — matches the layout of the offsite consolidated-
// inventory sheets Conesco already works from (one "Size" column, one
// free-text "Notes" column), so switching this app's export over doesn't
// change what the sheet looks like to anyone downstream. Everything above
// (InventoryExportRow, the *_EXPORT_COLUMNS lists, the *ExportRow
// functions) stays as-is for the Inventory Transfer screens, which still
// show each field broken out into its own on-screen column.
export interface ExcelExportRow {
  [key: string]: string | number
  Quantity: number | string
  Item: string
  Size: string
  Notes: string
  'View Online': string
  'Cost Per': number | string
  'Sell Per': number | string
}

// Shorthand Conesco already uses on these sheets — anything not listed here
// just prints as the plain style name.
const STYLE_ABBREVIATIONS: Record<string, string> = {
  Teardrop: 'TD',
  'New Style': 'NS',
}

function styleAbbreviation(style: string): string {
  return STYLE_ABBREVIATIONS[style] ?? style
}

// Breaks a long combined Notes string onto a second line near its midpoint
// (at the nearest comma, so it doesn't cut a word in half) rather than
// leaving it as one long run — exportToExcel.ts turns this literal "\n"
// into a real wrapped line in the cell. Short notes are left on one line.
function wrapAtMidpoint(text: string): string {
  if (text.length < 40) return text
  const mid = Math.floor(text.length / 2)
  for (let offset = 0; offset < text.length; offset++) {
    const right = mid + offset
    const left = mid - offset
    if (right < text.length && text[right] === ',') return breakAfterComma(text, right)
    if (left >= 0 && text[left] === ',') return breakAfterComma(text, left)
  }
  return text
}

function breakAfterComma(text: string, commaIndex: number): string {
  const afterComma = commaIndex + 1
  const start = text[afterComma] === ' ' ? afterComma + 1 : afterComma
  return `${text.slice(0, afterComma)}\n${text.slice(start)}`
}

function joinNotes(parts: Array<string | number | undefined | null>): string {
  const joined = parts
    .map((part) => (part === undefined || part === null ? '' : String(part).trim()))
    .filter(Boolean)
    .join(', ')
  return wrapAtMidpoint(joined)
}

function conditionNote(condition: string): string {
  return condition ? `${condition} condition` : ''
}

function footplateDescription(length: string, width: string, holeCount: string, holeSize: string): string {
  const pieces: string[] = []
  if (length || width) pieces.push(`${length}"x${width}" FP`)
  const holeBits = [holeCount ? `${holeCount}H` : '', holeSize].filter(Boolean).join(' ')
  if (holeBits) pieces.push(`with ${holeBits}`)
  return pieces.join(' ')
}

export function uprightExcelRow(row: UprightRow): ExcelExportRow {
  return {
    Quantity: row.quantity,
    Item: 'Upright',
    Size:
      row.columnLength || row.columnWidth
        ? `${row.widthByHeight} x ${row.columnLength}"x${row.columnWidth}"`
        : row.widthByHeight,
    Notes: joinNotes([
      styleAbbreviation(row.style),
      footplateDescription(row.footplateLength, row.footplateWidth, row.anchorHoleCount, row.holeSize),
      row.gauge ? `${row.gauge} gauge` : '',
      row.color,
      conditionNote(row.condition),
      row.stamp,
      row.notes,
    ]),
    'View Online': 'View Photos',
    'Cost Per': row.costPer,
    'Sell Per': row.sellPer,
  }
}

export function beamExcelRow(row: BeamRow): ExcelExportRow {
  return {
    Quantity: row.quantity,
    Item: 'Beam',
    Size: row.step ? `${row.widthByLength} x ${row.step}` : row.widthByLength,
    Notes: joinNotes([
      styleAbbreviation(row.style),
      row.pinCount ? `${row.pinCount} pins` : '',
      row.color,
      conditionNote(row.condition),
      row.stamp,
      row.stickers === 'Yes' ? 'Stickers' : '',
      row.notes,
    ]),
    'View Online': 'View Photos',
    'Cost Per': row.costPer,
    'Sell Per': row.sellPer,
  }
}

export function wireDeckExcelRow(row: WireDeckRow): ExcelExportRow {
  return {
    Quantity: row.quantity,
    Item: 'Wire Deck',
    Size: row.widthByLength,
    Notes: joinNotes([
      row.style.map(styleAbbreviation).join(', '),
      row.channelCount ? `${row.channelCount} channels` : '',
      conditionNote(row.condition),
      row.notes,
    ]),
    'View Online': 'View Photos',
    'Cost Per': row.costPer,
    'Sell Per': row.sellPer,
  }
}

export function miscExcelRow(row: MiscItemRow): ExcelExportRow {
  return {
    Quantity: row.quantity,
    Item: 'Other',
    Size: '',
    Notes: joinNotes([row.description, row.itemDescription, conditionNote(row.condition), row.notes]),
    'View Online': 'View Photos',
    'Cost Per': row.costPer,
    'Sell Per': row.sellPer,
  }
}
