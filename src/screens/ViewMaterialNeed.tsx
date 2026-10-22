import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import ReadOnlyItemTable, { type ColumnDef } from '../components/ReadOnlyItemTable'
import { combineRowsAcrossSites, type WithSite } from '../db/combineAcrossSites'
import { db } from '../db/db'
import { describeBeamRow, describeMiscRow, describeUprightRow, describeWireDeckRow } from '../db/describeItemRow'
import { groupBeams, leadingNumber, type BeamRow } from '../db/groupBeams'
import { groupMiscItems, type MiscItemRow } from '../db/groupMiscItems'
import { groupUprights, uprightDimensionSortValue, uprightHeightSortValue, type UprightRow } from '../db/groupUprights'
import { groupWireDecks, type WireDeckRow } from '../db/groupWireDecks'
import {
  allocatedQuantityForIds,
  summarizeNeedAllocations,
  tieMaterialNeedAllocation,
  untieMaterialNeedAllocation,
} from '../db/materialNeedAllocations'
import { deleteMaterialNeed, getMaterialNeed } from '../db/materialNeeds'
import { getProjectJobSite } from '../db/projectJobSites'
import { ITEM_TYPE_LABELS, type ItemType, type MaterialNeed } from '../models/types'
import { applyColumnFilters, computeFilterOptions } from '../utils/columnFilters'
import { matchesSearch, normalizeForSearch } from '../utils/searchMatch'

type AllBeamRow = BeamRow & WithSite
type AllUprightRow = UprightRow & WithSite
type AllWireDeckRow = WireDeckRow & WithSite
type AllMiscItemRow = MiscItemRow & WithSite

type FilterMap = Partial<Record<string, Set<string>>>

function locationLink(siteId: string, siteName: string) {
  return <Link to={`/locations/${siteId}`}>{siteName}</Link>
}

function photosLink(siteId: string, ids: string[], photoIds: string[]) {
  return photoIds.length > 0 ? (
    <Link to={`/locations/${siteId}/photos?ids=${ids.join(',')}`}>View photos ({photoIds.length})</Link>
  ) : (
    '—'
  )
}

