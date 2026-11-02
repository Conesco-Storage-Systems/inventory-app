import { useEffect, useRef, useState } from 'react'
import { deletePhoto } from '../db/items'

interface DeletePhotoDialogProps {
  photoId: string
  onClose: () => void
  onDeleted: () => void
}

export default function DeletePhotoDialog({ photoId, onClose, onDeleted }: DeletePhotoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  async function handleDelete() {
    setDeleting(true)
    try {
      await deletePhoto(photoId)
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="location-dialog" onClose={onClose}>
      <div className="delete-confirm">
        <p>Are you sure you'd like to permanently delete this photo from the line item?</p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button type="button" className="delete-confirm-button" onClick={handleDelete} disabled={deleting}>
            Delete
          </button>
        </div>
      </div>
    </dialog>
  )
}
