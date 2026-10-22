import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { CustomerSheetSeed } from '../components/GenerateCustomerSheetFlow'
import ReadOnlyItemTable, { type ColumnDef } from '../components/ReadOnlyItemTable'
import { combineRowsAcrossSites, type WithSite } from '../db/combineAcrossSites'
import { db } from '../db/db'
import { describeBeamRow, describeMiscRow, describeUprightRow, describeWireDeckRow } from '../db/describeItemRow'
import { groupBeams, leadingNumber, type BeamRow } from '../db/groupBeams'
import { groupMiscItems, type MiscItemRow } from '../db/groupMiscItems'
import { groupUprights, uprightDimensionSortValue, uprightHeightSortValue, type UprightRow } from '../db/groupUprights'
import { groupWireDecks, type WireDeckRow } from '../db/groupWireDecks'
import { exportSheetsToExcel } from '../export/exportToExcel'
import { beamExportRow, miscExportRow, uprightExportRow, wireDeckExportRow } from '../export/inventoryExportRows'
import type { ItemType } from '../models/types'
import { applyColumnFilters, computeFilterOptions } from '../utils/columnFilters'
import { matchesSearch, normalizeForSearch } from '../utils/searchMatch'

interface QuoteSelection {
  key: string
  itemType: ItemType
  siteId: string
  siteName: string
  description: string
  itemIds: string[]
  rawQuantity: number
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

  const toolbarObserverRef = useRef<IntersectionObserver | null>(null)
  const [toolbarStuck, setToolbarStuck] = useState(false)

