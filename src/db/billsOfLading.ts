import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { getEditorName } from '../state/editor'
import { enqueuePendingDelete } from './pendingDeletes'
import type { BolDirection, BolLineItem, PaymentTerm } from '../models/types'

export interface NewBolInput {
  siteId: string
  direction: BolDirection
  date: string
  loadNumber: string
  referenceDoc: string
  paymentTerm: PaymentTerm | ''
  shipFromCompany: string
  shipFromAddress: string
  shipFromPhone: string
  shipToCompany: string
  shipToContact: string
  shipToAddress: string
  shipToPhone: string
  carrier: string
  driverPhone: string
  brokerInfo: string
  lineItems: BolLineItem[]
}

export async function createBillOfLading(input: NewBolInput): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.billsOfLading.add({
    id,
    ...input,
    createdAt: now,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: now,
    syncStatus: 'pending',
  })
  return id
}

export async function listBolsBySite(siteId: string) {
  const rows = await db.billsOfLading.where('siteId').equals(siteId).toArray()
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getBillOfLading(id: string) {
  return db.billsOfLading.get(id)
}

export async function deleteBillOfLading(id: string): Promise<void> {
  await enqueuePendingDelete('billsOfLading', id)
  await db.billsOfLading.delete(id)
}
