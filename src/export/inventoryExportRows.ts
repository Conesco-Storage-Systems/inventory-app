import type { BeamRow } from '../db/groupBeams'
import type { MiscItemRow } from '../db/groupMiscItems'
import type { UprightRow } from '../db/groupUprights'
import type { WireDeckRow } from '../db/groupWireDecks'

// Matches the layout of the "Ringgold In Progress Inventory" reference
// sheet: one row per item, with everything beyond quantity/type/size
// condensed into a single free-text comments column instead of a column
// per field.
export interface InventoryExportRow {
  [key: string]: string | number
  'Quantity Remaining': number | string
  Item: string
  Size: string
  'Type / Comments': string
}

function joinParts(parts: (string | undefined | null | false)[]): string {
  return parts
    .map((p) => (p ?? '').toString().trim())
    .filter(Boolean)
    .join(', ')
}

export function uprightExportRow(row: UprightRow): InventoryExportRow {
  const size = [row.width ? `${row.width}"` : '', row.height, row.columnLength || row.columnWidth ? `${row.columnLength}x${row.columnWidth}` : '']
    .filter(Boolean)
    .join('x')

  const footplate = row.footplateLength || row.footplateWidth ? `${row.footplateLength}x${row.footplateWidth} FP` : ''
  const anchorHoles = row.anchorHoleCount ? `${row.anchorHoleCount}H ${row.holeSize}`.trim() : ''

  return {
    'Quantity Remaining': row.quantity,
    Item: 'Upright',
    Size: size,
    'Type / Comments': joinParts([row.style, row.color, footplate, anchorHoles, row.notes, row.condition, row.stamp, row.gauge]),
  }
}

export function beamExportRow(row: BeamRow): InventoryExportRow {
  const size = [row.width, row.length, row.step].filter(Boolean).join('x')
  const pinCount = row.pinCount ? `${row.pinCount}pin` : ''

  return {
    'Quantity Remaining': row.quantity,
    Item: 'Beam',
    Size: size,
    'Type / Comments': joinParts([row.style, row.color, pinCount, row.condition, row.stamp, row.stickers]),
  }
}

export function wireDeckExportRow(row: WireDeckRow): InventoryExportRow {
  const size = [row.width, row.length].filter(Boolean).join('x')
  const channels = row.channelCount ? `${row.channelCount} chnl` : ''

  return {
    'Quantity Remaining': row.quantity,
    Item: 'Wire Deck',
    Size: size,
    'Type / Comments': joinParts([channels, row.condition, row.notes]),
  }
}

export function miscExportRow(row: MiscItemRow): InventoryExportRow {
  return {
    'Quantity Remaining': row.quantity,
    Item: row.description || 'Other',
    Size: row.itemDescription ?? '',
    'Type / Comments': joinParts([row.condition, row.notes]),
  }
}
