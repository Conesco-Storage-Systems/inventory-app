import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { CustomerSheetSeed } from '../components/GenerateCustomerSheetFlow'
import ReadOnlyItemTable, { type ColumnDef } from '../components/ReadOnlyItemTable'
import { combineRowsAcrossSites, type WithSite } from '../db/combineAcrossSites'
import { db } from '../db/db'
import { groupBeams, type BeamRow } from '../db/groupBeams'
import { groupMiscItems, type MiscItemRow } from '../db/groupMiscItems'
import { groupUprights, uprightHeightSortValue, type UprightRow } from '../db/groupUprights'
import { groupWireDecks, type WireDeckRow } from '../db/groupWireDecks'
import { computeHeldQuantity, quantityWithHold } from '../db/salesQuotes'
import { exportSheetsToExcel } from '../export/exportToExcel'
import { beamExportRow, miscExportRow, uprightExportRow, wireDeckExportRow } from '../export/inventoryExportRows'
import type { ItemType } from '../models/types'
import { applyColumnFilters, computeFilterOptions } from '../utils/columnFilters'
import { formatDisplayName } from '../utils/displayName'
import { mergeRowsWithHolds, withHoldAwareColumns } from '../utils/heldRows'
import { matchesSearch, normalizeForSearch } from '../utils/searchMatch'

interface QuoteSelection {
  key: string
  itemType: ItemType
  siteId: string
  siteName: string
  description: string
  itemIds: string[]
  // The row's raw total quantity (not yet minus holds) — the quantity page
  // recomputes "available" itself from live holds, since time passes
  // between selecting here and saving quantities there.
  rawQuantity: number
}

