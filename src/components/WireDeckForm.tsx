import { useState } from 'react'
import DraggableField from './DraggableField'
import PhotoCapture from './PhotoCapture'
import { useFieldOrder } from '../hooks/useFieldOrder'
import { useSiteFieldOptions } from '../hooks/useSiteFieldOptions'
import { CONDITIONS } from '../models/types'

export const CHANNEL_COUNT_OPTIONS = ['3', '4', '5', '6', 'Other'] as const

export const WIRE_DECK_STYLE_OPTIONS = [
  'Double Waterfall',
  'Flared/Flanged',
  'Lay-in',
  'Inside Waterfall',
  'Other',
] as const

export interface WireDeckDraft {
  length: string
  width: string
  channelCount: string
  channelCountOther: string
  style: string[]
  styleOther: string
  condition: string
  quantity: string
  bundleSize: string
  notes: string
  photos: File[]
}

export const emptyWireDeckDraft: WireDeckDraft = {
  length: '',
  width: '',
  channelCount: '',
  channelCountOther: '',
  style: [],
  styleOther: '',
  condition: '',
  quantity: '',
  bundleSize: '',
  notes: '',
  photos: [],
}

type WireDeckFieldKey =
  | 'length'
  | 'width'
  | 'channelCount'
  | 'style'
  | 'condition'
  | 'quantity'
  | 'bundleSize'
  | 'notes'
  | 'photos'

const DEFAULT_WIRE_DECK_FIELD_ORDER: WireDeckFieldKey[] = [
  'photos',
  'length',
  'width',
  'channelCount',
  'style',
  'condition',
  'quantity',
  'bundleSize',
  'notes',
]

interface WireDeckFormProps {
  value: WireDeckDraft
  onChange: (next: WireDeckDraft) => void
  siteId?: string
}

export default function WireDeckForm({ value, onChange, siteId }: WireDeckFormProps) {
  const { order, locked, setLocked, moveField } = useFieldOrder<WireDeckFieldKey>(
    'wireDeckFieldOrder',
    DEFAULT_WIRE_DECK_FIELD_ORDER,
    { photos: 'start', notes: 'end' },
  )
  const [draggingKey, setDraggingKey] = useState<WireDeckFieldKey | null>(null)

  const channelCountOptions = useSiteFieldOptions(siteId, 'channelCount', CHANNEL_COUNT_OPTIONS)
  const styleOptions = useSiteFieldOptions(siteId, 'wireDeckStyle', WIRE_DECK_STYLE_OPTIONS)

  function toggleStyle(option: string) {
    const has = value.style.includes(option)
    onChange({
      ...value,
      style: has ? value.style.filter((s) => s !== option) : [...value.style, option],
    })
  }

  const fields: Record<WireDeckFieldKey, React.ReactNode> = {
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
            type="number"
            inputMode="decimal"
            value={value.width}
            onChange={(e) => onChange({ ...value, width: e.target.value })}
          />
          <span className="unit">Inches</span>
        </div>
      </label>
    ),
    channelCount: (
      <>
        <label>
          Number of Channels
          <select
            value={value.channelCount}
            onChange={(e) => onChange({ ...value, channelCount: e.target.value })}
          >
            <option value="" disabled>
              Select…
            </option>
            {channelCountOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {value.channelCount === 'Other' && (
          <input
            type="text"
            value={value.channelCountOther}
            onChange={(e) => onChange({ ...value, channelCountOther: e.target.value })}
            className="other-input"
          />
        )}
      </>
    ),
    style: (
      <fieldset className="checkbox-fieldset">
        <legend>Style</legend>
        <div className="checkbox-options">
          {styleOptions.map((option) => (
            <label key={option} className="checkbox-option">
              <input
                type="checkbox"
                checked={value.style.includes(option)}
                onChange={() => toggleStyle(option)}
              />
              {option}
            </label>
          ))}
        </div>
        {value.style.includes('Other') && (
          <input
            type="text"
            value={value.styleOther}
            onChange={(e) => onChange({ ...value, styleOther: e.target.value })}
            className="other-input"
          />
        )}
      </fieldset>
    ),
    condition: (
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
          onDragStartKey={(k) => setDraggingKey(k as WireDeckFieldKey)}
          onDragOverKey={(k) => {
            if (draggingKey) moveField(draggingKey, k as WireDeckFieldKey)
          }}
          onDragEnd={() => setDraggingKey(null)}
        >
          {fields[key]}
        </DraggableField>
      ))}
    </>
  )
}
