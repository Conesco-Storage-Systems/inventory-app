import { useEffect, useRef, useState } from 'react'
import { markSiteInactive } from '../db/locations'

interface MarkInactiveDialogProps {
  siteId: string
  onClose: () => void
  onDone: () => void
}

export default function MarkInactiveDialog({ siteId, onClose, onDone }: MarkInactiveDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  async function handleConfirm() {
    setSaving(true)
    try {
      await markSiteInactive(siteId)
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="location-dialog" onClose={onClose}>
      <div className="delete-confirm">
        <p>Are you sure you want to move this location to the inactive folder?</p>
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
