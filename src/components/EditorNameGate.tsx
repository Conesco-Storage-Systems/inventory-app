import { useState, type ReactNode } from 'react'
import { getEditorName, setEditorName } from '../state/editor'

export default function EditorNameGate({ children }: { children: ReactNode }) {
  const [confirmed, setConfirmed] = useState(false)
  const [name, setName] = useState(() => getEditorName())

  if (confirmed) return <>{children}</>

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setEditorName(name)
    setConfirmed(true)
  }

  return (
    <div className="editor-gate-overlay">
      <form className="editor-gate-panel" onSubmit={handleSubmit}>
        <h2>Who's counting?</h2>
        <p>Enter your name so edits can be attributed.</p>
        <label>
          Your name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </label>
        <button type="submit" disabled={!name.trim()}>
          Continue
        </button>
      </form>
    </div>
  )
}
