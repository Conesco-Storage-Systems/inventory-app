import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import ReadOnlyItemTable, { type ColumnDef } from '../components/ReadOnlyItemTable'
import { combineRowsAcrossSites, type WithSite } from '../db/combineAcrossSites'
import { db } from '../db/db'
import { groupBeams, type BeamRow } from '../db/groupBeams'
import { groupMiscItems, type MiscItemRow } from '../db/groupMiscItems'
import { groupUprights, type UprightRow } from '../db/groupUprights'
import { groupWireDecks, type WireDeckRow } from '../db/groupWireDecks'
import { exportSheetsToExcel } from '../export/exportToExcel'
import { applyColumnFilters, computeFilterOptions } from '../utils/columnFilters'
import { matchesSearch, normalizeForSearch } from '../utils/searchMatch'

type AllBeamRow = BeamRow & WithSite
type AllUprightRow = UprightRow & WithSite
type AllWireDeckRow = WireDeckRow & WithSite
type AllMiscItemRow = MiscItemRow & WithSite

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

// Beam width can be a free-form string ("4" or a range like "3.5-4.5"), so
// pull out the leading number for sorting rather than treating it as text.
function leadingNumber(text: string): number {
  const match = text.match(/-?\d+(\.\d+)?/)
  return match ? parseFloat(match[0]) : 0
}

type FilterMap = Partial<Record<string, Set<string>>>

