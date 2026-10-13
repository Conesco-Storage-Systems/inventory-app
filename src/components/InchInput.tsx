interface InchInputProps {
  value: string
  onChange: (next: string) => void
}

export default function InchInput({ value, onChange }: InchInputProps) {
  return (
    <span className="inch-input">
      <input
        type="text"
        // No inputMode hint — "decimal" forces a numeric-only mobile
        // keyboard with no "/" key, making a fraction like "1-5/8"
        // impossible to type even though this field already stores free
        // text. The default (full) keyboard includes "/".
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/"/g, ''))}
      />
      <span className="inch-input-mark">&quot;</span>
    </span>
  )
}
