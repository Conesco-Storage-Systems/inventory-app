import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ColumnPickerDialog from './ColumnPickerDialog'
import DraggableColumnHeader from './DraggableColumnHeader'
import FilterOptionList from './FilterOptionList'
import FilterSection from './FilterSection'
import { useColumnConfig } from '../hooks/useColumnConfig'
import type { WireDeckRow } from '../db/groupWireDecks'

type WireDeckColumnKey =
  | 'quantity'
  | 'style'
  | 'widthByLength'
  | 'channelCount'
  | 'condition'
  | 'bundleSize'
  | 'zone'
  | 'notes'
  | 'photos'

const DEFAULT_WIRE_DECK_COLUMN_ORDER: WireDeckColumnKey[] = [
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

interface WireDeckTableProps {
  rows: WireDeckRow[]
  siteId: string
  selectedKey: string | null
  onToggleSelect: (row: WireDeckRow) => void
  searchActive: boolean
}

export default function WireDeckTable({ rows, siteId, selectedKey, onToggleSelect, searchActive }: WireDeckTableProps) {
  const { order, hidden, visibleOrder, moveColumn, toggleHidden, setAllVisible } = useColumnConfig<WireDeckColumnKey>(
    'wireDeckColumns',
    DEFAULT_WIRE_DECK_COLUMN_ORDER,
  )
  const [draggingKey, setDraggingKey] = useState<WireDeckColumnKey | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const [filterOpen, setFilterOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [styleFilter, setStyleFilter] = useState<Set<string>>(new Set())
  const [channelFilter, setChannelFilter] = useState<Set<string>>(new Set())
  const [widthLengthFilter, setWidthLengthFilter] = useState<Set<string>>(new Set())
  const [widthSort, setWidthSort] = useState<'none' | 'asc' | 'desc'>('none')

  function toggleInSet(setState: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
    setState((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  function toggleSection(key: string) {
    toggleInSet(setExpandedSections, key)
  }

  const styleOptions = Array.from(new Set(rows.flatMap((row) => row.style))).sort()
  const channelOptions = Array.from(new Set(rows.map((row) => row.channelCount))).sort()
  const widthLengthOptions = Array.from(new Set(rows.map((row) => row.widthByLength)))

  const filtersActive = styleFilter.size > 0 || channelFilter.size > 0 || widthLengthFilter.size > 0

  let displayedRows = rows.filter((row) => {
    if (styleFilter.size > 0 && !row.style.some((s) => styleFilter.has(s))) return false
    if (channelFilter.size > 0 && !channelFilter.has(row.channelCount)) return false
    if (widthLengthFilter.size > 0 && !widthLengthFilter.has(row.widthByLength)) return false
    return true
  })
  if (widthSort !== 'none') {
    displayedRows = [...displayedRows].sort((a, b) =>
      widthSort === 'asc' ? a.width - b.width : b.width - a.width,
    )
  }

  function clearFilters() {
    setStyleFilter(new Set())
    setChannelFilter(new Set())
    setWidthLengthFilter(new Set())
  }

  const columns: Record<WireDeckColumnKey, { label: string; render: (row: WireDeckRow) => ReactNode }> = {
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
          <Link to={`/locations/${siteId}/photos?ids=${row.ids.join(',')}`}>
            View photos ({row.photoIds.length})
          </Link>
        ) : (
          '—'
        ),
    },
  }

  return (
    <>
      <div className="table-toolbar-row">
        <button type="button" className="filter-toggle-button" onClick={() => setFilterOpen(!filterOpen)}>
          Filter
          {filtersActive ? ` (${styleFilter.size + channelFilter.size + widthLengthFilter.size})` : ''}
        </button>
        <button type="button" className="column-picker-button" onClick={() => setPickerOpen(true)}>
          Filter Columns
        </button>
      </div>

      {filterOpen && (
        <div className="filter-panel">
          <FilterSection
            label="Style"
            count={styleFilter.size}
            expanded={expandedSections.has('style')}
            onToggle={() => toggleSection('style')}
          >
            <FilterOptionList
              options={styleOptions}
              selected={styleFilter}
              onToggle={(v) => toggleInSet(setStyleFilter, v)}
            />
          </FilterSection>

          <FilterSection
            label="Number of Channels"
            count={channelFilter.size}
            expanded={expandedSections.has('channels')}
            onToggle={() => toggleSection('channels')}
          >
            <FilterOptionList
              options={channelOptions}
              selected={channelFilter}
              onToggle={(v) => toggleInSet(setChannelFilter, v)}
            />
          </FilterSection>

          <FilterSection
            label="Width x Length"
            count={widthLengthFilter.size}
            expanded={expandedSections.has('widthLength')}
            onToggle={() => toggleSection('widthLength')}
          >
            <FilterOptionList
              options={widthLengthOptions}
              selected={widthLengthFilter}
              onToggle={(v) => toggleInSet(setWidthLengthFilter, v)}
            />
            <div className="filter-sort-group">
              <span className="filter-checkbox-row-label">Sort by Width</span>
              <button
                type="button"
                className={widthSort === 'asc' ? 'filter-sort-active' : ''}
                onClick={() => setWidthSort(widthSort === 'asc' ? 'none' : 'asc')}
              >
                Smallest → Biggest
              </button>
              <button
                type="button"
                className={widthSort === 'desc' ? 'filter-sort-active' : ''}
                onClick={() => setWidthSort(widthSort === 'desc' ? 'none' : 'desc')}
              >
                Biggest → Smallest
              </button>
            </div>
          </FilterSection>

          {filtersActive && (
            <button type="button" className="filter-clear-button" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="item-table-wrap">
        <table className="item-table">
          <thead>
            <tr>
              {visibleOrder.map((key) => (
                <DraggableColumnHeader
                  key={key}
                  columnKey={key}
                  isDragging={draggingKey === key}
                  onDragStartKey={setDraggingKey}
                  onDragOverKey={(k) => {
                    if (draggingKey) moveColumn(draggingKey, k)
                  }}
                  onDragEnd={() => setDraggingKey(null)}
                >
                  {columns[key].label}
                </DraggableColumnHeader>
              ))}
              <th className="col-edit"></th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 && (
              <tr>
                <td colSpan={visibleOrder.length + 1}>
                  No wire decks match the current filters{searchActive ? ' or search' : ''}.
                </td>
              </tr>
            )}
            {displayedRows.map((row) => (
              <tr key={row.key}>
                {visibleOrder.map((key) => (
                  <td key={key} className={key === 'notes' ? 'col-notes' : undefined}>
                    {columns[key].render(row)}
                  </td>
                ))}
                <td>
                  <input
                    type="checkbox"
                    checked={selectedKey === row.key}
                    onChange={() => onToggleSelect(row)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pickerOpen && (
        <ColumnPickerDialog
          title="Wire Decks Columns"
          columns={order.map((key) => ({ key, label: columns[key].label }))}
          hidden={hidden}
          onToggle={toggleHidden}
          onToggleAll={setAllVisible}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}
