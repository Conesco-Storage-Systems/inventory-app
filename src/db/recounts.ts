import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { touchSiteUpdated } from './locations'
import { enqueuePendingDelete, enqueuePendingDeletes } from './pendingDeletes'
import { deductGroupQuantity, savePhotos } from './items'
import { groupBeams, type BeamRow } from './groupBeams'
import { groupUprights, type UprightRow } from './groupUprights'
import { groupWireDecks, type WireDeckRow } from './groupWireDecks'
import { groupMiscItems, type MiscItemRow } from './groupMiscItems'
import { sumShippedQuantity } from './salesOrders'
import { getEditorName } from '../state/editor'
import type {
  Beam,
  BillOfLading,
  Condition,
  ItemType,
  MiscItem,
  Recount,
  RecountLineItem,
  SalesOrderLineItem,
  SyncStatus,
  Upright,
  WireDeck,
} from '../models/types'

// Only one 'draft' recount should exist per site at a time — resumes
// whatever's already in progress instead of starting a second one.
export async function startOrResumeRecount(siteId: string, siteName: string): Promise<Recount> {
  const existing = await db.recounts.where('siteId').equals(siteId).and((r) => r.status === 'draft').first()
  if (existing) return existing

  const now = Date.now()
  const recount: Recount = {
    id: uuidv4(),
    siteId,
    siteName,
    status: 'draft',
    label: '',
    startedAt: now,
    startedBy: getEditorName(),
    committedAt: 0,
    committedBy: '',
  }
  await db.recounts.add(recount)
  return recount
}

export async function listRecountsBySite(siteId: string): Promise<Recount[]> {
  const rows = await db.recounts.where('siteId').equals(siteId).toArray()
  return rows.sort((a, b) => b.startedAt - a.startedAt)
}

export async function listRecountLineItems(recountId: string): Promise<RecountLineItem[]> {
  return db.recountLineItems.where('recountId').equals(recountId).toArray()
}

export type NewRecountLineItemInput = Omit<RecountLineItem, 'id' | 'createdAt' | 'updatedAt' | 'photoIds'> & {
  photoFiles: File[]
}

