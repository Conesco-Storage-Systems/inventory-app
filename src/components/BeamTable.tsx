import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ColumnPickerDialog from './ColumnPickerDialog'
import DraggableColumnHeader from './DraggableColumnHeader'
import { useColumnConfig } from '../hooks/useColumnConfig'
import type { BeamRow } from '../db/groupBeams'
import { computeHeldQuantity, quantityWithHold } from '../db/salesQuotes'
import type { SalesQuoteLineItem } from '../models/types'
import { formatDisplayName } from '../utils/displayName'

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
  | 'costPer'
  | 'sellPer'
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
  'costPer',
  'sellPer',
  'photos',
]

type HeldBeamRow = BeamRow & { heldByEmail?: string }

interface BeamTableProps {
  rows: HeldBeamRow[]
  siteId: string
  selectedKeys: Set<string>
  onToggleSelect: (row: BeamRow) => void
  holds?: SalesQuoteLineItem[]
}

export default function BeamTable({ rows, siteId, selectedKeys, onToggleSelect, holds = [] }: BeamTableProps) {
  const { order, hidden, visibleOrder, moveColumn, toggleHidden, setAllVisible } = useColumnConfig<BeamColumnKey>(
    'beamColumns',
    DEFAULT_BEAM_COLUMN_ORDER,
  )
  const [draggingKey, setDraggingKey] = useState<BeamColumnKey | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const primaryRows = rows.filter((row) => !row.heldByEmail)
  const heldRows = rows.filter((row) => row.heldByEmail)

  const columns: Record<BeamColumnKey, { label: string; render: (row: HeldBeamRow) => ReactNode }> = {
    quantity: {
      label: 'Quantity',
      render: (row) =>
        row.heldByEmail ? row.quantity : quantityWithHold(row.quantity, computeHeldQuantity(row.ids, holds)),
    },
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

      <div className="item-table-wrap">
        <table className="item-table">
          <thead>
            <tr>
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
                >
                  {columns[key].label}
                </DraggableColumnHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={visibleOrder.length + 2}>No beams match your search.</td>
              </tr>
            )}
            {primaryRows.map((row) => (
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
            {heldRows.length > 0 && (
              <tr className="item-table-group-row">
                <td></td>
                <td>On Hold</td>
                <td colSpan={visibleOrder.length}></td>
              </tr>
            )}
            {heldRows.map((row) => (
              <tr key={row.key}>
                <td></td>
                <td>{formatDisplayName(row.heldByEmail ?? '')}</td>
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
