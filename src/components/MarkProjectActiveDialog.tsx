import { useEffect, useRef, useState } from 'react'
import { markProjectActive } from '../db/projects'

interface MarkProjectActiveDialogProps {
  projectId: string
  onClose: () => void
  onDone: () => void
}

export default function MarkProjectActiveDialog({
  projectId,
  onClose,
  onDone,
}: MarkProjectActiveDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  async function handleConfirm() {
    setSaving(true)
    try {
      await markProjectActive(projectId)
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="location-dialog" onClose={onClose}>
      <div className="delete-confirm">
        <p>Are you sure you want to set this project to active?</p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            No
          </button>
          <button type="button" onClick={handleConfirm} disabled={saving}>
            Yes
          </button>
        </div>
      </div>
    </dialog>
  )
}
