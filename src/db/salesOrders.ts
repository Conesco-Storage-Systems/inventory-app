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

// Flags rather than drops a match — every parsed row still gets imported,
// so nothing from the report is ever silently lost, but a row whose
// signature already exists (either already in the system, or repeated
// earlier in this same file) is marked for review instead of blending in
// with genuinely new rows.
function classifyImportItems(
  items: ParsedSoLineItem[],
  existing: SalesOrderLineItem[],
): { key: string; isDuplicate: boolean }[] {
  const seenKeys = new Set(existing.map(effectiveImportSourceKey))
  return items.map((parsed) => {
    const key = importKey({
      soNumber: parsed.soNumber,
      description: parsed.description,
      warehouseCode: parsed.warehouseCode,
      quantityOrdered: parsed.quantity,
    })
    const isDuplicate = seenKeys.has(key)
    seenKeys.add(key)
    return { key, isDuplicate }
  })
}

// Used by the import preview to show which rows will land in the
// "Duplicates" section, before anything is actually committed.
export async function previewImportDuplicateFlags(items: ParsedSoLineItem[]): Promise<boolean[]> {
  const existing = await db.salesOrderLineItems.toArray()
  return classifyImportItems(items, existing).map((c) => c.isDuplicate)
}

export async function importSalesOrderLineItems(items: ParsedSoLineItem[]): Promise<{ imported: number; flaggedDuplicates: number }> {
  const existing = await db.salesOrderLineItems.toArray()
  const classified = classifyImportItems(items, existing)

  const now = Date.now()
  let flaggedDuplicates = 0
  const toAdd: SalesOrderLineItem[] = items.map((parsed, i) => {
    const { key, isDuplicate } = classified[i]
    if (isDuplicate) flaggedDuplicates++
    return {
      id: uuidv4(),
      soNumber: parsed.soNumber,
      description: parsed.description,
      warehouseCode: parsed.warehouseCode,
      quantityOrdered: parsed.quantity,
      importSourceKey: key,
      flaggedDuplicate: isDuplicate,
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
    }
  })

  if (toAdd.length > 0) await db.salesOrderLineItems.bulkAdd(toAdd)
  return { imported: toAdd.length, flaggedDuplicates }
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

// Retroactively links a manually-added BOL line item (one with no
// sourceLineItemId, e.g. an item shipped on a Sales Order that never came
// through the Procurement import/tie flow) back to that Sales Order, by
// creating the same kind of 'tied' SalesOrderLineItem a normal tie would
// have produced. Doesn't touch inventory quantity — unlike a normal tie,
// whatever this line represents was already manually accounted for by
// whoever added it, so this is pure bookkeeping to make it show up
// alongside everything else tied to that Sales Order.
export async function linkBolLineItemToSalesOrder(
  bolId: string,
  lineItemIndex: number,
  input: { soNumber: string; itemType: ItemType; itemIds: string[]; tiedDescription: string },
): Promise<void> {
  await db.transaction('rw', [db.billsOfLading, db.salesOrderLineItems, db.sites], async () => {
    const bol = await db.billsOfLading.get(bolId)
    if (!bol) return
    const lineItem = bol.lineItems[lineItemIndex]
    if (!lineItem || lineItem.sourceLineItemId) return

    const site = await db.sites.get(bol.siteId)
    const now = Date.now()
    const editorName = getEditorName()
    const soLineItemId = uuidv4()

    await db.salesOrderLineItems.add({
      id: soLineItemId,
      soNumber: input.soNumber,
      description: lineItem.description,
      warehouseCode: '',
      quantityOrdered: lineItem.qtyShipped,
      status: 'tied',
      tiedSiteId: bol.siteId,
      tiedSiteName: site?.name ?? '',
      tiedItemType: input.itemType,
      tiedItemIds: input.itemIds,
      tiedDescription: input.tiedDescription,
      tiedAt: now,
      tiedBy: editorName,
      importedAt: 0,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    })

    const lineItems = bol.lineItems.map((li, i) => (i === lineItemIndex ? { ...li, sourceLineItemId: soLineItemId } : li))
    const sourceSoNumbers = bol.sourceSoNumbers.includes(input.soNumber)
      ? bol.sourceSoNumbers
      : [...bol.sourceSoNumbers, input.soNumber]

    await db.billsOfLading.update(bolId, {
      lineItems,
      sourceSoNumbers,
      lastUpdatedBy: editorName,
      lastUpdatedAt: now,
      syncStatus: 'pending',
    })
  })
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
          await restoreGroupQuantity(item.tiedItemType, item.tiedItemIds, item.quantityOrdered, item.tiedSiteId)
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
