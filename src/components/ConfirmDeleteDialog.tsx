import { useEffect, useRef, useState } from 'react'
import DeleteConfirm from './DeleteConfirm'

interface ConfirmDeleteDialogProps {
  onConfirm: () => Promise<void>
  onClose: () => void
  message?: string
}

export default function ConfirmDeleteDialog({ onConfirm, onClose, message }: ConfirmDeleteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  async function handleConfirm() {
    setDeleting(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="location-dialog" onClose={onClose}>
      <DeleteConfirm deleting={deleting} onConfirm={handleConfirm} onCancel={onClose} message={message} />
    </dialog>
  )
}
