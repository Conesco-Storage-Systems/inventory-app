import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { getEditorName } from '../state/editor'
import { enqueuePendingDelete } from './pendingDeletes'
import type { CustomerSheetLineItem } from '../models/types'

export interface NewCustomerSheetInput {
  siteId: string
  date: string
  customerName: string
  customerCompany: string
  customerAddress: string
  customerPhone: string
  lineItems: CustomerSheetLineItem[]
}

export async function createCustomerSheet(input: NewCustomerSheetInput): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  const editorName = getEditorName()
  await db.customerSheets.add({
    id,
    ...input,
    preparedBy: editorName,
    createdAt: now,
    lastUpdatedBy: editorName,
    lastUpdatedAt: now,
    syncStatus: 'pending',
  })
  return id
}

export async function listCustomerSheetsBySite(siteId: string) {
  const rows = await db.customerSheets.where('siteId').equals(siteId).toArray()
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getCustomerSheet(id: string) {
  return db.customerSheets.get(id)
}

export async function deleteCustomerSheet(id: string): Promise<void> {
  await enqueuePendingDelete('customerSheets', id)
  await db.customerSheets.delete(id)
}
