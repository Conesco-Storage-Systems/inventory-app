import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { deductGroupQuantity, restoreGroupQuantity } from './items'
import { enqueuePendingDelete } from './pendingDeletes'
import { getEditorName } from '../state/editor'
import type { ParsedSoLineItem } from '../import/parseSoReport'
import type { BillOfLading, ItemType, SalesOrderLineItem } from '../models/types'

// A Sales Order line item can be split across more than one BOL over time
// (a partial shipment now, the rest later) — this adds up how much of it
// has actually shipped so far, across every BOL that's been signed and
// marked shipped, by following each BOL line's sourceLineItemId back to
// the SalesOrderLineItem id(s) passed in. Used both to show "X of Y
// shipped" on a Sales Order and to classify Partially Shipped vs Shipped
// on the Sales Orders page.
export function sumShippedQuantity(
  lineItemIds: string[],
  bols: BillOfLading[],
): { qty: number; lastShippedAt: number } {
  const idSet = new Set(lineItemIds)
  let qty = 0
  let lastShippedAt = 0
  for (const bol of bols) {
    if (bol.shippedAt <= 0) continue
    let contributed = false
    for (const li of bol.lineItems) {
      if (li.sourceLineItemId && idSet.has(li.sourceLineItemId)) {
        qty += li.qtyShipped
        contributed = true
      }
    }
    if (contributed) lastShippedAt = Math.max(lastShippedAt, bol.shippedAt)
  }
  return { qty, lastShippedAt }
}

export async function listAllSalesOrderSchedules() {
  return db.salesOrderSchedules.toArray()
}

export async function getSalesOrderSchedule(soNumber: string, siteId: string) {
  return db.salesOrderSchedules.where('[soNumber+siteId]').equals([soNumber, siteId]).first()
}

// Setting a schedule for a (soNumber, siteId) pair that already has one
// updates that row instead of creating a duplicate — there's only ever one
// planned ship date per pair.
export async function setSalesOrderSchedule(
  soNumber: string,
  siteId: string,
  siteName: string,
  scheduledShipDate: string,
): Promise<void> {
  const now = Date.now()
  const editorName = getEditorName()
  const existing = await getSalesOrderSchedule(soNumber, siteId)
  if (existing) {
    await db.salesOrderSchedules.update(existing.id, {
      scheduledShipDate,
      lastUpdatedBy: editorName,
      lastUpdatedAt: now,
      syncStatus: 'pending',
    })
    return
  }
  await db.salesOrderSchedules.add({
    id: uuidv4(),
    soNumber,
    siteId,
    siteName,
    scheduledShipDate,
    createdBy: editorName,
    createdAt: now,
    lastUpdatedBy: editorName,
    lastUpdatedAt: now,
    syncStatus: 'pending',
  })
}

// "Remove Schedule Date" — drops the planned ship date for this (soNumber,
// siteId) pair, which sends it back to the "Not yet Scheduled" bucket on
// the Sales Orders page (unless a BOL already in progress or shipped for
// it says otherwise).
export async function deleteSalesOrderSchedule(soNumber: string, siteId: string): Promise<void> {
  const existing = await getSalesOrderSchedule(soNumber, siteId)
  if (!existing) return
  await enqueuePendingDelete('salesOrderSchedules', existing.id)
  await db.salesOrderSchedules.delete(existing.id)
}

// Rows already imported (pending OR tied) are matched on these four
// fields so re-importing an overlapping weekly report (an open SO can
// show up again in the next week's export) doesn't create duplicates.
// Uses importSourceKey when a row has one (set once at import, preserved
// across a partial-tie split) rather than its live quantityOrdered, which
// can shrink after a split and would otherwise look like a "new" row on
// the next re-import of the same original report line.
function importKey(li: { soNumber: string; description: string; warehouseCode: string; quantityOrdered: number }) {
  return [li.soNumber, li.description, li.warehouseCode, li.quantityOrdered].join('|')
}

function effectiveImportSourceKey(li: SalesOrderLineItem): string {
  return li.importSourceKey ?? importKey(li)
}

export async function importSalesOrderLineItems(items: ParsedSoLineItem[]): Promise<{ imported: number; skippedDuplicates: number }> {
  const existing = await db.salesOrderLineItems.toArray()
  const existingKeys = new Set(existing.map(effectiveImportSourceKey))

  const now = Date.now()
  let imported = 0
  let skippedDuplicates = 0
  const toAdd: SalesOrderLineItem[] = []

  for (const parsed of items) {
    const key = importKey({
      soNumber: parsed.soNumber,
      description: parsed.description,
      warehouseCode: parsed.warehouseCode,
      quantityOrdered: parsed.quantity,
    })
    if (existingKeys.has(key)) {
      skippedDuplicates++
      continue
    }
    existingKeys.add(key)
    imported++
    toAdd.push({
      id: uuidv4(),
      soNumber: parsed.soNumber,
      description: parsed.description,
      warehouseCode: parsed.warehouseCode,
      quantityOrdered: parsed.quantity,
      importSourceKey: key,
      status: 'pending',
      tiedSiteId: '',
      tiedSiteName: '',
      tiedItemType: '',
      tiedItemIds: [],
      tiedDescription: '',
      tiedAt: 0,
      tiedBy: '',
      importedAt: now,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    })
  }

  if (toAdd.length > 0) await db.salesOrderLineItems.bulkAdd(toAdd)
  return { imported, skippedDuplicates }
}

