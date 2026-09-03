import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import type { SyncTable } from '../models/types'

export async function enqueuePendingDelete(table: SyncTable, recordId: string): Promise<void> {
  await db.pendingDeletes.add({
    id: uuidv4(),
    table,
    recordId,
    deletedAt: Date.now(),
  })
}

export async function enqueuePendingDeletes(table: SyncTable, recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return
  await db.pendingDeletes.bulkAdd(
    recordIds.map((recordId) => ({
      id: uuidv4(),
      table,
      recordId,
      deletedAt: Date.now(),
    })),
  )
}