export default function AllInventory() {
  const sites = useLiveQuery(() => db.sites.toArray(), []) ?? []
  const beams = useLiveQuery(() => db.beams.toArray(), []) ?? []
  const uprights = useLiveQuery(() => db.uprights.toArray(), []) ?? []
  const wireDecks = useLiveQuery(() => db.wireDecks.toArray(), []) ?? []
  const miscItems = useLiveQuery(() => db.miscItems.toArray(), []) ?? []

  const [searchTerm, setSearchTerm] = useState('')
  const [uprightFilters, setUprightFilters] = useState<FilterMap>({})
  const [beamFilters, setBeamFilters] = useState<FilterMap>({})
  const [wireDeckFilters, setWireDeckFilters] = useState<FilterMap>({})
  const [miscFilters, setMiscFilters] = useState<FilterMap>({})

  const uprightRows = combineRowsAcrossSites(uprights, sites, groupUprights)
  const beamRows = combineRowsAcrossSites(beams, sites, groupBeams)
  const wireDeckRows = combineRowsAcrossSites(wireDecks, sites, groupWireDecks)
  const miscRows = combineRowsAcrossSites(miscItems, sites, groupMiscItems)

  const hasItems =
    uprightRows.length > 0 || beamRows.length > 0 || wireDeckRows.length > 0 || miscRows.length > 0

  function handleExport() {
    const blankRow = {
      Location: '',
      Quantity: 0 as string | number,
      Item: '',
      Style: '',
      'Width x Length': '',
      'Width x Height': '',
      Color: '',
      'Pin Count': '',
      Step: '',
      'Column Size': '',
      'Footplate Size': '',
      'Anchor Hole Count': '' as string | number,
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
      Photos: 0 as string | number,
    }

    const rows = [
      ...uprightRows.map((row) => ({
        ...blankRow,
        Location: row.siteName,
        Quantity: row.quantity,
        Item: 'Upright',
        Style: row.style,
        'Width x Height': row.widthByHeight,
        Color: row.color,
        'Column Size': row.columnSizeDisplay,
        'Footplate Size': row.footplateSizeDisplay,
        'Anchor Hole Count': row.anchorHoleCount,
        'Hole Size': row.holeSize,
        Gauge: row.gauge,
        Condition: row.condition,
        Stamp: row.stamp,
        'Bundle Size': row.bundleSize,
        Zone: row.zone,
        Notes: row.notes,
        Photos: row.photoIds.length,
      })),
      ...beamRows.map((row) => ({
        ...blankRow,
        Location: row.siteName,
        Quantity: row.quantity,
        Item: 'Beam',
        Style: row.style,
        'Width x Length': row.widthByLength,
        Color: row.color,
        'Pin Count': row.pinCount,
        Step: row.step,
        Condition: row.condition,
        Stamp: row.stamp,
        Stickers: row.stickers,
        'Bundle Size': row.bundleSize,
        Zone: row.zone,
        Notes: row.notes,
        Photos: row.photoIds.length,
      })),
      ...wireDeckRows.map((row) => ({
        ...blankRow,
        Location: row.siteName,
        Quantity: row.quantity,
        Item: 'Wire Deck',
        Style: row.style.join(', '),
        'Width x Length': row.widthByLength,
        'Number of Channels': row.channelCount,
        Condition: row.condition,
        'Bundle Size': row.bundleSize,
        Zone: row.zone,
        Notes: row.notes,
        Photos: row.photoIds.length,
      })),
      ...miscRows.map((row) => ({
        ...blankRow,
        Location: row.siteName,
        Quantity: row.quantity,
        Item: 'Other',
        Style: row.description,
        'Item Description': row.itemDescription,
        Condition: row.condition,
        'Bundle Size': row.bundleSize,
        Zone: row.zone,
        Notes: row.notes,
        Photos: row.photoIds.length,
      })),
    ]

    exportSheetsToExcel([{ name: 'All Inventory', rows }], 'all-offsite-inventory.xlsx')
  }

  const uprightColumns: Record<string, ColumnDef<AllUprightRow>> = {
    location: {
      label: 'Location',
      render: (row) => locationLink(row.siteId, row.siteName),
      getValue: (row) => row.siteName,
      sortValue: (row) => row.siteName,
    },
    quantity: { label: 'Quantity', render: (row) => row.quantity, getValue: (row) => String(row.quantity), filterable: false },
    style: { label: 'Style', render: (row) => row.style, getValue: (row) => row.style, sortValue: (row) => row.style },
    widthByHeight: {
      label: 'Width x Height',
      render: (row) => row.widthByHeight,
      getValue: (row) => row.widthByHeight,
      sortValue: (row) => row.width * 100000 + (row.heightFeet * 12 + row.heightInches),
    },
    color: { label: 'Color', render: (row) => row.color, getValue: (row) => row.color, sortValue: (row) => row.color },
    columnSize: {
      label: 'Column Size',
      render: (row) => row.columnSizeDisplay,
      getValue: (row) => row.columnSizeDisplay,
      sortValue: (row) => row.columnLength * 100000 + row.columnWidth,
    },
    footplateSize: {
      label: 'Footplate Size',
      render: (row) => row.footplateSizeDisplay,
      getValue: (row) => row.footplateSizeDisplay,
      sortValue: (row) => row.footplateLength * 100000 + row.footplateWidth,
    },
    anchorHoleCount: {
      label: 'Anchor Hole Count',
      render: (row) => row.anchorHoleCount,
      getValue: (row) => String(row.anchorHoleCount),
      sortValue: (row) => row.anchorHoleCount,
    },
    holeSize: {
      label: 'Hole Size',
      render: (row) => row.holeSize || '—',
      getValue: (row) => row.holeSize,
      sortValue: (row) => row.holeSize,
    },
    gauge: { label: 'Gauge', render: (row) => row.gauge, getValue: (row) => row.gauge, sortValue: (row) => row.gauge },
    condition: {
      label: 'Condition',
      render: (row) => row.condition,
      getValue: (row) => row.condition,
      sortValue: (row) => row.condition,
    },
    stamp: {
      label: 'Stamp',
      render: (row) => row.stamp || '—',
      getValue: (row) => row.stamp,
      sortValue: (row) => row.stamp,
    },
    bundleSize: {
      label: 'Bundle Size',
      render: (row) => row.bundleSize || '—',
      getValue: (row) => row.bundleSize,
      sortValue: (row) => row.bundleSize,
    },
    zone: {
      label: 'Zone',
      render: (row) => row.zone || '—',
      getValue: (row) => row.zone,
      sortValue: (row) => row.zone,
    },
    notes: {
      label: 'Notes',
      render: (row) => <span className="notes-text">{row.notes || '—'}</span>,
      getValue: (row) => row.notes,
      filterable: false,
    },
    photos: {
      label: 'Photos',
      render: (row) => photosLink(row.siteId, row.ids, row.photoIds),
      getValue: (row) => String(row.photoIds.length),
      filterable: false,
    },
  }
  const uprightOrder = [
    'location',
    'quantity',
    'style',
    'widthByHeight',
    'color',
    'columnSize',
    'footplateSize',
    'anchorHoleCount',
    'holeSize',
    'gauge',
    'condition',
    'stamp',
    'bundleSize',
    'zone',
    'notes',
    'photos',
  ]

  const beamColumns: Record<string, ColumnDef<AllBeamRow>> = {
    location: {
      label: 'Location',
      render: (row) => locationLink(row.siteId, row.siteName),
      getValue: (row) => row.siteName,
      sortValue: (row) => row.siteName,
    },
    quantity: { label: 'Quantity', render: (row) => row.quantity, getValue: (row) => String(row.quantity), filterable: false },
    style: { label: 'Style', render: (row) => row.style, getValue: (row) => row.style, sortValue: (row) => row.style },
    widthByLength: {
      label: 'Width x Length',
      render: (row) => row.widthByLength,
      getValue: (row) => row.widthByLength,
      sortValue: (row) => leadingNumber(row.width) * 100000 + row.length,
    },
    color: { label: 'Color', render: (row) => row.color, getValue: (row) => row.color, sortValue: (row) => row.color },
    pinCount: {
      label: 'Pin Count',
      render: (row) => row.pinCount,
      getValue: (row) => row.pinCount,
      sortValue: (row) => row.pinCount,
    },
    step: {
      label: 'Step',
      render: (row) => row.step || '—',
      getValue: (row) => row.step,
      sortValue: (row) => row.step,
    },
    condition: {
      label: 'Condition',
      render: (row) => row.condition,
      getValue: (row) => row.condition,
      sortValue: (row) => row.condition,
    },
    stamp: {
      label: 'Stamp',
      render: (row) => row.stamp || '—',
      getValue: (row) => row.stamp,
      sortValue: (row) => row.stamp,
    },
    stickers: {
      label: 'Stickers',
      render: (row) => row.stickers,
      getValue: (row) => row.stickers,
      sortValue: (row) => row.stickers,
    },
    bundleSize: {
      label: 'Bundle Size',
      render: (row) => row.bundleSize || '—',
      getValue: (row) => row.bundleSize,
      sortValue: (row) => row.bundleSize,
    },
    zone: {
      label: 'Zone',
      render: (row) => row.zone || '—',
      getValue: (row) => row.zone,
      sortValue: (row) => row.zone,
    },
    notes: {
      label: 'Notes',
      render: (row) => <span className="notes-text">{row.notes || '—'}</span>,
      getValue: (row) => row.notes,
      filterable: false,
    },
    photos: {
      label: 'Photos',
      render: (row) => photosLink(row.siteId, row.ids, row.photoIds),
      getValue: (row) => String(row.photoIds.length),
      filterable: false,
    },
  }
  const beamOrder = [
    'location',
    'quantity',
    'style',
    'widthByLength',
    'color',
    'pinCount',
    'step',
    'condition',
    'stamp',
    'stickers',
    'bundleSize',
    'zone',
    'notes',
    'photos',
  ]

  const wireDeckColumns: Record<string, ColumnDef<AllWireDeckRow>> = {
    location: {
      label: 'Location',
      render: (row) => locationLink(row.siteId, row.siteName),
      getValue: (row) => row.siteName,
      sortValue: (row) => row.siteName,
    },
    quantity: { label: 'Quantity', render: (row) => row.quantity, getValue: (row) => String(row.quantity), filterable: false },
    style: {
      label: 'Style',
      render: (row) => row.style.join(', ') || '—',
      getValue: (row) => row.style,
      sortValue: (row) => row.style.join(', '),
    },
    widthByLength: {
      label: 'Width x Length',
      render: (row) => row.widthByLength,
      getValue: (row) => row.widthByLength,
      sortValue: (row) => row.width * 100000 + row.length,
    },
    channelCount: {
      label: 'Number of Channels',
      render: (row) => row.channelCount,
      getValue: (row) => row.channelCount,
      sortValue: (row) => row.channelCount,
    },
    condition: {
      label: 'Condition',
      render: (row) => row.condition,
      getValue: (row) => row.condition,
      sortValue: (row) => row.condition,
    },
    bundleSize: {
      label: 'Bundle Size',
      render: (row) => row.bundleSize || '—',
      getValue: (row) => row.bundleSize,
      sortValue: (row) => row.bundleSize,
    },
    zone: {
      label: 'Zone',
      render: (row) => row.zone || '—',
      getValue: (row) => row.zone,
      sortValue: (row) => row.zone,
    },
    notes: {
      label: 'Notes',
      render: (row) => <span className="notes-text">{row.notes || '—'}</span>,
      getValue: (row) => row.notes,
      filterable: false,
    },
    photos: {
      label: 'Photos',
      render: (row) => photosLink(row.siteId, row.ids, row.photoIds),
      getValue: (row) => String(row.photoIds.length),
      filterable: false,
    },
  }
  const wireDeckOrder = [
    'location',
    'quantity',
    'style',
    'widthByLength',
    'channelCount',
    'condition',
    'bundleSize',
    'zone',
    'notes',
    'photos',
  ]

  const miscColumns: Record<string, ColumnDef<AllMiscItemRow>> = {
    location: {
      label: 'Location',
      render: (row) => locationLink(row.siteId, row.siteName),
      getValue: (row) => row.siteName,
      sortValue: (row) => row.siteName,
    },
    quantity: { label: 'Quantity', render: (row) => row.quantity, getValue: (row) => String(row.quantity), filterable: false },
    description: {
      label: 'Item',
      render: (row) => row.description || '—',
      getValue: (row) => row.description,
      sortValue: (row) => row.description,
    },
    itemDescription: {
      label: 'Item Description',
      render: (row) => <span className="notes-text">{row.itemDescription || '—'}</span>,
      getValue: (row) => row.itemDescription,
      sortValue: (row) => row.itemDescription,
    },
    condition: {
      label: 'Condition',
      render: (row) => row.condition,
      getValue: (row) => row.condition,
      sortValue: (row) => row.condition,
    },
    bundleSize: {
      label: 'Bundle Size',
      render: (row) => row.bundleSize || '—',
      getValue: (row) => row.bundleSize,
      sortValue: (row) => row.bundleSize,
    },
    zone: {
      label: 'Zone',
      render: (row) => row.zone || '—',
      getValue: (row) => row.zone,
      sortValue: (row) => row.zone,
    },
    notes: {
      label: 'Notes',
      render: (row) => <span className="notes-text">{row.notes || '—'}</span>,
      getValue: (row) => row.notes,
      filterable: false,
    },
    photos: {
      label: 'Photos',
      render: (row) => photosLink(row.siteId, row.ids, row.photoIds),
      getValue: (row) => String(row.photoIds.length),
      filterable: false,
    },
  }
  const miscOrder = [
    'location',
    'quantity',
    'description',
    'itemDescription',
    'condition',
    'bundleSize',
    'zone',
    'notes',
    'photos',
  ]

  const uprightFilterOptions = computeFilterOptions(uprightRows, uprightColumns)
  const beamFilterOptions = computeFilterOptions(beamRows, beamColumns)
  const wireDeckFilterOptions = computeFilterOptions(wireDeckRows, wireDeckColumns)
  const miscFilterOptions = computeFilterOptions(miscRows, miscColumns)

  const normalizedSearch = normalizeForSearch(searchTerm)

  function displayRows<TRow extends { key: string }>(
    rows: TRow[],
    columns: Record<string, ColumnDef<TRow>>,
    filters: FilterMap,
  ): TRow[] {
    const searched = normalizedSearch ? rows.filter((row) => matchesSearch(row, normalizedSearch)) : rows
    return applyColumnFilters(searched, columns, filters)
  }

  const displayedUprightRows = displayRows(uprightRows, uprightColumns, uprightFilters)
  const displayedBeamRows = displayRows(beamRows, beamColumns, beamFilters)
  const displayedWireDeckRows = displayRows(wireDeckRows, wireDeckColumns, wireDeckFilters)
  const displayedMiscRows = displayRows(miscRows, miscColumns, miscFilters)

  return (
    <main className="page page-wide">
      <p>
        <Link to="/">← Locations</Link>
      </p>
      <h1>All Offsite Inventory</h1>

      {hasItems && (
        <>
          <div className="item-search-row">
            <input
              type="text"
              className="item-search-input"
              placeholder="Search…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <p className="add-item-row">
            <button type="button" onClick={handleExport} className="export-button">
              Export to Excel
            </button>
          </p>
        </>
      )}

      {!hasItems && <p className="placeholder-note">No items across any active locations yet.</p>}

      {uprightRows.length > 0 && (
        <section className="item-section">
          <h2>Uprights</h2>
          <ReadOnlyItemTable<string, AllUprightRow>
            storageKey="allInventoryUprightColumns"
            title="Uprights Columns"
            columns={uprightColumns}
            defaultOrder={uprightOrder}
            rows={displayedUprightRows}
            filterOptions={uprightFilterOptions}
            filters={uprightFilters}
            onFilterChange={(key, values) => setUprightFilters((prev) => ({ ...prev, [key]: values }))}
            emptyMessage="No uprights match your search or filters."
            wrapColumnKeys={['notes']}
          />
        </section>
      )}

      {beamRows.length > 0 && (
        <section className="item-section">
          <h2>Beams</h2>
          <ReadOnlyItemTable<string, AllBeamRow>
            storageKey="allInventoryBeamColumns"
            title="Beams Columns"
            columns={beamColumns}
            defaultOrder={beamOrder}
            rows={displayedBeamRows}
            filterOptions={beamFilterOptions}
            filters={beamFilters}
            onFilterChange={(key, values) => setBeamFilters((prev) => ({ ...prev, [key]: values }))}
            emptyMessage="No beams match your search or filters."
            wrapColumnKeys={['notes']}
          />
        </section>
      )}

      {wireDeckRows.length > 0 && (
        <section className="item-section">
          <h2>Wire Decks</h2>
          <ReadOnlyItemTable<string, AllWireDeckRow>
            storageKey="allInventoryWireDeckColumns"
            title="Wire Decks Columns"
            columns={wireDeckColumns}
            defaultOrder={wireDeckOrder}
            rows={displayedWireDeckRows}
            filterOptions={wireDeckFilterOptions}
            filters={wireDeckFilters}
            onFilterChange={(key, values) => setWireDeckFilters((prev) => ({ ...prev, [key]: values }))}
            emptyMessage="No wire decks match your search or filters."
            wrapColumnKeys={['notes']}
          />
        </section>
      )}

      {miscRows.length > 0 && (
        <section className="item-section">
          <h2>Other</h2>
          <ReadOnlyItemTable<string, AllMiscItemRow>
            storageKey="allInventoryMiscColumns"
            title="Other Items Columns"
            columns={miscColumns}
            defaultOrder={miscOrder}
            rows={displayedMiscRows}
            filterOptions={miscFilterOptions}
            filters={miscFilters}
            onFilterChange={(key, values) => setMiscFilters((prev) => ({ ...prev, [key]: values }))}
            emptyMessage="No items match your search or filters."
            wrapColumnKeys={['notes', 'itemDescription']}
          />
        </section>
      )}
    </main>
  )
}
