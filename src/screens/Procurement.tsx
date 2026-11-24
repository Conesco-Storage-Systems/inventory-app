import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import TieAllocationColumn, {
  EMPTY_TIE_ALLOCATION,
  type TieAllocationSelection,
  type TieAllocationValue,
} from '../components/TieAllocationColumn'
import { db } from '../db/db'
import { importSalesOrderChangeLog, type ChangeLogImportResult } from '../db/salesOrderChangeLog'
import { listOpenSalesOrderDiscrepancies, resolveSalesOrderDiscrepancy } from '../db/salesOrderDiscrepancies'
import {
  deletePendingSalesOrderLineItem,
  importSalesOrderLineItems,
  listPendingSalesOrderLineItems,
  previewImportDuplicateFlags,
  tieSalesOrderLineItem,
  type TieAllocation,
} from '../db/salesOrders'
import {
  getChangeLogSheetNames,
  parseSoChangeLogWorkbook,
  type SoChangeLogParseResult,
} from '../import/parseChangeLogReport'
import { getSoReportSheetNames, parseSoReportWorkbook, type SoReportParseResult } from '../import/parseSoReport'
import type { SalesOrderLineItem } from '../models/types'
import { useRole } from '../state/RoleContext'
import { formatSoNumber } from '../utils/soNumber'

// Known GP/SalesPad field names from the change log's "Old X"/"New X"
// column pairs, given a friendlier label. Anything not in this list (the
// export's tracked fields aren't fixed — see parseChangeLogReport.ts) just
// gets title-cased instead of showing its raw column suffix.
const CHANGE_FIELD_LABELS: Record<string, string> = {
  itemnmbr: 'Item Number',
  itemdesc: 'Item Description',
  'extended description': 'Description',
  locncode: 'Location',
  quantity: 'Quantity',
  unitcost: 'Unit Cost',
  extdcost: 'Extended Cost',
  unitprce: 'Unit Price',
  xtndprce: 'Extended Price',
}

function friendlyFieldLabel(field: string): string {
  return CHANGE_FIELD_LABELS[field] ?? field.replace(/\b\w/g, (c) => c.toUpperCase())
}

// Only a field whose Old and New are both present and actually differ is
// worth showing here — a DELETE/INSERT row's untouched fields always have
// one side blank (nothing to compare), and that's noise, not a change. One
// string per changed field — the caller renders each on its own line.
function formatChangeLines(changes: { field: string; oldValue: string; newValue: string }[]): string[] {
  return changes
    .filter((c) => c.oldValue && c.newValue && c.oldValue !== c.newValue)
    .map((c) => {
      const label = friendlyFieldLabel(c.field)
      return `Old ${label}: ${c.oldValue} --> New ${label}: ${c.newValue}`
    })
}

