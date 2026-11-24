import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import type { BayConfiguration } from '../models/types'

export async function listBayConfigurations(standingCountId: string) {
  return db.bayConfigurations.where('standingCountId').equals(standingCountId).toArray()
}

export async function createBayConfiguration(
  standingCountId: string,
  fields: Omit<BayConfiguration, 'id' | 'standingCountId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.bayConfigurations.add({
    id,
    standingCountId,
    ...fields,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function updateBayConfiguration(
  id: string,
  fields: Omit<BayConfiguration, 'id' | 'standingCountId' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  await db.bayConfigurations.update(id, {
    ...fields,
    updatedAt: Date.now(),
  })
}

export async function deleteBayConfiguration(id: string): Promise<void> {
  await db.bayConfigurations.delete(id)
}
