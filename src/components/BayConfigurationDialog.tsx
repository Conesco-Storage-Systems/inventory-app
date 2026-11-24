import { useRef, useState } from 'react'
import InchInput from './InchInput'
import { createBayConfiguration, updateBayConfiguration } from '../db/bayConfigurations'
import type { BayConfiguration } from '../models/types'
import { CONDITIONS } from '../models/types'

type BayConfigurationFields = Omit<BayConfiguration, 'id' | 'standingCountId' | 'createdAt' | 'updatedAt'>

const BLANK: BayConfigurationFields = {
  name: '',
  upright: {
    style: '',
    width: '',
    height: '',
    columnLength: '',
    columnWidth: '',
    footplateLength: '',
    footplateWidth: '',
    footplateThickness: '',
    anchorHoleCount: '',
    holeSize: '',
    gauge: '',
    color: '',
    condition: '',
  },
  beam: {
    levelCount: '',
    length: '',
    step: '',
    color: '',
    pinCount: '',
    style: '',
    stickers: '',
    condition: '',
  },
  deck: {
    decksPerLevel: '',
    length: '',
    width: '',
    channelCount: '',
    style: '',
    condition: '',
  },
}

interface BayConfigurationDialogProps {
  standingCountId: string
  existing?: BayConfiguration
  onSaved?: (id: string) => void
  // Defaults match the "create" usage — a plain button reading "Create Bay
  // Configuration". The per-row "edit" usage overrides this to "Edit".
  label?: string
}

