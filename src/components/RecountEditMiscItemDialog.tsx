import { useEffect, useRef, useState } from 'react'
import DeleteConfirm from './DeleteConfirm'
import MiscItemForm, { MISC_ITEM_OPTIONS, type MiscItemDraft } from './MiscItemForm'
import type { MiscItemRow } from '../db/groupMiscItems'
import { addRecountLineItem, deleteRecountLineItemGroup, updateRecountLineItemGroup } from '../db/recounts'
import { CONDITIONS } from '../models/types'

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
    costPer: row.costPer ? String(row.costPer) : '',
    sellPer: row.sellPer ? String(row.sellPer) : '',
    photos: [],
  }
}

interface RecountEditMiscItemDialogProps {
  row: MiscItemRow
  recountId: string
  siteId: string
  mode: 'edit' | 'duplicate'
  onClose: () => void
}

export default function RecountEditMiscItemDialog({
  row,
  recountId,
  siteId,
  mode,
  onClose,
}: RecountEditMiscItemDialogProps) {
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
      const condition = draft.condition === 'Other' ? draft.conditionOther : draft.condition

      const miscFields = {
        quantity: Number(draft.quantity) || 0,
        condition,
        bundleSize: draft.bundleSize,
        zone: draft.zone,
        notes: draft.notes,
        description,
        itemDescription: draft.itemDescription,
        costPer: Number(draft.costPer) || 0,
        sellPer: Number(draft.sellPer) || 0,
      }
      const irrelevantFields = {
        color: '',
        style: '',
        stamp: '',
        length: '',
        width: '',
        pinCount: '',
        stickers: '',
        step: '',
        height: '',
        columnLength: '',
        columnWidth: '',
        footplateLength: '',
        footplateWidth: '',
        footplateThickness: '',
        anchorHoleCount: '',
        holeSize: '',
        gauge: '',
        channelCount: '',
        wireDeckStyle: [],
      }

      if (mode === 'duplicate') {
        await addRecountLineItem({
          recountId,
          siteId,
          itemType: 'misc',
          recordedBy: '',
          ...miscFields,
          ...irrelevantFields,
          photoFiles: draft.photos,
        })
      } else {
        await updateRecountLineItemGroup({
          survivingId: row.ids[0],
          otherIds: row.ids.slice(1),
          recordedBy: '',
          ...miscFields,
          ...irrelevantFields,
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
      await deleteRecountLineItemGroup(row.ids)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="location-dialog edit-item-dialog" onClose={onClose}>
      {confirmingDelete ? (
        <DeleteConfirm deleting={deleting} onConfirm={handleDelete} onCancel={() => setConfirmingDelete(false)} />
      ) : (
        <form onSubmit={handleSave}>
          <h2>{mode === 'duplicate' ? 'Duplicate line' : 'Edit line'}</h2>
          {mode === 'duplicate' && (
            <p className="existing-photos-note">Photos are not copied to the new line — add photos below if needed.</p>
          )}
          {mode === 'edit' && row.photoIds.length > 0 && (
            <p className="existing-photos-note">
              {row.photoIds.length} existing photo{row.photoIds.length === 1 ? '' : 's'} kept — add more below if
              needed.
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
              {mode === 'duplicate' ? 'Save New Line' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
