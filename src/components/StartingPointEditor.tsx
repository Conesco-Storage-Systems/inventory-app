import { useState } from 'react'

interface StartingPointEditorProps {
  value: string
  onSave: (value: string) => void
}

// Starts in edit mode when there's nothing saved yet; once confirmed it
// shows as plain text, and clicking that text re-opens the editor.
export default function StartingPointEditor({ value, onSave }: StartingPointEditorProps) {
  const [editing, setEditing] = useState(!value)
  const [draft, setDraft] = useState(value)

  function startEditing() {
    setDraft(value)
    setEditing(true)
  }

  function handleConfirm() {
    onSave(draft.trim())
    setEditing(false)
  }

  return (
    <div className="starting-point-field">
      <span className="starting-point-label">Starting point</span>
      {editing ? (
        <div className="starting-point-edit-row">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. northeast corner, nearest the office"
            autoFocus
          />
          <button type="button" onClick={handleConfirm}>
            Confirm
          </button>
        </div>
      ) : (
        <p className="starting-point-value" onClick={startEditing}>
          {value}
        </p>
      )}
    </div>
  )
}
