import { useState } from 'react'
import DraggableField from './DraggableField'
import PhotoCapture from './PhotoCapture'
import { useFieldOrder } from '../hooks/useFieldOrder'
import { useSiteFieldOptions } from '../hooks/useSiteFieldOptions'
import { CONDITIONS } from '../models/types'

export const BEAM_COLOR_OPTIONS = ['Orange', 'Green', 'Blue', 'Gray', 'Other'] as const

export const BEAM_PIN_COUNT_OPTIONS = ['1', '2', '3', '4', '5', '6', 'TBOLT', 'N/A', 'Other'] as const

export const BEAM_STYLE_OPTIONS = ['Teardrop', 'New Style', 'TBOLT', 'Ridg-U-Rak', 'Other'] as const

export const BEAM_STEP_OPTIONS = ['1-5/8"', 'Other'] as const

export const STICKERS_OPTIONS = ['Yes', 'No'] as const

export interface BeamDraft {
  length: string
  width: string
  color: string
  colorOther: string
  pinCount: string
  pinCountOther: string
  stamp: string
  style: string
  styleOther: string
  stickers: string
  step: string
  stepOther: string
  condition: string
  conditionOther: string
  quantity: string
  bundleSize: string
  zone: string
  notes: string
  photos: File[]
}

export const emptyBeamDraft: BeamDraft = {
  length: '',
  width: '',
  color: '',
  colorOther: '',
  pinCount: '',
  pinCountOther: '',
  stamp: '',
  style: '',
  styleOther: '',
  stickers: '',
  step: '',
  stepOther: '',
  condition: '',
  conditionOther: '',
  quantity: '',
  bundleSize: '',
  zone: '',
  notes: '',
  photos: [],
}

type BeamFieldKey =
  | 'length'
  | 'width'
  | 'color'
  | 'pinCount'
  | 'stamp'
  | 'style'
  | 'stickers'
  | 'step'
  | 'condition'
  | 'quantity'
  | 'bundleSize'
  | 'zone'
  | 'notes'
  | 'photos'

const DEFAULT_BEAM_FIELD_ORDER: BeamFieldKey[] = [
  'photos',
  'length',
  'width',
  'color',
  'pinCount',
  'stamp',
  'style',
  'stickers',
  'step',
  'condition',
  'quantity',
  'bundleSize',
  'zone',
  'notes',
]

interface BeamFormProps {
  value: BeamDraft
  onChange: (next: BeamDraft) => void
  siteId?: string
}

