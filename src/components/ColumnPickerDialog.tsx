import { useEffect, useRef } from 'react'

interface ColumnOption<T extends string> {
  key: T
  label: string
}

interface ColumnPickerDialogProps<T extends string> {
  title: string
  columns: ColumnOption<T>[]
  hidden: Set<T>
  onToggle: (key: T) => void
  onToggleAll: (visible: boolean) => void
  onClose: () => void
}

export default function ColumnPickerDialog<T extends string>({
  title,
  columns,
  hidden,
  onToggle,
  onToggleAll,
  onClose,
}: ColumnPickerDialogProps<T>) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const allSelected = hidden.size === 0

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog ref={dialogRef} className="location-dialog column-picker-dialog" onClose={onClose}>
      <h2>{title}</h2>
      <label className="column-picker-option column-picker-select-all">
        <span>Select all</span>
        <input type="checkbox" checked={allSelected} onChange={() => onToggleAll(!allSelected)} />
      </label>
      <div className="column-picker-list">
        {columns.map((col) => (
          <label key={col.key} className="column-picker-option">
            <span>{col.label}</span>
            <input type="checkbox" checked={!hidden.has(col.key)} onChange={() => onToggle(col.key)} />
          </label>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  )
}
