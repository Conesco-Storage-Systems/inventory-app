import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { enqueuePendingDelete } from './pendingDeletes'
import type { ParsedChangeLogRow } from '../import/parseChangeLogReport'
import type { SalesOrderDiscrepancy, SalesOrderLineItem } from '../models/types'

export interface ChangeLogImportResult {
  totalRows: number
  ignoredInserts: number
  alreadyProcessed: number
  unmatched: number
  silentlyUpdated: number
  silentlyRemoved: number
  flaggedForReview: number
}

// Identifies one audit event uniquely enough to skip it on a re-import of
// an overlapping report window — same reasoning as the SO import's own
// de-dup, just keyed on the event itself rather than a line's content.
function rowDedupeKey(row: ParsedChangeLogRow): string {
  return [row.soNumber, row.lineSeq ?? '', row.auditDate, row.changeAction].join('|')
}

function findChange(row: ParsedChangeLogRow, field: string) {
  return row.changes.find((c) => c.field === field)
}

// "Old" values aren't always present on a row — only the field(s) that
// actually changed in that one event get an Old/New pair — so the identity
// anchor used for fallback matching has to fall back to the row's
// current/base value whenever that particular field wasn't the one being
// edited. This is what keeps the anchor stable across the one event that
// *does* edit it: that row carries an explicit Old value equal to what's
// still stored locally, while every other row just repeats the (unchanged)
// current value.
function effectiveOldDescription(row: ParsedChangeLogRow): string {
  return findChange(row, 'extended description')?.oldValue || row.description
}

function effectiveOldWarehouseCode(row: ParsedChangeLogRow): string {
  return findChange(row, 'locncode')?.oldValue || row.warehouseCode
}

// Finds every local line item (pending or tied) that represents the same
// SalesPad order line as this change-log row. Prefers the line-sequence
// number when both sides have one — exact, unaffected by any edit to that
// line's own fields. Falls back to (SO #, description, warehouse code) —
// deliberately never on quantity, since tying can split one SalesPad
// line's quantity across more than one local row, and quantity is exactly
// the field most likely to be the thing that changed.
//
// Known limitation: two genuinely different lines on the same order with
// identical description and warehouse code are indistinguishable from each
// other without a line-sequence number — rare, but worth watching for
// during testing.
function findMatchingGroup(allItems: SalesOrderLineItem[], row: ParsedChangeLogRow): SalesOrderLineItem[] {
  const forThisOrder = allItems.filter((li) => li.soNumber === row.soNumber)

  if (row.lineSeq != null) {
    const bySeq = forThisOrder.filter((li) => li.lineSeq === row.lineSeq)
    if (bySeq.length > 0) return bySeq
  }

  const oldDescription = effectiveOldDescription(row)
  const oldWarehouseCode = effectiveOldWarehouseCode(row)
  return forThisOrder.filter((li) => li.description === oldDescription && li.warehouseCode === oldWarehouseCode)
}

function applyRecognizedField(fields: Partial<SalesOrderLineItem>, field: string, newValue: string): void {
  switch (field) {
    case 'extended description':
    case 'itemdesc':
      fields.description = newValue
      break
    case 'locncode':
      fields.warehouseCode = newValue
      break
    case 'quantity': {
      const qty = Number(newValue)
      if (Number.isFinite(qty)) fields.quantityOrdered = qty
      break
    }
    default:
      break
  }
}

async function findOpenDiscrepancyForGroup(groupIds: string[]): Promise<SalesOrderDiscrepancy | undefined> {
  const idSet = new Set(groupIds)
  const all = await db.salesOrderDiscrepancies.toArray()
  return all.find((d) => !d.resolved && d.lineItemIds.length === idSet.size && d.lineItemIds.every((id) => idSet.has(id)))
}

