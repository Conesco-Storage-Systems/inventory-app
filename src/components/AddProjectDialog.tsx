import { useRef, useState } from 'react'
import { createProject } from '../db/projects'

interface AddProjectDialogProps {
  onCreated?: (projectId: string) => void
}

export default function AddProjectDialog({ onCreated }: AddProjectDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  function open() {
    setName('')
    dialogRef.current?.showModal()
  }

  function close() {
    dialogRef.current?.close()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const projectId = await createProject(name)
      close()
      onCreated?.(projectId)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" onClick={open}>
        + Add project
      </button>
      <dialog ref={dialogRef} className="location-dialog">
        <form onSubmit={handleSubmit}>
          <h2>Add project</h2>
          <label>
            Project name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <div className="dialog-actions">
            <button type="button" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()}>
              Save project
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
