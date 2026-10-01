import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import TieAllocationColumn, { EMPTY_TIE_ALLOCATION, type TieAllocationValue } from '../components/TieAllocationColumn'
import { db } from '../db/db'
import {
  deletePendingSalesOrderLineItem,
  importSalesOrderLineItems,
  listPendingSalesOrderLineItems,
  tieSalesOrderLineItem,
  type TieAllocation,
} from '../db/salesOrders'
import { getSoReportSheetNames, parseSoReportWorkbook, type SoReportParseResult } from '../import/parseSoReport'
import { useRole } from '../state/RoleContext'
import { formatSoNumber } from '../utils/soNumber'

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
  const [tyRows, setTyRows] = useState<TieAllocationValue[]>([EMPTY_TIE_ALLOCATION])
  const [tying, setTying] = useState(false)
  const [tieError, setTieError] = useState<string | null>(null)

  const activeSites = sites.filter((site) => site.active !== false && !site.deletedAt)

  const tyingLineItem = pendingLineItems.find((li) => li.id === tyingId)

  const tyRowsTotal = tyRows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)

  // Once the last column has a complete selection but the columns still
  // don't add up to the full line item, add another empty column — this
  // is what makes new columns "pop up" as you go instead of needing a
  // manual add button.
  useEffect(() => {
    if (!tyingLineItem) return
    const lastRow = tyRows[tyRows.length - 1]
    const lastRowComplete = !!(lastRow && lastRow.siteId && lastRow.rowKey && Number(lastRow.quantity) > 0)
    if (lastRowComplete && tyRowsTotal < tyingLineItem.quantityOrdered) {
      setTyRows((prev) => [...prev, EMPTY_TIE_ALLOCATION])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tyRows, tyingLineItem?.quantityOrdered])

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
    setTyRows([EMPTY_TIE_ALLOCATION])
    setTieError(null)
  }

  function cancelTying() {
    setTyingId(null)
    setTyRows([EMPTY_TIE_ALLOCATION])
    setTieError(null)
  }

  function updateTyRow(index: number, next: TieAllocationValue) {
    setTyRows((prev) => prev.map((row, i) => (i === index ? next : row)))
  }

  function removeTyRow(index: number) {
    setTyRows((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleConfirmTie() {
    const lineItem = tyingLineItem
    if (!lineItem) return
    const allocations: TieAllocation[] = tyRows
      .filter((row) => row.siteId && row.rowKey && Number(row.quantity) > 0)
      .map((row) => ({
        siteId: row.siteId,
        siteName: row.siteName,
        itemType: row.itemType as Exclude<TieAllocationValue['itemType'], ''>,
        itemIds: row.itemIds,
        tiedDescription: row.description,
        quantity: Number(row.quantity),
      }))
    if (allocations.length === 0) return
    setTying(true)
    setTieError(null)
    try {
      await tieSalesOrderLineItem(lineItem.id, allocations)
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

      <section className="item-section">
        <h2>Recent Changes</h2>
        <p className="placeholder-note">
          This will surface recent sales order changes in one feed in order to show discrepancies needing attention
          in inventory
        </p>
      </section>

      <details className="item-section collapsible-section" open>
        <summary className="collapsible-section-summary">Recent SO's ({pendingLineItems.length})</summary>

        <p>
          <button type="button" onClick={() => importFileInputRef.current?.click()} disabled={importParsing}>
            {importParsing ? 'Reading…' : 'Import Sales Orders'}
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
                      <td>{formatSoNumber(li.soNumber)}</td>
                      <td>{li.warehouseCode}</td>
                      <td className="col-left">{li.description}</td>
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
                        <td colSpan={6} className="col-left">
                          <div className="tie-allocation-row">
                            {tyRows.map((row, index) => {
                              const othersTotal = tyRowsTotal - (Number(row.quantity) || 0)
                              const maxQuantity = Math.max(0, li.quantityOrdered - othersTotal)
                              return (
                                <TieAllocationColumn
                                  key={index}
                                  activeSites={activeSites}
                                  holds={holds}
                                  value={row}
                                  maxQuantity={maxQuantity}
                                  onChange={(next) => updateTyRow(index, next)}
                                  onRemove={index > 0 ? () => removeTyRow(index) : undefined}
                                  isFirst={index === 0}
                                />
                              )
                            })}
                          </div>
                          {tyRowsTotal > 0 && tyRowsTotal < li.quantityOrdered && (
                            <p className="placeholder-note">
                              {tyRowsTotal} of {li.quantityOrdered} accounted for so far — add another location to
                              cover the rest, or confirm now and leave {li.quantityOrdered - tyRowsTotal} pending to
                              tie later.
                            </p>
                          )}
                          {tieError && <p className="field-error">{tieError}</p>}
                          <p>
                            <button type="button" onClick={handleConfirmTie} disabled={tying || tyRowsTotal === 0}>
                              {tying ? 'Tying…' : 'Confirm Tie'}
                            </button>
                          </p>
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
    </main>
  )
}
