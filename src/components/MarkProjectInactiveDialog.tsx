import { useEffect, useRef, useState } from 'react'
import { markProjectInactive } from '../db/projects'

interface MarkProjectInactiveDialogProps {
  projectId: string
  onClose: () => void
  onDone: () => void
}

export default function MarkProjectInactiveDialog({
  projectId,
  onClose,
  onDone,
}: MarkProjectInactiveDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  async function handleConfirm() {
    setSaving(true)
    try {
      await markProjectInactive(projectId)
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="location-dialog" onClose={onClose}>
      <div className="delete-confirm">
        <p>Are you sure you want to move this project to the inactive folder?</p>
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
