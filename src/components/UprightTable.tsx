import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ColumnPickerDialog from './ColumnPickerDialog'
import DraggableColumnHeader from './DraggableColumnHeader'
import StickyHeaderRow from './StickyHeaderRow'
import { useColumnConfig } from '../hooks/useColumnConfig'
import type { UprightRow } from '../db/groupUprights'

type UprightColumnKey =
  | 'quantity'
  | 'style'
  | 'widthByHeight'
  | 'color'
  | 'columnSize'
  | 'footplateSize'
  | 'footplateThickness'
  | 'anchorHoleCount'
  | 'holeSize'
  | 'gauge'
  | 'condition'
  | 'stamp'
  | 'bundleSize'
  | 'zone'
  | 'notes'
  | 'costPer'
  | 'sellPer'
  | 'photos'

const DEFAULT_UPRIGHT_COLUMN_ORDER: UprightColumnKey[] = [
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

interface UprightTableProps {
  rows: UprightRow[]
  siteId: string
  selectedKeys: Set<string>
  onToggleSelect: (row: UprightRow) => void
  // Whether the page is currently scrolled into this section — only then
  // does the header need to freeze in place as you scroll through it.
  active?: boolean
}

export default function UprightTable({ rows, siteId, selectedKeys, onToggleSelect, active = false }: UprightTableProps) {
  const { order, hidden, visibleOrder, moveColumn, toggleHidden, setAllVisible } = useColumnConfig<UprightColumnKey>(
    'uprightColumns',
    DEFAULT_UPRIGHT_COLUMN_ORDER,
  )
  const [draggingKey, setDraggingKey] = useState<UprightColumnKey | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const columns: Record<UprightColumnKey, { label: string; render: (row: UprightRow) => ReactNode }> = {
    quantity: { label: 'Quantity', render: (row) => row.quantity },
    style: { label: 'Style', render: (row) => row.style },
    widthByHeight: { label: 'Width x Height', render: (row) => row.widthByHeight },
    color: { label: 'Color', render: (row) => row.color },
    columnSize: { label: 'Column Size', render: (row) => row.columnSizeDisplay },
    footplateSize: { label: 'Footplate Size', render: (row) => row.footplateSizeDisplay },
    footplateThickness: { label: 'Footplate Thickness', render: (row) => row.footplateThickness || '—' },
    anchorHoleCount: { label: 'Anchor Hole Count', render: (row) => row.anchorHoleCount },
    holeSize: { label: 'Hole Size', render: (row) => row.holeSize || '—' },
    gauge: { label: 'Gauge', render: (row) => row.gauge },
    condition: { label: 'Condition', render: (row) => row.condition },
    stamp: { label: 'Stamp', render: (row) => row.stamp || '—' },
    bundleSize: { label: 'Bundle Size', render: (row) => row.bundleSize || '—' },
    zone: { label: 'Zone', render: (row) => row.zone || '—' },
    notes: { label: 'Notes', render: (row) => <span className="notes-text">{row.notes || '—'}</span> },
    costPer: { label: 'Cost Per', render: (row) => (row.costPer ? `$${row.costPer.toFixed(2)}` : '—') },
    sellPer: { label: 'Sell Per', render: (row) => (row.sellPer ? `$${row.sellPer.toFixed(2)}` : '—') },
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
      <button type="button" className="column-picker-button" onClick={() => setPickerOpen(true)}>
        Filter Columns
      </button>

      <div className="item-table-wrap" ref={wrapperRef}>
        <table className="item-table">
          <thead>
            <StickyHeaderRow wrapperRef={wrapperRef} active={active}>
              <th className="col-edit"></th>
              <th></th>
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
                  style={key === 'notes' ? { textAlign: 'left' } : undefined}
                >
                  {columns[key].label}
                </DraggableColumnHeader>
              ))}
            </StickyHeaderRow>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={visibleOrder.length + 2}>No uprights match your search.</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(row.key)}
                    onChange={() => onToggleSelect(row)}
                  />
                </td>
                <td></td>
                {visibleOrder.map((key) => (
                  <td key={key} className={key === 'notes' ? 'col-notes' : undefined}>
                    {columns[key].render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pickerOpen && (
        <ColumnPickerDialog
          title="Uprights Columns"
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
