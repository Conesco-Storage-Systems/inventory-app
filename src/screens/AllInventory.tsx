import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ReadOnlyItemTable from '../components/ReadOnlyItemTable'
import { combineRowsAcrossSites, type WithSite } from '../db/combineAcrossSites'
import { db } from '../db/db'
import { groupBeams, type BeamRow } from '../db/groupBeams'
import { groupMiscItems, type MiscItemRow } from '../db/groupMiscItems'
import { groupUprights, type UprightRow } from '../db/groupUprights'
import { groupWireDecks, type WireDeckRow } from '../db/groupWireDecks'
import { exportSheetsToExcel } from '../export/exportToExcel'
import { matchesSearch, normalizeForSearch } from '../utils/searchMatch'

type AllBeamRow = BeamRow & WithSite
type AllUprightRow = UprightRow & WithSite
type AllWireDeckRow = WireDeckRow & WithSite
type AllMiscItemRow = MiscItemRow & WithSite

function locationLink(siteId: string, siteName: string) {
  return <Link to={`/locations/${siteId}`}>{siteName}</Link>
}

export default function AllInventory() {
  const sites = useLiveQuery(() => db.sites.toArray(), []) ?? []
  const beams = useLiveQuery(() => db.beams.toArray(), []) ?? []
  const uprights = useLiveQuery(() => db.uprights.toArray(), []) ?? []
  const wireDecks = useLiveQuery(() => db.wireDecks.toArray(), []) ?? []
  const miscItems = useLiveQuery(() => db.miscItems.toArray(), []) ?? []

  const [searchTerm, setSearchTerm] = useState('')

  const uprightRows = combineRowsAcrossSites(uprights, sites, groupUprights)
  const beamRows = combineRowsAcrossSites(beams, sites, groupBeams)
  const wireDeckRows = combineRowsAcrossSites(wireDecks, sites, groupWireDecks)
  const miscRows = combineRowsAcrossSites(miscItems, sites, groupMiscItems)

  const normalizedSearch = normalizeForSearch(searchTerm)
  const displayedUprightRows = normalizedSearch
    ? uprightRows.filter((row) => matchesSearch(row, normalizedSearch))
    : uprightRows
  const displayedBeamRows = normalizedSearch
    ? beamRows.filter((row) => matchesSearch(row, normalizedSearch))
    : beamRows
  const displayedWireDeckRows = normalizedSearch
    ? wireDeckRows.filter((row) => matchesSearch(row, normalizedSearch))
    : wireDeckRows
  const displayedMiscRows = normalizedSearch
    ? miscRows.filter((row) => matchesSearch(row, normalizedSearch))
    : miscRows

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

  const uprightColumns: Record<string, { label: string; render: (row: AllUprightRow) => ReactNode }> = {
    location: { label: 'Location', render: (row) => locationLink(row.siteId, row.siteName) },
    quantity: { label: 'Quantity', render: (row) => row.quantity },
    style: { label: 'Style', render: (row) => row.style },
    widthByHeight: { label: 'Width x Height', render: (row) => row.widthByHeight },
    color: { label: 'Color', render: (row) => row.color },
    columnSize: { label: 'Column Size', render: (row) => row.columnSizeDisplay },
    footplateSize: { label: 'Footplate Size', render: (row) => row.footplateSizeDisplay },
    anchorHoleCount: { label: 'Anchor Hole Count', render: (row) => row.anchorHoleCount },
    holeSize: { label: 'Hole Size', render: (row) => row.holeSize || '—' },
    gauge: { label: 'Gauge', render: (row) => row.gauge },
    condition: { label: 'Condition', render: (row) => row.condition },
    stamp: { label: 'Stamp', render: (row) => row.stamp || '—' },
    bundleSize: { label: 'Bundle Size', render: (row) => row.bundleSize || '—' },
    zone: { label: 'Zone', render: (row) => row.zone || '—' },
    notes: { label: 'Notes', render: (row) => <span className="notes-text">{row.notes || '—'}</span> },
    photos: {
      label: 'Photos',
      render: (row) =>
        row.photoIds.length > 0 ? (
          <Link to={`/locations/${row.siteId}/photos?ids=${row.ids.join(',')}`}>
            View photos ({row.photoIds.length})
          </Link>
        ) : (
          '—'
        ),
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

  const beamColumns: Record<string, { label: string; render: (row: AllBeamRow) => ReactNode }> = {
    location: { label: 'Location', render: (row) => locationLink(row.siteId, row.siteName) },
    quantity: { label: 'Quantity', render: (row) => row.quantity },
    style: { label: 'Style', render: (row) => row.style },
    widthByLength: { label: 'Width x Length', render: (row) => row.widthByLength },
    color: { label: 'Color', render: (row) => row.color },
    pinCount: { label: 'Pin Count', render: (row) => row.pinCount },
    step: { label: 'Step', render: (row) => row.step || '—' },
    condition: { label: 'Condition', render: (row) => row.condition },
    stamp: { label: 'Stamp', render: (row) => row.stamp || '—' },
    stickers: { label: 'Stickers', render: (row) => row.stickers },
    bundleSize: { label: 'Bundle Size', render: (row) => row.bundleSize || '—' },
    zone: { label: 'Zone', render: (row) => row.zone || '—' },
    notes: { label: 'Notes', render: (row) => <span className="notes-text">{row.notes || '—'}</span> },
    photos: {
      label: 'Photos',
      render: (row) =>
        row.photoIds.length > 0 ? (
          <Link to={`/locations/${row.siteId}/photos?ids=${row.ids.join(',')}`}>
            View photos ({row.photoIds.length})
          </Link>
        ) : (
          '—'
        ),
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

  const wireDeckColumns: Record<string, { label: string; render: (row: AllWireDeckRow) => ReactNode }> = {
    location: { label: 'Location', render: (row) => locationLink(row.siteId, row.siteName) },
    quantity: { label: 'Quantity', render: (row) => row.quantity },
    style: { label: 'Style', render: (row) => row.style.join(', ') || '—' },
    widthByLength: { label: 'Width x Length', render: (row) => row.widthByLength },
    channelCount: { label: 'Number of Channels', render: (row) => row.channelCount },
    condition: { label: 'Condition', render: (row) => row.condition },
    bundleSize: { label: 'Bundle Size', render: (row) => row.bundleSize || '—' },
    zone: { label: 'Zone', render: (row) => row.zone || '—' },
    notes: { label: 'Notes', render: (row) => <span className="notes-text">{row.notes || '—'}</span> },
    photos: {
      label: 'Photos',
      render: (row) =>
        row.photoIds.length > 0 ? (
          <Link to={`/locations/${row.siteId}/photos?ids=${row.ids.join(',')}`}>
            View photos ({row.photoIds.length})
          </Link>
        ) : (
          '—'
        ),
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

  const miscColumns: Record<string, { label: string; render: (row: AllMiscItemRow) => ReactNode }> = {
    location: { label: 'Location', render: (row) => locationLink(row.siteId, row.siteName) },
    quantity: { label: 'Quantity', render: (row) => row.quantity },
    description: { label: 'Item', render: (row) => row.description || '—' },
    itemDescription: {
      label: 'Item Description',
      render: (row) => <span className="notes-text">{row.itemDescription || '—'}</span>,
    },
    condition: { label: 'Condition', render: (row) => row.condition },
    bundleSize: { label: 'Bundle Size', render: (row) => row.bundleSize || '—' },
    zone: { label: 'Zone', render: (row) => row.zone || '—' },
    notes: { label: 'Notes', render: (row) => <span className="notes-text">{row.notes || '—'}</span> },
    photos: {
      label: 'Photos',
      render: (row) =>
        row.photoIds.length > 0 ? (
          <Link to={`/locations/${row.siteId}/photos?ids=${row.ids.join(',')}`}>
            View photos ({row.photoIds.length})
          </Link>
        ) : (
          '—'
        ),
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
            emptyMessage="No uprights match your search."
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
            emptyMessage="No beams match your search."
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
            emptyMessage="No wire decks match your search."
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
            emptyMessage="No items match your search."
            wrapColumnKeys={['notes', 'itemDescription']}
          />
        </section>
      )}
    </main>
  )
}
