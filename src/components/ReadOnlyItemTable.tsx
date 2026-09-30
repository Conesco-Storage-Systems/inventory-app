import { useState, type ReactNode } from 'react'
import ColumnPickerDialog from './ColumnPickerDialog'
import ColumnValueFilterDialog from './ColumnValueFilterDialog'
import DraggableColumnHeader from './DraggableColumnHeader'
import { useColumnConfig } from '../hooks/useColumnConfig'

export interface ColumnDef<TRow> {
  label: string
  render: (row: TRow) => ReactNode
  getValue: (row: TRow) => string | string[]
  filterable?: boolean
  // Comparable value used for sorting. A number sorts numerically; a string
  // sorts alphabetically. Falls back to getValue() (as text) when omitted.
  sortValue?: (row: TRow) => number | string
}

interface SortState<TKey> {
  key: TKey
  direction: 'asc' | 'desc'
}

interface ReadOnlyItemTableProps<TKey extends string, TRow extends { key: string }> {
  storageKey: string
  title: string
  columns: Record<TKey, ColumnDef<TRow>>
  defaultOrder: TKey[]
  rows: TRow[]
  filterOptions: Record<TKey, string[]>
  filters: Partial<Record<TKey, Set<string>>>
  onFilterChange: (key: TKey, values: Set<string>) => void
  emptyMessage: string
  wrapColumnKeys?: TKey[]
  leftAlignColumnKeys?: TKey[]
  // When set, rows this predicate matches are pulled out of the normal
  // flow and rendered together at the bottom of the same table, under a
  // divider row bearing this label — a subgroup, not a separate table.
  secondaryGroupLabel?: string
  isSecondaryRow?: (row: TRow) => boolean
  // Columns pinned to the far left, in order, outside the
  // reorderable/hideable column set — so none of them can end up buried by
  // a viewer's saved column order (the way a brand-new column otherwise
  // would, since unknown saved orders append new keys at the end). Each
  // one shows on primary rows by default; set showOnSecondary to flip that
  // (e.g. a "Held By" column that only has something to show once a
  // secondary/held row exists).
  leadingColumns?: { label: string; render: (row: TRow) => ReactNode; showOnSecondary?: boolean }[]
}

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