export default function Procurement() {
  const { permissions } = useRole()
  const importFileInputRef = useRef<HTMLInputElement>(null)

  const [importFile, setImportFile] = useState<File | null>(null)
  const [importFileName, setImportFileName] = useState<string | null>(null)
  const [importSheetNames, setImportSheetNames] = useState<string[]>([])
  const [importPreview, setImportPreview] = useState<SoReportParseResult | null>(null)
  const [importPreviewDuplicateFlags, setImportPreviewDuplicateFlags] = useState<boolean[]>([])
  const [importParsing, setImportParsing] = useState(false)
  const [importParseError, setImportParseError] = useState<string | null>(null)
  const [importCommitting, setImportCommitting] = useState(false)
  const [importResultMessage, setImportResultMessage] = useState<string | null>(null)

  const changeLogFileInputRef = useRef<HTMLInputElement>(null)
  const [changeLogFile, setChangeLogFile] = useState<File | null>(null)
  const [changeLogFileName, setChangeLogFileName] = useState<string | null>(null)
  const [changeLogSheetNames, setChangeLogSheetNames] = useState<string[]>([])
  const [changeLogPreview, setChangeLogPreview] = useState<SoChangeLogParseResult | null>(null)
  const [changeLogParsing, setChangeLogParsing] = useState(false)
  const [changeLogParseError, setChangeLogParseError] = useState<string | null>(null)
  const [changeLogCommitting, setChangeLogCommitting] = useState(false)
  const [changeLogResultMessage, setChangeLogResultMessage] = useState<string | null>(null)

  const sites = useLiveQuery(() => db.sites.orderBy('name').toArray(), []) ?? []
  const pendingLineItems = useLiveQuery(() => listPendingSalesOrderLineItems(), []) ?? []
  const openDiscrepancies = useLiveQuery(() => listOpenSalesOrderDiscrepancies(), []) ?? []

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

  async function loadPreview(file: File, sheetName: string) {
    const preview = await parseSoReportWorkbook(file, sheetName)
    setImportPreview(preview)
    setImportPreviewDuplicateFlags(await previewImportDuplicateFlags(preview.lineItems))
  }

  async function handleImportFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportFile(file)
    setImportFileName(file.name)
    setImportPreview(null)
    setImportPreviewDuplicateFlags([])
    setImportParseError(null)
    setImportResultMessage(null)
    setImportSheetNames([])
    setImportParsing(true)
    try {
      const sheetNames = await getSoReportSheetNames(file)
      if (sheetNames.length === 1) {
        await loadPreview(file, sheetNames[0])
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
      await loadPreview(importFile, sheetName)
    } catch (err) {
      setImportParseError(err instanceof Error ? err.message : 'Could not read that sheet.')
    } finally {
      setImportParsing(false)
    }
  }

  function cancelImportPreview() {
    setImportPreview(null)
    setImportPreviewDuplicateFlags([])
    setImportFile(null)
    setImportFileName(null)
    setImportSheetNames([])
    setImportParseError(null)
  }

  async function confirmImport() {
    if (!importPreview) return
    setImportCommitting(true)
    try {
      const { imported, flaggedDuplicates } = await importSalesOrderLineItems(importPreview.lineItems)
      setImportResultMessage(
        `Imported ${imported} line item${imported === 1 ? '' : 's'}` +
          (flaggedDuplicates > 0 ? ` (${flaggedDuplicates} flagged as duplicates — see below).` : '.'),
      )
      cancelImportPreview()
    } finally {
      setImportCommitting(false)
    }
  }

  async function loadChangeLogPreview(file: File, sheetName: string) {
    setChangeLogPreview(await parseSoChangeLogWorkbook(file, sheetName))
  }

  async function handleChangeLogFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setChangeLogFile(file)
    setChangeLogFileName(file.name)
    setChangeLogPreview(null)
    setChangeLogParseError(null)
    setChangeLogResultMessage(null)
    setChangeLogSheetNames([])
    setChangeLogParsing(true)
    try {
      const sheetNames = await getChangeLogSheetNames(file)
      if (sheetNames.length === 1) {
        await loadChangeLogPreview(file, sheetNames[0])
      } else {
        setChangeLogSheetNames(sheetNames)
      }
    } catch {
      setChangeLogParseError('Could not read that file. Make sure it is a valid Excel export.')
    } finally {
      setChangeLogParsing(false)
    }
  }

  async function handleSelectChangeLogSheet(sheetName: string) {
    if (!changeLogFile) return
    setChangeLogParseError(null)
    setChangeLogParsing(true)
    try {
      await loadChangeLogPreview(changeLogFile, sheetName)
    } catch (err) {
      setChangeLogParseError(err instanceof Error ? err.message : 'Could not read that sheet.')
    } finally {
      setChangeLogParsing(false)
    }
  }

  function cancelChangeLogPreview() {
    setChangeLogPreview(null)
    setChangeLogFile(null)
    setChangeLogFileName(null)
    setChangeLogSheetNames([])
    setChangeLogParseError(null)
  }

  function describeChangeLogResult(result: ChangeLogImportResult): string {
    const parts: string[] = []
    if (result.flaggedForReview > 0) {
      parts.push(`flagged ${result.flaggedForReview} tied line${result.flaggedForReview === 1 ? '' : 's'} for review`)
    }
    if (result.silentlyUpdated > 0) {
      parts.push(`updated ${result.silentlyUpdated} pending line${result.silentlyUpdated === 1 ? '' : 's'}`)
    }
    if (result.silentlyRemoved > 0) {
      parts.push(`removed ${result.silentlyRemoved} pending line${result.silentlyRemoved === 1 ? '' : 's'} that were deleted on the order`)
    }
    if (result.unmatched > 0) {
      parts.push(`${result.unmatched} row${result.unmatched === 1 ? '' : 's'} didn't match a known line item`)
    }
    if (result.ignoredInserts > 0) {
      parts.push(`${result.ignoredInserts} new-line insert${result.ignoredInserts === 1 ? '' : 's'} ignored`)
    }
    if (result.alreadyProcessed > 0) {
      parts.push(`${result.alreadyProcessed} already processed`)
    }
    return parts.length > 0 ? `Processed ${result.totalRows} rows: ${parts.join(', ')}.` : `Processed ${result.totalRows} rows — nothing to do.`
  }

  async function confirmChangeLogImport() {
    if (!changeLogPreview) return
    setChangeLogCommitting(true)
    try {
      const result = await importSalesOrderChangeLog(changeLogPreview.rows)
      setChangeLogResultMessage(describeChangeLogResult(result))
      cancelChangeLogPreview()
    } finally {
      setChangeLogCommitting(false)
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

  const previewNewItems = importPreview
    ? importPreview.lineItems.filter((_, i) => !importPreviewDuplicateFlags[i])
    : []
  const previewDuplicateItems = importPreview
    ? importPreview.lineItems.filter((_, i) => importPreviewDuplicateFlags[i])
    : []
  const normalPendingItems = pendingLineItems.filter((li) => !li.flaggedDuplicate)
  const duplicatePendingItems = pendingLineItems.filter((li) => li.flaggedDuplicate)

  // Shared by both the normal and "Duplicates" sections below — same
  // columns, same tie/remove actions either way, since a flagged row still
  // needs to be assignable or removable just like any other pending item.
  function renderLineItemsTable(items: SalesOrderLineItem[]) {
    return (
      <div className="item-table-wrap">
        <table className="item-table">
          <thead>
            <tr>
              <th>SO #</th>
              <th>Warehouse Code</th>
              <th>Qty Ordered</th>
              <th>Created On</th>
              <th>Salesperson ID</th>
              <th>Assign to Inventory</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((li) => (
              <Fragment key={li.id}>
                <tr>
                  <td>{formatSoNumber(li.soNumber)}</td>
                  <td>{li.warehouseCode}</td>
                  <td>{li.quantityOrdered}</td>
                  <td>{li.createdOn ? new Date(li.createdOn).toLocaleDateString() : '—'}</td>
                  <td>{li.salespersonId || '—'}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={tyingId === li.id}
                      onChange={(e) => (e.target.checked ? startTying(li.id) : cancelTying())}
                    />
                  </td>
                  <td className="col-left">{li.description}</td>
                  <td>
                    <button type="button" className="delete-button" onClick={() => deletePendingSalesOrderLineItem(li.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
                {tyingId === li.id && (
                  <tr>
                    <td colSpan={8} className="col-left">
                      <div className="tie-allocation-row">
                        {tyRows.map((row, index) => {
                          const othersTotal = tyRowsTotal - (Number(row.quantity) || 0)
                          const maxQuantity = Math.max(0, li.quantityOrdered - othersTotal)
                          const otherSelections: TieAllocationSelection[] = tyRows
                            .filter((_, i) => i !== index)
                            .filter((r) => r.siteId && r.rowKey)
                            .map((r) => ({ siteId: r.siteId, rowKey: r.rowKey, quantity: Number(r.quantity) || 0 }))
                          return (
                            <TieAllocationColumn
                              key={index}
                              activeSites={activeSites}
                              value={row}
                              maxQuantity={maxQuantity}
                              otherSelections={otherSelections}
                              importedDescription={li.description}
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
    )
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

        <p>
          <button type="button" onClick={() => changeLogFileInputRef.current?.click()} disabled={changeLogParsing}>
            {changeLogParsing ? 'Reading…' : 'Import File'}
          </button>
          <input
            ref={changeLogFileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="photo-file-input"
            onChange={handleChangeLogFileSelected}
          />
        </p>
        {changeLogParseError && <p className="field-error">{changeLogParseError}</p>}
        {changeLogResultMessage && <p className="placeholder-note">{changeLogResultMessage}</p>}

        {changeLogSheetNames.length > 0 && !changeLogPreview && (
          <div className="field-row">
            <label>
              <strong>{changeLogFileName}</strong> has multiple sheets. Pick the one with the change log data.
              <select defaultValue="" onChange={(e) => handleSelectChangeLogSheet(e.target.value)}>
                <option value="" disabled>
                  Select a sheet…
                </option>
                {changeLogSheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={cancelChangeLogPreview}>
              Cancel
            </button>
          </div>
        )}

        {changeLogPreview && (
          <div className="item-section">
            {(() => {
              const actionableRows = changeLogPreview.rows.filter((row) => row.changeAction !== 'INSERT')
              const insertCount = changeLogPreview.rows.length - actionableRows.length
              return (
                <>
                  <p>
                    Ready to import from <strong>{changeLogFileName}</strong>: {actionableRows.length} update/delete
                    event{actionableRows.length === 1 ? '' : 's'}
                    {insertCount > 0 ? ` (${insertCount} new-line insert${insertCount === 1 ? '' : 's'} will be ignored)` : ''}
                    {changeLogPreview.skippedRows > 0
                      ? `, ${changeLogPreview.skippedRows} row${changeLogPreview.skippedRows === 1 ? '' : 's'} skipped — missing SO # or action.`
                      : '.'}
                  </p>
                  {actionableRows.length > 0 && (
                    <div className="item-table-wrap">
                      <table className="item-table">
                        <thead>
                          <tr>
                            <th>SO #</th>
                            <th>Warehouse Code</th>
                            <th>Action</th>
                            <th>Batch ID</th>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Changes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {actionableRows.map((row, i) => (
                            <tr key={i}>
                              <td>{formatSoNumber(row.soNumber)}</td>
                              <td>{row.warehouseCode}</td>
                              <td>{row.changeAction}</td>
                              <td>{row.batchId || '—'}</td>
                              <td>{row.auditDate ? new Date(row.auditDate).toLocaleString() : '—'}</td>
                              <td className="col-notes">{row.description}</td>
                              <td className="col-left">
                                {formatChangeLines(row.changes).map((line, j) => (
                                  <div key={j}>{line}</div>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )
            })()}

            <div className="import-preview-actions">
              <button type="button" onClick={cancelChangeLogPreview} disabled={changeLogCommitting}>
                Cancel
              </button>
              <button type="button" onClick={confirmChangeLogImport} disabled={changeLogCommitting}>
                {changeLogCommitting ? 'Importing…' : 'Confirm Import'}
              </button>
            </div>
          </div>
        )}

        {openDiscrepancies.length === 0 ? (
          <p className="placeholder-note">No discrepancies need attention right now.</p>
        ) : (
          <div className="item-table-wrap">
            <table className="item-table">
              <thead>
                <tr>
                  <th>SO #</th>
                  <th>Location</th>
                  <th>Line Item</th>
                  <th>Action</th>
                  <th>Changes</th>
                  <th>Last Changed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {openDiscrepancies.map((d) => (
                  <tr key={d.id}>
                    <td>{formatSoNumber(d.soNumber)}</td>
                    <td>{d.tiedSiteNames.join(', ') || d.warehouseCode}</td>
                    <td className="col-notes">{d.description}</td>
                    <td>{d.action === 'deleted' ? 'Deleted' : 'Updated'}</td>
                    <td className="col-left">
                      {formatChangeLines(d.changes).map((line, j) => (
                        <div key={j}>{line}</div>
                      ))}
                    </td>
                    <td>{d.lastChangedAt ? new Date(d.lastChangedAt).toLocaleString() : '—'}</td>
                    <td>
                      <button type="button" onClick={() => resolveSalesOrderDiscrepancy(d.id)}>
                        Mark Reviewed
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

            {previewNewItems.length > 0 && (
              <div className="item-table-wrap">
                <table className="item-table">
                  <thead>
                    <tr>
                      <th>SO #</th>
                      <th>Warehouse Code</th>
                      <th>Qty Ordered</th>
                      <th>Created On</th>
                      <th>Salesperson ID</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewNewItems.map((li, i) => (
                      <tr key={i}>
                        <td>{formatSoNumber(li.soNumber)}</td>
                        <td>{li.warehouseCode}</td>
                        <td>{li.quantity}</td>
                        <td>{li.createdOn ? new Date(li.createdOn).toLocaleDateString() : '—'}</td>
                        <td>{li.salespersonId || '—'}</td>
                        <td className="col-left">{li.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {previewDuplicateItems.length > 0 && (
              <>
                <h3>Duplicates</h3>
                <p className="placeholder-note">
                  These match a line item already in the system — they'll still be imported, just flagged below for
                  review.
                </p>
                <div className="item-table-wrap">
                  <table className="item-table">
                    <thead>
                      <tr>
                        <th>SO #</th>
                        <th>Warehouse Code</th>
                        <th>Qty Ordered</th>
                        <th>Created On</th>
                        <th>Salesperson ID</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewDuplicateItems.map((li, i) => (
                        <tr key={i}>
                          <td>{formatSoNumber(li.soNumber)}</td>
                          <td>{li.warehouseCode}</td>
                          <td>{li.quantity}</td>
                          <td>{li.createdOn ? new Date(li.createdOn).toLocaleDateString() : '—'}</td>
                          <td>{li.salespersonId || '—'}</td>
                          <td className="col-left">{li.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="import-preview-actions">
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
          <>
            {normalPendingItems.length > 0 && renderLineItemsTable(normalPendingItems)}
            {duplicatePendingItems.length > 0 && (
              <>
                <h3>Duplicates</h3>
                <p className="placeholder-note">
                  These matched a line item already in the system when imported — assign or remove them like any
                  other pending item.
                </p>
                {renderLineItemsTable(duplicatePendingItems)}
              </>
            )}
          </>
        )}
      </details>
    </main>
  )
}