export default function ViewMaterialNeed() {
  const { projectId, needId } = useParams<{ projectId: string; needId: string }>()
  const navigate = useNavigate()

  const need = useLiveQuery(() => (needId ? getMaterialNeed(needId) : undefined), [needId])
  const jobSite = useLiveQuery(() => (need ? getProjectJobSite(need.jobSiteId) : undefined), [need?.jobSiteId])
  const allocations = useLiveQuery(() => (needId ? db.materialNeedAllocations.where('materialNeedId').equals(needId).toArray() : []), [needId]) ?? []
  // Every allocation in the system, not just this need's — real inventory
  // is shared across every project, so stock already tied to ANY need has
  // to be treated as spoken for here, even if it was tied from a
  // different need or a different project entirely.
  const allAllocations = useLiveQuery(() => db.materialNeedAllocations.toArray(), []) ?? []
  const allSites = useLiveQuery(() => db.sites.toArray(), []) ?? []

  const beams = useLiveQuery(() => (need?.itemType === 'beam' ? db.beams.toArray() : []), [need?.itemType]) ?? []
  const uprights = useLiveQuery(() => (need?.itemType === 'upright' ? db.uprights.toArray() : []), [need?.itemType]) ?? []
  const wireDecks = useLiveQuery(() => (need?.itemType === 'wireDeck' ? db.wireDecks.toArray() : []), [need?.itemType]) ?? []
  const miscItems = useLiveQuery(() => (need?.itemType === 'misc' ? db.miscItems.toArray() : []), [need?.itemType]) ?? []

  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState<FilterMap>({})
  const [tieQuantities, setTieQuantities] = useState<Record<string, string>>({})
  const [tyingKey, setTyingKey] = useState<string | null>(null)
  const [tieError, setTieError] = useState<string | null>(null)
  const [confirmingDeleteNeed, setConfirmingDeleteNeed] = useState(false)
  const [confirmingUntieId, setConfirmingUntieId] = useState<string | null>(null)

  if (need === undefined) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    )
  }

  if (!need || !projectId) {
    return (
      <main className="page">
        <p>
          <Link to={`/projects/${projectId}`}>← Back</Link>
        </p>
        <p>Material need not found.</p>
      </main>
    )
  }

  const summary = summarizeNeedAllocations(need.id, allocations)
  const gap = need.quantityNeeded - summary.total

  function describeRow(itemType: ItemType, row: AllBeamRow | AllUprightRow | AllWireDeckRow | AllMiscItemRow): string {
    switch (itemType) {
      case 'beam':
        return describeBeamRow(row as AllBeamRow)
      case 'upright':
        return describeUprightRow(row as AllUprightRow)
      case 'wireDeck':
        return describeWireDeckRow(row as AllWireDeckRow)
      case 'misc':
        return describeMiscRow(row as AllMiscItemRow)
    }
  }

  async function handleTie(itemType: ItemType, row: { key: string; quantity: number; siteId: string; siteName: string; ids: string[] }, description: string) {
    if (!projectId) return
    const qtyStr = tieQuantities[row.key] ?? ''
    const qty = Number(qtyStr)
    if (!qty || qty <= 0 || qty > row.quantity) {
      setTieError('Enter a quantity between 1 and what is available.')
      return
    }
    setTyingKey(row.key)
    setTieError(null)
    try {
      await tieMaterialNeedAllocation({
        materialNeedId: need!.id,
        projectId,
        siteId: row.siteId,
        siteName: row.siteName,
        itemType,
        itemIds: row.ids,
        description,
        quantity: qty,
      })
      setTieQuantities((prev) => ({ ...prev, [row.key]: '' }))
    } catch (err) {
      setTieError(err instanceof Error ? err.message : 'Something went wrong tying that inventory.')
    } finally {
      setTyingKey(null)
    }
  }

  async function handleDeleteNeed() {
    await deleteMaterialNeed(need!.id)
    navigate(`/projects/${projectId}`)
  }

  // A "Tie" cell works the same regardless of item type — just needs the
  // few fields every grouped row shares — so one render function covers
  // all four tables below instead of repeating it per item type.
  function tieCell(row: AllBeamRow | AllUprightRow | AllWireDeckRow | AllMiscItemRow) {
    return (
      <div className="tie-cell">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={row.quantity}
          value={tieQuantities[row.key] ?? ''}
          onChange={(e) => setTieQuantities((prev) => ({ ...prev, [row.key]: e.target.value }))}
        />
        <button
          type="button"
          onClick={() => handleTie(need!.itemType, row, describeRow(need!.itemType, row))}
          disabled={tyingKey === row.key}
        >
          {tyingKey === row.key ? 'Tying…' : 'Tie'}
        </button>
      </div>
    )
  }

  const tieLeadingColumn = { label: '', render: tieCell }

  const normalizedSearch = normalizeForSearch(searchTerm)

  function displayRows<TRow extends { key: string; quantity: number }>(
    rows: TRow[],
    columns: Record<string, ColumnDef<TRow>>,
  ): TRow[] {
    const nonZero = rows.filter((row) => row.quantity > 0)
    const searched = normalizedSearch ? nonZero.filter((row) => matchesSearch(row, normalizedSearch)) : nonZero
    return applyColumnFilters(searched, columns, filters)
  }

  const uprightColumns: Record<string, ColumnDef<AllUprightRow>> = {
    location: { label: 'Location', render: (row) => locationLink(row.siteId, row.siteName), getValue: (row) => row.siteName, sortValue: (row) => row.siteName },
    quantity: { label: 'Quantity', render: (row) => row.quantity, getValue: (row) => String(row.quantity), filterable: false },
    style: { label: 'Style', render: (row) => row.style, getValue: (row) => row.style, sortValue: (row) => row.style },
    widthByHeight: {
      label: 'Width x Height',
      render: (row) => row.widthByHeight,
      getValue: (row) => row.widthByHeight,
      sortValue: (row) => uprightDimensionSortValue(row.width) * 100000 + uprightHeightSortValue(row.height),
    },
    color: { label: 'Color', render: (row) => row.color, getValue: (row) => row.color, sortValue: (row) => row.color },
    columnSize: {
      label: 'Column Size',
      render: (row) => row.columnSizeDisplay,
      getValue: (row) => row.columnSizeDisplay,
      sortValue: (row) => uprightDimensionSortValue(row.columnLength) * 100000 + uprightDimensionSortValue(row.columnWidth),
    },
    footplateSize: {
      label: 'Footplate Size',
      render: (row) => row.footplateSizeDisplay,
      getValue: (row) => row.footplateSizeDisplay,
      sortValue: (row) => uprightDimensionSortValue(row.footplateLength) * 100000 + uprightDimensionSortValue(row.footplateWidth),
    },
    footplateThickness: { label: 'Footplate Thickness', render: (row) => row.footplateThickness || '—', getValue: (row) => row.footplateThickness, sortValue: (row) => row.footplateThickness },
    anchorHoleCount: { label: 'Anchor Hole Count', render: (row) => row.anchorHoleCount, getValue: (row) => row.anchorHoleCount, sortValue: (row) => uprightDimensionSortValue(row.anchorHoleCount) },
    holeSize: { label: 'Hole Size', render: (row) => row.holeSize || '—', getValue: (row) => row.holeSize, sortValue: (row) => row.holeSize },
    gauge: { label: 'Gauge', render: (row) => row.gauge, getValue: (row) => row.gauge, sortValue: (row) => row.gauge },
    condition: { label: 'Condition', render: (row) => row.condition, getValue: (row) => row.condition, sortValue: (row) => row.condition },
    stamp: { label: 'Stamp', render: (row) => row.stamp || '—', getValue: (row) => row.stamp, sortValue: (row) => row.stamp },
    bundleSize: { label: 'Bundle Size', render: (row) => row.bundleSize || '—', getValue: (row) => row.bundleSize, sortValue: (row) => row.bundleSize },
    zone: { label: 'Zone', render: (row) => row.zone || '—', getValue: (row) => row.zone, sortValue: (row) => row.zone },
    notes: { label: 'Notes', render: (row) => <span className="notes-text">{row.notes || '—'}</span>, getValue: (row) => row.notes, filterable: false },
    costPer: { label: 'Cost Per', render: (row) => (row.costPer ? `$${row.costPer.toFixed(2)}` : '—'), getValue: (row) => String(row.costPer), sortValue: (row) => row.costPer },
    sellPer: { label: 'Sell Per', render: (row) => (row.sellPer ? `$${row.sellPer.toFixed(2)}` : '—'), getValue: (row) => String(row.sellPer), sortValue: (row) => row.sellPer },
    photos: { label: 'Photos', render: (row) => photosLink(row.siteId, row.ids, row.photoIds), getValue: (row) => String(row.photoIds.length), filterable: false },
  }
  const uprightOrder = [
    'location', 'quantity', 'style', 'widthByHeight', 'color', 'columnSize', 'footplateSize', 'footplateThickness',
    'anchorHoleCount', 'holeSize', 'gauge', 'condition', 'stamp', 'bundleSize', 'zone', 'notes', 'costPer', 'sellPer', 'photos',
  ]

  const beamColumns: Record<string, ColumnDef<AllBeamRow>> = {
    location: { label: 'Location', render: (row) => locationLink(row.siteId, row.siteName), getValue: (row) => row.siteName, sortValue: (row) => row.siteName },
    quantity: { label: 'Quantity', render: (row) => row.quantity, getValue: (row) => String(row.quantity), filterable: false },
    style: { label: 'Style', render: (row) => row.style, getValue: (row) => row.style, sortValue: (row) => row.style },
    widthByLength: {
      label: 'Width x Length',
      render: (row) => row.widthByLength,
      getValue: (row) => row.widthByLength,
      sortValue: (row) => leadingNumber(row.width) * 100000 + leadingNumber(row.length),
    },
    color: { label: 'Color', render: (row) => row.color, getValue: (row) => row.color, sortValue: (row) => row.color },
    pinCount: { label: 'Pin Count', render: (row) => row.pinCount, getValue: (row) => row.pinCount, sortValue: (row) => row.pinCount },
    step: { label: 'Step', render: (row) => row.step || '—', getValue: (row) => row.step, sortValue: (row) => row.step },
    condition: { label: 'Condition', render: (row) => row.condition, getValue: (row) => row.condition, sortValue: (row) => row.condition },
    stamp: { label: 'Stamp', render: (row) => row.stamp || '—', getValue: (row) => row.stamp, sortValue: (row) => row.stamp },
    stickers: { label: 'Stickers', render: (row) => row.stickers, getValue: (row) => row.stickers, sortValue: (row) => row.stickers },
    bundleSize: { label: 'Bundle Size', render: (row) => row.bundleSize || '—', getValue: (row) => row.bundleSize, sortValue: (row) => row.bundleSize },
    zone: { label: 'Zone', render: (row) => row.zone || '—', getValue: (row) => row.zone, sortValue: (row) => row.zone },
    notes: { label: 'Notes', render: (row) => <span className="notes-text">{row.notes || '—'}</span>, getValue: (row) => row.notes, filterable: false },
    costPer: { label: 'Cost Per', render: (row) => (row.costPer ? `$${row.costPer.toFixed(2)}` : '—'), getValue: (row) => String(row.costPer), sortValue: (row) => row.costPer },
    sellPer: { label: 'Sell Per', render: (row) => (row.sellPer ? `$${row.sellPer.toFixed(2)}` : '—'), getValue: (row) => String(row.sellPer), sortValue: (row) => row.sellPer },
    photos: { label: 'Photos', render: (row) => photosLink(row.siteId, row.ids, row.photoIds), getValue: (row) => String(row.photoIds.length), filterable: false },
  }
  const beamOrder = [
    'location', 'quantity', 'style', 'widthByLength', 'color', 'pinCount', 'step', 'condition', 'stamp', 'stickers',
    'bundleSize', 'zone', 'notes', 'costPer', 'sellPer', 'photos',
  ]

  const wireDeckColumns: Record<string, ColumnDef<AllWireDeckRow>> = {
    location: { label: 'Location', render: (row) => locationLink(row.siteId, row.siteName), getValue: (row) => row.siteName, sortValue: (row) => row.siteName },
    quantity: { label: 'Quantity', render: (row) => row.quantity, getValue: (row) => String(row.quantity), filterable: false },
    style: { label: 'Style', render: (row) => row.style.join(', ') || '—', getValue: (row) => row.style, sortValue: (row) => row.style.join(', ') },
    widthByLength: {
      label: 'Width x Length',
      render: (row) => row.widthByLength,
      getValue: (row) => row.widthByLength,
      sortValue: (row) => row.width * 100000 + row.length,
    },
    channelCount: { label: 'Number of Channels', render: (row) => row.channelCount, getValue: (row) => row.channelCount, sortValue: (row) => row.channelCount },
    condition: { label: 'Condition', render: (row) => row.condition, getValue: (row) => row.condition, sortValue: (row) => row.condition },
    bundleSize: { label: 'Bundle Size', render: (row) => row.bundleSize || '—', getValue: (row) => row.bundleSize, sortValue: (row) => row.bundleSize },
    zone: { label: 'Zone', render: (row) => row.zone || '—', getValue: (row) => row.zone, sortValue: (row) => row.zone },
    notes: { label: 'Notes', render: (row) => <span className="notes-text">{row.notes || '—'}</span>, getValue: (row) => row.notes, filterable: false },
    costPer: { label: 'Cost Per', render: (row) => (row.costPer ? `$${row.costPer.toFixed(2)}` : '—'), getValue: (row) => String(row.costPer), sortValue: (row) => row.costPer },
    sellPer: { label: 'Sell Per', render: (row) => (row.sellPer ? `$${row.sellPer.toFixed(2)}` : '—'), getValue: (row) => String(row.sellPer), sortValue: (row) => row.sellPer },
    photos: { label: 'Photos', render: (row) => photosLink(row.siteId, row.ids, row.photoIds), getValue: (row) => String(row.photoIds.length), filterable: false },
  }
  const wireDeckOrder = ['location', 'quantity', 'style', 'widthByLength', 'channelCount', 'condition', 'bundleSize', 'zone', 'notes', 'costPer', 'sellPer', 'photos']

  const miscColumns: Record<string, ColumnDef<AllMiscItemRow>> = {
    location: { label: 'Location', render: (row) => locationLink(row.siteId, row.siteName), getValue: (row) => row.siteName, sortValue: (row) => row.siteName },
    quantity: { label: 'Quantity', render: (row) => row.quantity, getValue: (row) => String(row.quantity), filterable: false },
    description: { label: 'Item', render: (row) => row.description || '—', getValue: (row) => row.description, sortValue: (row) => row.description },
    itemDescription: { label: 'Item Description', render: (row) => <span className="notes-text">{row.itemDescription || '—'}</span>, getValue: (row) => row.itemDescription, sortValue: (row) => row.itemDescription },
    condition: { label: 'Condition', render: (row) => row.condition, getValue: (row) => row.condition, sortValue: (row) => row.condition },
    bundleSize: { label: 'Bundle Size', render: (row) => row.bundleSize || '—', getValue: (row) => row.bundleSize, sortValue: (row) => row.bundleSize },
    zone: { label: 'Zone', render: (row) => row.zone || '—', getValue: (row) => row.zone, sortValue: (row) => row.zone },
    notes: { label: 'Notes', render: (row) => <span className="notes-text">{row.notes || '—'}</span>, getValue: (row) => row.notes, filterable: false },
    costPer: { label: 'Cost Per', render: (row) => (row.costPer ? `$${row.costPer.toFixed(2)}` : '—'), getValue: (row) => String(row.costPer), sortValue: (row) => row.costPer },
    sellPer: { label: 'Sell Per', render: (row) => (row.sellPer ? `$${row.sellPer.toFixed(2)}` : '—'), getValue: (row) => String(row.sellPer), sortValue: (row) => row.sellPer },
    photos: { label: 'Photos', render: (row) => photosLink(row.siteId, row.ids, row.photoIds), getValue: (row) => String(row.photoIds.length), filterable: false },
  }
  const miscOrder = ['location', 'quantity', 'description', 'itemDescription', 'condition', 'bundleSize', 'zone', 'notes', 'costPer', 'sellPer', 'photos']

  // What this need itself calls for, shown as one row using the exact same
  // columns as the Available Inventory table below it, so the two line up
  // for an easy side-by-side comparison of what's needed vs. what's on hand.
  function neededCellValue(key: string, need: MaterialNeed): ReactNode {
    switch (key) {
      case 'location':
        return jobSite?.name ?? '—'
      case 'quantity':
        return need.quantityNeeded
      case 'style':
        return (need.itemType === 'wireDeck' ? need.wireDeckStyle.join(', ') : need.style) || '—'
      case 'widthByLength':
        return `${need.width}" x ${need.length}"`
      case 'widthByHeight':
        return `${need.width}" x ${need.height}`
      case 'color':
        return need.color || '—'
      case 'pinCount':
        return need.pinCount || '—'
      case 'step':
        return need.step || '—'
      case 'columnSize':
        return `${need.columnLength}"x${need.columnWidth}"`
      case 'footplateSize':
        return need.footplateLength || need.footplateWidth ? `${need.footplateLength}"x${need.footplateWidth}"` : '—'
      case 'footplateThickness':
        return need.footplateThickness || '—'
      case 'anchorHoleCount':
        return need.anchorHoleCount || '—'
      case 'holeSize':
        return need.holeSize || '—'
      case 'gauge':
        return need.gauge || '—'
      case 'channelCount':
        return need.channelCount || '—'
      case 'condition':
        return need.condition || '—'
      case 'stamp':
        return need.stamp || '—'
      case 'stickers':
        return need.stickers || '—'
      case 'bundleSize':
        return need.bundleSize || '—'
      case 'zone':
        return need.zone || '—'
      case 'notes':
        return <span className="notes-text">{need.notes || '—'}</span>
      case 'costPer':
        return need.costPer ? `$${need.costPer.toFixed(2)}` : '—'
      case 'sellPer':
        return need.sellPer ? `$${need.sellPer.toFixed(2)}` : '—'
      case 'photos':
        return '—'
      case 'description':
        return need.description || '—'
      case 'itemDescription':
        return <span className="notes-text">{need.itemDescription || '—'}</span>
      default:
        return '—'
    }
  }

  function neededRow(order: string[], columns: Record<string, { label: string }>) {
    return (
      <div className="item-table-wrap">
        <table className="item-table">
          <thead>
            <tr>
              {order.map((key) => (
                <th key={key}>{columns[key].label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {order.map((key) => (
                <td key={key}>{neededCellValue(key, need!)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  // Real inventory is never deducted for a Material Need tie, so without
  // this, the same on-hand stock could be tied to need after need with
  // nothing showing it's already spoken for. Here — and only here, within
  // Project Management — already-allocated quantity is treated as if it
  // were deducted; the real inventory pages read quantity straight off
  // the item records and are unaffected.
  function withAvailableQuantity<TRow extends { ids: string[]; quantity: number }>(rows: TRow[], itemType: ItemType): TRow[] {
    return rows.map((row) => ({
      ...row,
      quantity: Math.max(0, row.quantity - allocatedQuantityForIds(itemType, row.ids, allAllocations)),
    }))
  }

  const uprightRows = withAvailableQuantity(combineRowsAcrossSites(uprights, allSites, groupUprights), 'upright')
  const beamRows = withAvailableQuantity(combineRowsAcrossSites(beams, allSites, groupBeams), 'beam')
  const wireDeckRows = withAvailableQuantity(combineRowsAcrossSites(wireDecks, allSites, groupWireDecks), 'wireDeck')
  const miscRows = withAvailableQuantity(combineRowsAcrossSites(miscItems, allSites, groupMiscItems), 'misc')

  return (
    <main className="page page-wide">
      <p>
        <Link to={`/projects/${projectId}`}>← Back</Link>
      </p>
      <div className="sticky-need-header">
        <h1>{ITEM_TYPE_LABELS[need.itemType]}</h1>
        <div className="item-section">
          <h2>What's Needed</h2>
          {need.itemType === 'upright' && neededRow(uprightOrder, uprightColumns)}
          {need.itemType === 'beam' && neededRow(beamOrder, beamColumns)}
          {need.itemType === 'wireDeck' && neededRow(wireDeckOrder, wireDeckColumns)}
          {need.itemType === 'misc' && neededRow(miscOrder, miscColumns)}
        </div>
      </div>

      <p className="placeholder-note">
        Job Site: {jobSite?.name ?? 'Unknown'} · Needed: {need.quantityNeeded} · Tied: {summary.total} ·{' '}
        {gap > 0 ? `Still needed: ${gap}` : gap < 0 ? `Surplus: ${Math.abs(gap)}` : 'Fully met'}
      </p>

      <p>
        <button type="button" className="delete-button" onClick={() => setConfirmingDeleteNeed(true)}>
          Delete Material Need
        </button>
      </p>

      <div className="item-section">
        <h2>Tied Allocations</h2>
        {allocations.length === 0 ? (
          <p className="placeholder-note">Nothing tied to this need yet.</p>
        ) : (
          <div className="item-table-wrap">
            <table className="item-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <td>{allocation.siteName}</td>
                    <td>{allocation.description}</td>
                    <td>{allocation.quantity}</td>
                    <td>
                      <button type="button" className="delete-button" onClick={() => setConfirmingUntieId(allocation.id)}>
                        Untie
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="item-section">
        <h2>Available {ITEM_TYPE_LABELS[need.itemType]} Inventory</h2>
        <div className="item-search-row">
          <input
            type="text"
            className="item-search-input"
            placeholder="Search…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {tieError && <p className="field-error">{tieError}</p>}

        {need.itemType === 'upright' && (
          <ReadOnlyItemTable<string, AllUprightRow>
            storageKey="materialNeedUprightColumns"
            title="Uprights Columns"
            columns={uprightColumns}
            defaultOrder={uprightOrder}
            rows={displayRows(uprightRows, uprightColumns)}
            filterOptions={computeFilterOptions(uprightRows.filter((r) => r.quantity > 0), uprightColumns)}
            filters={filters}
            onFilterChange={(key, values) => setFilters((prev) => ({ ...prev, [key]: values }))}
            emptyMessage="No uprights match your search or filters."
            wrapColumnKeys={['notes']}
            leftAlignColumnKeys={['location']}
            leadingColumns={[tieLeadingColumn]}
          />
        )}
        {need.itemType === 'beam' && (
          <ReadOnlyItemTable<string, AllBeamRow>
            storageKey="materialNeedBeamColumns"
            title="Beams Columns"
            columns={beamColumns}
            defaultOrder={beamOrder}
            rows={displayRows(beamRows, beamColumns)}
            filterOptions={computeFilterOptions(beamRows.filter((r) => r.quantity > 0), beamColumns)}
            filters={filters}
            onFilterChange={(key, values) => setFilters((prev) => ({ ...prev, [key]: values }))}
            emptyMessage="No beams match your search or filters."
            wrapColumnKeys={['notes']}
            leftAlignColumnKeys={['location']}
            leadingColumns={[tieLeadingColumn]}
          />
        )}
        {need.itemType === 'wireDeck' && (
          <ReadOnlyItemTable<string, AllWireDeckRow>
            storageKey="materialNeedWireDeckColumns"
            title="Wire Decks Columns"
            columns={wireDeckColumns}
            defaultOrder={wireDeckOrder}
            rows={displayRows(wireDeckRows, wireDeckColumns)}
            filterOptions={computeFilterOptions(wireDeckRows.filter((r) => r.quantity > 0), wireDeckColumns)}
            filters={filters}
            onFilterChange={(key, values) => setFilters((prev) => ({ ...prev, [key]: values }))}
            emptyMessage="No wire decks match your search or filters."
            wrapColumnKeys={['notes']}
            leftAlignColumnKeys={['location']}
            leadingColumns={[tieLeadingColumn]}
          />
        )}
        {need.itemType === 'misc' && (
          <ReadOnlyItemTable<string, AllMiscItemRow>
            storageKey="materialNeedMiscColumns"
            title="Other Columns"
            columns={miscColumns}
            defaultOrder={miscOrder}
            rows={displayRows(miscRows, miscColumns)}
            filterOptions={computeFilterOptions(miscRows.filter((r) => r.quantity > 0), miscColumns)}
            filters={filters}
            onFilterChange={(key, values) => setFilters((prev) => ({ ...prev, [key]: values }))}
            emptyMessage="No items match your search or filters."
            wrapColumnKeys={['notes']}
            leftAlignColumnKeys={['location']}
            leadingColumns={[tieLeadingColumn]}
          />
        )}
      </div>

      {confirmingDeleteNeed && (
        <ConfirmDeleteDialog
          onConfirm={handleDeleteNeed}
          onClose={() => setConfirmingDeleteNeed(false)}
          message="Delete this material need? Anything tied to it will be untied."
        />
      )}
      {confirmingUntieId && (
        <ConfirmDeleteDialog
          onConfirm={() => untieMaterialNeedAllocation(confirmingUntieId)}
          onClose={() => setConfirmingUntieId(null)}
          message="Untie this allocation?"
          confirmLabel="Untie"
          confirmingLabel="Untying…"
        />
      )}
    </main>
  )
}