  const toolbarSentinelRef = useCallback((node: HTMLDivElement | null) => {
    toolbarObserverRef.current?.disconnect()
    toolbarObserverRef.current = null
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setToolbarStuck(!entry.isIntersecting), {
      threshold: 0,
    })
    observer.observe(node)
    toolbarObserverRef.current = observer
  }, [])

  // Which item-type section the page is currently scrolled into, shown in
  // the sticky toolbar (and used to decide which table's own Filter
  // Columns/Sort buttons currently belong there too).
  const stickyToolbarRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const [activeSectionLabel, setActiveSectionLabel] = useState<string | null>(null)
  const [toolbarButtonSlot, setToolbarButtonSlot] = useState<HTMLDivElement | null>(null)

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

  useEffect(() => {
    const labels = ['Uprights', 'Beams', 'Wire Decks', 'Other']
    let frame = 0

    function recompute() {
      frame = 0
      const headerBottom = stickyToolbarRef.current?.getBoundingClientRect().bottom ?? 0
      let current: string | null = null
      for (const label of labels) {
        const el = sectionRefs.current[label]
        if (el && el.getBoundingClientRect().top <= headerBottom + 1) {
          current = label
        }
      }
      setActiveSectionLabel(current)
    }

    function onScrollOrResize() {
      if (frame) return
      frame = requestAnimationFrame(recompute)
    }

    recompute()
    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [uprightRows.length > 0, beamRows.length > 0, wireDeckRows.length > 0, miscRows.length > 0])

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
              const available = row.quantity
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
      render: (row) => row.quantity,
      getValue: (row) => String(row.quantity),
      filterable: false,
    },
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
    footplateThickness: {
      label: 'Footplate Thickness',
      render: (row) => row.footplateThickness || '—',
      getValue: (row) => row.footplateThickness,
      sortValue: (row) => row.footplateThickness,
    },
    anchorHoleCount: {
      label: 'Anchor Hole Count',
      render: (row) => row.anchorHoleCount,
      getValue: (row) => row.anchorHoleCount,
      sortValue: (row) => uprightDimensionSortValue(row.anchorHoleCount),
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
    'footplateThickness',
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
              const available = row.quantity
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
      render: (row) => row.quantity,
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
              const available = row.quantity
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
      render: (row) => row.quantity,
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
              const available = row.quantity
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
      render: (row) => row.quantity,
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

  const uprightFilterOptions = computeFilterOptions(nonZeroUprightRows, uprightColumns)
  const beamFilterOptions = computeFilterOptions(nonZeroBeamRows, beamColumns)
  const wireDeckFilterOptions = computeFilterOptions(nonZeroWireDeckRows, wireDeckColumns)
  const miscFilterOptions = computeFilterOptions(nonZeroMiscRows, miscColumns)

  const normalizedSearch = normalizeForSearch(searchTerm)

  function displayRows<TRow extends { key: string }>(
    rows: TRow[],
    columns: Record<string, ColumnDef<TRow>>,
    filters: FilterMap,
  ): TRow[] {
    const searched = normalizedSearch ? rows.filter((row) => matchesSearch(row, normalizedSearch)) : rows
    return applyColumnFilters(searched, columns, filters)
  }

  const displayedUprightRows = displayRows(nonZeroUprightRows, uprightColumns, uprightFilters)
  const displayedBeamRows = displayRows(nonZeroBeamRows, beamColumns, beamFilters)
  const displayedWireDeckRows = displayRows(nonZeroWireDeckRows, wireDeckColumns, wireDeckFilters)
  const displayedMiscRows = displayRows(nonZeroMiscRows, miscColumns, miscFilters)

  return (
    <main className="page page-wide">
      <p>
        <Link to={backLink}>{backLabel}</Link>
      </p>
      <h1>{pageTitle}</h1>

      {hasItems && (
        <>
          <p className="add-item-row">
            <button type="button" onClick={handleExport} className="export-button">
              Export to Excel
            </button>
          </p>

          <div ref={toolbarSentinelRef} />
          <div ref={stickyToolbarRef} className={`sticky-toolbar${toolbarStuck ? ' sticky-toolbar--stuck' : ''}`}>
            <div className="sticky-toolbar-inner">
              <div className="sticky-toolbar-stack">
                <div className="sticky-toolbar-top-row">
                  <div className="item-search-row">
                    <input
                      type="text"
                      className="item-search-input"
                      placeholder="Search…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  {activeSectionLabel && <h2 className="sticky-toolbar-section-label">{activeSectionLabel}</h2>}
                </div>
                <div className="sticky-toolbar-table-actions" ref={setToolbarButtonSlot} />
              </div>
            </div>
          </div>
        </>
      )}

      {!hasItems && <p className="placeholder-note">No items across any active locations yet.</p>}

      {(() => {
        const generateActionButtons = (
          <>
            <button type="button" onClick={handleGeneratePdf} disabled={pdfSelections.size === 0}>
              Generate PDF{pdfSelections.size > 0 ? ` (${pdfSelections.size})` : ''}
            </button>
            {quoteId && (
              <button type="button" onClick={handleGenerateQuote} disabled={selections.size === 0}>
                Generate Quote ({selections.size})
              </button>
            )}
          </>
        )
        return (
          <>
            {uprightRows.length > 0 && (
              <section className="item-section" ref={(el) => { sectionRefs.current['Uprights'] = el }}>
                <h2>Uprights</h2>
                <ReadOnlyItemTable<string, AllUprightRow>
                  storageKey={quoteId ? 'allInventoryUprightColumnsQuote' : 'allInventoryUprightColumns'}
                  title="Uprights Columns"
                  columns={uprightColumns}
                  defaultOrder={uprightOrder}
                  rows={displayedUprightRows}
                  filterOptions={uprightFilterOptions}
                  filters={uprightFilters}
                  onFilterChange={(key, values) => setUprightFilters((prev) => ({ ...prev, [key]: values }))}
                  emptyMessage="No uprights match your search or filters."
                  wrapColumnKeys={['notes']}
                  leftAlignColumnKeys={['location']}
                  active={activeSectionLabel === 'Uprights'}
                  toolbarButtonSlot={toolbarButtonSlot}
                  leadingColumns={quoteId ? [] : [pdfSelectLeadingColumn('upright')]}
                  extraActions={generateActionButtons}
                />
              </section>
            )}

            {beamRows.length > 0 && (
              <section className="item-section" ref={(el) => { sectionRefs.current['Beams'] = el }}>
                <h2>Beams</h2>
                <ReadOnlyItemTable<string, AllBeamRow>
                  storageKey={quoteId ? 'allInventoryBeamColumnsQuote' : 'allInventoryBeamColumns'}
                  title="Beams Columns"
                  columns={beamColumns}
                  defaultOrder={beamOrder}
                  rows={displayedBeamRows}
                  filterOptions={beamFilterOptions}
                  filters={beamFilters}
                  onFilterChange={(key, values) => setBeamFilters((prev) => ({ ...prev, [key]: values }))}
                  emptyMessage="No beams match your search or filters."
                  wrapColumnKeys={['notes']}
                  leftAlignColumnKeys={['location']}
                  leadingColumns={quoteId ? [] : [pdfSelectLeadingColumn('beam')]}
                  active={activeSectionLabel === 'Beams'}
                  toolbarButtonSlot={toolbarButtonSlot}
                  extraActions={generateActionButtons}
                />
              </section>
            )}

            {wireDeckRows.length > 0 && (
              <section className="item-section" ref={(el) => { sectionRefs.current['Wire Decks'] = el }}>
                <h2>Wire Decks</h2>
                <ReadOnlyItemTable<string, AllWireDeckRow>
                  storageKey={quoteId ? 'allInventoryWireDeckColumnsQuote' : 'allInventoryWireDeckColumns'}
                  title="Wire Decks Columns"
                  columns={wireDeckColumns}
                  defaultOrder={wireDeckOrder}
                  rows={displayedWireDeckRows}
                  filterOptions={wireDeckFilterOptions}
                  filters={wireDeckFilters}
                  onFilterChange={(key, values) => setWireDeckFilters((prev) => ({ ...prev, [key]: values }))}
                  emptyMessage="No wire decks match your search or filters."
                  wrapColumnKeys={['notes']}
                  leftAlignColumnKeys={['location']}
                  leadingColumns={quoteId ? [] : [pdfSelectLeadingColumn('wireDeck')]}
                  active={activeSectionLabel === 'Wire Decks'}
                  toolbarButtonSlot={toolbarButtonSlot}
                  extraActions={generateActionButtons}
                />
              </section>
            )}

            {miscRows.length > 0 && (
              <section className="item-section" ref={(el) => { sectionRefs.current['Other'] = el }}>
                <h2>Other</h2>
                <ReadOnlyItemTable<string, AllMiscItemRow>
                  storageKey={quoteId ? 'allInventoryMiscColumnsQuote' : 'allInventoryMiscColumns'}
                  title="Other Items Columns"
                  columns={miscColumns}
                  defaultOrder={miscOrder}
                  rows={displayedMiscRows}
                  filterOptions={miscFilterOptions}
                  filters={miscFilters}
                  onFilterChange={(key, values) => setMiscFilters((prev) => ({ ...prev, [key]: values }))}
                  emptyMessage="No items match your search or filters."
                  wrapColumnKeys={['notes', 'itemDescription']}
                  leftAlignColumnKeys={['location']}
                  leadingColumns={quoteId ? [] : [pdfSelectLeadingColumn('misc')]}
                  active={activeSectionLabel === 'Other'}
                  toolbarButtonSlot={toolbarButtonSlot}
                  extraActions={generateActionButtons}
                />
              </section>
            )}
          </>
        )
      })()}
    </main>
  )
}
