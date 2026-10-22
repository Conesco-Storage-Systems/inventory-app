import type { BeamRow } from '../db/groupBeams'
import type { MiscItemRow } from '../db/groupMiscItems'
import type { UprightRow } from '../db/groupUprights'
import type { WireDeckRow } from '../db/groupWireDecks'

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
