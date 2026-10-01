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
  // The distinct Sales Order numbers these line items came from, if any —
  // a real link the Sales Orders page uses to detect a shipped order,
  // unlike referenceDoc which is just free text.
  sourceSoNumbers?: string[]
}

export async function createBillOfLading(input: NewBolInput): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.billsOfLading.add({
    ...input,
    id,
    trailerLoadedBy: input.trailerLoadedBy ?? '',
    freightCountedBy: input.freightCountedBy ?? '',
    sourceSoNumbers: input.sourceSoNumbers ?? [],
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
  // An empty image means the signature was cleared and saved blank — no
  // "signed at" for something that isn't actually signed.
  const signedAt = signatureImage ? now : 0
  const changes =
    role === 'shipper'
      ? { shipperSignatureImage: signatureImage, shipperSignedAt: signedAt }
      : { carrierSignatureImage: signatureImage, carrierSignedAt: signedAt }
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

// Reverses "Mark as Shipped" — e.g. it was clicked by mistake, or a real
// shipment got canceled. Un-shipping unlocks line items, shipment photos,
// and the ability to delete this BOL's photos again, and drops any Sales
// Order this BOL covers back out of Shipped/Partially Shipped (since that
// classification only counts quantity from BOLs that are actually
// shipped) — it does not touch inventory, since tying (not shipping) is
// what deducts it.
export async function unmarkBillOfLadingShipped(id: string): Promise<void> {
  await db.billsOfLading.update(id, {
    shippedAt: 0,
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
