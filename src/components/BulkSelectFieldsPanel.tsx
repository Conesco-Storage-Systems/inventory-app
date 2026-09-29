import { useState, type Dispatch, type SetStateAction } from 'react'
import { getFieldDefs } from '../db/itemFields'
import type { ItemType } from '../models/types'

// The minimal shape this panel needs per item — just enough to know which
// bulk-checked fields actually apply to it, without caring where the item
// came from (a quote's held items, an inventory selection, items
// preselected on a location page, etc).
export interface BulkSelectableItem {
  key: string
  itemType: ItemType
  fieldKeys: string[]
}

const BULK_SELECT_COLUMNS: { itemType: ItemType; label: string }[] = [
  { itemType: 'upright', label: 'Uprights' },
  { itemType: 'beam', label: 'Beams' },
  { itemType: 'wireDeck', label: 'Wire Decks' },
  { itemType: 'misc', label: 'Other' },
]

interface BulkSelectFieldsPanelProps {
  items: BulkSelectableItem[]
  // Whether the caller's items carry a "Location" field (only true when
  // items can span more than one site, e.g. a Sales Quote or an Inventory
  // selection — not a single location's own Customer Sheet).
  includeLocationField?: boolean
  // Only the setters are needed — this panel only ever force-sets values,
  // it never reads the current per-item selection state.
  setFieldSelections: Dispatch<SetStateAction<Record<string, Set<string>>>>
  setPhotoSelections: Dispatch<SetStateAction<Record<string, boolean>>>
}

// Every field an item type can carry (plus Location and Photos when
// applicable) — the full checklist for that type's "apply to every item"
// column, independent of which specific fields any one item passed in
// happens to have a value for.
export default function BulkSelectFieldsPanel({
  items,
  includeLocationField = false,
  setFieldSelections,
  setPhotoSelections,
}: BulkSelectFieldsPanelProps) {
  // Independent of the per-item state above — these are one-way "apply to
  // every item of this type" actions, not a live summary of what's already
  // checked on individual items. Keyed by `${itemType}:${fieldKey}` /
  // `${itemType}` so they don't collide with per-item state.
  const [masterFieldChecks, setMasterFieldChecks] = useState<Record<string, boolean>>({})
  const [masterPhotoChecks, setMasterPhotoChecks] = useState<Record<string, boolean>>({})
  // "Select All" for one column — same one-way action as the individual
  // boxes above, just applied to every field (and Photos) in that column
  // at once, keyed by itemType.
  const [selectAllChecks, setSelectAllChecks] = useState<Record<string, boolean>>({})

  function bulkFieldDefs(itemType: ItemType): { key: string; label: string }[] {
    const defs = getFieldDefs(itemType)
    return includeLocationField ? [...defs, { key: 'location', label: 'Location' }] : defs
  }

  // Force-sets one field on every item of this type at once — items that
  // don't actually have that field (no value for it) are left alone, since
  // there's nothing to check.
  function toggleMasterField(itemType: ItemType, fieldKey: string) {
    const mapKey = `${itemType}:${fieldKey}`
    const nextChecked = !masterFieldChecks[mapKey]
    setMasterFieldChecks((prev) => ({ ...prev, [mapKey]: nextChecked }))
    setFieldSelections((prev) => {
      const next = { ...prev }
      for (const item of items) {
        if (item.itemType !== itemType) continue
        if (!item.fieldKeys.includes(fieldKey)) continue
        const current = new Set(next[item.key] ?? [])
        if (nextChecked) current.add(fieldKey)
        else current.delete(fieldKey)
        next[item.key] = current
      }
      return next
    })
  }

  // Same idea, but for the Photos checkbox. Items with no actual photos
  // never show that checkbox and never end up with any in the generated
  // PDF regardless of this flag, so setting it on them is harmless.
  function toggleMasterPhotos(itemType: ItemType) {
    const nextChecked = !masterPhotoChecks[itemType]
    setMasterPhotoChecks((prev) => ({ ...prev, [itemType]: nextChecked }))
    setPhotoSelections((prev) => {
      const next = { ...prev }
      for (const item of items) {
        if (item.itemType !== itemType) continue
        next[item.key] = nextChecked
      }
      return next
    })
  }

  // Checks (or unchecks) every field and Photos for one column in a single
  // action — equivalent to clicking each of that column's own checkboxes
  // one by one, just done all at once.
  function toggleSelectAll(itemType: ItemType) {
    const nextChecked = !selectAllChecks[itemType]
    const fieldKeys = bulkFieldDefs(itemType).map((f) => f.key)

    setSelectAllChecks((prev) => ({ ...prev, [itemType]: nextChecked }))
    setMasterFieldChecks((prev) => {
      const next = { ...prev }
      for (const key of fieldKeys) next[`${itemType}:${key}`] = nextChecked
      return next
    })
    setMasterPhotoChecks((prev) => ({ ...prev, [itemType]: nextChecked }))

    setFieldSelections((prev) => {
      const next = { ...prev }
      for (const item of items) {
        if (item.itemType !== itemType) continue
        const current = new Set(next[item.key] ?? [])
        for (const key of fieldKeys) {
          if (!item.fieldKeys.includes(key)) continue
          if (nextChecked) current.add(key)
          else current.delete(key)
        }
        next[item.key] = current
      }
      return next
    })
    setPhotoSelections((prev) => {
      const next = { ...prev }
      for (const item of items) {
        if (item.itemType !== itemType) continue
        next[item.key] = nextChecked
      }
      return next
    })
  }

  return (
    <details className="item-section collapsible-section quote-bulk-select-details">
      <summary className="collapsible-section-summary">Select for all Items</summary>
      <p className="placeholder-note">
        Checking a box here checks it on every item of that type below — it's a shortcut, not a live
        summary, so it won't reflect (or undo) changes made by hand on individual items afterward.
      </p>
      <div className="quote-bulk-select-grid">
        {BULK_SELECT_COLUMNS.map(({ itemType, label }) => (
          <div key={itemType} className="quote-bulk-select-column">
            <h3>{label}</h3>
            <label className="checkbox-option quote-bulk-select-all">
              <input
                type="checkbox"
                checked={selectAllChecks[itemType] ?? false}
                onChange={() => toggleSelectAll(itemType)}
              />
              <strong>Select All</strong>
            </label>
            <div className="checkbox-options">
              {bulkFieldDefs(itemType).map((field) => (
                <label key={field.key} className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={masterFieldChecks[`${itemType}:${field.key}`] ?? false}
                    onChange={() => toggleMasterField(itemType, field.key)}
                  />
                  {field.label}
                </label>
              ))}
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={masterPhotoChecks[itemType] ?? false}
                  onChange={() => toggleMasterPhotos(itemType)}
                />
                Photos
              </label>
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
