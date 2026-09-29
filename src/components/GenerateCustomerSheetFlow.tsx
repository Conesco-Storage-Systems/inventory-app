import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import BlobImage from './BlobImage'
import BulkSelectFieldsPanel from './BulkSelectFieldsPanel'
import { db } from '../db/db'
import { groupBeams } from '../db/groupBeams'
import { groupMiscItems } from '../db/groupMiscItems'
import { groupUprights } from '../db/groupUprights'
import { groupWireDecks } from '../db/groupWireDecks'
import { getItemFields, getItemLabel, type ItemField, type SelectableRow } from '../db/itemFields'
import { getPhotosForItem } from '../db/items'
import { bolElementToPdfBlob } from '../export/exportBolToPdf'
import { compressImageToDataUrl } from '../export/compressImage'
import { saveBlobAs } from '../export/saveBlob'
import type { Beam, CustomerSheetLineItem, ItemType, MiscItem, Upright, WireDeck } from '../models/types'
import { getEditorName } from '../state/editor'
import { formatDisplayName } from '../utils/displayName'

// The minimal shape needed to seed this flow, regardless of where the
// items came from (a Sales Quote's held items, checkboxes on the All
// Inventory page, etc.) — the flow itself doesn't care about the source.
export interface CustomerSheetSeed {
  key: string
  itemType: ItemType
  siteId: string
  siteName: string
  itemIds: string[]
  quantity: number
  description: string
}

interface SiteItemLists {
  beams: Beam[]
  uprights: Upright[]
  wireDecks: WireDeck[]
  miscItems: MiscItem[]
}

interface SheetItem {
  key: string
  itemType: ItemType
  itemLabel: string
  // The seed's own raw-id snapshot — used for photo lookups regardless of
  // whether a live matching row is found below, since photos are stored
  // per raw item id and don't depend on that row still being groupable.
  photoLookupIds: string[]
  fields: ItemField[]
}

