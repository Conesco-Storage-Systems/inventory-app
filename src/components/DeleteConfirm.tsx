interface DeleteConfirmProps {
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
  message?: string
  confirmLabel?: string
  confirmingLabel?: string
}

export default function DeleteConfirm({
  onConfirm,
  onCancel,
  deleting,
  message,
  confirmLabel,
  confirmingLabel,
}: DeleteConfirmProps) {
  return (
    <div className="delete-confirm">
      <p>{message ?? 'Are you sure you want to delete the line item?'}</p>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} disabled={deleting}>
          Go Back
        </button>
        <button type="button" className="delete-confirm-button" onClick={onConfirm} disabled={deleting}>
          {deleting ? (confirmingLabel ?? 'Deleting…') : (confirmLabel ?? 'Delete')}
        </button>
      </div>
    </div>
  )
}
