import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ColumnPickerDialog from './ColumnPickerDialog'
import DraggableColumnHeader from './DraggableColumnHeader'
import { useColumnConfig } from '../hooks/useColumnConfig'
import type { UprightRow } from '../db/groupUprights'

type UprightColumnKey =
  | 'quantity'
  | 'style'
  | 'widthByHeight'
  | 'color'
  | 'columnSize'
  | 'footplateSize'
  | 'anchorHoleCount'
  | 'holeSize'
  | 'gauge'
  | 'condition'
  | 'stamp'
  | 'bundleSize'
  | 'zone'
  | 'notes'
  | 'photos'

const DEFAULT_UPRIGHT_COLUMN_ORDER: UprightColumnKey[] = [
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

interface UprightTableProps {
  rows: UprightRow[]
  siteId: string
  selectedKey: string | null
  onToggleSelect: (row: UprightRow) => void
}

export default function UprightTable({ rows, siteId, selectedKey, onToggleSelect }: UprightTableProps) {
  const { order, hidden, visibleOrder, moveColumn, toggleHidden, setAllVisible } = useColumnConfig<UprightColumnKey>(
    'uprightColumns',
    DEFAULT_UPRIGHT_COLUMN_ORDER,
  )
  const [draggingKey, setDraggingKey] = useState<UprightColumnKey | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const columns: Record<UprightColumnKey, { label: string; render: (row: UprightRow) => ReactNode }> = {
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

      <div className="item-table-wrap">
        <table className="item-table">
          <thead>
            <tr>
              <th className="col-edit"></th>
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={visibleOrder.length + 1}>No uprights match your search.</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedKey === row.key}
                    onChange={() => onToggleSelect(row)}
                  />
                </td>
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
