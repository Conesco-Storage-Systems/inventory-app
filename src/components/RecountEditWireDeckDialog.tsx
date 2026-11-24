import { useEffect, useRef, useState } from 'react'
import DeleteConfirm from './DeleteConfirm'
import WireDeckForm, { CHANNEL_COUNT_OPTIONS, WIRE_DECK_STYLE_OPTIONS, type WireDeckDraft } from './WireDeckForm'
import type { WireDeckRow } from '../db/groupWireDecks'
import { addRecountLineItem, deleteRecountLineItemGroup, updateRecountLineItemGroup } from '../db/recounts'
import { CONDITIONS } from '../models/types'

function draftFromRow(row: WireDeckRow): WireDeckDraft {
  const knownChannelCount = (CHANNEL_COUNT_OPTIONS as readonly string[]).includes(row.channelCount)
  const knownStyles = row.style.filter((s) => (WIRE_DECK_STYLE_OPTIONS as readonly string[]).includes(s))
  const unknownStyles = row.style.filter((s) => !(WIRE_DECK_STYLE_OPTIONS as readonly string[]).includes(s))
  const knownCondition = (CONDITIONS as readonly string[]).includes(row.condition)

  return {
    length: String(row.length),
    width: String(row.width),
    channelCount: knownChannelCount ? row.channelCount : 'Other',
    channelCountOther: knownChannelCount ? '' : row.channelCount,
    style: unknownStyles.length > 0 ? [...knownStyles, 'Other'] : knownStyles,
    styleOther: unknownStyles.join(', '),
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

interface RecountEditWireDeckDialogProps {
  row: WireDeckRow
  recountId: string
  siteId: string
  mode: 'edit' | 'duplicate'
  onClose: () => void
}

export default function RecountEditWireDeckDialog({
  row,
  recountId,
  siteId,
  mode,
  onClose,
}: RecountEditWireDeckDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<WireDeckDraft>(() => draftFromRow(row))
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
      const channelCount = draft.channelCount === 'Other' ? draft.channelCountOther : draft.channelCount
      const style = draft.style.map((s) => (s === 'Other' ? draft.styleOther : s)).filter(Boolean)
      const condition = draft.condition === 'Other' ? draft.conditionOther : draft.condition

      const wireDeckFields = {
        quantity: Number(draft.quantity) || 0,
        condition,
        bundleSize: draft.bundleSize,
        zone: draft.zone,
        notes: draft.notes,
        length: draft.length,
        width: draft.width,
        channelCount,
        wireDeckStyle: style,
        costPer: Number(draft.costPer) || 0,
        sellPer: Number(draft.sellPer) || 0,
      }
      const irrelevantFields = {
        color: '',
        style: '',
        stamp: '',
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
        description: '',
        itemDescription: '',
      }

      if (mode === 'duplicate') {
        await addRecountLineItem({
          recountId,
          siteId,
          itemType: 'wireDeck',
          recordedBy: '',
          ...wireDeckFields,
          ...irrelevantFields,
          photoFiles: draft.photos,
        })
      } else {
        await updateRecountLineItemGroup({
          survivingId: row.ids[0],
          otherIds: row.ids.slice(1),
          recordedBy: '',
          ...wireDeckFields,
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
          <h2>{mode === 'duplicate' ? 'Duplicate wire deck line' : 'Edit wire deck line'}</h2>
          {mode === 'duplicate' && (
            <p className="existing-photos-note">Photos are not copied to the new line — add photos below if needed.</p>
          )}
          {mode === 'edit' && row.photoIds.length > 0 && (
            <p className="existing-photos-note">
              {row.photoIds.length} existing photo{row.photoIds.length === 1 ? '' : 's'} kept — add more below if
              needed.
            </p>
          )}
          <WireDeckForm value={draft} onChange={setDraft} siteId={siteId} />
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
