import { useRef, useState } from 'react'
import { computeRowMaterials } from '../db/computeRowMaterials'
import { updateRackRowSegments } from '../db/rackRows'
import type { BayConfiguration, RackRow } from '../models/types'

interface Segment {
  bayConfigId: string
  bayCount: number
}

function blankSegment(firstConfigId: string): Segment {
  return { bayConfigId: firstConfigId, bayCount: 1 }
}

interface RackRowDialogProps {
  bayConfigurations: BayConfiguration[]
  existing: RackRow
  label?: string
}

// Edits the bay-by-bay makeup of an already-created row (name and starting
// point are set directly on the row's own card — see StandingRackingDetail).
export default function RackRowDialog({ bayConfigurations, existing, label = 'Add Bays' }: RackRowDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const firstConfigId = bayConfigurations[0]?.id ?? ''
  const [segments, setSegments] = useState<Segment[]>([])
  const [transitionOverrides, setTransitionOverrides] = useState<number[]>([])
  const [saving, setSaving] = useState(false)

  function open() {
    setSegments(existing.segments.length > 0 ? existing.segments : firstConfigId ? [blankSegment(firstConfigId)] : [])
    setTransitionOverrides(existing.transitionOverrides)
    dialogRef.current?.showModal()
  }

  function close() {
    dialogRef.current?.close()
  }

  function addSegment() {
    if (!firstConfigId) return
    setSegments([...segments, blankSegment(firstConfigId)])
  }

  function removeSegment(index: number) {
    setSegments(segments.filter((_, i) => i !== index))
    // Boundary indices shift down by one past the removed segment, and the
    // two boundaries touching it (if any) no longer exist.
    setTransitionOverrides(
      transitionOverrides
        .filter((boundary) => boundary !== index - 1 && boundary !== index)
        .map((boundary) => (boundary > index ? boundary - 1 : boundary)),
    )
  }

  function updateSegment(index: number, fields: Partial<Segment>) {
    setSegments(segments.map((seg, i) => (i === index ? { ...seg, ...fields } : seg)))
  }

  function toggleTransition(boundary: number) {
    setTransitionOverrides(
      transitionOverrides.includes(boundary)
        ? transitionOverrides.filter((b) => b !== boundary)
        : [...transitionOverrides, boundary],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (segments.length === 0) return
    setSaving(true)
    try {
      await updateRackRowSegments(existing.id, { name: existing.name, segments, transitionOverrides })
      close()
    } finally {
      setSaving(false)
    }
  }

  const configsById = new Map(bayConfigurations.map((c) => [c.id, c]))
  const previewRow: RackRow = { ...existing, segments, transitionOverrides }
  const totals = computeRowMaterials(previewRow, configsById)

  return (
    <>
      <button type="button" onClick={open} disabled={bayConfigurations.length === 0}>
        {label}
      </button>
      <dialog ref={dialogRef} className="location-dialog">
        <form onSubmit={handleSubmit}>
          <h2>{existing.name} — Bays</h2>

          <fieldset>
            <legend>Bays</legend>
            {segments.map((segment, index) => (
              <div key={index}>
                <div className="dimension-pair">
                  <select
                    value={segment.bayConfigId}
                    onChange={(e) => updateSegment(index, { bayConfigId: e.target.value })}
                  >
                    {bayConfigurations.map((config) => (
                      <option key={config.id} value={config.id}>
                        {config.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={segment.bayCount}
                    onChange={(e) => updateSegment(index, { bayCount: Number(e.target.value) || 1 })}
                  />
                  <button type="button" onClick={() => removeSegment(index)}>
                    Remove
                  </button>
                </div>

                {index < segments.length - 1 && (
                  <label>
                    Shared frame between this and the next segment uses:
                    <select
                      value={transitionOverrides.includes(index) ? 'before' : 'after'}
                      onChange={(e) => {
                        const wantsBefore = e.target.value === 'before'
                        const alreadyBefore = transitionOverrides.includes(index)
                        if (wantsBefore !== alreadyBefore) toggleTransition(index)
                      }}
                    >
                      <option value="after">
                        {bayConfigurations.find((c) => c.id === segments[index + 1]?.bayConfigId)?.name ??
                          'Next configuration'}
                      </option>
                      <option value="before">
                        {bayConfigurations.find((c) => c.id === segment.bayConfigId)?.name ?? 'This configuration'}
                      </option>
                    </select>
                  </label>
                )}
              </div>
            ))}
            <button type="button" onClick={addSegment}>
              + Add Bays
            </button>
          </fieldset>

          {segments.length > 0 && (
            <fieldset>
              <legend>Computed Totals</legend>
              <p>
                Uprights: {totals.uprights.reduce((sum, t) => sum + t.count, 0)} (
                {totals.uprights.map((t) => `${t.count} ${t.config.name}`).join(', ')})
              </p>
              <p>
                Beams: {totals.beams.reduce((sum, t) => sum + t.count, 0)} (
                {totals.beams.map((t) => `${t.count} ${t.config.name}`).join(', ')})
              </p>
              <p>
                Wire Decks: {totals.decks.reduce((sum, t) => sum + t.count, 0)} (
                {totals.decks.map((t) => `${t.count} ${t.config.name}`).join(', ')})
              </p>
            </fieldset>
          )}

          <div className="dialog-actions">
            <button type="button" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || segments.length === 0}>
              Save Row
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
