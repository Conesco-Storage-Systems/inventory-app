import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ColumnPickerDialog from './ColumnPickerDialog'
import DraggableColumnHeader from './DraggableColumnHeader'
import { useColumnConfig } from '../hooks/useColumnConfig'
import type { MiscItemRow } from '../db/groupMiscItems'

type MiscItemColumnKey =
  | 'quantity'
  | 'description'
  | 'itemDescription'
  | 'condition'
  | 'bundleSize'
  | 'zone'
  | 'notes'
  | 'photos'

const DEFAULT_MISC_ITEM_COLUMN_ORDER: MiscItemColumnKey[] = [
  'quantity',
  'description',
  'itemDescription',
  'condition',
  'bundleSize',
  'zone',
  'notes',
  'photos',
]

interface MiscItemTableProps {
  rows: MiscItemRow[]
  siteId: string
  selectedKey: string | null
  onToggleSelect: (row: MiscItemRow) => void
}

export default function MiscItemTable({ rows, siteId, selectedKey, onToggleSelect }: MiscItemTableProps) {
  const { order, hidden, visibleOrder, moveColumn, toggleHidden, setAllVisible } =
    useColumnConfig<MiscItemColumnKey>('miscItemColumns', DEFAULT_MISC_ITEM_COLUMN_ORDER)
  const [draggingKey, setDraggingKey] = useState<MiscItemColumnKey | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const columns: Record<MiscItemColumnKey, { label: string; render: (row: MiscItemRow) => ReactNode }> = {
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
                <td colSpan={visibleOrder.length + 1}>No items match your search.</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.key}>
                {visibleOrder.map((key) => (
                  <td key={key} className={key === 'notes' || key === 'itemDescription' ? 'col-notes' : undefined}>
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
          title="Other Items Columns"
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
