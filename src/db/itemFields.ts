import type { BeamRow } from './groupBeams'
import type { MiscItemRow } from './groupMiscItems'
import type { UprightRow } from './groupUprights'
import type { WireDeckRow } from './groupWireDecks'

export type SelectableItemType = 'upright' | 'beam' | 'wireDeck' | 'misc'
export type SelectableRow = BeamRow | UprightRow | WireDeckRow | MiscItemRow

export interface ItemField {
  key: string
  label: string
  value: string
}

export function getItemLabel(itemType: SelectableItemType, row: SelectableRow): string {
  switch (itemType) {
    case 'beam':
      return 'Used Beams'
    case 'upright':
      return 'Used Uprights'
    case 'wireDeck':
      return 'Used Wire Decks'
    case 'misc':
      return (row as MiscItemRow).description || 'Other'
  }
}

// Mirrors each item type's own table columns (and label text) so the
// checkbox list on a customer sheet matches the vocabulary used
// everywhere else in the app. Fields with no value for this item are
// left out — no point offering a checkbox for a blank.
export function getItemFields(itemType: SelectableItemType, row: SelectableRow): ItemField[] {
  let fields: ItemField[]
  switch (itemType) {
    case 'beam': {
      const r = row as BeamRow
      fields = [
        { key: 'style', label: 'Style', value: r.style },
        { key: 'widthByLength', label: 'Width x Length', value: r.widthByLength },
        { key: 'color', label: 'Color', value: r.color },
        { key: 'pinCount', label: 'Pin Count', value: r.pinCount },
        { key: 'step', label: 'Step', value: r.step },
        { key: 'condition', label: 'Condition', value: r.condition },
        { key: 'stamp', label: 'Stamp', value: r.stamp },
        { key: 'stickers', label: 'Stickers', value: r.stickers },
        { key: 'bundleSize', label: 'Bundle Size', value: r.bundleSize },
        { key: 'zone', label: 'Zone', value: r.zone },
        { key: 'notes', label: 'Notes', value: r.notes },
      ]
      break
    }
    case 'upright': {
      const r = row as UprightRow
      fields = [
        { key: 'style', label: 'Style', value: r.style },
        { key: 'widthByHeight', label: 'Width x Height', value: r.widthByHeight },
        { key: 'color', label: 'Color', value: r.color },
        { key: 'columnSize', label: 'Column Size', value: r.columnSizeDisplay },
        { key: 'footplateSize', label: 'Footplate Size', value: r.footplateSizeDisplay },
        { key: 'anchorHoleCount', label: 'Anchor Hole Count', value: String(r.anchorHoleCount ?? '') },
        { key: 'holeSize', label: 'Hole Size', value: r.holeSize },
        { key: 'gauge', label: 'Gauge', value: r.gauge },
        { key: 'condition', label: 'Condition', value: r.condition },
        { key: 'stamp', label: 'Stamp', value: r.stamp },
        { key: 'bundleSize', label: 'Bundle Size', value: r.bundleSize },
        { key: 'zone', label: 'Zone', value: r.zone },
        { key: 'notes', label: 'Notes', value: r.notes },
      ]
      break
    }
    case 'wireDeck': {
      const r = row as WireDeckRow
      fields = [
        { key: 'style', label: 'Style', value: r.style.join(', ') },
        { key: 'widthByLength', label: 'Width x Length', value: r.widthByLength },
        { key: 'channelCount', label: 'Number of Channels', value: r.channelCount },
        { key: 'condition', label: 'Condition', value: r.condition },
        { key: 'bundleSize', label: 'Bundle Size', value: r.bundleSize },
        { key: 'zone', label: 'Zone', value: r.zone },
        { key: 'notes', label: 'Notes', value: r.notes },
      ]
      break
    }
    case 'misc': {
      const r = row as MiscItemRow
      fields = [
        { key: 'description', label: 'Item', value: r.description },
        { key: 'itemDescription', label: 'Item Description', value: r.itemDescription },
        { key: 'condition', label: 'Condition', value: r.condition },
        { key: 'bundleSize', label: 'Bundle Size', value: r.bundleSize },
        { key: 'zone', label: 'Zone', value: r.zone },
        { key: 'notes', label: 'Notes', value: r.notes },
      ]
      break
    }
  }
  return fields.filter((f) => f.value)
}
