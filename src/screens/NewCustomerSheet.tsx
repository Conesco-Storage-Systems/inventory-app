import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import BlobImage from '../components/BlobImage'
import { createCustomerSheet } from '../db/customerSheets'
import { db } from '../db/db'
import { groupBeams } from '../db/groupBeams'
import { groupMiscItems } from '../db/groupMiscItems'
import { groupUprights } from '../db/groupUprights'
import { groupWireDecks } from '../db/groupWireDecks'
import { getItemFields, getItemLabel, type SelectableItemType, type SelectableRow } from '../db/itemFields'
import { getPhotosForItem, listBeamsBySite, listMiscItemsBySite, listUprightsBySite, listWireDecksBySite } from '../db/items'
import { compressImageToDataUrl } from '../export/compressImage'
import type { CustomerSheetLineItem } from '../models/types'
import { useRole } from '../state/RoleContext'

interface AvailableItem {
  key: string
  itemType: SelectableItemType
  row: SelectableRow
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function SelectedItemCard({
  item,
  fieldKeys,
  includePhotos,
  onToggleField,
  onTogglePhotos,
  onRemove,
}: {
  item: AvailableItem
  fieldKeys: Set<string>
  includePhotos: boolean
  onToggleField: (fieldKey: string) => void
  onTogglePhotos: () => void
  onRemove: () => void
}) {
  const photos = useLiveQuery(() => getPhotosForItem(item.row.ids), [item.row.ids.join(',')]) ?? []
  const fields = getItemFields(item.itemType, item.row)

  return (
    <div className="customer-sheet-item-card">
      <div className="customer-sheet-item-card-header">
        <strong>{getItemLabel(item.itemType, item.row)}</strong>
        <button type="button" className="delete-button" onClick={onRemove}>
          Remove
        </button>
      </div>

      {fields.length > 0 && (
        <div className="checkbox-options customer-sheet-field-grid">
          {fields.map((field) => (
            <label key={field.key} className="checkbox-option">
              <input
                type="checkbox"
                checked={fieldKeys.has(field.key)}
                onChange={() => onToggleField(field.key)}
              />
              {field.label}: {field.value}
            </label>
          ))}
        </div>
      )}

      {photos.length > 0 && (
        <div className="customer-sheet-photo-row">
          <label className="checkbox-option">
            <input type="checkbox" checked={includePhotos} onChange={onTogglePhotos} />
            Include Photos ({photos.length})
          </label>
          <div className="photo-thumbnails">
            {photos.map((photo) => (
              <div className="photo-thumb" key={photo.id}>
                <BlobImage blob={photo.blob} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function NewCustomerSheet() {
  const { permissions } = useRole()
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const preselectedKeys = (location.state as { preselected?: string[] } | null)?.preselected
  const appliedPreselectRef = useRef(false)

  const site = useLiveQuery(() => (siteId ? db.sites.get(siteId) : undefined), [siteId])
  const uprights = useLiveQuery(() => (siteId ? listUprightsBySite(siteId) : []), [siteId]) ?? []
  const beams = useLiveQuery(() => (siteId ? listBeamsBySite(siteId) : []), [siteId]) ?? []
  const wireDecks = useLiveQuery(() => (siteId ? listWireDecksBySite(siteId) : []), [siteId]) ?? []
  const miscItems = useLiveQuery(() => (siteId ? listMiscItemsBySite(siteId) : []), [siteId]) ?? []

  const availableItems: AvailableItem[] = [
    ...groupBeams(beams).map((row) => ({ key: `beam:${row.key}`, itemType: 'beam' as const, row })),
    ...groupUprights(uprights).map((row) => ({ key: `upright:${row.key}`, itemType: 'upright' as const, row })),
    ...groupWireDecks(wireDecks).map((row) => ({ key: `wireDeck:${row.key}`, itemType: 'wireDeck' as const, row })),
    ...groupMiscItems(miscItems).map((row) => ({ key: `misc:${row.key}`, itemType: 'misc' as const, row })),
  ]

  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [fieldSelections, setFieldSelections] = useState<Record<string, Set<string>>>({})
  const [photoSelections, setPhotoSelections] = useState<Record<string, boolean>>({})
  const [selectedRowKey, setSelectedRowKey] = useState('')

  const [date, setDate] = useState(todayIso())
  const [customerName, setCustomerName] = useState('')
  const [customerCompany, setCustomerCompany] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [saving, setSaving] = useState(false)

  function addItem(key: string) {
    const item = availableItems.find((i) => i.key === key)
    if (!item) return
    setSelectedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
    setFieldSelections((prev) => ({
      ...prev,
      [key]: new Set(getItemFields(item.itemType, item.row).map((f) => f.key)),
    }))
    setPhotoSelections((prev) => ({ ...prev, [key]: true }))
  }

  function removeItem(key: string) {
    setSelectedKeys((prev) => prev.filter((k) => k !== key))
  }

  function toggleField(key: string, fieldKey: string) {
    setFieldSelections((prev) => {
      const current = new Set(prev[key] ?? [])
      if (current.has(fieldKey)) current.delete(fieldKey)
      else current.add(fieldKey)
      return { ...prev, [key]: current }
    })
  }

  function togglePhotos(key: string) {
    setPhotoSelections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    if (appliedPreselectRef.current) return
    if (!preselectedKeys || preselectedKeys.length === 0) {
      appliedPreselectRef.current = true
      return
    }
    if (availableItems.length === 0) return
    for (const key of preselectedKeys) {
      if (availableItems.some((i) => i.key === key)) addItem(key)
    }
    appliedPreselectRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableItems.length])

  if (site === undefined) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    )
  }

  if (!site) {
    return (
      <main className="page">
        <p>Location not found.</p>
        <Link to="/">Back to locations</Link>
      </main>
    )
  }

  if (!permissions.generateCustomerSheet) {
    return (
      <main className="page">
        <p>
          <Link to={`/locations/${siteId}`}>← Back</Link>
        </p>
        <p>Your role doesn't have permission to generate a customer sheet.</p>
      </main>
    )
  }

  async function handleGenerate() {
    if (!siteId) return
    setSaving(true)
    try {
      const lineItems: CustomerSheetLineItem[] = []
      for (const key of selectedKeys) {
        const item = availableItems.find((i) => i.key === key)
        if (!item) continue
        const included = fieldSelections[key] ?? new Set<string>()
        const fields = getItemFields(item.itemType, item.row)
          .filter((f) => included.has(f.key))
          .map((f) => ({ label: f.label, value: f.value }))

        let photos: string[] = []
        if (photoSelections[key]) {
          const rawPhotos = await getPhotosForItem(item.row.ids)
          photos = await Promise.all(rawPhotos.map((p) => compressImageToDataUrl(p.blob)))
        }

        lineItems.push({
          itemType: item.itemType,
          itemLabel: getItemLabel(item.itemType, item.row),
          fields,
          photos,
        })
      }

      const sheetId = await createCustomerSheet({
        siteId,
        date,
        customerName,
        customerCompany,
        customerAddress,
        customerPhone,
        lineItems,
      })
      navigate(`/locations/${siteId}/customer-sheet/${sheetId}`)
    } finally {
      setSaving(false)
    }
  }

  const selectedItems = selectedKeys
    .map((key) => availableItems.find((i) => i.key === key))
    .filter((i): i is AvailableItem => !!i)

  return (
    <main className="page page-wide">
      <p>
        <Link to={`/locations/${siteId}`}>← Back</Link>
      </p>
      <h1>New Customer Sheet</h1>
      <p className="placeholder-note">
        Confirm which items, fields, and photos to include below — everything is checked by default, so
        uncheck anything you don't want the customer to see.
      </p>

      <h2>Selected Items</h2>
      <div className="field-row">
        <label>
          Add item from inventory
          <select value={selectedRowKey} onChange={(e) => setSelectedRowKey(e.target.value)}>
            <option value="">Select an item…</option>
            {availableItems
              .filter((i) => !selectedKeys.includes(i.key))
              .map((item) => (
                <option key={item.key} value={item.key}>
                  {getItemLabel(item.itemType, item.row)} — {item.row.quantity} available
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            if (selectedRowKey) addItem(selectedRowKey)
            setSelectedRowKey('')
          }}
          disabled={!selectedRowKey}
        >
          + Add Item
        </button>
      </div>

      {selectedItems.length === 0 ? (
        <p className="placeholder-note">No items selected yet.</p>
      ) : (
        <div className="customer-sheet-item-list">
          {selectedItems.map((item) => (
            <SelectedItemCard
              key={item.key}
              item={item}
              fieldKeys={fieldSelections[item.key] ?? new Set()}
              includePhotos={photoSelections[item.key] ?? false}
              onToggleField={(fieldKey) => toggleField(item.key, fieldKey)}
              onTogglePhotos={() => togglePhotos(item.key)}
              onRemove={() => removeItem(item.key)}
            />
          ))}
        </div>
      )}

      <h2>Customer Information</h2>
      <div className="site-edit-form">
        <div className="field-row">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label>
          Customer Name
          <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </label>
        <label>
          Company
          <input type="text" value={customerCompany} onChange={(e) => setCustomerCompany(e.target.value)} />
        </label>
        <label>
          Address
          <input type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
        </label>
        <label>
          Phone
          <input type="text" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
        </label>
      </div>

      <div className="save-item-row">
        <button type="button" onClick={handleGenerate} disabled={saving || selectedItems.length === 0}>
          {saving ? 'Generating…' : 'Generate PDF'}
        </button>
      </div>
    </main>
  )
}
