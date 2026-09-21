import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { getEditorName } from '../state/editor'
import { enqueuePendingDelete } from './pendingDeletes'
import type { BolDirection, BolLineItem, FreightCountedBy, PaymentTerm, TrailerLoadedBy } from '../models/types'

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
  trailerLoadedBy?: TrailerLoadedBy
  freightCountedBy?: FreightCountedBy
  lineItems: BolLineItem[]
}

export async function createBillOfLading(input: NewBolInput): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.billsOfLading.add({
    ...input,
    id,
    trailerLoadedBy: input.trailerLoadedBy ?? '',
    freightCountedBy: input.freightCountedBy ?? '',
    shipperSignatureImage: '',
    shipperSignedAt: 0,
    carrierSignatureImage: '',
    carrierSignedAt: 0,
    shippedAt: 0,
    createdAt: now,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: now,
    syncStatus: 'pending',
  })
  return id
}

export interface BolEditInput {
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
  trailerLoadedBy: TrailerLoadedBy
  freightCountedBy: FreightCountedBy
  lineItems: BolLineItem[]
}

export async function updateBillOfLading(id: string, input: BolEditInput): Promise<void> {
  await db.billsOfLading.update(id, {
    ...input,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

export async function signBillOfLading(
  id: string,
  role: 'shipper' | 'carrier',
  signatureImage: string,
): Promise<void> {
  const now = Date.now()
  const changes =
    role === 'shipper'
      ? { shipperSignatureImage: signatureImage, shipperSignedAt: now }
      : { carrierSignatureImage: signatureImage, carrierSignedAt: now }
  await db.billsOfLading.update(id, {
    ...changes,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: now,
    syncStatus: 'pending',
  })
}

export async function markBillOfLadingShipped(id: string): Promise<void> {
  await db.billsOfLading.update(id, {
    shippedAt: Date.now(),
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
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
