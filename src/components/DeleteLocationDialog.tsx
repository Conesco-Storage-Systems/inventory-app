import { useEffect, useRef, useState } from 'react'
import { deleteSite } from '../db/locations'

const DELETE_PASSWORD = 'Conesco'

interface DeleteLocationDialogProps {
  siteId: string
  onClose: () => void
  onDeleted: () => void
}

export default function DeleteLocationDialog({ siteId, onClose, onDeleted }: DeleteLocationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState<'confirm' | 'password'>('confirm')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== DELETE_PASSWORD) {
      setError('Incorrect password.')
      return
    }
    setDeleting(true)
    try {
      await deleteSite(siteId)
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="location-dialog" onClose={onClose}>
      {step === 'confirm' ? (
        <div className="delete-confirm">
          <p>Are you sure you want to delete this location?</p>
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              Go Back
            </button>
            <button type="button" className="delete-confirm-button" onClick={() => setStep('password')}>
              Delete
            </button>
          </div>
        </div>
      ) : (
        <form className="delete-confirm" onSubmit={handlePasswordSubmit}>
          <p>Enter the password to confirm deletion.</p>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              autoFocus
            />
          </label>
          {error && <p className="field-error">{error}</p>}
          <div className="dialog-actions">
            <button type="button" onClick={onClose} disabled={deleting}>
              Go Back
            </button>
            <button type="submit" className="delete-confirm-button" disabled={deleting}>
              Delete
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
