import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { moveItemGroupToSite } from './items'
import { enqueuePendingDelete } from './pendingDeletes'
import { getEditorName } from '../state/editor'
import type { InventoryTransfer, InventoryTransferLineItem } from '../models/types'

export interface NewInventoryTransferInput {
  fromSiteId: string
  fromSiteName: string
  toSiteId: string
  toSiteName: string
  scheduledDate: string
  lineItems: InventoryTransferLineItem[]
}

// Moves every selected group to its destination site and records the
// transfer as a single frozen receipt — both happen together in one
// transaction so a failure partway through can't leave inventory moved
// without any record of it (or vice versa).
export async function createInventoryTransfer(input: NewInventoryTransferInput): Promise<string> {
  const id = uuidv4()
  const now = Date.now()

  await db.transaction(
    'rw',
    [db.beams, db.uprights, db.wireDecks, db.miscItems, db.sites, db.inventoryTransfers],
    async () => {
      for (const li of input.lineItems) {
        await moveItemGroupToSite(li.itemType, li.itemIds, input.toSiteId)
      }

      await db.inventoryTransfers.add({
        id,
        fromSiteId: input.fromSiteId,
        fromSiteName: input.fromSiteName,
        toSiteId: input.toSiteId,
        toSiteName: input.toSiteName,
        scheduledDate: input.scheduledDate,
        lineItems: input.lineItems,
        createdBy: getEditorName(),
        createdAt: now,
        syncStatus: 'pending',
      })
    },
  )

  return id
}

// Undoes a transfer entirely: moves every line item's underlying records
// back to the original source site and removes the receipt — e.g. for a
// mis-made or test transfer, so it doesn't leave inventory sitting at the
// wrong location with no way to reverse it short of re-adding items by
// hand. Same all-or-nothing transaction shape as creating a transfer.
export async function deleteInventoryTransfer(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.beams, db.uprights, db.wireDecks, db.miscItems, db.sites, db.inventoryTransfers, db.pendingDeletes],
    async () => {
      const transfer = await db.inventoryTransfers.get(id)
      if (!transfer) return

      for (const li of transfer.lineItems) {
        await moveItemGroupToSite(li.itemType, li.itemIds, transfer.fromSiteId)
      }

      await enqueuePendingDelete('inventoryTransfers', id)
      await db.inventoryTransfers.delete(id)
    },
  )
}

export async function listInventoryTransfers(): Promise<InventoryTransfer[]> {
  const rows = await db.inventoryTransfers.toArray()
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getInventoryTransfer(id: string): Promise<InventoryTransfer | undefined> {
  return db.inventoryTransfers.get(id)
}
