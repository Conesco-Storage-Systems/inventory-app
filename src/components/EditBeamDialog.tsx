import { useEffect, useRef, useState } from 'react'
import BeamForm, {
  BEAM_COLOR_OPTIONS,
  BEAM_PIN_COUNT_OPTIONS,
  BEAM_STEP_OPTIONS,
  BEAM_STYLE_OPTIONS,
  type BeamDraft,
} from './BeamForm'
import DeleteConfirm from './DeleteConfirm'
import type { BeamRow } from '../db/groupBeams'
import { createBeam, deleteBeamGroup, updateBeamGroup } from '../db/items'
import type { Condition } from '../models/types'

function draftFromRow(row: BeamRow): BeamDraft {
  const knownColor = (BEAM_COLOR_OPTIONS as readonly string[]).includes(row.color)
  const knownStyle = (BEAM_STYLE_OPTIONS as readonly string[]).includes(row.style)
  const knownPinCount = (BEAM_PIN_COUNT_OPTIONS as readonly string[]).includes(row.pinCount)
  const step = row.step ?? ''
  const knownStep = step === '' || (BEAM_STEP_OPTIONS as readonly string[]).includes(step)

  return {
    length: String(row.length),
    width: row.width,
    color: knownColor ? row.color : 'Other',
    colorOther: knownColor ? '' : row.color,
    pinCount: knownPinCount ? row.pinCount : 'Other',
    pinCountOther: knownPinCount ? '' : row.pinCount,
    stamp: row.stamp,
    style: knownStyle ? row.style : 'Other',
    styleOther: knownStyle ? '' : row.style,
    stickers: row.stickers,
    step: knownStep ? step : 'Other',
    stepOther: knownStep ? '' : step,
    condition: row.condition,
    quantity: String(row.quantity),
    bundleSize: row.bundleSize,
    zone: row.zone,
    notes: row.notes,
    photos: [],
  }
}

interface EditBeamDialogProps {
  row: BeamRow
  siteId: string
  mode: 'edit' | 'duplicate'
  onClose: () => void
}

export default function EditBeamDialog({ row, siteId, mode, onClose }: EditBeamDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<BeamDraft>(() => draftFromRow(row))
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
      const color = draft.color === 'Other' ? draft.colorOther : draft.color
      const style = draft.style === 'Other' ? draft.styleOther : draft.style
      const pinCount = draft.pinCount === 'Other' ? draft.pinCountOther : draft.pinCount
      const step = draft.step === 'Other' ? draft.stepOther : draft.step

      if (mode === 'duplicate') {
        await createBeam({
          siteId,
          quantity: Number(draft.quantity) || 0,
          condition: draft.condition as Condition,
          bundleSize: draft.bundleSize,
          zone: draft.zone,
          notes: draft.notes,
          length: Number(draft.length) || 0,
          width: draft.width,
          color,
          pinCount,
          stamp: draft.stamp,
          style,
          stickers: draft.stickers,
          step,
          photoFiles: draft.photos,
        })
      } else {
        await updateBeamGroup({
          survivingId: row.ids[0],
          otherIds: row.ids.slice(1),
          quantity: Number(draft.quantity) || 0,
          condition: draft.condition as Condition,
          bundleSize: draft.bundleSize,
          zone: draft.zone,
          notes: draft.notes,
          length: Number(draft.length) || 0,
          width: draft.width,
          color,
          pinCount,
          stamp: draft.stamp,
          style,
          stickers: draft.stickers,
          step,
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
      await deleteBeamGroup(row.ids)
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
          <h2>{mode === 'duplicate' ? 'Duplicate beam' : 'Edit beam'}</h2>
          {mode === 'edit' && row.photoIds.length > 0 && (
            <p className="existing-photos-note">
              {row.photoIds.length} existing photo{row.photoIds.length === 1 ? '' : 's'} kept — add more
              below if needed.
            </p>
          )}
          <BeamForm value={draft} onChange={setDraft} siteId={siteId} />
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
