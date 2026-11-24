import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import type { RackRow } from '../models/types'

export async function listRackRows(standingCountId: string) {
  return db.rackRows.where('standingCountId').equals(standingCountId).toArray()
}

// "Add Row" creates one immediately, with just an auto-numbered name — no
// dialog. Starting point and bay-by-bay detail are filled in afterward,
// directly on the row's own card.
export async function addRackRow(standingCountId: string, name: string): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.rackRows.add({
    id,
    standingCountId,
    name,
    startingPoint: '',
    segments: [],
    transitionOverrides: [],
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function updateRackRowStartingPoint(id: string, startingPoint: string): Promise<void> {
  await db.rackRows.update(id, {
    startingPoint,
    updatedAt: Date.now(),
  })
}

type RackRowFields = Pick<RackRow, 'name' | 'segments' | 'transitionOverrides'>

export async function updateRackRowSegments(id: string, fields: RackRowFields): Promise<void> {
  await db.rackRows.update(id, {
    ...fields,
    updatedAt: Date.now(),
  })
}

export async function deleteRackRow(id: string): Promise<void> {
  await db.rackRows.delete(id)
}
