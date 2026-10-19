import type { BeamRow } from './groupBeams'
import type { MiscItemRow } from './groupMiscItems'
import type { UprightRow } from './groupUprights'
import type { WireDeckRow } from './groupWireDecks'

// Shared, full-detail description builders — used anywhere an inventory
// row needs to be shown or saved as a single readable line (Sales Quotes,
// Customer Sheets, the Procurement tie dropdown). Keeping one copy of each
// avoids different screens showing different levels of detail for the
// same item.
export function describeBeamRow(row: BeamRow): string {
  return [
    row.style,
    row.widthByLength,
    row.color,
    row.pinCount && `${row.pinCount} pin`,
    row.step && `${row.step} step`,
    row.condition,
    row.stamp,
    row.stickers === 'Yes' && 'Stickers',
  ]
    .filter(Boolean)
    .join(', ')
}

export function describeUprightRow(row: UprightRow): string {
  const footplate =
    row.footplateLength || row.footplateWidth ? `${row.footplateLength}"x${row.footplateWidth}" FP` : ''
  return [
    row.style,
    `${row.widthByHeight} x ${row.columnSizeDisplay}`,
    row.color,
    footplate,
    row.condition,
    row.gauge && `${row.gauge} ga`,
  ]
    .filter(Boolean)
    .join(', ')
}

export function describeWireDeckRow(row: WireDeckRow): string {
  return [row.style.join('/'), row.widthByLength, row.channelCount && `${row.channelCount} channel`, row.condition]
    .filter(Boolean)
    .join(', ')
}

export function describeMiscRow(row: MiscItemRow): string {
  return [row.description, row.itemDescription, row.condition].filter(Boolean).join(', ')
}
