import { useEffect, useRef, useState } from 'react'
import DeleteConfirm from './DeleteConfirm'
import MiscItemForm, { MISC_ITEM_OPTIONS, type MiscItemDraft } from './MiscItemForm'
import type { MiscItemRow } from '../db/groupMiscItems'
import { createMiscItem, deleteMiscItemGroup, updateMiscItemGroup } from '../db/items'
import { CONDITIONS, type Condition } from '../models/types'

function draftFromRow(row: MiscItemRow): MiscItemDraft {
  const knownDescription = (MISC_ITEM_OPTIONS as readonly string[]).includes(row.description)
  const knownCondition = (CONDITIONS as readonly string[]).includes(row.condition)

  return {
    description: knownDescription ? row.description : 'Other',
    descriptionOther: knownDescription ? '' : row.description,
    itemDescription: row.itemDescription,
    condition: knownCondition ? row.condition : 'Other',
    conditionOther: knownCondition ? '' : row.condition,
    quantity: String(row.quantity),
    bundleSize: row.bundleSize,
    zone: row.zone,
    notes: row.notes,
    photos: [],
  }
}

interface EditMiscItemDialogProps {
  row: MiscItemRow
  siteId: string
  mode: 'edit' | 'duplicate'
  onClose: () => void
}

export default function EditMiscItemDialog({ row, siteId, mode, onClose }: EditMiscItemDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<MiscItemDraft>(() => draftFromRow(row))
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const ready = draft.condition !== '' && draft.quantity.trim() !== ''

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setSaving(true)
    try {
      const description = draft.description === 'Other' ? draft.descriptionOther : draft.description
      const condition = (draft.condition === 'Other' ? draft.conditionOther : draft.condition) as Condition

      if (mode === 'duplicate') {
        await createMiscItem({
          siteId,
          quantity: Number(draft.quantity) || 0,
          condition,
          bundleSize: draft.bundleSize,
          zone: draft.zone,
          notes: draft.notes,
          description,
          itemDescription: draft.itemDescription,
          photoFiles: draft.photos,
        })
      } else {
        await updateMiscItemGroup({
          survivingId: row.ids[0],
          otherIds: row.ids.slice(1),
          quantity: Number(draft.quantity) || 0,
          condition,
          bundleSize: draft.bundleSize,
          zone: draft.zone,
          notes: draft.notes,
          description,
          itemDescription: draft.itemDescription,
          existingPhotoIds: row.photoIds,
          newPhotoFiles: draft.photos,
        })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteMiscItemGroup(row.ids)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="location-dialog edit-item-dialog" onClose={onClose}>
      {confirmingDelete ? (
        <DeleteConfirm
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      ) : (
        <form onSubmit={handleSave}>
          <h2>{mode === 'duplicate' ? 'Duplicate item' : 'Edit item'}</h2>
          {mode === 'edit' && row.photoIds.length > 0 && (
            <p className="existing-photos-note">
              {row.photoIds.length} existing photo{row.photoIds.length === 1 ? '' : 's'} kept — add more
              below if needed.
            </p>
          )}
          <MiscItemForm value={draft} onChange={setDraft} siteId={siteId} />
          <div className="dialog-actions">
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            {mode === 'edit' && (
              <button type="button" className="delete-button" onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            )}
            <button type="submit" disabled={!ready || saving}>
              {mode === 'duplicate' ? 'Save New Item' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
