import type { ReactNode } from 'react'

interface FilterSectionProps {
  label: string
  count: number
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}

export default function FilterSection({ label, count, expanded, onToggle, children }: FilterSectionProps) {
  return (
    <div className="filter-section">
      <button type="button" className="filter-section-header" onClick={onToggle}>
        {label}
        {count > 0 ? ` (${count})` : ''} {expanded ? '▲' : '▼'}
      </button>
      {expanded && <div className="filter-section-body">{children}</div>}
    </div>
  )
}
