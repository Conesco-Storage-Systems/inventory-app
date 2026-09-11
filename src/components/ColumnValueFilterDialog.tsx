import { useEffect, useRef } from 'react'
import FilterOptionList from './FilterOptionList'

interface ColumnValueFilterDialogProps {
  title: string
  options: string[]
  selected: Set<string>
  onToggle: (value: string) => void
  onClear: () => void
  onClose: () => void
}

export default function ColumnValueFilterDialog({
  title,
  options,
  selected,
  onToggle,
  onClear,
  onClose,
}: ColumnValueFilterDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog ref={dialogRef} className="location-dialog column-value-filter-dialog" onClose={onClose}>
      <h2>Filter: {title}</h2>
      <div className="column-value-filter-list">
        <FilterOptionList options={options} selected={selected} onToggle={onToggle} />
      </div>
      <div className="dialog-actions">
        {selected.size > 0 && (
          <button type="button" className="filter-clear-button" onClick={onClear}>
            Clear filter
          </button>
        )}
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  )
}
