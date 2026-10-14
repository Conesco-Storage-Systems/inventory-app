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

export async function listLineItemsByQuote(quoteId: string): Promise<SalesQuoteLineItem[]> {
  const rows = await db.salesQuoteLineItems.where('quoteId').equals(quoteId).toArray()
  return rows.sort((a, b) => a.createdAt - b.createdAt)
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

// The underlying inventory is never touched by a quote line item, so
// there's nothing to add back — just this one row to remove.
export async function cancelSalesQuoteLineItem(lineItemId: string): Promise<void> {
  await enqueuePendingDelete('salesQuoteLineItems', lineItemId)
  await db.salesQuoteLineItems.delete(lineItemId)
}

// Removes every line item on the quote and marks the quote itself canceled.
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
