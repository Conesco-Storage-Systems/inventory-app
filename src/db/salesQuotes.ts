import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { enqueuePendingDelete, enqueuePendingDeletes } from './pendingDeletes'
import type { ItemType, SalesQuote, SalesQuoteLineItem } from '../models/types'

export interface NewSalesQuoteInput {
  quoteNumber: string
  customerName: string
  customerAddress: string
  notes: string
  createdById: string
  createdByEmail: string
}

export async function createSalesQuote(input: NewSalesQuoteInput): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.salesQuotes.add({
    id,
    quoteNumber: input.quoteNumber.trim(),
    customerName: input.customerName.trim(),
    customerAddress: input.customerAddress.trim(),
    notes: input.notes.trim(),
    createdById: input.createdById,
    createdByEmail: input.createdByEmail,
    createdAt: now,
    lastUpdatedAt: now,
    syncStatus: 'pending',
  })
  return id
}

export async function getSalesQuote(id: string): Promise<SalesQuote | undefined> {
  return db.salesQuotes.get(id)
}

export async function listMySalesQuotes(userId: string): Promise<SalesQuote[]> {
  const rows = await db.salesQuotes.where('createdById').equals(userId).toArray()
  return rows.filter((q) => !q.canceledAt).sort((a, b) => b.createdAt - a.createdAt)
}

// Every row currently in salesQuoteLineItems is, by construction, an
// active hold — canceling one deletes it rather than flagging it, so there
// is never a stale/inactive row to filter out here.
export async function listActiveHolds(): Promise<SalesQuoteLineItem[]> {
  return db.salesQuoteLineItems.toArray()
}

export async function listHoldsBySite(siteId: string): Promise<SalesQuoteLineItem[]> {
  return db.salesQuoteLineItems.where('siteId').equals(siteId).toArray()
}

export async function listLineItemsByQuote(quoteId: string): Promise<SalesQuoteLineItem[]> {
  const rows = await db.salesQuoteLineItems.where('quoteId').equals(quoteId).toArray()
  return rows.sort((a, b) => a.createdAt - b.createdAt)
}

// Sums how much of a live inventory group is already held, by overlap on
// raw record ids — a hold's itemIds snapshot could drift from the group's
// current ids if that row gets edited/re-split later, so overlap (not an
// exact match) is what keeps the hold "attached" to the right row.
export function computeHeldQuantity(rowIds: string[], holds: SalesQuoteLineItem[]): number {
  return holds
    .filter((hold) => hold.itemIds.some((id) => rowIds.includes(id)))
    .reduce((sum, hold) => sum + hold.quantityHeld, 0)
}

// The one shared "how much can actually be sold/tied/shipped right now"
// number — total on hand minus whatever's currently held for a quote.
export function computeAvailableQuantity(quantity: number, rowIds: string[], holds: SalesQuoteLineItem[]): number {
  return Math.max(0, quantity - computeHeldQuantity(rowIds, holds))
}

// Same breakdown shown everywhere quantity is displayed, so the numbers
// read consistently across the app: plain when nothing's held, otherwise
// "available (total, on hold)".
export function quantityWithHold(quantity: number, held: number): string {
  if (held <= 0) return String(quantity)
  return `${Math.max(0, quantity - held)} (${quantity} total, ${held} on hold)`
}

export interface NewSalesQuoteLineItemInput {
  quoteId: string
  quoteNumber: string
  siteId: string
  siteName: string
  itemType: ItemType
  itemIds: string[]
  description: string
  quantityHeld: number
  heldByEmail: string
}

export async function addSalesQuoteLineItem(input: NewSalesQuoteLineItemInput): Promise<void> {
  const id = uuidv4()
  const now = Date.now()
  await db.salesQuoteLineItems.add({
    id,
    quoteId: input.quoteId,
    quoteNumber: input.quoteNumber,
    siteId: input.siteId,
    siteName: input.siteName,
    itemType: input.itemType,
    itemIds: input.itemIds,
    description: input.description,
    quantityHeld: input.quantityHeld,
    heldByEmail: input.heldByEmail,
    createdAt: now,
    syncStatus: 'pending',
  })
  await db.salesQuotes.update(input.quoteId, { lastUpdatedAt: now, syncStatus: 'pending' })
}

// Releases just this one hold — the underlying inventory was never
// touched, so there's nothing to add back, only this row to remove.
export async function cancelSalesQuoteLineItem(lineItemId: string): Promise<void> {
  await enqueuePendingDelete('salesQuoteLineItems', lineItemId)
  await db.salesQuoteLineItems.delete(lineItemId)
}

// Releases every hold on the quote and marks the quote itself canceled.
export async function cancelSalesQuote(quoteId: string): Promise<void> {
  const lineItems = await listLineItemsByQuote(quoteId)
  if (lineItems.length > 0) {
    await enqueuePendingDeletes('salesQuoteLineItems', lineItems.map((li) => li.id))
    await db.salesQuoteLineItems.bulkDelete(lineItems.map((li) => li.id))
  }
  await db.salesQuotes.update(quoteId, {
    canceledAt: Date.now(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}
