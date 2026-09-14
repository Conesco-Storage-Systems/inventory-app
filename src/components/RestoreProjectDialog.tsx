import { useEffect, useRef, useState } from 'react'
import { restoreProject } from '../db/projects'

interface RestoreProjectDialogProps {
  projectId: string
  projectName: string
  onClose: () => void
  onDone: () => void
}

export default function RestoreProjectDialog({
  projectId,
  projectName,
  onClose,
  onDone,
}: RestoreProjectDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  async function handleConfirm() {
    setSaving(true)
    try {
      await restoreProject(projectId)
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="location-dialog" onClose={onClose}>
      <div className="delete-confirm">
        <p>Restore {projectName}? It will show up in Projects again exactly as it was.</p>
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
