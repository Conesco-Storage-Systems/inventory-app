import { useState, type ReactNode } from 'react'
import ColumnPickerDialog from './ColumnPickerDialog'
import DraggableColumnHeader from './DraggableColumnHeader'
import { useColumnConfig } from '../hooks/useColumnConfig'

interface ReadOnlyItemTableProps<TKey extends string, TRow extends { key: string }> {
  storageKey: string
  title: string
  columns: Record<TKey, { label: string; render: (row: TRow) => ReactNode }>
  defaultOrder: TKey[]
  rows: TRow[]
  emptyMessage: string
  wrapColumnKeys?: TKey[]
}

export default function ReadOnlyItemTable<TKey extends string, TRow extends { key: string }>({
  storageKey,
  title,
  columns,
  defaultOrder,
  rows,
  emptyMessage,
  wrapColumnKeys = [],
}: ReadOnlyItemTableProps<TKey, TRow>) {
  const { order, hidden, visibleOrder, moveColumn, toggleHidden, setAllVisible } = useColumnConfig<TKey>(
    storageKey,
    defaultOrder,
  )
  const [draggingKey, setDraggingKey] = useState<TKey | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={visibleOrder.length}>{emptyMessage}</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.key}>
                {visibleOrder.map((key) => (
                  <td key={key} className={wrapColumnKeys.includes(key) ? 'col-notes' : undefined}>
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
          title={title}
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