// Matches and applies one row; returns false if it couldn't be matched to
// any known local line item. Doesn't touch the processed-keys dedupe log —
// the caller decides when a row's outcome is final.
async function applyRow(row: ParsedChangeLogRow, result: ChangeLogImportResult): Promise<boolean> {
  const allItems = await db.salesOrderLineItems.toArray()
  const group = findMatchingGroup(allItems, row)
  if (group.length === 0) return false

  const anyTied = group.some((li) => li.status === 'tied')

  if (!anyTied) {
    if (row.changeAction === 'DELETE') {
      for (const li of group) {
        await enqueuePendingDelete('salesOrderLineItems', li.id)
        await db.salesOrderLineItems.delete(li.id)
      }
      result.silentlyRemoved += group.length
    } else {
      const fields: Partial<SalesOrderLineItem> = {}
      for (const change of row.changes) applyRecognizedField(fields, change.field, change.newValue)
      if (Object.keys(fields).length > 0) {
        for (const li of group) {
          await db.salesOrderLineItems.update(li.id, {
            ...fields,
            updatedAt: Date.now(),
            syncStatus: 'pending',
          })
        }
        result.silentlyUpdated += group.length
      }
    }
  } else {
    const groupIds = group.map((li) => li.id)
    const existing = await findOpenDiscrepancyForGroup(groupIds)
    const now = Date.now()
    const action = row.changeAction === 'DELETE' ? 'deleted' : 'updated'

    if (existing) {
      const changes = [...existing.changes]
      for (const change of row.changes) {
        const idx = changes.findIndex((c) => c.field === change.field)
        if (idx >= 0) {
          changes[idx] = { ...changes[idx], newValue: change.newValue }
        } else {
          changes.push(change)
        }
      }
      await db.salesOrderDiscrepancies.update(existing.id, {
        // A delete supersedes a prior update flag — once the line is
        // gone, that's the thing to review, regardless of what field
        // edits happened to it before.
        action: action === 'deleted' ? 'deleted' : existing.action,
        changes,
        lastChangedAt: row.auditDate,
        updatedAt: now,
      })
    } else {
      await db.salesOrderDiscrepancies.add({
        id: uuidv4(),
        lineItemIds: groupIds,
        soNumber: row.soNumber,
        warehouseCode: row.warehouseCode,
        tiedSiteNames: [...new Set(group.filter((li) => li.tiedSiteName).map((li) => li.tiedSiteName))],
        description: group[0].description,
        action,
        changes: row.changes,
        firstDetectedAt: row.auditDate,
        lastChangedAt: row.auditDate,
        resolved: false,
        resolvedAt: 0,
        resolvedBy: '',
        createdAt: now,
        updatedAt: now,
      })
    }
    result.flaggedForReview++
  }

  return true
}

// Processes one Recent Changes import: a line that hasn't been tied yet
// gets its fields updated directly (nothing's been deducted, so there's
// nothing to review); a line that's already tied gets an open
// SalesOrderDiscrepancy created or updated instead, collapsing repeated
// edits since the last review into one net-change entry per line. An
// INSERT event is a line being born, not a change to something already
// known, so it's skipped outright. Every row — matched or not — is marked
// processed so a re-import of an overlapping report window is a no-op.
export async function importSalesOrderChangeLog(rows: ParsedChangeLogRow[]): Promise<ChangeLogImportResult> {
  const result: ChangeLogImportResult = {
    totalRows: rows.length,
    ignoredInserts: 0,
    alreadyProcessed: 0,
    unmatched: 0,
    silentlyUpdated: 0,
    silentlyRemoved: 0,
    flaggedForReview: 0,
  }

  // Oldest first, so a line's edits are applied — and chained against each
  // other — in the order they actually happened, even when one import
  // batch covers several edits to the same line.
  const sorted = [...rows].sort((a, b) => a.auditDate - b.auditDate)

  const toRetry: ParsedChangeLogRow[] = []

  for (const row of sorted) {
    const key = rowDedupeKey(row)
    if (await db.processedChangeLogKeys.get(key)) {
      result.alreadyProcessed++
      continue
    }

    if (row.changeAction === 'INSERT') {
      result.ignoredInserts++
      await db.processedChangeLogKeys.add({ id: key })
      continue
    }

    const matched = await applyRow(row, result)
    if (matched) {
      await db.processedChangeLogKeys.add({ id: key })
    } else {
      toRetry.push(row)
    }
  }

  // One retry pass over whatever didn't match the first time. The
  // fallback match (no lineSeq) anchors on a row's own "old" value when
  // present, else the sheet's current/base column for that field — but
  // that base column always reflects the line's *latest* value, even on a
  // chronologically earlier row, so an earlier row can fail to match
  // against our still-not-yet-updated local record when a later row in
  // this same batch is what actually changes that field. By now every row
  // that *did* match on the first pass has already been applied, so the
  // local record has caught up — giving a genuinely stale row (not really
  // unmatched, just processed out of order relative to its own anchor) a
  // second chance before it's counted as unmatched for good.
  for (const row of toRetry) {
    const matched = await applyRow(row, result)
    if (!matched) result.unmatched++
    await db.processedChangeLogKeys.add({ id: rowDedupeKey(row) })
  }

  return result
}
