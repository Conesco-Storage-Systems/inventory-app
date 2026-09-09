import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ColumnPickerDialog from './ColumnPickerDialog'
import DraggableColumnHeader from './DraggableColumnHeader'
import { useColumnConfig } from '../hooks/useColumnConfig'
import type { BeamRow } from '../db/groupBeams'

type BeamColumnKey =
  | 'quantity'
  | 'style'
  | 'widthByLength'
  | 'color'
  | 'pinCount'
  | 'step'
  | 'condition'
  | 'stamp'
  | 'stickers'
  | 'bundleSize'
  | 'zone'
  | 'notes'
  | 'photos'

const DEFAULT_BEAM_COLUMN_ORDER: BeamColumnKey[] = [
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

interface BeamTableProps {
  rows: BeamRow[]
  siteId: string
  selectedKey: string | null
  onToggleSelect: (row: BeamRow) => void
}

export default function BeamTable({ rows, siteId, selectedKey, onToggleSelect }: BeamTableProps) {
  const { order, hidden, visibleOrder, moveColumn, toggleHidden, setAllVisible } = useColumnConfig<BeamColumnKey>(
    'beamColumns',
    DEFAULT_BEAM_COLUMN_ORDER,
  )
  const [draggingKey, setDraggingKey] = useState<BeamColumnKey | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const columns: Record<BeamColumnKey, { label: string; render: (row: BeamRow) => ReactNode }> = {
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={visibleOrder.length + 1}>No beams match your search.</td>
              </tr>
            )}
            {rows.map((row) => (
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
          title="Beams Columns"
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
