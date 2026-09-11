import { useState } from 'react'
import { BEAM_COLOR_OPTIONS } from './BeamForm'
import DraggableField from './DraggableField'
import InchInput from './InchInput'
import PhotoCapture from './PhotoCapture'
import { useFieldOrder } from '../hooks/useFieldOrder'
import { useSiteFieldOptions } from '../hooks/useSiteFieldOptions'
import { CONDITIONS } from '../models/types'

export const GAUGE_OPTIONS = ['10', '11', '12', '13', '14', 'Other'] as const

export const UPRIGHT_STYLE_OPTIONS = [
  'Teardrop',
  'New Style',
  'TBOLT',
  'Ridg-U-Rak',
  'Mecalux',
  'Other',
] as const

export interface UprightDraft {
  photos: File[]
  color: string
  colorOther: string
  style: string
  styleOther: string
  width: string
  heightFeet: string
  heightInches: string
  columnLength: string
  columnWidth: string
  footplateLength: string
  footplateWidth: string
  anchorHoleCount: string
  holeSize: string
  gauge: string
  gaugeOther: string
  condition: string
  conditionOther: string
  quantity: string
  stamp: string
  bundleSize: string
  zone: string
  notes: string
}

export const emptyUprightDraft: UprightDraft = {
  photos: [],
  color: '',
  colorOther: '',
  style: '',
  styleOther: '',
  width: '',
  heightFeet: '',
  heightInches: '',
  columnLength: '',
  columnWidth: '',
  footplateLength: '',
  footplateWidth: '',
  anchorHoleCount: '',
  holeSize: '',
  gauge: '',
  gaugeOther: '',
  condition: '',
  conditionOther: '',
  quantity: '',
  stamp: '',
  bundleSize: '',
  zone: '',
  notes: '',
}

type UprightFieldKey =
  | 'photos'
  | 'color'
  | 'style'
  | 'width'
  | 'height'
  | 'columnSize'
  | 'footplateSize'
  | 'anchorHoleCount'
  | 'holeSize'
  | 'gauge'
  | 'condition'
  | 'quantity'
  | 'stamp'
  | 'bundleSize'
  | 'zone'
  | 'notes'

const DEFAULT_UPRIGHT_FIELD_ORDER: UprightFieldKey[] = [
  'photos',
  'color',
  'style',
  'width',
  'height',
  'columnSize',
  'footplateSize',
  'anchorHoleCount',
  'holeSize',
  'gauge',
  'condition',
  'quantity',
  'stamp',
  'bundleSize',
  'zone',
  'notes',
]

interface UprightFormProps {
  value: UprightDraft
  onChange: (next: UprightDraft) => void
  siteId?: string
}

export default function UprightForm({ value, onChange, siteId }: UprightFormProps) {
  const { order, locked, setLocked, moveField } = useFieldOrder<UprightFieldKey>(
    'uprightFieldOrder',
    DEFAULT_UPRIGHT_FIELD_ORDER,
    { photos: 'start', notes: 'end' },
  )
  const [draggingKey, setDraggingKey] = useState<UprightFieldKey | null>(null)

  const colorOptions = useSiteFieldOptions(siteId, 'color', BEAM_COLOR_OPTIONS)
  const styleOptions = useSiteFieldOptions(siteId, 'uprightStyle', UPRIGHT_STYLE_OPTIONS)
  const gaugeOptions = useSiteFieldOptions(siteId, 'gauge', GAUGE_OPTIONS)

  const fields: Record<UprightFieldKey, React.ReactNode> = {
    photos: (
      <div className="photos-field">
        <span className="photos-label">Photos</span>
        <PhotoCapture files={value.photos} onChange={(photos) => onChange({ ...value, photos })} />
      </div>
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
    width: (
      <label>
        Width
        <div className="input-with-unit">
          <input
            type="number"
            inputMode="decimal"
            value={value.width}
            onChange={(e) => onChange({ ...value, width: e.target.value })}
          />
          <span className="unit">Inches</span>
        </div>
      </label>
    ),
    height: (
      <label>
        Height
        <div className="height-inputs">
          <div className="input-with-unit">
            <input
              type="number"
              inputMode="decimal"
              value={value.heightFeet}
              onChange={(e) => onChange({ ...value, heightFeet: e.target.value })}
            />
            <span className="unit">Feet</span>
          </div>
          <div className="input-with-unit">
            <input
              type="number"
              inputMode="decimal"
              value={value.heightInches}
              onChange={(e) => onChange({ ...value, heightInches: e.target.value })}
            />
            <span className="unit">Inches</span>
          </div>
        </div>
      </label>
    ),
    columnSize: (
      <label>
        Column Size
        <div className="dimension-pair">
          <InchInput
            value={value.columnLength}
            onChange={(columnLength) => onChange({ ...value, columnLength })}
          />
          <span className="dimension-x">x</span>
          <InchInput
            value={value.columnWidth}
            onChange={(columnWidth) => onChange({ ...value, columnWidth })}
          />
        </div>
      </label>
    ),
    footplateSize: (
      <label>
        Footplate Size
        <div className="dimension-pair">
          <InchInput
            value={value.footplateLength}
            onChange={(footplateLength) => onChange({ ...value, footplateLength })}
          />
          <span className="dimension-x">x</span>
          <InchInput
            value={value.footplateWidth}
            onChange={(footplateWidth) => onChange({ ...value, footplateWidth })}
          />
        </div>
      </label>
    ),
    anchorHoleCount: (
      <label>
        Number of Usable Anchor Holes in Footplate
        <input
          type="number"
          inputMode="numeric"
          value={value.anchorHoleCount}
          onChange={(e) => onChange({ ...value, anchorHoleCount: e.target.value })}
        />
      </label>
    ),
    holeSize: (
      <label>
        Hole Size
        <InchInput
          value={value.holeSize}
          onChange={(holeSize) => onChange({ ...value, holeSize })}
        />
      </label>
    ),
    gauge: (
      <>
        <label>
          Gauge
          <select value={value.gauge} onChange={(e) => onChange({ ...value, gauge: e.target.value })}>
            <option value="" disabled>
              Select gauge…
            </option>
            {gaugeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {value.gauge === 'Other' && (
          <input
            type="text"
            value={value.gaugeOther}
            onChange={(e) => onChange({ ...value, gaugeOther: e.target.value })}
            className="other-input"
          />
        )}
      </>
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
          onDragStartKey={(k) => setDraggingKey(k as UprightFieldKey)}
          onDragOverKey={(k) => {
            if (draggingKey) moveField(draggingKey, k as UprightFieldKey)
          }}
          onDragEnd={() => setDraggingKey(null)}
        >
          {fields[key]}
        </DraggableField>
      ))}
    </>
  )
}
