import { useState } from 'react'
import DraggableField from './DraggableField'
import PhotoCapture from './PhotoCapture'
import { useFieldOrder } from '../hooks/useFieldOrder'
import { useSiteFieldOptions } from '../hooks/useSiteFieldOptions'
import { CONDITIONS } from '../models/types'

export const MISC_ITEM_OPTIONS = [
  'Row Spacer',
  'Column Spacer',
  'Pallet Supports',
  'End Aisle Guards',
  'Guard Rail',
  'Conveyor',
  'Other',
] as const

export interface MiscItemDraft {
  description: string
  descriptionOther: string
  itemDescription: string
  condition: string
  conditionOther: string
  quantity: string
  bundleSize: string
  zone: string
  notes: string
  photos: File[]
}

export const emptyMiscItemDraft: MiscItemDraft = {
  description: '',
  descriptionOther: '',
  itemDescription: '',
  condition: '',
  conditionOther: '',
  quantity: '',
  bundleSize: '',
  zone: '',
  notes: '',
  photos: [],
}

type MiscItemFieldKey =
  | 'description'
  | 'itemDescription'
  | 'condition'
  | 'quantity'
  | 'bundleSize'
  | 'zone'
  | 'notes'
  | 'photos'

const DEFAULT_MISC_ITEM_FIELD_ORDER: MiscItemFieldKey[] = [
  'photos',
  'description',
  'itemDescription',
  'condition',
  'quantity',
  'bundleSize',
  'zone',
  'notes',
]

interface MiscItemFormProps {
  value: MiscItemDraft
  onChange: (next: MiscItemDraft) => void
  siteId?: string
}

export default function MiscItemForm({ value, onChange, siteId }: MiscItemFormProps) {
  const { order, locked, setLocked, moveField } = useFieldOrder<MiscItemFieldKey>(
    'miscItemFieldOrder',
    DEFAULT_MISC_ITEM_FIELD_ORDER,
    { photos: 'start', notes: 'end' },
  )
  const [draggingKey, setDraggingKey] = useState<MiscItemFieldKey | null>(null)

  const descriptionOptions = useSiteFieldOptions(siteId, 'miscItem', MISC_ITEM_OPTIONS)

  const fields: Record<MiscItemFieldKey, React.ReactNode> = {
    description: (
      <>
        <label>
          Item
          <select
            value={value.description}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
          >
            <option value="" disabled>
              Select an item…
            </option>
            {descriptionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {value.description === 'Other' && (
          <input
            type="text"
            placeholder="Enter item"
            value={value.descriptionOther}
            onChange={(e) => onChange({ ...value, descriptionOther: e.target.value })}
            className="other-input"
          />
        )}
      </>
    ),
    itemDescription: (
      <label>
        Item Description
        <textarea
          value={value.itemDescription}
          onChange={(e) => onChange({ ...value, itemDescription: e.target.value })}
          rows={3}
        />
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
          onDragStartKey={(k) => setDraggingKey(k as MiscItemFieldKey)}
          onDragOverKey={(k) => {
            if (draggingKey) moveField(draggingKey, k as MiscItemFieldKey)
          }}
          onDragEnd={() => setDraggingKey(null)}
        >
          {fields[key]}
        </DraggableField>
      ))}
    </>
  )
}