export async function addRecountLineItem(input: NewRecountLineItemInput): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  const photoIds = await savePhotos(input.itemType, id, input.photoFiles)
  const { photoFiles: _photoFiles, ...fields } = input

  await db.recountLineItems.add({
    ...fields,
    id,
    photoIds,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

// A recount line's photos go through the same shared photos/photoBlobs
// tables as every other item (Photo.itemId is just a string key) — those
// tables are synced regardless of what points at them, so removing a
// draft line needs the same enqueue-then-delete cleanup real items use
// (see deletePhotosForItems in db/items.ts), not just a local delete.
export async function deleteRecountLineItem(id: string): Promise<void> {
  const line = await db.recountLineItems.get(id)
  if (!line) return
  const photoIds = Array.isArray(line.photoIds) ? line.photoIds : []
  for (const photoId of photoIds) {
    await enqueuePendingDelete('photos', photoId)
    await db.photos.delete(photoId)
    await db.photoBlobs.delete(photoId)
  }
  await db.recountLineItems.delete(id)
}

// Same grouped-row edit convention as updateBeamGroup etc. in db/items.ts
// (a grouped row can span several raw records; editing merges them onto
// one survivor) — but needs only one implementation here, unlike the four
// live tables, since every RecountLineItem already lives in one table
// regardless of itemType.
export type RecountLineItemEditInput = Omit<
  RecountLineItem,
  'id' | 'recountId' | 'siteId' | 'itemType' | 'createdAt' | 'updatedAt' | 'photoIds'
> & {
  survivingId: string
  otherIds: string[]
  existingPhotoIds: string[]
  newPhotoFiles: File[]
}

export async function updateRecountLineItemGroup(input: RecountLineItemEditInput): Promise<void> {
  const existing = await db.recountLineItems.get(input.survivingId)
  if (!existing) return

  const newPhotoIds = await savePhotos(existing.itemType, input.survivingId, input.newPhotoFiles)
  const photoIds = [...input.existingPhotoIds, ...newPhotoIds]

  if (input.otherIds.length > 0) {
    await db.photos
      .where('itemId')
      .anyOf(input.otherIds)
      .modify({ itemId: input.survivingId, uploadStatus: 'pending' })
    await db.recountLineItems.bulkDelete(input.otherIds)
  }

  const { survivingId: _survivingId, otherIds: _otherIds, existingPhotoIds: _existingPhotoIds, newPhotoFiles: _newPhotoFiles, ...fields } =
    input

  await db.recountLineItems.update(input.survivingId, {
    ...fields,
    photoIds,
    updatedAt: Date.now(),
  })
}

export async function deleteRecountLineItemGroup(ids: string[]): Promise<void> {
  for (const id of ids) await deleteRecountLineItem(id)
}

function fillItemBaseDefaults(li: RecountLineItem) {
  return {
    id: li.id,
    siteId: li.siteId,
    areaId: '',
    aisleOrBay: '',
    quantity: li.quantity,
    condition: li.condition as Condition,
    bundleSize: li.bundleSize,
    zone: li.zone,
    notes: li.notes,
    photoIds: Array.isArray(li.photoIds) ? li.photoIds : [],
    recordedBy: li.recordedBy,
    createdAt: li.createdAt,
    updatedAt: li.updatedAt,
    syncStatus: 'pending' as SyncStatus,
    costPer: li.costPer,
    sellPer: li.sellPer,
  }
}

// Adapters below exist only so the already-trusted grouping functions
// (groupBeams/groupUprights/groupWireDecks/groupMiscItems) can be reused
// unmodified on RecountLineItem rows — same grouping key, same matching
// behavior as live inventory already uses everywhere else. Exported so the
// Recount screens can group/display a recount's own lines the exact same
// way LocationDetail groups live ones.
export function recountLineItemsToBeams(items: RecountLineItem[]): Beam[] {
  return items
    .filter((li) => li.itemType === 'beam')
    .map((li) => ({
      ...fillItemBaseDefaults(li),
      length: li.length,
      width: li.width,
      color: li.color,
      pinCount: li.pinCount,
      stamp: li.stamp,
      style: li.style,
      stickers: li.stickers,
      step: li.step,
    }))
}

export function recountLineItemsToUprights(items: RecountLineItem[]): Upright[] {
  return items
    .filter((li) => li.itemType === 'upright')
    .map((li) => ({
      ...fillItemBaseDefaults(li),
      color: li.color,
      style: li.style,
      width: li.width,
      height: li.height,
      columnLength: li.columnLength,
      columnWidth: li.columnWidth,
      footplateLength: li.footplateLength,
      footplateWidth: li.footplateWidth,
      footplateThickness: li.footplateThickness,
      anchorHoleCount: li.anchorHoleCount,
      holeSize: li.holeSize,
      gauge: li.gauge,
      stamp: li.stamp,
    }))
}

export function recountLineItemsToWireDecks(items: RecountLineItem[]): WireDeck[] {
  return items
    .filter((li) => li.itemType === 'wireDeck')
    .map((li) => ({
      ...fillItemBaseDefaults(li),
      length: Number(li.length) || 0,
      width: Number(li.width) || 0,
      channelCount: li.channelCount,
      style: li.wireDeckStyle,
    }))
}

export function recountLineItemsToMiscItems(items: RecountLineItem[]): MiscItem[] {
  return items
    .filter((li) => li.itemType === 'misc')
    .map((li) => ({
      ...fillItemBaseDefaults(li),
      description: li.description,
      itemDescription: li.itemDescription,
    }))
}

interface GroupRow {
  key: string
  ids: string[]
  quantity: number
}

interface GroupMatch<T extends GroupRow> {
  matched: { oldRow: T; newRow: T }[]
  newOnly: T[]
  oldOnly: T[]
}

function matchByKey<T extends GroupRow>(oldRows: T[], newRows: T[]): GroupMatch<T> {
  const oldMap = new Map(oldRows.map((r) => [r.key, r]))
  const newMap = new Map(newRows.map((r) => [r.key, r]))
  const matched: { oldRow: T; newRow: T }[] = []
  const newOnly: T[] = []

  for (const [key, newRow] of newMap) {
    const oldRow = oldMap.get(key)
    if (oldRow) matched.push({ oldRow, newRow })
    else newOnly.push(newRow)
  }

  const oldOnly = oldRows.filter((r) => !newMap.has(r.key))
  return { matched, newOnly, oldOnly }
}

// How much of this live group is still committed to an order that hasn't
// physically left yet — tied (status 'tied') minus whatever's actually
// shipped so far (sumShippedQuantity, the same check the Sales Orders page
// already uses). This is the amount a recount of this spot must still
// account for, since that material hasn't moved.
async function computeRemainingTiedQty(
  itemType: ItemType,
  liveIds: string[],
): Promise<{ qty: number; lineItems: SalesOrderLineItem[] }> {
  if (liveIds.length === 0) return { qty: 0, lineItems: [] }
  const idSet = new Set(liveIds)
  const [allLineItems, bols] = await Promise.all([db.salesOrderLineItems.toArray(), db.billsOfLading.toArray()])
  const tiedHere = allLineItems.filter(
    (li) => li.status === 'tied' && li.tiedItemType === itemType && li.tiedItemIds.some((id) => idSet.has(id)),
  )

  let qty = 0
  for (const li of tiedHere) {
    const shipped = sumShippedQuantity([li.id], bols).qty
    qty += Math.max(0, li.quantityOrdered - shipped)
  }
  return { qty, lineItems: tiedHere }
}

export interface RecountGroupComparison<T extends GroupRow> {
  old: T | null
  recount: T | null
  remainingTiedQty: number
  tiedLineItems: SalesOrderLineItem[]
  // True only when the recounted quantity can't cover what's still tied to
  // an open, unshipped Sales Order at this spot — the one case that blocks
  // commit. An old group that's simply missing from the new count (with
  // nothing tied to it) is NOT a shortfall, just flagged for review.
  shortfall: boolean
}

export interface RecountComparison {
  beams: RecountGroupComparison<BeamRow>[]
  uprights: RecountGroupComparison<UprightRow>[]
  wireDecks: RecountGroupComparison<WireDeckRow>[]
  miscItems: RecountGroupComparison<MiscItemRow>[]
  hasBlockingShortfall: boolean
}

async function toComparisons<T extends GroupRow>(
  itemType: ItemType,
  match: GroupMatch<T>,
): Promise<RecountGroupComparison<T>[]> {
  const out: RecountGroupComparison<T>[] = []

  for (const { oldRow, newRow } of match.matched) {
    const { qty, lineItems } = await computeRemainingTiedQty(itemType, oldRow.ids)
    out.push({ old: oldRow, recount: newRow, remainingTiedQty: qty, tiedLineItems: lineItems, shortfall: newRow.quantity < qty })
  }
  for (const oldRow of match.oldOnly) {
    const { qty, lineItems } = await computeRemainingTiedQty(itemType, oldRow.ids)
    out.push({ old: oldRow, recount: null, remainingTiedQty: qty, tiedLineItems: lineItems, shortfall: qty > 0 })
  }
  for (const newRow of match.newOnly) {
    out.push({ old: null, recount: newRow, remainingTiedQty: 0, tiedLineItems: [], shortfall: false })
  }

  return out
}

export async function buildRecountComparison(recountId: string): Promise<RecountComparison> {
  const recount = await db.recounts.get(recountId)
  if (!recount) throw new Error('Recount not found.')

  const [recountItems, liveBeams, liveUprights, liveWireDecks, liveMiscItems] = await Promise.all([
    listRecountLineItems(recountId),
    db.beams.where('siteId').equals(recount.siteId).toArray(),
    db.uprights.where('siteId').equals(recount.siteId).toArray(),
    db.wireDecks.where('siteId').equals(recount.siteId).toArray(),
    db.miscItems.where('siteId').equals(recount.siteId).toArray(),
  ])

  const beamMatch = matchByKey(groupBeams(liveBeams), groupBeams(recountLineItemsToBeams(recountItems)))
  const uprightMatch = matchByKey(groupUprights(liveUprights), groupUprights(recountLineItemsToUprights(recountItems)))
  const wireDeckMatch = matchByKey(groupWireDecks(liveWireDecks), groupWireDecks(recountLineItemsToWireDecks(recountItems)))
  const miscMatch = matchByKey(groupMiscItems(liveMiscItems), groupMiscItems(recountLineItemsToMiscItems(recountItems)))

  const beams = await toComparisons('beam', beamMatch)
  const uprights = await toComparisons('upright', uprightMatch)
  const wireDecks = await toComparisons('wireDeck', wireDeckMatch)
  const miscItems = await toComparisons('misc', miscMatch)

  const hasBlockingShortfall = [...beams, ...uprights, ...wireDecks, ...miscItems].some((c) => c.shortfall)

  return { beams, uprights, wireDecks, miscItems, hasBlockingShortfall }
}

// Creates the real live record for one promoted recount line, reusing its
// own id (so its photos — already saved under that id — need no
// retargeting) rather than minting a new one.
function promoteLineItem(itemType: ItemType, li: RecountLineItem): Beam | Upright | WireDeck | MiscItem {
  if (itemType === 'beam') return recountLineItemsToBeams([li])[0]
  if (itemType === 'upright') return recountLineItemsToUprights([li])[0]
  if (itemType === 'wireDeck') return recountLineItemsToWireDecks([li])[0]
  return recountLineItemsToMiscItems([li])[0]
}

const TABLE_NAMES: Record<ItemType, 'beams' | 'uprights' | 'wireDecks' | 'miscItems'> = {
  beam: 'beams',
  upright: 'uprights',
  wireDeck: 'wireDecks',
  misc: 'miscItems',
}

async function commitGroupSet<T extends GroupRow>(
  itemType: ItemType,
  comparisons: RecountGroupComparison<T>[],
  recountItemsById: Map<string, RecountLineItem>,
  bols: BillOfLading[],
): Promise<void> {
  const table = db.table(TABLE_NAMES[itemType])

  for (const comparison of comparisons) {
    // Old-only, nothing tied — leave the live records exactly as they are.
    // Flagging this for review happens on the review screen itself; commit
    // doesn't need to do anything further here.
    if (!comparison.recount) continue

    // New-to-this-recount or matched-and-cleared-to-commit: promote every
    // underlying recount line in this group to a real live record.
    const newIds = comparison.recount.ids
    for (const liId of newIds) {
      const li = recountItemsById.get(liId)
      if (!li) continue
      await table.add(promoteLineItem(itemType, li))
    }

    if (comparison.old) {
      // Matched group being replaced — repoint every open, still-owed tie
      // at the new records, re-apply the same still-committed amount
      // against them (so the new quantity means "recount total minus
      // still tied," same as everywhere else via deductGroupQuantity),
      // then retire the old records.
      if (comparison.remainingTiedQty > 0) {
        for (const li of comparison.tiedLineItems) {
          const shipped = sumShippedQuantity([li.id], bols).qty
          const stillOwed = Math.max(0, li.quantityOrdered - shipped)
          if (stillOwed <= 0) continue
          await db.salesOrderLineItems.update(li.id, {
            tiedItemIds: newIds,
            updatedAt: Date.now(),
            syncStatus: 'pending',
          })
        }

        await deductGroupQuantity(itemType, newIds, comparison.remainingTiedQty)
      }

      await enqueuePendingDeletes(TABLE_NAMES[itemType], comparison.old.ids)
      await table.bulkDelete(comparison.old.ids)
    }
  }
}

// Commits a draft Recount: for every group where the new count covers
// what's still tied to an open, unshipped Sales Order, the old live
// records are replaced by the recount's own (promoted) records and every
// affected tie is repointed; groups the recount didn't find are left
// untouched. Throws (nothing is written) if any group's recount quantity
// can't cover what's still committed there — see buildRecountComparison.
// RecountLineItem rows are never deleted; they're the permanent record of
// this recount, same role the old Excel version tabs used to serve.
export async function commitRecount(recountId: string): Promise<void> {
  const comparison = await buildRecountComparison(recountId)
  if (comparison.hasBlockingShortfall) {
    throw new Error(
      'Cannot commit: some recounted quantities are less than what is still tied to an open, unshipped Sales Order.',
    )
  }

  const recount = await db.recounts.get(recountId)
  if (!recount || recount.status !== 'draft') return

  const recountItems = await listRecountLineItems(recountId)
  const recountItemsById = new Map(recountItems.map((li) => [li.id, li]))
  const bols = await db.billsOfLading.toArray()

  await db.transaction(
    'rw',
    [db.recounts, db.recountLineItems, db.beams, db.uprights, db.wireDecks, db.miscItems, db.salesOrderLineItems, db.pendingDeletes, db.billsOfLading],
    async () => {
      await commitGroupSet('beam', comparison.beams, recountItemsById, bols)
      await commitGroupSet('upright', comparison.uprights, recountItemsById, bols)
      await commitGroupSet('wireDeck', comparison.wireDecks, recountItemsById, bols)
      await commitGroupSet('misc', comparison.miscItems, recountItemsById, bols)

      await db.recounts.update(recountId, {
        status: 'committed',
        committedAt: Date.now(),
        committedBy: getEditorName(),
      })
    },
  )

  await touchSiteUpdated(recount.siteId)
}
