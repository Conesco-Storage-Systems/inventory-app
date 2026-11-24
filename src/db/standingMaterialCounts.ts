import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import type { StandingMaterialCount } from '../models/types'

export async function listStandingMaterialCounts() {
  return db.standingMaterialCounts.orderBy('createdAt').toArray()
}

export async function createStandingMaterialCount(): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.standingMaterialCounts.add({
    id,
    siteName: '',
    siteAddress: '',
    siteInfo: '',
    confirmed: false,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function updateStandingMaterialCount(
  id: string,
  fields: Partial<Pick<StandingMaterialCount, 'siteName' | 'siteAddress' | 'siteInfo'>>,
): Promise<void> {
  await db.standingMaterialCounts.update(id, {
    ...fields,
    updatedAt: Date.now(),
  })
}

export async function confirmStandingMaterialCount(
  id: string,
  fields: Pick<StandingMaterialCount, 'siteName' | 'siteAddress' | 'siteInfo'>,
): Promise<void> {
  await db.standingMaterialCounts.update(id, {
    ...fields,
    confirmed: true,
    updatedAt: Date.now(),
  })
}
