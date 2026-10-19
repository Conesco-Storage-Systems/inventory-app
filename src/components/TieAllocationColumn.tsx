import { useLiveQuery } from 'dexie-react-hooks'
import { describeBeamRow, describeMiscRow, describeUprightRow, describeWireDeckRow } from '../db/describeItemRow'
import { groupBeams } from '../db/groupBeams'
import { groupMiscItems } from '../db/groupMiscItems'
import { groupUprights } from '../db/groupUprights'
import { groupWireDecks } from '../db/groupWireDecks'
import { listBeamsBySite, listMiscItemsBySite, listUprightsBySite, listWireDecksBySite } from '../db/items'
import type { ItemType, Site } from '../models/types'
import { rankTieRecommendations } from '../utils/tieRecommendation'

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

// What another column in this same tie has already claimed — used to
// shrink (or hide) a shared inventory row here so the same physical stock
// can't be double-counted across columns.
export interface TieAllocationSelection {
  siteId: string
  rowKey: string
  quantity: number
}

interface TieAllocationColumnProps {
  activeSites: Site[]
  value: TieAllocationValue
  // The most this column's quantity can be — whatever's still left on the
  // line item once every other column's own quantity is subtracted out.
  maxQuantity: number
  // Every other column's current (siteId, rowKey, quantity) selection —
  // this column's own value is never in here, only the others.
  otherSelections: TieAllocationSelection[]
  // The imported Sales Order line's own free-text description — used to
  // recommend a likely match. Empty when there's nothing to compare
  // against (or nothing worth recommending).
  importedDescription: string
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
  value,
  maxQuantity,
  otherSelections,
  importedDescription,
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
          description: describeBeamRow(row),
          quantity: row.quantity,
        })),
        ...groupUprights(uprights).map((row) => ({
          key: `upright:${row.key}`,
          itemType: 'upright' as ItemType,
          itemIds: row.ids,
          description: describeUprightRow(row),
          quantity: row.quantity,
        })),
        ...groupWireDecks(wireDecks).map((row) => ({
          key: `wireDeck:${row.key}`,
          itemType: 'wireDeck' as ItemType,
          itemIds: row.ids,
          description: describeWireDeckRow(row),
          quantity: row.quantity,
        })),
        ...groupMiscItems(miscItems).map((row) => ({
          key: `misc:${row.key}`,
          itemType: 'misc' as ItemType,
          itemIds: row.ids,
          description: describeMiscRow(row),
          quantity: row.quantity,
        })),
      ]
    : []

  // Shrink each row by however much of it other columns have already
  // claimed, so the same physical stock can't be allocated twice — it
  // only drops off the list once nothing's left of it.
  function reservedElsewhere(rowKey: string): number {
    return otherSelections
      .filter((sel) => sel.siteId === value.siteId && sel.rowKey === rowKey)
      .reduce((sum, sel) => sum + sel.quantity, 0)
  }

  const eligibleRows = availableRows
    .map((row) => ({ ...row, quantity: row.quantity - reservedElsewhere(row.key) }))
    .filter((row) => row.quantity > 0)
  const selectedRow = eligibleRows.find((row) => row.key === value.rowKey)

  // Best-matching row(s) for the imported line's own description, best
  // first — empty when nothing scores well enough to recommend.
  const recommendedKeys = rankTieRecommendations(importedDescription, eligibleRows)
  const recommendedSet = new Set(recommendedKeys)
  const recommendedRows = recommendedKeys
    .map((key) => eligibleRows.find((row) => row.key === key))
    .filter((row): row is TieAllocationRow => Boolean(row))
  const otherRows = eligibleRows.filter((row) => !recommendedSet.has(row.key))

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
        {recommendedRows.length > 0 && (
          <optgroup label="Recommended">
            {recommendedRows.map((row) => (
              <option key={row.key} value={row.key}>
                {row.description} ({row.quantity} available)
              </option>
            ))}
          </optgroup>
        )}
        {recommendedRows.length > 0 ? (
          <optgroup label="All Items">
            {otherRows.map((row) => (
              <option key={row.key} value={row.key}>
                {row.description} ({row.quantity} available)
              </option>
            ))}
          </optgroup>
        ) : (
          otherRows.map((row) => (
            <option key={row.key} value={row.key}>
              {row.description} ({row.quantity} available)
            </option>
          ))
        )}
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