export default function BeamForm({ value, onChange, siteId }: BeamFormProps) {
  const { order, locked, setLocked, moveField } = useFieldOrder<BeamFieldKey>(
    'beamFieldOrder',
    DEFAULT_BEAM_FIELD_ORDER,
    { photos: 'start', notes: 'end' },
  )
  const [draggingKey, setDraggingKey] = useState<BeamFieldKey | null>(null)

  const colorOptions = useSiteFieldOptions(siteId, 'color', BEAM_COLOR_OPTIONS)
  const styleOptions = useSiteFieldOptions(siteId, 'beamStyle', BEAM_STYLE_OPTIONS)

  const fields: Record<BeamFieldKey, React.ReactNode> = {
    length: (
      <label>
        Length
        <div className="input-with-unit">
          <input
            type="number"
            inputMode="decimal"
            value={value.length}
            onChange={(e) => onChange({ ...value, length: e.target.value })}
          />
          <span className="unit">Inches</span>
        </div>
      </label>
    ),
    width: (
      <label>
        Width
        <div className="input-with-unit">
          <input
            type="text"
            placeholder="e.g. 4 or 3.5-4.5"
            value={value.width}
            onChange={(e) => onChange({ ...value, width: e.target.value })}
          />
          <span className="unit">Inches</span>
        </div>
      </label>
    ),
    color: (
      <>
        <label>
          Color
          <select value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })}>
            <option value="" disabled>
              Select a color…
            </option>
            {colorOptions.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </select>
        </label>
        {value.color === 'Other' && (
          <input
            type="text"
            value={value.colorOther}
            onChange={(e) => onChange({ ...value, colorOther: e.target.value })}
            className="other-input"
          />
        )}
      </>
    ),
    pinCount: (
      <>
        <label>
          Pin Count
          <select
            value={value.pinCount}
            onChange={(e) => onChange({ ...value, pinCount: e.target.value })}
          >
            <option value="" disabled>
              Select pin count…
            </option>
            {BEAM_PIN_COUNT_OPTIONS.map((pinCount) => (
              <option key={pinCount} value={pinCount}>
                {pinCount}
              </option>
            ))}
          </select>
        </label>
        {value.pinCount === 'Other' && (
          <input
            type="text"
            placeholder="e.g. 2-3 pins"
            value={value.pinCountOther}
            onChange={(e) => onChange({ ...value, pinCountOther: e.target.value })}
            className="other-input"
          />
        )}
      </>
    ),
    stamp: (
      <label>
        Stamp
        <input
          type="text"
          value={value.stamp}
          onChange={(e) => onChange({ ...value, stamp: e.target.value })}
        />
      </label>
    ),
    style: (
      <>
        <label>
          Style
          <select value={value.style} onChange={(e) => onChange({ ...value, style: e.target.value })}>
            <option value="" disabled>
              Select a style…
            </option>
            {styleOptions.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>
        </label>
        {value.style === 'Other' && (
          <input
            type="text"
            value={value.styleOther}
            onChange={(e) => onChange({ ...value, styleOther: e.target.value })}
            className="other-input"
          />
        )}
      </>
    ),
    step: (
      <div className="option-box-field">
        <span className="option-box-label">Step</span>
        <div className="option-box-group">
          {BEAM_STEP_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`option-box${value.step === option ? ' option-box--selected' : ''}`}
              onClick={() => onChange({ ...value, step: option })}
            >
              {option}
            </button>
          ))}
        </div>
        {value.step === 'Other' && (
          <input
            type="text"
            placeholder="Enter step"
            value={value.stepOther}
            onChange={(e) => onChange({ ...value, stepOther: e.target.value })}
            className="other-input"
          />
        )}
      </div>
    ),
    stickers: (
      <label>
        Stickers
        <select
          value={value.stickers}
          onChange={(e) => onChange({ ...value, stickers: e.target.value })}
        >
          <option value="" disabled>
            Select…
          </option>
          {STICKERS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    ),
    condition: (
      <>
        <label>
          Condition
          <select
            value={value.condition}
            onChange={(e) => onChange({ ...value, condition: e.target.value })}
          >
            <option value="" disabled>
              Select condition…
            </option>
            {CONDITIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {value.condition === 'Other' && (
          <input
            type="text"
            placeholder="Enter condition"
            value={value.conditionOther}
            onChange={(e) => onChange({ ...value, conditionOther: e.target.value })}
            className="other-input"
          />
        )}
      </>
    ),
    quantity: (
      <label>
        Quantity
        <input
          type="number"
          inputMode="numeric"
          value={value.quantity}
          onChange={(e) => onChange({ ...value, quantity: e.target.value })}
        />
      </label>
    ),
    bundleSize: (
      <label>
        Bundle Size
        <input
          type="text"
          value={value.bundleSize}
          onChange={(e) => onChange({ ...value, bundleSize: e.target.value })}
        />
      </label>
    ),
    zone: (
      <label>
        Zone
        <input
          type="text"
          value={value.zone}
          onChange={(e) => onChange({ ...value, zone: e.target.value })}
        />
      </label>
    ),
    notes: (
      <label>
        Notes
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          rows={3}
        />
      </label>
    ),
    photos: (
      <div className="photos-field">
        <span className="photos-label">Photos</span>
        <PhotoCapture files={value.photos} onChange={(photos) => onChange({ ...value, photos })} />
      </div>
    ),
  }

  return (
    <>
      <div className="field-order-toolbar">
        <button type="button" onClick={() => setLocked(!locked)}>
          {locked ? 'Reorder fields' : 'Lock order'}
        </button>
        {!locked && <span className="field-order-hint">Drag a section by its handle to reorder.</span>}
      </div>

      {order.map((key) => (
        <DraggableField
          key={key}
          fieldKey={key}
          draggable={!locked}
          isDragging={draggingKey === key}
          onDragStartKey={(k) => setDraggingKey(k as BeamFieldKey)}
          onDragOverKey={(k) => {
            if (draggingKey) moveField(draggingKey, k as BeamFieldKey)
          }}
          onDragEnd={() => setDraggingKey(null)}
        >
          {fields[key]}
        </DraggableField>
      ))}
    </>
  )
}
