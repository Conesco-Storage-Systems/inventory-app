interface SingleSelectCheckboxGroupProps {
  legend: string
  options: readonly string[]
  value: string
  onChange: (value: string) => void
}

// Same visual language as the multi-select checkbox fields (e.g. Wire Deck
// Style) but only one box can be checked at a time — checking one unchecks
// whichever was previously checked, and checking the already-checked one
// clears the selection.
export default function SingleSelectCheckboxGroup({
  legend,
  options,
  value,
  onChange,
}: SingleSelectCheckboxGroupProps) {
  return (
    <fieldset className="checkbox-fieldset">
      <legend>{legend}</legend>
      <div className="checkbox-options">
        {options.map((option) => (
          <label key={option} className="checkbox-option">
            <input
              type="checkbox"
              checked={value === option}
              onChange={() => onChange(value === option ? '' : option)}
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
