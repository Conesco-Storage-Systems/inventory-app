interface FilterOptionListProps {
  options: string[]
  selected: Set<string>
  onToggle: (option: string) => void
}

export default function FilterOptionList({ options, selected, onToggle }: FilterOptionListProps) {
  if (options.length === 0) {
    return <p className="filter-menu-empty">No options yet</p>
  }

  return (
    <div className="filter-checkbox-options">
      {options.map((option) => (
        <label key={option} className="filter-checkbox-option">
          <input type="checkbox" checked={selected.has(option)} onChange={() => onToggle(option)} />
          {option}
        </label>
      ))}
    </div>
  )
}
