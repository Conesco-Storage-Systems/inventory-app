import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { deductGroupQuantity, restoreGroupQuantity } from './items'
import { enqueuePendingDelete } from './pendingDeletes'
import { getEditorName } from '../state/editor'
import type { ParsedSoLineItem } from '../import/parseSoReport'
import type { ItemType, SalesOrderLineItem } from '../models/types'

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

// Rows already imported (pending OR tied) are matched on these four
// fields so re-importing an overlapping weekly report (an open SO can
// show up again in the next week's export) doesn't create duplicates.
function importKey(li: Pick<SalesOrderLineItem, 'soNumber' | 'description' | 'warehouseCode' | 'quantityOrdered'>) {
  return [li.soNumber, li.description, li.warehouseCode, li.quantityOrdered].join('|')
}

export async function importSalesOrderLineItems(items: ParsedSoLineItem[]): Promise<{ imported: number; skippedDuplicates: number }> {
  const existing = await db.salesOrderLineItems.toArray()
  const existingKeys = new Set(existing.map(importKey))

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

export interface TieSalesOrderLineItemInput {
  lineItemId: string
  siteId: string
  siteName: string
  itemType: ItemType
  itemIds: string[]
  tiedDescription: string
}

// Deducting inventory and marking the line item tied must succeed or fail
// together — otherwise a failure between the two steps (a closed tab, a
// browser crash) could leave inventory deducted while the line item still
// shows 'pending', and retrying would deduct it a second time.
export async function tieSalesOrderLineItem(input: TieSalesOrderLineItemInput): Promise<void> {
  await db.transaction(
    'rw',
    [db.salesOrderLineItems, db.beams, db.uprights, db.wireDecks, db.miscItems, db.sites],
    async () => {
      const lineItem = await db.salesOrderLineItems.get(input.lineItemId)
      if (!lineItem || lineItem.status !== 'pending') return

      await deductGroupQuantity(input.itemType, input.itemIds, lineItem.quantityOrdered)

      await db.salesOrderLineItems.update(input.lineItemId, {
        status: 'tied',
        tiedSiteId: input.siteId,
        tiedSiteName: input.siteName,
        tiedItemType: input.itemType,
        tiedItemIds: input.itemIds,
        tiedDescription: input.tiedDescription,
        tiedAt: Date.now(),
        tiedBy: getEditorName(),
        updatedAt: Date.now(),
        syncStatus: 'pending',
      })
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

      const schedule = await getSalesOrderSchedule(soNumber, siteId)
      if (schedule) {
        await enqueuePendingDelete('salesOrderSchedules', schedule.id)
        await db.salesOrderSchedules.delete(schedule.id)
      }
    },
  )
}