export default function ReadOnlyItemTable<TKey extends string, TRow extends { key: string }>({
  storageKey,
  title,
  columns,
  defaultOrder,
  rows,
  filterOptions,
  filters,
  onFilterChange,
  emptyMessage,
  wrapColumnKeys = [],
  leftAlignColumnKeys = [],
  secondaryGroupLabel,
  isSecondaryRow,
  leadingColumns = [],
}: ReadOnlyItemTableProps<TKey, TRow>) {
  const { order, hidden, visibleOrder, moveColumn, toggleHidden, setAllVisible } = useColumnConfig<TKey>(
    storageKey,
    defaultOrder,
  )
  const [draggingKey, setDraggingKey] = useState<TKey | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [openFilterKey, setOpenFilterKey] = useState<TKey | null>(null)
  const [sortEnabled, setSortEnabled] = useState(false)
  const [sortState, setSortState] = useState<SortState<TKey> | null>(null)

  function handleToggleValue(key: TKey, value: string) {
    const current = filters[key] ?? new Set<string>()
    const next = new Set(current)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onFilterChange(key, next)
  }

  function handleToggleSort() {
    setSortEnabled((prev) => !prev)
  }

  function handleHeaderClick(key: TKey) {
    if (!sortEnabled || columns[key].filterable === false) return
    setSortState((prev) => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  let displayedRows = rows
  if (sortState) {
    const column = columns[sortState.key]
    const getSortValue = column.sortValue ?? column.getValue
    const direction = sortState.direction === 'asc' ? 1 : -1
    displayedRows = [...rows].sort((a, b) => {
      const av = getSortValue(a)
      const bv = getSortValue(b)
      return compareValues(Array.isArray(av) ? av.join(', ') : av, Array.isArray(bv) ? bv.join(', ') : bv) * direction
    })
  }

  // The secondary group (e.g. held rows) is split out here rather than
  // sorted/filtered separately, so it still reflects whatever sort or
  // filter is active — it just always renders after the primary rows.
  const primaryRows = isSecondaryRow ? displayedRows.filter((row) => !isSecondaryRow(row)) : displayedRows
  const secondaryRows = isSecondaryRow ? displayedRows.filter((row) => isSecondaryRow(row)) : []

  const columnCount = visibleOrder.length + leadingColumns.length

  // Each leading column only renders on the row group it's meant for
  // (primary by default, secondary-only when flagged) — e.g. a "Held By"
  // column has nothing to show until a secondary/held row exists, so it
  // stays blank (even its header label) everywhere else.
  function renderRow(row: TRow, isSecondary: boolean) {
    return (
      <tr key={row.key}>
        {leadingColumns.map((col, i) => (
          <td key={i}>{(col.showOnSecondary ?? false) === isSecondary ? col.render(row) : null}</td>
        ))}
        {visibleOrder.map((key) => (
          <td
            key={key}
            className={wrapColumnKeys.includes(key) ? 'col-notes' : leftAlignColumnKeys.includes(key) ? 'col-left' : undefined}
          >
            {columns[key].render(row)}
          </td>
        ))}
      </tr>
    )
  }

  return (
    <>
      <div className="table-toolbar-row">
        <button type="button" className="column-picker-button" onClick={() => setPickerOpen(true)}>
          Filter Columns
        </button>
        <button
          type="button"
          className={`sort-toggle-button${sortEnabled ? ' sort-toggle-button--active' : ''}`}
          onClick={handleToggleSort}
        >
          Sort
        </button>
      </div>

      <div className="item-table-wrap">
        <table className="item-table">
          <thead>
            <tr>
              {leadingColumns.map((_, i) => (
                <th key={i}></th>
              ))}
              {visibleOrder.map((key) => {
                const filterActive = (filters[key]?.size ?? 0) > 0
                const filterable = columns[key].filterable !== false
                const isSortedColumn = sortState?.key === key
                return (
                  <DraggableColumnHeader
                    key={key}
                    columnKey={key}
                    isDragging={draggingKey === key}
                    draggable={!sortEnabled}
                    onDragStartKey={setDraggingKey}
                    onDragOverKey={(k) => {
                      if (draggingKey) moveColumn(draggingKey, k)
                    }}
                    onDragEnd={() => setDraggingKey(null)}
                  >
                    <div className="column-header-inner">
                      <span
                        className={`column-header-label${sortEnabled && filterable ? ' column-header-label--clickable' : ''}`}
                        onClick={sortEnabled && filterable ? () => handleHeaderClick(key) : undefined}
                      >
                        {columns[key].label}
                        {isSortedColumn && (sortState!.direction === 'asc' ? ' ▲' : ' ▼')}
                      </span>
                      {filterable && (
                        <button
                          type="button"
                          className={`column-filter-icon${filterActive ? ' column-filter-icon--active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenFilterKey(key)
                          }}
                          aria-label={`Filter ${columns[key].label}`}
                        >
                          ▾
                        </button>
                      )}
                    </div>
                  </DraggableColumnHeader>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {primaryRows.length === 0 && secondaryRows.length === 0 && (
              <tr>
                <td colSpan={columnCount}>{emptyMessage}</td>
              </tr>
            )}
            {primaryRows.map((row) => renderRow(row, false))}
            {secondaryRows.length > 0 && (
              <tr className="item-table-group-row">
                {leadingColumns.length > 0 ? (
                  <>
                    {leadingColumns.map((col, i) => (
                      <td key={i}>{col.showOnSecondary ? secondaryGroupLabel : ''}</td>
                    ))}
                    <td colSpan={visibleOrder.length}></td>
                  </>
                ) : (
                  <td colSpan={columnCount}>{secondaryGroupLabel}</td>
                )}
              </tr>
            )}
            {secondaryRows.map((row) => renderRow(row, true))}
          </tbody>
        </table>
      </div>

      {pickerOpen && (
        <ColumnPickerDialog
          title={title}
          columns={order.map((key) => ({ key, label: columns[key].label }))}
          hidden={hidden}
          onToggle={toggleHidden}
          onToggleAll={setAllVisible}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {openFilterKey && (
        <ColumnValueFilterDialog
          title={columns[openFilterKey].label}
          options={filterOptions[openFilterKey] ?? []}
          selected={filters[openFilterKey] ?? new Set()}
          onToggle={(value) => handleToggleValue(openFilterKey, value)}
          onClear={() => onFilterChange(openFilterKey, new Set())}
          onClose={() => setOpenFilterKey(null)}
        />
      )}
    </>
  )
}