interface PreviewDocument {
  date: string
  customerName: string
  customerCompany: string
  customerAddress: string
  customerPhone: string
  preparedBy: string
  lineItems: CustomerSheetLineItem[]
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function sheetPdfFileName(customerName: string, date: string): string {
  const parts = ['Customer-Sheet', customerName || 'customer', date || 'undated']
  return `${parts.join('-').replace(/[^a-zA-Z0-9-]+/g, '_')}.pdf`
}

// Filters each site's live records down to just the ones this seed's raw
// ids still point to, then groups only that subset — so a full field match
// (style, color, etc., everything the inventory list itself shows) is
// recovered as long as the seeded records themselves still exist,
// regardless of whether the surrounding group they originally belonged to
// has since grown, shrunk, or been re-split by other activity at that
// location.
function findMatchedRow(itemType: ItemType, itemIds: string[], siteItems: SiteItemLists): SelectableRow | undefined {
  switch (itemType) {
    case 'beam':
      return groupBeams(siteItems.beams.filter((row) => itemIds.includes(row.id)))[0]
    case 'upright':
      return groupUprights(siteItems.uprights.filter((row) => itemIds.includes(row.id)))[0]
    case 'wireDeck':
      return groupWireDecks(siteItems.wireDecks.filter((row) => itemIds.includes(row.id)))[0]
    case 'misc':
      return groupMiscItems(siteItems.miscItems.filter((row) => itemIds.includes(row.id)))[0]
  }
}

function SelectedItemCard({
  item,
  fieldKeys,
  includePhotos,
  onToggleField,
  onTogglePhotos,
  onRemove,
}: {
  item: SheetItem
  fieldKeys: Set<string>
  includePhotos: boolean
  onToggleField: (fieldKey: string) => void
  onTogglePhotos: () => void
  onRemove: () => void
}) {
  const photos = useLiveQuery(() => getPhotosForItem(item.photoLookupIds), [item.photoLookupIds.join(',')]) ?? []

  return (
    <div className="customer-sheet-item-card">
      <div className="customer-sheet-item-card-header">
        <strong>{item.itemLabel}</strong>
        <button type="button" className="delete-button" onClick={onRemove}>
          Remove
        </button>
      </div>

      {item.fields.length > 0 && (
        <div className="checkbox-options customer-sheet-field-grid">
          {item.fields.map((field) => (
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

interface GenerateCustomerSheetFlowProps {
  seeds: CustomerSheetSeed[]
  backTo: string
  backLabel: string
  heading: string
  introText: string
  emptyMessage: string
  initialCustomerName?: string
  initialCustomerAddress?: string
}

export default function GenerateCustomerSheetFlow({
  seeds,
  backTo,
  backLabel,
  heading,
  introText,
  emptyMessage,
  initialCustomerName = '',
  initialCustomerAddress = '',
}: GenerateCustomerSheetFlowProps) {
  // Fetched the same way every other inventory-reading screen in the app
  // does — reactively, across all sites — then filtered/grouped in plain
  // JS below. Seeds can span more than one location, so there's no single
  // siteId to scope a query to up front.
  const allBeams = useLiveQuery(() => db.beams.toArray(), []) ?? []
  const allUprights = useLiveQuery(() => db.uprights.toArray(), []) ?? []
  const allWireDecks = useLiveQuery(() => db.wireDecks.toArray(), []) ?? []
  const allMiscItems = useLiveQuery(() => db.miscItems.toArray(), []) ?? []

  // Each seeded item's fields/photos are read from the *live* inventory row
  // it overlaps with (by raw record id) — same matching the "On Hold"
  // display uses — so the sheet always reflects the item's current
  // details, not a stale snapshot from when it was seeded. Location joins
  // the field list as just another checkable field, since seeds can span
  // more than one site.
  const sheetItems: SheetItem[] = seeds.map((seed): SheetItem => {
    const siteItems: SiteItemLists = {
      beams: allBeams.filter((row) => row.siteId === seed.siteId),
      uprights: allUprights.filter((row) => row.siteId === seed.siteId),
      wireDecks: allWireDecks.filter((row) => row.siteId === seed.siteId),
      miscItems: allMiscItems.filter((row) => row.siteId === seed.siteId),
    }
    const matchedRow = findMatchedRow(seed.itemType, seed.itemIds, siteItems)

    if (matchedRow) {
      const rowWithQty = { ...matchedRow, quantity: seed.quantity }
      return {
        key: seed.key,
        itemType: seed.itemType,
        itemLabel: getItemLabel(seed.itemType, matchedRow),
        photoLookupIds: seed.itemIds,
        fields: [...getItemFields(seed.itemType, rowWithQty), { key: 'location', label: 'Location', value: seed.siteName }],
      }
    }

    return {
      key: seed.key,
      itemType: seed.itemType,
      itemLabel: seed.description || 'Item',
      photoLookupIds: seed.itemIds,
      fields: [
        { key: 'quantity', label: 'Quantity', value: String(seed.quantity) },
        { key: 'location', label: 'Location', value: seed.siteName },
      ].filter((f) => f.value),
    }
  })

  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [fieldSelections, setFieldSelections] = useState<Record<string, Set<string>>>({})
  const [photoSelections, setPhotoSelections] = useState<Record<string, boolean>>({})
  const appliedInitialSelectionRef = useRef(false)

  const [date, setDate] = useState(todayIso())
  const [customerName, setCustomerName] = useState(initialCustomerName)
  const [customerCompany, setCustomerCompany] = useState('')
  const [customerAddress, setCustomerAddress] = useState(initialCustomerAddress)
  const [customerPhone, setCustomerPhone] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [previewDocument, setPreviewDocument] = useState<PreviewDocument | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  function addItem(key: string) {
    const item = sheetItems.find((i) => i.key === key)
    if (!item) return
    setSelectedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
    // Every field/photo starts unchecked — the salesperson builds the sheet
    // up by adding what they want the customer to see, rather than having
    // to strip out what they don't.
    setFieldSelections((prev) => ({ ...prev, [key]: new Set<string>() }))
    setPhotoSelections((prev) => ({ ...prev, [key]: false }))
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

  // Every seeded item is included by default — this sheet isn't built by
  // browsing inventory, it's a snapshot of what was already selected, so
  // there's nothing to "add" beyond removing what the salesperson doesn't
  // want printed.
  useEffect(() => {
    if (appliedInitialSelectionRef.current) return
    if (sheetItems.length === 0) return
    for (const item of sheetItems) addItem(item.key)
    appliedInitialSelectionRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetItems.length])

  // Builds the document and shows it as a preview — nothing is exported or
  // downloaded yet. Re-clicking this (after changing a checkbox) refreshes
  // the preview with the current selections.
  async function handleGeneratePdf() {
    setExportError(null)
    setGenerating(true)
    try {
      const lineItemsOut: CustomerSheetLineItem[] = []
      for (const key of selectedKeys) {
        const item = sheetItems.find((i) => i.key === key)
        if (!item) continue
        const included = fieldSelections[key] ?? new Set<string>()
        const fields = item.fields.filter((f) => included.has(f.key)).map((f) => ({ label: f.label, value: f.value }))

        let photos: string[] = []
        if (photoSelections[key] && item.photoLookupIds.length > 0) {
          const rawPhotos = await getPhotosForItem(item.photoLookupIds)
          photos = await Promise.all(rawPhotos.map((p) => compressImageToDataUrl(p.blob)))
        }

        lineItemsOut.push({ itemType: item.itemType, itemLabel: item.itemLabel, fields, photos })
      }

      setPreviewDocument({
        date,
        customerName,
        customerCompany,
        customerAddress,
        customerPhone,
        preparedBy: getEditorName(),
        lineItems: lineItemsOut,
      })
    } catch {
      setExportError('Could not generate the preview. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  // Captures the preview already on screen and downloads it — nothing here
  // is written to the database or tied to a location; the PDF exists only
  // as this download.
  async function handleSavePdf() {
    if (!previewDocument || !previewRef.current) return
    setExportError(null)
    setSaving(true)
    try {
      const blob = await bolElementToPdfBlob(previewRef.current)
      await saveBlobAs(blob, sheetPdfFileName(previewDocument.customerName, previewDocument.date))
    } catch {
      setExportError('Could not save the PDF. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const selectedItems = selectedKeys
    .map((key) => sheetItems.find((i) => i.key === key))
    .filter((i): i is SheetItem => !!i)

  return (
    <main className="page page-wide">
      <p>
        <Link to={backTo}>← {backLabel}</Link>
      </p>
      <h1>{heading}</h1>
      <p className="placeholder-note">{introText}</p>

      <BulkSelectFieldsPanel
        items={sheetItems.map((item) => ({ key: item.key, itemType: item.itemType, fieldKeys: item.fields.map((f) => f.key) }))}
        includeLocationField
        setFieldSelections={setFieldSelections}
        setPhotoSelections={setPhotoSelections}
      />

      {selectedItems.length === 0 ? (
        <p className="placeholder-note">{emptyMessage}</p>
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

      {exportError && <p className="field-error">{exportError}</p>}

      <div className="save-item-row">
        <div className="dialog-actions">
          <button type="button" onClick={handleGeneratePdf} disabled={generating || selectedItems.length === 0}>
            {generating ? 'Generating…' : previewDocument ? 'Regenerate Preview' : 'Generate PDF'}
          </button>
          {previewDocument && (
            <button type="button" onClick={handleSavePdf} disabled={saving}>
              {saving ? 'Saving…' : 'Save PDF'}
            </button>
          )}
        </div>
      </div>

      {previewDocument && (
        <>
          <h2>Preview</h2>
          <div className="cs-sheet" ref={previewRef}>
            <div className="cs-header">
              <div className="cs-title">
                <h1>MATERIAL SPECIFICATION SHEET</h1>
                <p>Date: {previewDocument.date}</p>
              </div>
              <div className="cs-logo">
                <img src="/conesco-logo.png" alt="Conesco" />
                <p className="cs-header-company">
                  Conesco Storage Systems Inc.
                  <br />
                  15660 E. Hinsdale Dr, Ste 100
                  <br />
                  Centennial, CO 80112
                  <br />
                  Phone: (303) 690-9591
                </p>
              </div>
            </div>

            <div className="cs-customer-box">
              <h3>PREPARED FOR</h3>
              <p>
                <strong>Name:</strong> {previewDocument.customerName}
              </p>
              <p>
                <strong>Company:</strong> {previewDocument.customerCompany}
              </p>
              <p>
                <strong>Address:</strong> {previewDocument.customerAddress}
              </p>
              <p>
                <strong>Phone:</strong> {previewDocument.customerPhone}
              </p>
              <p>
                <strong>Prepared By:</strong> {formatDisplayName(previewDocument.preparedBy)}
              </p>
            </div>

            <div className="cs-items">
              {previewDocument.lineItems.map((li, index) => (
                <div className="cs-item-box" key={index}>
                  <div className="cs-item-header">{li.itemLabel}</div>
                  {li.fields.length > 0 && (
                    <div className="cs-item-fields">
                      {li.fields.map((field, fi) => (
                        <div className="cs-item-field" key={fi}>
                          <span className="cs-item-field-label">{field.label}</span>
                          <span className="cs-item-field-value">{field.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {li.photos.length > 0 && (
                    <div className="cs-item-photos">
                      {li.photos.map((src, pi) => (
                        <img src={src} alt="" key={pi} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="cs-footer">© Conesco Storage Systems, Inc. — www.CONESCO.com</p>
          </div>
        </>
      )}
    </main>
  )
}