export default function BayConfigurationDialog({
  standingCountId,
  existing,
  onSaved,
  label = 'Create Bay Configuration',
}: BayConfigurationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<BayConfigurationFields>(existing ?? BLANK)
  const [saving, setSaving] = useState(false)

  function open() {
    setDraft(existing ?? BLANK)
    dialogRef.current?.showModal()
  }

  function close() {
    dialogRef.current?.close()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) return
    setSaving(true)
    try {
      let id: string
      if (existing) {
        await updateBayConfiguration(existing.id, draft)
        id = existing.id
      } else {
        id = await createBayConfiguration(standingCountId, draft)
      }
      close()
      onSaved?.(id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" onClick={open}>
        {label}
      </button>
      <dialog ref={dialogRef} className="location-dialog">
        <form onSubmit={handleSubmit}>
          <h2>{existing ? 'Edit Bay Configuration' : 'Create Bay Configuration'}</h2>

          <label>
            Configuration Name
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={`e.g. "8' Red Teardrop bays"`}
              required
              autoFocus
            />
          </label>

          <fieldset>
            <legend>Upright</legend>
            <label>
              Style
              <input
                type="text"
                value={draft.upright.style}
                onChange={(e) => setDraft({ ...draft, upright: { ...draft.upright, style: e.target.value } })}
              />
            </label>
            <label>
              Width
              <input
                type="text"
                value={draft.upright.width}
                onChange={(e) => setDraft({ ...draft, upright: { ...draft.upright, width: e.target.value } })}
              />
            </label>
            <label>
              Height
              <input
                type="text"
                value={draft.upright.height}
                onChange={(e) => setDraft({ ...draft, upright: { ...draft.upright, height: e.target.value } })}
              />
            </label>
            <label>
              Column Size
              <div className="dimension-pair">
                <InchInput
                  value={draft.upright.columnLength}
                  onChange={(columnLength) => setDraft({ ...draft, upright: { ...draft.upright, columnLength } })}
                />
                <span className="dimension-x">x</span>
                <InchInput
                  value={draft.upright.columnWidth}
                  onChange={(columnWidth) => setDraft({ ...draft, upright: { ...draft.upright, columnWidth } })}
                />
              </div>
            </label>
            <label>
              Footplate Size
              <div className="dimension-pair">
                <InchInput
                  value={draft.upright.footplateLength}
                  onChange={(footplateLength) =>
                    setDraft({ ...draft, upright: { ...draft.upright, footplateLength } })
                  }
                />
                <span className="dimension-x">x</span>
                <InchInput
                  value={draft.upright.footplateWidth}
                  onChange={(footplateWidth) =>
                    setDraft({ ...draft, upright: { ...draft.upright, footplateWidth } })
                  }
                />
              </div>
            </label>
            <label>
              Footplate Thickness
              <input
                type="text"
                value={draft.upright.footplateThickness}
                onChange={(e) =>
                  setDraft({ ...draft, upright: { ...draft.upright, footplateThickness: e.target.value } })
                }
              />
            </label>
            <label>
              Anchor Holes
              <input
                type="text"
                value={draft.upright.anchorHoleCount}
                onChange={(e) =>
                  setDraft({ ...draft, upright: { ...draft.upright, anchorHoleCount: e.target.value } })
                }
              />
            </label>
            <label>
              Hole Size
              <InchInput
                value={draft.upright.holeSize}
                onChange={(holeSize) => setDraft({ ...draft, upright: { ...draft.upright, holeSize } })}
              />
            </label>
            <label>
              Gauge
              <input
                type="text"
                value={draft.upright.gauge}
                onChange={(e) => setDraft({ ...draft, upright: { ...draft.upright, gauge: e.target.value } })}
              />
            </label>
            <label>
              Color
              <input
                type="text"
                value={draft.upright.color}
                onChange={(e) => setDraft({ ...draft, upright: { ...draft.upright, color: e.target.value } })}
              />
            </label>
            <label>
              Condition
              <select
                value={draft.upright.condition}
                onChange={(e) => setDraft({ ...draft, upright: { ...draft.upright, condition: e.target.value } })}
              >
                <option value="">Select…</option>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend>Beam</legend>
            <label>
              Levels per Bay
              <input
                type="number"
                inputMode="numeric"
                value={draft.beam.levelCount}
                onChange={(e) => setDraft({ ...draft, beam: { ...draft.beam, levelCount: e.target.value } })}
              />
            </label>
            <label>
              Length
              <input
                type="text"
                value={draft.beam.length}
                onChange={(e) => setDraft({ ...draft, beam: { ...draft.beam, length: e.target.value } })}
              />
            </label>
            <label>
              Step
              <input
                type="text"
                value={draft.beam.step}
                onChange={(e) => setDraft({ ...draft, beam: { ...draft.beam, step: e.target.value } })}
              />
            </label>
            <label>
              Color
              <input
                type="text"
                value={draft.beam.color}
                onChange={(e) => setDraft({ ...draft, beam: { ...draft.beam, color: e.target.value } })}
              />
            </label>
            <label>
              Pin Count
              <input
                type="text"
                value={draft.beam.pinCount}
                onChange={(e) => setDraft({ ...draft, beam: { ...draft.beam, pinCount: e.target.value } })}
              />
            </label>
            <label>
              Style
              <input
                type="text"
                value={draft.beam.style}
                onChange={(e) => setDraft({ ...draft, beam: { ...draft.beam, style: e.target.value } })}
              />
            </label>
            <label>
              Stickers
              <select
                value={draft.beam.stickers}
                onChange={(e) => setDraft({ ...draft, beam: { ...draft.beam, stickers: e.target.value } })}
              >
                <option value="">Select…</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>
            <label>
              Condition
              <select
                value={draft.beam.condition}
                onChange={(e) => setDraft({ ...draft, beam: { ...draft.beam, condition: e.target.value } })}
              >
                <option value="">Select…</option>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend>Wire Deck</legend>
            <label>
              Decks per Level
              <input
                type="number"
                inputMode="numeric"
                value={draft.deck.decksPerLevel}
                onChange={(e) => setDraft({ ...draft, deck: { ...draft.deck, decksPerLevel: e.target.value } })}
              />
            </label>
            <label>
              Length
              <input
                type="text"
                value={draft.deck.length}
                onChange={(e) => setDraft({ ...draft, deck: { ...draft.deck, length: e.target.value } })}
              />
            </label>
            <label>
              Width
              <input
                type="text"
                value={draft.deck.width}
                onChange={(e) => setDraft({ ...draft, deck: { ...draft.deck, width: e.target.value } })}
              />
            </label>
            <label>
              Channel Count
              <input
                type="text"
                value={draft.deck.channelCount}
                onChange={(e) => setDraft({ ...draft, deck: { ...draft.deck, channelCount: e.target.value } })}
              />
            </label>
            <label>
              Style
              <input
                type="text"
                value={draft.deck.style}
                onChange={(e) => setDraft({ ...draft, deck: { ...draft.deck, style: e.target.value } })}
              />
            </label>
            <label>
              Condition
              <select
                value={draft.deck.condition}
                onChange={(e) => setDraft({ ...draft, deck: { ...draft.deck, condition: e.target.value } })}
              >
                <option value="">Select…</option>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <div className="dialog-actions">
            <button type="button" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !draft.name.trim()}>
              Save Configuration
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
