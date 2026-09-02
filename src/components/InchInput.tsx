interface InchInputProps {
  value: string
  onChange: (next: string) => void
}

export default function InchInput({ value, onChange }: InchInputProps) {
  return (
    <span className="inch-input">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/"/g, ''))}
      />
      <span className="inch-input-mark">&quot;</span>
    </span>
  )
}