function describeBeamRow(row: BeamRow): string {
  return [row.style, row.widthByLength, row.color, row.pinCount && `${row.pinCount} pin`, row.step && `${row.step} step`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeUprightRow(row: UprightRow): string {
  return [row.style, row.widthByHeight, row.color, row.gauge && `${row.gauge} ga`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeWireDeckRow(row: WireDeckRow): string {
  return [row.style.join('/'), row.widthByLength, row.channelCount && `${row.channelCount} channel`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeMiscRow(row: MiscItemRow): string {
  return [row.description, row.itemDescription, row.condition].filter(Boolean).join(', ')
}

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
  // Present at /projects/:projectId/inventory, absent at /all-inventory —
  // scopes everything below to just that project's locations instead of
  // the standalone Offsite Locations.
  const { projectId } = useParams<{ projectId?: string }>()
  const project = useLiveQuery(() => (projectId ? db.projects.get(projectId) : undefined), [projectId])
  const allSites = useLiveQuery(() => db.sites.toArray(), []) ?? []
  const sites = allSites.filter((site) => (projectId ? site.projectId === projectId : !site.projectId))
  const beams = useLiveQuery(() => db.beams.toArray(), []) ?? []
  const uprights = useLiveQuery(() => db.uprights.toArray(), []) ?? []
  const wireDecks = useLiveQuery(() => db.wireDecks.toArray(), []) ?? []
  const miscItems = useLiveQuery(() => db.miscItems.toArray(), []) ?? []
  const holds = useLiveQuery(() => db.salesQuoteLineItems.toArray(), []) ?? []

  // Present when this page was reached via "Create Sales Quote → Select
  // Inventory" — turns on the selection checkboxes and Generate Quote
  // button; otherwise the page behaves exactly as it always has.
  const location = useLocation()
  const navigate = useNavigate()
  const quoteId = (location.state as { quoteId?: string } | null)?.quoteId
  const [selections, setSelections] = useState<Map<string, QuoteSelection>>(new Map())

  function toggleSelection(sel: QuoteSelection) {
    setSelections((prev) => {
      const next = new Map(prev)
      if (next.has(sel.key)) next.delete(sel.key)
      else next.set(sel.key, sel)
      return next
    })
  }

  function handleGenerateQuote() {
    navigate(`/sales-quotes/${quoteId}/generate`, { state: { selections: Array.from(selections.values()) } })
  }

  // Independent of the quote-building selection above — this is for
  // generating a one-off Customer Sheet PDF straight from whatever's
  // checked here, regardless of whether a Sales Quote is being built at
  // the same time.
  const [pdfSelections, setPdfSelections] = useState<Set<string>>(new Set())

  function togglePdfSelection(key: string) {
    setPdfSelections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // While building a Sales Quote, one checkbox does double duty — it adds
  // the item to the quote and marks it for the PDF generator, instead of
  // showing two separate checkboxes for the same row.
  function toggleSelectionAndPdf(sel: QuoteSelection) {
    toggleSelection(sel)
    togglePdfSelection(sel.key)
  }

  function handleGeneratePdf() {
    const seeds: CustomerSheetSeed[] = [
      ...uprightRows
        .filter((row) => pdfSelections.has(`upright:${row.key}`))
        .map((row) => ({
          key: `upright:${row.key}`,
          itemType: 'upright' as const,
          siteId: row.siteId,
          siteName: row.siteName,
          itemIds: row.ids,
          quantity: row.quantity,
          description: describeUprightRow(row),
        })),
      ...beamRows
        .filter((row) => pdfSelections.has(`beam:${row.key}`))
        .map((row) => ({
          key: `beam:${row.key}`,
          itemType: 'beam' as const,
          siteId: row.siteId,
          siteName: row.siteName,
          itemIds: row.ids,
          quantity: row.quantity,
          description: describeBeamRow(row),
        })),
      ...wireDeckRows
        .filter((row) => pdfSelections.has(`wireDeck:${row.key}`))
        .map((row) => ({
          key: `wireDeck:${row.key}`,
          itemType: 'wireDeck' as const,
          siteId: row.siteId,
          siteName: row.siteName,
          itemIds: row.ids,
          quantity: row.quantity,
          description: describeWireDeckRow(row),
        })),
      ...miscRows
        .filter((row) => pdfSelections.has(`misc:${row.key}`))
        .map((row) => ({
          key: `misc:${row.key}`,
          itemType: 'misc' as const,
          siteId: row.siteId,
          siteName: row.siteName,
          itemIds: row.ids,
          quantity: row.quantity,
          description: describeMiscRow(row),
        })),
    ]
    navigate('/all-inventory/customer-sheet', { state: { seeds, backTo: location.pathname } })
  }

  const [searchTerm, setSearchTerm] = useState('')
  const [uprightFilters, setUprightFilters] = useState<FilterMap>({})
  const [beamFilters, setBeamFilters] = useState<FilterMap>({})
  const [wireDeckFilters, setWireDeckFilters] = useState<FilterMap>({})
  const [miscFilters, setMiscFilters] = useState<FilterMap>({})

  const uprightRows = combineRowsAcrossSites(uprights, sites, groupUprights)
  const beamRows = combineRowsAcrossSites(beams, sites, groupBeams)
  const wireDeckRows = combineRowsAcrossSites(wireDecks, sites, groupWireDecks)
  const miscRows = combineRowsAcrossSites(miscItems, sites, groupMiscItems)

  const pageTitle = projectId ? (project ? `All ${project.name} Inventory` : 'All Project Inventory') : 'All Offsite Inventory'
  const backLink = projectId ? `/projects/${projectId}` : '/'
  const backLabel = projectId ? '← Back' : '← Locations'

  const hasItems =
    uprightRows.length > 0 || beamRows.length > 0 || wireDeckRows.length > 0 || miscRows.length > 0

  function handleExport() {
    const rows = [
      ...uprightRows.map((row) => ({ Location: row.siteName, ...uprightExportRow(row) })),
      ...beamRows.map((row) => ({ Location: row.siteName, ...beamExportRow(row) })),
      ...wireDeckRows.map((row) => ({ Location: row.siteName, ...wireDeckExportRow(row) })),
      ...miscRows.map((row) => ({ Location: row.siteName, ...miscExportRow(row) })),
    ]

    const filename = project
      ? `${project.name.replace(/[^a-z0-9]+/gi, '-')}-inventory.xlsx`
      : 'all-offsite-inventory.xlsx'
    exportSheetsToExcel([{ name: 'All Inventory', rows }], filename)
  }

  const uprightColumns: Record<string, ColumnDef<AllUprightRow>> = {
    ...(quoteId
      ? {
          select: {
            label: '',
            render: (row: AllUprightRow) => {
              const held = computeHeldQuantity(row.ids, holds)
              const available = row.quantity - held
              const key = `upright:${row.key}`
              return (
                <input
                  type="checkbox"
                  disabled={available <= 0}
                  checked={selections.has(key)}
                  onChange={() =>
                    toggleSelectionAndPdf({
                      key,
                      itemType: 'upright',
                      siteId: row.siteId,
                      siteName: row.siteName,
                      description: describeUprightRow(row),
                      itemIds: row.ids,
                      rawQuantity: row.quantity,
                    })
                  }
                />
              )
            },
            getValue: () => '',
            filterable: false,
          },
        }
      : {}),
    location: {
      label: 'Location',
      render: (row) => locationLink(row.siteId, row.siteName),
      getValue: (row) => row.siteName,
      sortValue: (row) => row.siteName,
    },
    quantity: {
      label: 'Quantity',
      render: (row) => quantityWithHold(row.quantity, computeHeldQuantity(row.ids, holds)),
      getValue: (row) => String(row.quantity),
      filterable: false,
    },
    style: { label: 'Style', render: (row) => row.style, getValue: (row) => row.style, sortValue: (row) => row.style },
    widthByHeight: {
      label: 'Width x Height',
      render: (row) => row.widthByHeight,
      getValue: (row) => row.widthByHeight,
      sortValue: (row) => row.width * 100000 + uprightHeightSortValue(row.height),
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
    costPer: {
      label: 'Cost Per',
      render: (row) => (row.costPer ? `$${row.costPer.toFixed(2)}` : '—'),
      getValue: (row) => String(row.costPer),
      sortValue: (row) => row.costPer,
    },
    sellPer: {
      label: 'Sell Per',
      render: (row) => (row.sellPer ? `$${row.sellPer.toFixed(2)}` : '—'),
      getValue: (row) => String(row.sellPer),
      sortValue: (row) => row.sellPer,
    },
    photos: {
      label: 'Photos',
      render: (row) => photosLink(row.siteId, row.ids, row.photoIds),
      getValue: (row) => String(row.photoIds.length),
      filterable: false,
    },
  }
  const uprightOrder = [
    ...(quoteId ? ['select'] : []),
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
    'costPer',
    'sellPer',
    'photos',
  ]

  const beamColumns: Record<string, ColumnDef<AllBeamRow>> = {
    ...(quoteId
      ? {
          select: {
            label: '',
            render: (row: AllBeamRow) => {
              const held = computeHeldQuantity(row.ids, holds)
              const available = row.quantity - held
              const key = `beam:${row.key}`
              return (
                <input
                  type="checkbox"
                  disabled={available <= 0}
                  checked={selections.has(key)}
                  onChange={() =>
                    toggleSelectionAndPdf({
                      key,
                      itemType: 'beam',
                      siteId: row.siteId,
                      siteName: row.siteName,
                      description: describeBeamRow(row),
                      itemIds: row.ids,
                      rawQuantity: row.quantity,
                    })
                  }
                />
              )
            },
            getValue: () => '',
            filterable: false,
          },
        }
      : {}),
    location: {
      label: 'Location',
      render: (row) => locationLink(row.siteId, row.siteName),
      getValue: (row) => row.siteName,
      sortValue: (row) => row.siteName,
    },
    quantity: {
      label: 'Quantity',
      render: (row) => quantityWithHold(row.quantity, computeHeldQuantity(row.ids, holds)),
      getValue: (row) => String(row.quantity),
      filterable: false,
    },
    style: { label: 'Style', render: (row) => row.style, getValue: (row) => row.style, sortValue: (row) => row.style },
    widthByLength: {
      label: 'Width x Length',
      render: (row) => row.widthByLength,
      getValue: (row) => row.widthByLength,
      sortValue: (row) => leadingNumber(row.width) * 100000 + leadingNumber(row.length),
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
    costPer: {
      label: 'Cost Per',
      render: (row) => (row.costPer ? `$${row.costPer.toFixed(2)}` : '—'),
      getValue: (row) => String(row.costPer),
      sortValue: (row) => row.costPer,
    },
    sellPer: {
      label: 'Sell Per',
      render: (row) => (row.sellPer ? `$${row.sellPer.toFixed(2)}` : '—'),
      getValue: (row) => String(row.sellPer),
      sortValue: (row) => row.sellPer,
    },
    photos: {
      label: 'Photos',
      render: (row) => photosLink(row.siteId, row.ids, row.photoIds),
      getValue: (row) => String(row.photoIds.length),
      filterable: false,
    },
  }
  const beamOrder = [
    ...(quoteId ? ['select'] : []),
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
    'costPer',
    'sellPer',
    'photos',
  ]

  const wireDeckColumns: Record<string, ColumnDef<AllWireDeckRow>> = {
    ...(quoteId
      ? {
          select: {
            label: '',
            render: (row: AllWireDeckRow) => {
              const held = computeHeldQuantity(row.ids, holds)
              const available = row.quantity - held
              const key = `wireDeck:${row.key}`
              return (
                <input
                  type="checkbox"
                  disabled={available <= 0}
                  checked={selections.has(key)}
                  onChange={() =>
                    toggleSelectionAndPdf({
                      key,
                      itemType: 'wireDeck',
                      siteId: row.siteId,
                      siteName: row.siteName,
                      description: describeWireDeckRow(row),
                      itemIds: row.ids,
                      rawQuantity: row.quantity,
                    })
                  }
                />
              )
            },
            getValue: () => '',
            filterable: false,
          },
        }
      : {}),
    location: {
      label: 'Location',
      render: (row) => locationLink(row.siteId, row.siteName),
      getValue: (row) => row.siteName,
      sortValue: (row) => row.siteName,
    },
    quantity: {
      label: 'Quantity',
      render: (row) => quantityWithHold(row.quantity, computeHeldQuantity(row.ids, holds)),
      getValue: (row) => String(row.quantity),
      filterable: false,
    },
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
    costPer: {
      label: 'Cost Per',
      render: (row) => (row.costPer ? `$${row.costPer.toFixed(2)}` : '—'),
      getValue: (row) => String(row.costPer),
      sortValue: (row) => row.costPer,
    },
    sellPer: {
      label: 'Sell Per',
      render: (row) => (row.sellPer ? `$${row.sellPer.toFixed(2)}` : '—'),
      getValue: (row) => String(row.sellPer),
      sortValue: (row) => row.sellPer,
    },
    photos: {
      label: 'Photos',
      render: (row) => photosLink(row.siteId, row.ids, row.photoIds),
      getValue: (row) => String(row.photoIds.length),
      filterable: false,
    },
  }
  const wireDeckOrder = [
    ...(quoteId ? ['select'] : []),
    'location',
    'quantity',
    'style',
    'widthByLength',
    'channelCount',
    'condition',
    'bundleSize',
    'zone',
    'notes',
    'costPer',
    'sellPer',
    'photos',
  ]

  const miscColumns: Record<string, ColumnDef<AllMiscItemRow>> = {
    ...(quoteId
      ? {
          select: {
            label: '',
            render: (row: AllMiscItemRow) => {
              const held = computeHeldQuantity(row.ids, holds)
              const available = row.quantity - held
              const key = `misc:${row.key}`
              return (
                <input
                  type="checkbox"
                  disabled={available <= 0}
                  checked={selections.has(key)}
                  onChange={() =>
                    toggleSelectionAndPdf({
                      key,
                      itemType: 'misc',
                      siteId: row.siteId,
                      siteName: row.siteName,
                      description: describeMiscRow(row),
                      itemIds: row.ids,
                      rawQuantity: row.quantity,
                    })
                  }
                />
              )
            },
            getValue: () => '',
            filterable: false,
          },
        }
      : {}),
    location: {
      label: 'Location',
      render: (row) => locationLink(row.siteId, row.siteName),
      getValue: (row) => row.siteName,
      sortValue: (row) => row.siteName,
    },
    quantity: {
      label: 'Quantity',
      render: (row) => quantityWithHold(row.quantity, computeHeldQuantity(row.ids, holds)),
      getValue: (row) => String(row.quantity),
      filterable: false,
    },
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
    costPer: {
      label: 'Cost Per',
      render: (row) => (row.costPer ? `$${row.costPer.toFixed(2)}` : '—'),
      getValue: (row) => String(row.costPer),
      sortValue: (row) => row.costPer,
    },
    sellPer: {
      label: 'Sell Per',
      render: (row) => (row.sellPer ? `$${row.sellPer.toFixed(2)}` : '—'),
      getValue: (row) => String(row.sellPer),
      sortValue: (row) => row.sellPer,
    },
    photos: {
      label: 'Photos',
      render: (row) => photosLink(row.siteId, row.ids, row.photoIds),
      getValue: (row) => String(row.photoIds.length),
      filterable: false,
    },
  }
  const miscOrder = [
    ...(quoteId ? ['select'] : []),
    'location',
    'quantity',
    'description',
    'itemDescription',
    'condition',
    'bundleSize',
    'zone',
    'notes',
    'costPer',
    'sellPer',
    'photos',
  ]

  // Fully-allocated/shipped items (quantity deducted down to 0) stay in
  // the database — they're still a real record, visible on whatever Sales
  // Order or BOL used them — but they're dead weight on this live
  // on-hand-inventory view, so they're left out of it specifically. The
  // Excel export still uses the un-filtered rows above.
  const nonZeroUprightRows = uprightRows.filter((row) => row.quantity > 0)
  const nonZeroBeamRows = beamRows.filter((row) => row.quantity > 0)
  const nonZeroWireDeckRows = wireDeckRows.filter((row) => row.quantity > 0)
  const nonZeroMiscRows = miscRows.filter((row) => row.quantity > 0)

  // Held rows are merged in as extra rows right alongside the ones they
  // belong to, rather than a separate table — "On Hold" stays a visible
  // distinction (via the Held By column) but the section itself is one
  // combined, sortable/filterable table.
  const uprightMergedRows = mergeRowsWithHolds(nonZeroUprightRows, holds, 'upright')
  const beamMergedRows = mergeRowsWithHolds(nonZeroBeamRows, holds, 'beam')
  const wireDeckMergedRows = mergeRowsWithHolds(nonZeroWireDeckRows, holds, 'wireDeck')
  const miscMergedRows = mergeRowsWithHolds(nonZeroMiscRows, holds, 'misc')

  const uprightMergedColumns = withHoldAwareColumns(uprightColumns)
  const beamMergedColumns = withHoldAwareColumns(beamColumns)
  const wireDeckMergedColumns = withHoldAwareColumns(wireDeckColumns)
  const miscMergedColumns = withHoldAwareColumns(miscColumns)

  const heldByLeadingColumn = {
    label: 'Held By',
    render: (row: { heldByEmail?: string }) => (row.heldByEmail ? formatDisplayName(row.heldByEmail) : '—'),
    showOnSecondary: true,
  }

  // A fixed leading checkbox for each item type — kept out of the
  // reorderable column set (like Held By above) so it can't end up buried
  // by a viewer's saved column order the way a brand-new column otherwise
  // would.
  function pdfSelectLeadingColumn<TRow extends { key: string }>(itemType: ItemType) {
    return {
      label: '',
      render: (row: TRow) => (
        <input
          type="checkbox"
          checked={pdfSelections.has(`${itemType}:${row.key}`)}
          onChange={() => togglePdfSelection(`${itemType}:${row.key}`)}
        />
      ),
    }
  }

  const uprightFilterOptions = computeFilterOptions(uprightMergedRows, uprightMergedColumns)
  const beamFilterOptions = computeFilterOptions(beamMergedRows, beamMergedColumns)
  const wireDeckFilterOptions = computeFilterOptions(wireDeckMergedRows, wireDeckMergedColumns)
  const miscFilterOptions = computeFilterOptions(miscMergedRows, miscMergedColumns)

  const normalizedSearch = normalizeForSearch(searchTerm)

  function displayRows<TRow extends { key: string }>(
    rows: TRow[],
    columns: Record<string, ColumnDef<TRow>>,
    filters: FilterMap,
  ): TRow[] {
    const searched = normalizedSearch ? rows.filter((row) => matchesSearch(row, normalizedSearch)) : rows
    return applyColumnFilters(searched, columns, filters)
  }

  const displayedUprightRows = displayRows(uprightMergedRows, uprightMergedColumns, uprightFilters)
  const displayedBeamRows = displayRows(beamMergedRows, beamMergedColumns, beamFilters)
  const displayedWireDeckRows = displayRows(wireDeckMergedRows, wireDeckMergedColumns, wireDeckFilters)
  const displayedMiscRows = displayRows(miscMergedRows, miscMergedColumns, miscFilters)

  return (
    <main className="page page-wide">
      <p>
        <Link to={backLink}>{backLabel}</Link>
      </p>
      <h1>{pageTitle}</h1>

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
            <button type="button" onClick={handleGeneratePdf} disabled={pdfSelections.size === 0}>
              Generate PDF{pdfSelections.size > 0 ? ` (${pdfSelections.size})` : ''}
            </button>
            {quoteId && (
              <button type="button" onClick={handleGenerateQuote} disabled={selections.size === 0}>
                Generate Quote ({selections.size})
              </button>
            )}
          </p>
        </>
      )}

      {!hasItems && <p className="placeholder-note">No items across any active locations yet.</p>}

      {uprightRows.length > 0 && (
        <section className="item-section">
          <h2>Uprights</h2>
          <ReadOnlyItemTable<string, AllUprightRow & { heldByEmail?: string }>
            storageKey={quoteId ? 'allInventoryUprightColumnsQuote' : 'allInventoryUprightColumns'}
            title="Uprights Columns"
            columns={uprightMergedColumns}
            defaultOrder={uprightOrder}
            rows={displayedUprightRows}
            filterOptions={uprightFilterOptions}
            filters={uprightFilters}
            onFilterChange={(key, values) => setUprightFilters((prev) => ({ ...prev, [key]: values }))}
            emptyMessage="No uprights match your search or filters."
            wrapColumnKeys={['notes']}
            leftAlignColumnKeys={['location']}
            secondaryGroupLabel="On Hold"
            isSecondaryRow={(row) => !!row.heldByEmail}
            leadingColumns={quoteId ? [heldByLeadingColumn] : [pdfSelectLeadingColumn('upright'), heldByLeadingColumn]}
          />
        </section>
      )}

      {beamRows.length > 0 && (
        <section className="item-section">
          <h2>Beams</h2>
          <ReadOnlyItemTable<string, AllBeamRow & { heldByEmail?: string }>
            storageKey={quoteId ? 'allInventoryBeamColumnsQuote' : 'allInventoryBeamColumns'}
            title="Beams Columns"
            columns={beamMergedColumns}
            defaultOrder={beamOrder}
            rows={displayedBeamRows}
            filterOptions={beamFilterOptions}
            filters={beamFilters}
            onFilterChange={(key, values) => setBeamFilters((prev) => ({ ...prev, [key]: values }))}
            emptyMessage="No beams match your search or filters."
            wrapColumnKeys={['notes']}
            leftAlignColumnKeys={['location']}
            secondaryGroupLabel="On Hold"
            isSecondaryRow={(row) => !!row.heldByEmail}
            leadingColumns={quoteId ? [heldByLeadingColumn] : [pdfSelectLeadingColumn('beam'), heldByLeadingColumn]}
          />
        </section>
      )}

      {wireDeckRows.length > 0 && (
        <section className="item-section">
          <h2>Wire Decks</h2>
          <ReadOnlyItemTable<string, AllWireDeckRow & { heldByEmail?: string }>
            storageKey={quoteId ? 'allInventoryWireDeckColumnsQuote' : 'allInventoryWireDeckColumns'}
            title="Wire Decks Columns"
            columns={wireDeckMergedColumns}
            defaultOrder={wireDeckOrder}
            rows={displayedWireDeckRows}
            filterOptions={wireDeckFilterOptions}
            filters={wireDeckFilters}
            onFilterChange={(key, values) => setWireDeckFilters((prev) => ({ ...prev, [key]: values }))}
            emptyMessage="No wire decks match your search or filters."
            wrapColumnKeys={['notes']}
            leftAlignColumnKeys={['location']}
            secondaryGroupLabel="On Hold"
            isSecondaryRow={(row) => !!row.heldByEmail}
            leadingColumns={quoteId ? [heldByLeadingColumn] : [pdfSelectLeadingColumn('wireDeck'), heldByLeadingColumn]}
          />
        </section>
      )}

      {miscRows.length > 0 && (
        <section className="item-section">
          <h2>Other</h2>
          <ReadOnlyItemTable<string, AllMiscItemRow & { heldByEmail?: string }>
            storageKey={quoteId ? 'allInventoryMiscColumnsQuote' : 'allInventoryMiscColumns'}
            title="Other Items Columns"
            columns={miscMergedColumns}
            defaultOrder={miscOrder}
            rows={displayedMiscRows}
            filterOptions={miscFilterOptions}
            filters={miscFilters}
            onFilterChange={(key, values) => setMiscFilters((prev) => ({ ...prev, [key]: values }))}
            emptyMessage="No items match your search or filters."
            wrapColumnKeys={['notes', 'itemDescription']}
            leftAlignColumnKeys={['location']}
            secondaryGroupLabel="On Hold"
            isSecondaryRow={(row) => !!row.heldByEmail}
            leadingColumns={quoteId ? [heldByLeadingColumn] : [pdfSelectLeadingColumn('misc'), heldByLeadingColumn]}
          />
        </section>
      )}
    </main>
  )
}
