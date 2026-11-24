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
import { addRecountLineItem, deleteRecountLineItemGroup, updateRecountLineItemGroup } from '../db/recounts'
import { CONDITIONS } from '../models/types'

function draftFromRow(row: BeamRow): BeamDraft {
  const knownColor = (BEAM_COLOR_OPTIONS as readonly string[]).includes(row.color)
  const knownStyle = (BEAM_STYLE_OPTIONS as readonly string[]).includes(row.style)
  const knownPinCount = (BEAM_PIN_COUNT_OPTIONS as readonly string[]).includes(row.pinCount)
  const step = row.step ?? ''
  const knownStep = step === '' || (BEAM_STEP_OPTIONS as readonly string[]).includes(step)
  const knownCondition = (CONDITIONS as readonly string[]).includes(row.condition)

  return {
    length: row.length,
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

interface RecountEditBeamDialogProps {
  row: BeamRow
  recountId: string
  siteId: string
  mode: 'edit' | 'duplicate'
  onClose: () => void
}

export default function RecountEditBeamDialog({ row, recountId, siteId, mode, onClose }: RecountEditBeamDialogProps) {
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
      const condition = draft.condition === 'Other' ? draft.conditionOther : draft.condition

      const beamFields = {
        quantity: Number(draft.quantity) || 0,
        condition,
        bundleSize: draft.bundleSize,
        zone: draft.zone,
        notes: draft.notes,
        length: draft.length,
        width: draft.width,
        color,
        pinCount,
        stamp: draft.stamp,
        style,
        stickers: draft.stickers,
        step,
        costPer: Number(draft.costPer) || 0,
        sellPer: Number(draft.sellPer) || 0,
      }
      const irrelevantFields = {
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
        description: '',
        itemDescription: '',
      }

      if (mode === 'duplicate') {
        await addRecountLineItem({
          recountId,
          siteId,
          itemType: 'beam',
          recordedBy: '',
          ...beamFields,
          ...irrelevantFields,
          photoFiles: draft.photos,
        })
      } else {
        await updateRecountLineItemGroup({
          survivingId: row.ids[0],
          otherIds: row.ids.slice(1),
          recordedBy: '',
          ...beamFields,
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
          <h2>{mode === 'duplicate' ? 'Duplicate beam line' : 'Edit beam line'}</h2>
          {mode === 'duplicate' && (
            <p className="existing-photos-note">Photos are not copied to the new line — add photos below if needed.</p>
          )}
          {mode === 'edit' && row.photoIds.length > 0 && (
            <p className="existing-photos-note">
              {row.photoIds.length} existing photo{row.photoIds.length === 1 ? '' : 's'} kept — add more below if
              needed.
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
              {mode === 'duplicate' ? 'Save New Line' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
