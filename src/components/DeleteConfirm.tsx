interface DeleteConfirmProps {
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}

export default function DeleteConfirm({ onConfirm, onCancel, deleting }: DeleteConfirmProps) {
  return (
    <div className="delete-confirm">
      <p>Are you sure you want to delete the line item?</p>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} disabled={deleting}>
          Go Back
        </button>
        <button type="button" className="delete-confirm-button" onClick={onConfirm} disabled={deleting}>
          Delete
        </button>
      </div>
    </div>
  )
}
