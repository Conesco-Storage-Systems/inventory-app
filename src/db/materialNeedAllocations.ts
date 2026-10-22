import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { enqueuePendingDelete, enqueuePendingDeletes } from './pendingDeletes'
import { getEditorName } from '../state/editor'
import type { ItemType, MaterialNeedAllocation } from '../models/types'

export interface TieMaterialNeedInput {
  materialNeedId: string
  projectId: string
  siteId: string
  siteName: string
  itemType: ItemType
  itemIds: string[]
  description: string
  quantity: number
}

// Ties real on-hand inventory to a Material Need purely as a tracking
// record — it does NOT deduct from that inventory. This chart exists to
// measure and track where material for a project's needs is sitting;
// the actual reservation/deduction of real stock happens later, when
// it's tied to a Sales Order (see tieSalesOrderLineItem).
export async function tieMaterialNeedAllocation(input: TieMaterialNeedInput): Promise<void> {
  await db.materialNeedAllocations.add({
    id: uuidv4(),
    materialNeedId: input.materialNeedId,
    projectId: input.projectId,
    siteId: input.siteId,
    siteName: input.siteName,
    itemType: input.itemType,
    itemIds: input.itemIds,
    description: input.description,
    quantity: input.quantity,
    tiedAt: Date.now(),
    tiedBy: getEditorName(),
    syncStatus: 'pending',
  })
}

export async function listMaterialNeedAllocationsByProject(projectId: string): Promise<MaterialNeedAllocation[]> {
  return db.materialNeedAllocations.where('projectId').equals(projectId).toArray()
}

export async function listAllMaterialNeedAllocations(): Promise<MaterialNeedAllocation[]> {
  return db.materialNeedAllocations.toArray()
}

// How much of a grouped inventory row (by its underlying raw record ids)
// is already tied to SOME Material Need, anywhere — across every project,
// not just the one being viewed. Real inventory is never deducted for a
// Material Need tie, so without this, the same on-hand stock could be
// tied to need after need with nothing showing it's already spoken for.
// Subtracting this from a row's real quantity is how the Project
// Management tie screen treats it as "already in use" while every other
// screen (which reads real quantity directly) keeps showing the full
// on-hand amount.
export function allocatedQuantityForIds(itemType: ItemType, ids: string[], allocations: MaterialNeedAllocation[]): number {
  const idSet = new Set(ids)
  let total = 0
  for (const allocation of allocations) {
    if (allocation.itemType !== itemType) continue
    if (allocation.itemIds.some((id) => idSet.has(id))) total += allocation.quantity
  }
  return total
}

export async function listMaterialNeedAllocations(materialNeedId: string): Promise<MaterialNeedAllocation[]> {
  return db.materialNeedAllocations.where('materialNeedId').equals(materialNeedId).toArray()
}

// "Untie" — just removes the tracking record. Nothing was ever deducted,
// so there's nothing to restore.
export async function untieMaterialNeedAllocation(id: string): Promise<void> {
  await db.transaction('rw', [db.materialNeedAllocations, db.pendingDeletes], async () => {
    const allocation = await db.materialNeedAllocations.get(id)
    if (!allocation) return
    await enqueuePendingDelete('materialNeedAllocations', id)
    await db.materialNeedAllocations.delete(id)
  })
}

// Used when deleting a whole Material Need — removes every one of its
// allocation records, same as untying each by hand.
export async function untieAllMaterialNeedAllocations(materialNeedId: string): Promise<void> {
  await db.transaction('rw', [db.materialNeedAllocations, db.pendingDeletes], async () => {
    const allocations = await listMaterialNeedAllocations(materialNeedId)
    const ids = allocations.map((a) => a.id)
    if (ids.length > 0) {
      await enqueuePendingDeletes('materialNeedAllocations', ids)
      await db.materialNeedAllocations.bulkDelete(ids)
    }
  })
}

export interface AllocationSourceSummary {
  siteId: string
  siteName: string
  quantity: number
}

export interface NeedAllocationSummary {
  bySite: AllocationSourceSummary[]
  total: number
}

// How much of a need has actually been tied, broken down by Location —
// used by both the Material Needs table and the by-job-site chart so they
// always agree. Combines multiple ties from the same Location into one
// segment rather than showing them separately.
export function summarizeNeedAllocations(
  materialNeedId: string,
  allocations: MaterialNeedAllocation[],
): NeedAllocationSummary {
  const bySiteMap = new Map<string, AllocationSourceSummary>()
  for (const allocation of allocations) {
    if (allocation.materialNeedId !== materialNeedId) continue
    const existing = bySiteMap.get(allocation.siteId)
    if (existing) existing.quantity += allocation.quantity
    else bySiteMap.set(allocation.siteId, { siteId: allocation.siteId, siteName: allocation.siteName, quantity: allocation.quantity })
  }
  const bySite = Array.from(bySiteMap.values())
  const total = bySite.reduce((sum, s) => sum + s.quantity, 0)
  return { bySite, total }
}