export async function listPendingSalesOrderLineItems(): Promise<SalesOrderLineItem[]> {
  const rows = await db.salesOrderLineItems.where('status').equals('pending').toArray()
  return rows.sort((a, b) => a.createdAt - b.createdAt)
}

export async function listTiedSalesOrderLineItemsBySite(siteId: string): Promise<SalesOrderLineItem[]> {
  const rows = await db.salesOrderLineItems.where('tiedSiteId').equals(siteId).toArray()
  return rows.sort((a, b) => b.tiedAt - a.tiedAt)
}

// Reached from a specific location's Sales Orders dropdown — a Sales
// Order can span multiple locations (different line items tied to
// different warehouses), so this only shows what's actually tied here,
// never other locations' items and never still-pending ones.
export async function listTiedLineItemsBySoNumberAndSite(soNumber: string, siteId: string): Promise<SalesOrderLineItem[]> {
  const rows = await db.salesOrderLineItems.where('soNumber').equals(soNumber).toArray()
  return rows.filter((li) => li.status === 'tied' && li.tiedSiteId === siteId).sort((a, b) => b.tiedAt - a.tiedAt)
}

export async function deletePendingSalesOrderLineItem(id: string): Promise<void> {
  const existing = await db.salesOrderLineItems.get(id)
  if (!existing || existing.status !== 'pending') return
  await enqueuePendingDelete('salesOrderLineItems', id)
  await db.salesOrderLineItems.delete(id)
}

export interface TieAllocation {
  siteId: string
  siteName: string
  itemType: ItemType
  itemIds: string[]
  tiedDescription: string
  // Exactly how much to pull from this row — capped to what's left on the
  // line item (and expected to already be capped to what the row actually
  // has, by the caller).
  quantity: number
}

// Ties a pending line item across one or more inventory rows/locations in
// a single pass — e.g. a 300-unit order split 150 at Pineville, 150 at
// Maricopa. Each allocation becomes its own tied line item (so each has
// its own single, unambiguous tied-to location, same as before); whatever
// isn't covered by the allocations stays on the original row as a smaller
// pending remainder, ready to be tied again later. Deducting inventory and
// marking things tied must succeed or fail together — otherwise a failure
// partway through (a closed tab, a browser crash) could leave inventory
// deducted while the line item still shows the old full amount pending.
export async function tieSalesOrderLineItem(lineItemId: string, allocations: TieAllocation[]): Promise<void> {
  await db.transaction(
    'rw',
    [db.salesOrderLineItems, db.beams, db.uprights, db.wireDecks, db.miscItems, db.sites, db.pendingDeletes],
    async () => {
      const lineItem = await db.salesOrderLineItems.get(lineItemId)
      if (!lineItem || lineItem.status !== 'pending') return

      const sourceKey = effectiveImportSourceKey(lineItem)
      const now = Date.now()
      const editorName = getEditorName()
      let remaining = lineItem.quantityOrdered

      for (const alloc of allocations) {
        if (remaining <= 0) break
        const qty = Math.max(0, Math.min(alloc.quantity, remaining))
        if (qty <= 0) continue

        await deductGroupQuantity(alloc.itemType, alloc.itemIds, qty)
        await db.salesOrderLineItems.add({
          ...lineItem,
          id: uuidv4(),
          quantityOrdered: qty,
          importSourceKey: sourceKey,
          status: 'tied',
          tiedSiteId: alloc.siteId,
          tiedSiteName: alloc.siteName,
          tiedItemType: alloc.itemType,
          tiedItemIds: alloc.itemIds,
          tiedDescription: alloc.tiedDescription,
          tiedAt: now,
          tiedBy: editorName,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        })
        remaining -= qty
      }

      if (remaining <= 0) {
        // Fully accounted for across the allocation(s) above — nothing
        // left for the original row to represent.
        await enqueuePendingDelete('salesOrderLineItems', lineItem.id)
        await db.salesOrderLineItems.delete(lineItem.id)
      } else if (remaining !== lineItem.quantityOrdered) {
        await db.salesOrderLineItems.update(lineItem.id, {
          quantityOrdered: remaining,
          importSourceKey: sourceKey,
          updatedAt: now,
          syncStatus: 'pending',
        })
      }
    },
  )
}

// "Delete SO" on a location's Sales Order page — reverses the tie: restores
// the quantity that was deducted from inventory and sends the line item(s)
// back to 'pending' so they reappear in Procurement to be reconciled again,
// rather than erasing the SalesPad-sourced record entirely. Also clears any
// ship-date schedule for this pair, so a future re-tie at this site doesn't
// inherit a stale date.
export async function deleteTiedSalesOrder(soNumber: string, siteId: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.salesOrderLineItems,
      db.salesOrderSchedules,
      db.beams,
      db.uprights,
      db.wireDecks,
      db.miscItems,
      db.sites,
      db.pendingDeletes,
    ],
    async () => {
      const items = await listTiedLineItemsBySoNumberAndSite(soNumber, siteId)
      for (const item of items) {
        if (item.tiedItemType) {
          await restoreGroupQuantity(item.tiedItemType, item.tiedItemIds, item.quantityOrdered)
        }
        await db.salesOrderLineItems.update(item.id, {
          status: 'pending',
          tiedSiteId: '',
          tiedSiteName: '',
          tiedItemType: '',
          tiedItemIds: [],
          tiedDescription: '',
          tiedAt: 0,
          tiedBy: '',
          updatedAt: Date.now(),
          syncStatus: 'pending',
        })
      }

      await deleteSalesOrderSchedule(soNumber, siteId)
    },
  )
}
