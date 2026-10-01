import { useLiveQuery } from 'dexie-react-hooks'
import { groupBeams, type BeamRow } from '../db/groupBeams'
import { groupMiscItems, type MiscItemRow } from '../db/groupMiscItems'
import { groupUprights, type UprightRow } from '../db/groupUprights'
import { groupWireDecks, type WireDeckRow } from '../db/groupWireDecks'
import { listBeamsBySite, listMiscItemsBySite, listUprightsBySite, listWireDecksBySite } from '../db/items'
import { computeAvailableQuantity } from '../db/salesQuotes'
import type { ItemType, Site, SalesQuoteLineItem } from '../models/types'

// Carries its own resolved selection (not just keys) so the parent can
// build a tie allocation straight from this value without needing to
// re-run any of the site-scoped inventory queries itself.
export interface TieAllocationValue {
  siteId: string
  siteName: string
  rowKey: string
  itemType: ItemType | ''
  itemIds: string[]
  description: string
  quantity: string
}

export const EMPTY_TIE_ALLOCATION: TieAllocationValue = {
  siteId: '',
  siteName: '',
  rowKey: '',
  itemType: '',
  itemIds: [],
  description: '',
  quantity: '',
}

export interface TieAllocationRow {
  key: string
  itemType: ItemType
  itemIds: string[]
  description: string
  quantity: number
}

function describeBeam(row: BeamRow): string {
  return [row.style, row.widthByLength, row.color, row.pinCount && `${row.pinCount} pin`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeUpright(row: UprightRow): string {
  return [row.style, row.widthByHeight, row.color, row.gauge && `${row.gauge} ga`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeWireDeck(row: WireDeckRow): string {
  return [row.style.join('/'), row.widthByLength, row.channelCount && `${row.channelCount} channel`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeMisc(row: MiscItemRow): string {
  return [row.description, row.itemDescription, row.condition].filter(Boolean).join(', ')
}

interface TieAllocationColumnProps {
  activeSites: Site[]
  holds: SalesQuoteLineItem[]
  value: TieAllocationValue
  // The most this column's quantity can be — whatever's still left on the
  // line item once every other column's own quantity is subtracted out.
  maxQuantity: number
  onChange: (next: TieAllocationValue) => void
  onRemove?: () => void
  // The first column keeps the original look (separate full-size boxes,
  // left-aligned, no remove control) from before multi-location tying
  // existed. Every column after it uses the newer compact boxed style.
  isFirst?: boolean
}

// One (Location, Inventory Item, Quantity) group — its own component so
// each column can independently query just its own chosen site's
// inventory via its own hooks, rather than one shared site-scoped query
// for every column.
export default function TieAllocationColumn({
  activeSites,
  holds,
  value,
  maxQuantity,
  onChange,
  onRemove,
  isFirst = false,
}: TieAllocationColumnProps) {
  const beams = useLiveQuery(() => (value.siteId ? listBeamsBySite(value.siteId) : []), [value.siteId]) ?? []
  const uprights = useLiveQuery(() => (value.siteId ? listUprightsBySite(value.siteId) : []), [value.siteId]) ?? []
  const wireDecks = useLiveQuery(() => (value.siteId ? listWireDecksBySite(value.siteId) : []), [value.siteId]) ?? []
  const miscItems = useLiveQuery(() => (value.siteId ? listMiscItemsBySite(value.siteId) : []), [value.siteId]) ?? []

  const availableRows: TieAllocationRow[] = value.siteId
    ? [
        ...groupBeams(beams).map((row) => ({
          key: `beam:${row.key}`,
          itemType: 'beam' as ItemType,
          itemIds: row.ids,
          description: describeBeam(row),
          quantity: computeAvailableQuantity(row.quantity, row.ids, holds),
        })),
        ...groupUprights(uprights).map((row) => ({
          key: `upright:${row.key}`,
          itemType: 'upright' as ItemType,
          itemIds: row.ids,
          description: describeUpright(row),
          quantity: computeAvailableQuantity(row.quantity, row.ids, holds),
        })),
        ...groupWireDecks(wireDecks).map((row) => ({
          key: `wireDeck:${row.key}`,
          itemType: 'wireDeck' as ItemType,
          itemIds: row.ids,
          description: describeWireDeck(row),
          quantity: computeAvailableQuantity(row.quantity, row.ids, holds),
        })),
        ...groupMiscItems(miscItems).map((row) => ({
          key: `misc:${row.key}`,
          itemType: 'misc' as ItemType,
          itemIds: row.ids,
          description: describeMisc(row),
          quantity: computeAvailableQuantity(row.quantity, row.ids, holds),
        })),
      ]
    : []

  const eligibleRows = availableRows.filter((row) => row.quantity > 0)
  const selectedRow = eligibleRows.find((row) => row.key === value.rowKey)

  function handleSiteChange(siteId: string) {
    const site = activeSites.find((s) => s.id === siteId)
    onChange({ ...EMPTY_TIE_ALLOCATION, siteId, siteName: site?.name ?? '' })
  }

  function handleRowChange(rowKey: string) {
    const row = eligibleRows.find((r) => r.key === rowKey)
    if (!row) {
      onChange({ ...value, rowKey: '', itemType: '', itemIds: [], description: '', quantity: '' })
      return
    }
    const prefill = Math.max(1, Math.min(row.quantity, maxQuantity))
    onChange({
      ...value,
      rowKey,
      itemType: row.itemType,
      itemIds: row.itemIds,
      description: row.description,
      quantity: String(prefill),
    })
  }

  const locationField = (
    <label>
      Location
      <select value={value.siteId} onChange={(e) => handleSiteChange(e.target.value)}>
        <option value="">Select a location…</option>
        {activeSites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
    </label>
  )

  const itemField = value.siteId && (
    <label>
      Inventory Item
      <select value={value.rowKey} onChange={(e) => handleRowChange(e.target.value)}>
        <option value="">Select an item…</option>
        {eligibleRows.map((row) => (
          <option key={row.key} value={row.key}>
            {row.description} ({row.quantity} available)
          </option>
        ))}
      </select>
    </label>
  )

  const noInventoryNote = value.siteId && eligibleRows.length === 0 && (
    <p className="placeholder-note">No inventory is available at this location yet.</p>
  )

  const quantityField = selectedRow && (
    <label>
      Quantity
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={Math.min(selectedRow.quantity, maxQuantity)}
        value={value.quantity}
        onChange={(e) => onChange({ ...value, quantity: e.target.value })}
      />
    </label>
  )

  return (
    <div className="tie-allocation-column">
      <div className="field-row">{locationField}</div>
      {itemField && <div className="field-row">{itemField}</div>}
      {noInventoryNote}
      {isFirst
        ? quantityField && <div className="field-row">{quantityField}</div>
        : (quantityField || onRemove) && (
            <div className="field-row tie-allocation-qty-row">
              {quantityField}
              {onRemove && (
                <button type="button" className="delete-button" onClick={onRemove}>
                  Remove
                </button>
              )}
            </div>
          )}
    </div>
  )
}
