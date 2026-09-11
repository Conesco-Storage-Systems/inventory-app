import { useEffect, useRef, useState } from 'react'
import { restoreSite } from '../db/locations'

interface RestoreSiteDialogProps {
  siteId: string
  siteName: string
  onClose: () => void
  onDone: () => void
}

export default function RestoreSiteDialog({ siteId, siteName, onClose, onDone }: RestoreSiteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  async function handleConfirm() {
    setSaving(true)
    try {
      await restoreSite(siteId)
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="location-dialog" onClose={onClose}>
      <div className="delete-confirm">
        <p>Restore {siteName}? It will show up in Locations again exactly as it was.</p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={saving}>
            Restore
          </button>
        </div>
      </div>
    </dialog>
  )
}
