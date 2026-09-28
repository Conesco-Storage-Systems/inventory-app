import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { groupBeams, type BeamRow } from '../db/groupBeams'
import { groupMiscItems, type MiscItemRow } from '../db/groupMiscItems'
import { groupUprights, type UprightRow } from '../db/groupUprights'
import { groupWireDecks, type WireDeckRow } from '../db/groupWireDecks'
import { listBeamsBySite, listMiscItemsBySite, listUprightsBySite, listWireDecksBySite } from '../db/items'
import {
  deletePendingSalesOrderLineItem,
  importSalesOrderLineItems,
  listPendingSalesOrderLineItems,
  tieSalesOrderLineItem,
} from '../db/salesOrders'
import { computeAvailableQuantity } from '../db/salesQuotes'
import { getSoReportSheetNames, parseSoReportWorkbook, type SoReportParseResult } from '../import/parseSoReport'
import type { ItemType } from '../models/types'
import { useRole } from '../state/RoleContext'

interface AvailableRow {
  key: string
  itemType: ItemType
  itemIds: string[]
  description: string
  quantity: number
}

function describeBeam(row: BeamRow): string {
  return [row.style, row.widthByLength, row.color, row.pinCount && `${row.pinCount} pin`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeUpright(row: UprightRow): string {
  return [row.style, row.widthByHeight, row.color, row.gauge && `${row.gauge} ga`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeWireDeck(row: WireDeckRow): string {
  return [row.style.join('/'), row.widthByLength, row.channelCount && `${row.channelCount} channel`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeMisc(row: MiscItemRow): string {
  return [row.description, row.itemDescription, row.condition].filter(Boolean).join(', ')
}

export default function Procurement() {
  const { permissions } = useRole()
  const importFileInputRef = useRef<HTMLInputElement>(null)

  const [importFile, setImportFile] = useState<File | null>(null)
  const [importFileName, setImportFileName] = useState<string | null>(null)
  const [importSheetNames, setImportSheetNames] = useState<string[]>([])
  const [importPreview, setImportPreview] = useState<SoReportParseResult | null>(null)
  const [importParsing, setImportParsing] = useState(false)
  const [importParseError, setImportParseError] = useState<string | null>(null)
  const [importCommitting, setImportCommitting] = useState(false)
  const [importResultMessage, setImportResultMessage] = useState<string | null>(null)

  const sites = useLiveQuery(() => db.sites.orderBy('name').toArray(), []) ?? []
  const pendingLineItems = useLiveQuery(() => listPendingSalesOrderLineItems(), []) ?? []
  const holds = useLiveQuery(() => db.salesQuoteLineItems.toArray(), []) ?? []

  const [tyingId, setTyingId] = useState<string | null>(null)
  const [tySiteId, setTySiteId] = useState('')
  const [tyRowKey, setTyRowKey] = useState('')
  const [tying, setTying] = useState(false)
  const [tieError, setTieError] = useState<string | null>(null)

  const activeSites = sites.filter((site) => site.active !== false && !site.deletedAt)

  const beams = useLiveQuery(() => (tySiteId ? listBeamsBySite(tySiteId) : []), [tySiteId]) ?? []
  const uprights = useLiveQuery(() => (tySiteId ? listUprightsBySite(tySiteId) : []), [tySiteId]) ?? []
  const wireDecks = useLiveQuery(() => (tySiteId ? listWireDecksBySite(tySiteId) : []), [tySiteId]) ?? []
  const miscItems = useLiveQuery(() => (tySiteId ? listMiscItemsBySite(tySiteId) : []), [tySiteId]) ?? []

  const availableRows: AvailableRow[] = tySiteId
    ? [
        ...groupBeams(beams).map((row) => ({
          key: `beam:${row.key}`,
          itemType: 'beam' as ItemType,
          itemIds: row.ids,
          description: describeBeam(row),
          quantity: computeAvailableQuantity(row.quantity, row.ids, holds),
        })),
        ...groupUprights(uprights).map((row) => ({
          key: `upright:${row.key}`,
          itemType: 'upright' as ItemType,
          itemIds: row.ids,
          description: describeUpright(row),
          quantity: computeAvailableQuantity(row.quantity, row.ids, holds),
        })),
        ...groupWireDecks(wireDecks).map((row) => ({
          key: `wireDeck:${row.key}`,
          itemType: 'wireDeck' as ItemType,
          itemIds: row.ids,
          description: describeWireDeck(row),
          quantity: computeAvailableQuantity(row.quantity, row.ids, holds),
        })),
        ...groupMiscItems(miscItems).map((row) => ({
          key: `misc:${row.key}`,
          itemType: 'misc' as ItemType,
          itemIds: row.ids,
          description: describeMisc(row),
          quantity: computeAvailableQuantity(row.quantity, row.ids, holds),
        })),
      ]
    : []

  const tyingLineItem = pendingLineItems.find((li) => li.id === tyingId)
  const eligibleRows = tyingLineItem ? availableRows.filter((row) => row.quantity >= tyingLineItem.quantityOrdered) : []

  async function handleImportFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportFile(file)
    setImportFileName(file.name)
    setImportPreview(null)
    setImportParseError(null)
    setImportResultMessage(null)
    setImportSheetNames([])
    setImportParsing(true)
    try {
      const sheetNames = await getSoReportSheetNames(file)
      if (sheetNames.length === 1) {
        setImportPreview(await parseSoReportWorkbook(file, sheetNames[0]))
      } else {
        setImportSheetNames(sheetNames)
      }
    } catch {
      setImportParseError('Could not read that file. Make sure it is a valid Excel export.')
    } finally {
      setImportParsing(false)
    }
  }

  async function handleSelectImportSheet(sheetName: string) {
    if (!importFile) return
    setImportParseError(null)
    setImportParsing(true)
    try {
      setImportPreview(await parseSoReportWorkbook(importFile, sheetName))
    } catch (err) {
      setImportParseError(err instanceof Error ? err.message : 'Could not read that sheet.')
    } finally {
      setImportParsing(false)
    }
  }

  function cancelImportPreview() {
    setImportPreview(null)
    setImportFile(null)
    setImportFileName(null)
    setImportSheetNames([])
    setImportParseError(null)
  }

  async function confirmImport() {
    if (!importPreview) return
    setImportCommitting(true)
    try {
      const { imported, skippedDuplicates } = await importSalesOrderLineItems(importPreview.lineItems)
      setImportResultMessage(
        `Imported ${imported} new line item${imported === 1 ? '' : 's'}` +
          (skippedDuplicates > 0 ? ` (${skippedDuplicates} already imported, skipped).` : '.'),
      )
      cancelImportPreview()
    } finally {
      setImportCommitting(false)
    }
  }

  function startTying(lineItemId: string) {
    setTyingId(lineItemId)
    setTySiteId('')
    setTyRowKey('')
    setTieError(null)
  }

  function cancelTying() {
    setTyingId(null)
    setTySiteId('')
    setTyRowKey('')
    setTieError(null)
  }

  async function handleConfirmTie() {
    const lineItem = tyingLineItem
    const row = eligibleRows.find((r) => r.key === tyRowKey)
    const site = activeSites.find((s) => s.id === tySiteId)
    if (!lineItem || !row || !site) return
    setTying(true)
    setTieError(null)
    try {
      await tieSalesOrderLineItem({
        lineItemId: lineItem.id,
        siteId: site.id,
        siteName: site.name,
        itemType: row.itemType,
        itemIds: row.itemIds,
        tiedDescription: row.description,
      })
      cancelTying()
    } catch (err) {
      setTieError(err instanceof Error ? err.message : 'Could not tie this line item. Please try again.')
    } finally {
      setTying(false)
    }
  }

  if (!permissions.viewProcurementDashboard) {
    return (
      <main className="page">
        <p>
          <Link to="/">← Back</Link>
        </p>
        <p>Your role doesn't have permission to view this page.</p>
      </main>
    )
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to="/">← Back</Link>
      </p>
      <h1>Procurement</h1>

      <p>
        <button type="button" onClick={() => importFileInputRef.current?.click()} disabled={importParsing}>
          {importParsing ? 'Reading…' : 'Import Reports'}
        </button>
        <input
          ref={importFileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="photo-file-input"
          onChange={handleImportFileSelected}
        />
      </p>
      {importParseError && <p className="field-error">{importParseError}</p>}
      {importResultMessage && <p className="placeholder-note">{importResultMessage}</p>}

      {importSheetNames.length > 0 && !importPreview && (
        <div className="field-row">
          <label>
            <strong>{importFileName}</strong> has multiple sheets. Pick the one with the SO data.
            <select defaultValue="" onChange={(e) => handleSelectImportSheet(e.target.value)}>
              <option value="" disabled>
                Select a sheet…
              </option>
              {importSheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={cancelImportPreview}>
            Cancel
          </button>
        </div>
      )}

      {importPreview && (
        <div className="item-section">
          <p>
            Ready to import from <strong>{importFileName}</strong>: {importPreview.lineItems.length} Sales Order
            line item{importPreview.lineItems.length === 1 ? '' : 's'}
            {importPreview.skippedRows > 0
              ? ` (${importPreview.skippedRows} row${importPreview.skippedRows === 1 ? '' : 's'} skipped — no quantity).`
              : '.'}
          </p>
          <div className="dialog-actions">
            <button type="button" onClick={cancelImportPreview} disabled={importCommitting}>
              Cancel
            </button>
            <button type="button" onClick={confirmImport} disabled={importCommitting}>
              {importCommitting ? 'Importing…' : 'Confirm Import'}
            </button>
          </div>
        </div>
      )}

      <section className="item-section">
        <h2>Recent Changes</h2>
        <p className="placeholder-note">
          Nothing to show yet — this will surface recent Sales Order, Invoice, and Bill of Lading activity in one
          feed.
        </p>
      </section>

      <details className="item-section collapsible-section" open>
        <summary className="collapsible-section-summary">Recent SO's ({pendingLineItems.length})</summary>

        {pendingLineItems.length === 0 ? (
          <p className="placeholder-note">No pending Sales Order line items — import a report to bring some in.</p>
        ) : (
          <div className="item-table-wrap">
            <table className="item-table">
              <thead>
                <tr>
                  <th>SO #</th>
                  <th>Warehouse Code</th>
                  <th>Description</th>
                  <th>Qty Ordered</th>
                  <th>Assign to Inventory</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingLineItems.map((li) => (
                  <Fragment key={li.id}>
                    <tr>
                      <td>{li.soNumber}</td>
                      <td>{li.warehouseCode}</td>
                      <td>{li.description}</td>
                      <td>{li.quantityOrdered}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={tyingId === li.id}
                          onChange={(e) => (e.target.checked ? startTying(li.id) : cancelTying())}
                        />
                      </td>
                      <td>
                        <button type="button" className="delete-button" onClick={() => deletePendingSalesOrderLineItem(li.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                    {tyingId === li.id && (
                      <tr>
                        <td colSpan={6}>
                          <div className="field-row">
                            <label>
                              Location
                              <select value={tySiteId} onChange={(e) => { setTySiteId(e.target.value); setTyRowKey('') }}>
                                <option value="">Select a location…</option>
                                {activeSites.map((site) => (
                                  <option key={site.id} value={site.id}>
                                    {site.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {tySiteId && (
                              <label>
                                Inventory Item
                                <select value={tyRowKey} onChange={(e) => setTyRowKey(e.target.value)}>
                                  <option value="">Select an item…</option>
                                  {eligibleRows.map((row) => (
                                    <option key={row.key} value={row.key}>
                                      {row.description} ({row.quantity} available)
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                          {tySiteId && eligibleRows.length === 0 && (
                            <p className="placeholder-note">
                              No item at this location has {li.quantityOrdered} or more available — a line item
                              can only be tied to one row for its full quantity.
                            </p>
                          )}
                          {tieError && <p className="field-error">{tieError}</p>}
                          <div className="dialog-actions">
                            <button type="button" onClick={handleConfirmTie} disabled={tying || !tyRowKey}>
                              {tying ? 'Tying…' : 'Confirm Tie'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <details className="item-section collapsible-section" open>
        <summary className="collapsible-section-summary">Invoices</summary>
        <p className="placeholder-note">Invoice tracking hasn't been built yet.</p>
      </details>

      <details className="item-section collapsible-section" open>
        <summary className="collapsible-section-summary">Bills of Lading</summary>
        <p className="placeholder-note">Company-wide Bill of Lading tracking hasn't been built yet.</p>
      </details>
    </main>
  )
}
