import { useRef, useState } from 'react'
import { createSite } from '../db/locations'

interface AddLocationDialogProps {
  onCreated?: (siteId: string) => void
  projectId?: string
  // Defaults match the original Offsite Locations page usage — a plain
  // button reading "+ Add location". The project page instead wants this
  // to read as a link, so both are overridable per call site.
  label?: string
  linkStyle?: boolean
}

export default function AddLocationDialog({
  onCreated,
  projectId,
  label = '+ Add location',
  linkStyle = false,
}: AddLocationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [otherInfo, setOtherInfo] = useState('')
  const [saving, setSaving] = useState(false)

  function open() {
    setName('')
    setAddress('')
    setOtherInfo('')
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
      const siteId = await createSite(name, address, otherInfo, projectId)
      close()
      onCreated?.(siteId)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" className={linkStyle ? 'link-button' : undefined} onClick={open}>
        {label}
      </button>
      <dialog ref={dialogRef} className="location-dialog">
        <form onSubmit={handleSubmit}>
          <h2>Add location</h2>
          <label>
            Offsite location name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            Address
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label>
            Other info
            <textarea
              value={otherInfo}
              onChange={(e) => setOtherInfo(e.target.value)}
              rows={3}
            />
          </label>
          <div className="dialog-actions">
            <button type="button" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()}>
              Save location
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
