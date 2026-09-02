import { useEffect, useRef, useState } from 'react'
import { BEAM_COLOR_OPTIONS } from './BeamForm'
import DeleteConfirm from './DeleteConfirm'
import UprightForm, { GAUGE_OPTIONS, UPRIGHT_STYLE_OPTIONS, type UprightDraft } from './UprightForm'
import type { UprightRow } from '../db/groupUprights'
import { createUpright, deleteUprightGroup, updateUprightGroup } from '../db/items'
import type { Condition } from '../models/types'

function draftFromRow(row: UprightRow): UprightDraft {
  const knownColor = (BEAM_COLOR_OPTIONS as readonly string[]).includes(row.color)
  const knownStyle = (UPRIGHT_STYLE_OPTIONS as readonly string[]).includes(row.style)
  const knownGauge = (GAUGE_OPTIONS as readonly string[]).includes(row.gauge)

  return {
    photos: [],
    color: knownColor ? row.color : 'Other',
    colorOther: knownColor ? '' : row.color,
    style: knownStyle ? row.style : 'Other',
    styleOther: knownStyle ? '' : row.style,
    width: String(row.width),
    heightFeet: String(row.heightFeet),
    heightInches: String(row.heightInches),
    columnLength: String(row.columnLength),
    columnWidth: String(row.columnWidth),
    footplateLength: String(row.footplateLength),
    footplateWidth: String(row.footplateWidth),
    anchorHoleCount: String(row.anchorHoleCount),
    holeSize: row.holeSize,
    gauge: knownGauge ? row.gauge : 'Other',
    gaugeOther: knownGauge ? '' : row.gauge,
    condition: row.condition,
    quantity: String(row.quantity),
    stamp: row.stamp,
    bundleSize: row.bundleSize,
    notes: row.notes,
  }
}

interface EditUprightDialogProps {
  row: UprightRow
  siteId: string
  mode: 'edit' | 'duplicate'
  onClose: () => void
}

export default function EditUprightDialog({ row, siteId, mode, onClose }: EditUprightDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<UprightDraft>(() => draftFromRow(row))
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
      const gauge = draft.gauge === 'Other' ? draft.gaugeOther : draft.gauge

      if (mode === 'duplicate') {
        await createUpright({
          siteId,
          quantity: Number(draft.quantity) || 0,
          condition: draft.condition as Condition,
          bundleSize: draft.bundleSize,
          notes: draft.notes,
          color,
          style,
          width: Number(draft.width) || 0,
          heightFeet: Number(draft.heightFeet) || 0,
          heightInches: Number(draft.heightInches) || 0,
          columnLength: Number(draft.columnLength) || 0,
          columnWidth: Number(draft.columnWidth) || 0,
          footplateLength: Number(draft.footplateLength) || 0,
          footplateWidth: Number(draft.footplateWidth) || 0,
          anchorHoleCount: Number(draft.anchorHoleCount) || 0,
          holeSize: draft.holeSize,
          gauge,
          stamp: draft.stamp,
          photoFiles: draft.photos,
        })
      } else {
        await updateUprightGroup({
          survivingId: row.ids[0],
          otherIds: row.ids.slice(1),
          quantity: Number(draft.quantity) || 0,
          condition: draft.condition as Condition,
          bundleSize: draft.bundleSize,
          notes: draft.notes,
          color,
          style,
          width: Number(draft.width) || 0,
          heightFeet: Number(draft.heightFeet) || 0,
          heightInches: Number(draft.heightInches) || 0,
          columnLength: Number(draft.columnLength) || 0,
          columnWidth: Number(draft.columnWidth) || 0,
          footplateLength: Number(draft.footplateLength) || 0,
          footplateWidth: Number(draft.footplateWidth) || 0,
          anchorHoleCount: Number(draft.anchorHoleCount) || 0,
          holeSize: draft.holeSize,
          gauge,
          stamp: draft.stamp,
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
      await deleteUprightGroup(row.ids)
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
          <h2>{mode === 'duplicate' ? 'Duplicate upright' : 'Edit upright'}</h2>
          {mode === 'edit' && row.photoIds.length > 0 && (
            <p className="existing-photos-note">
              {row.photoIds.length} existing photo{row.photoIds.length === 1 ? '' : 's'} kept — add more
              below if needed.
            </p>
          )}
          <UprightForm value={draft} onChange={setDraft} siteId={siteId} />
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
