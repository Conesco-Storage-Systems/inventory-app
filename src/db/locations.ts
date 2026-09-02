import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import type { AreaStatus } from '../models/types'
import { getEditorName } from '../state/editor'

export async function createSite(name: string, address: string, otherInfo: string): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.sites.add({
    id,
    name: name.trim(),
    address: address.trim(),
    otherInfo: otherInfo.trim(),
    createdAt: now,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: now,
    active: true,
  })
  return id
}

export async function listSites() {
  return db.sites.orderBy('name').toArray()
}

export async function getSite(siteId: string) {
  return db.sites.get(siteId)
}

export async function updateSite(
  siteId: string,
  name: string,
  address: string,
  otherInfo: string,
): Promise<void> {
  await db.sites.update(siteId, {
    name: name.trim(),
    address: address.trim(),
    otherInfo: otherInfo.trim(),
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
  })
}

export async function touchSiteUpdated(siteId: string): Promise<void> {
  await db.sites.update(siteId, {
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
  })
}

export async function markSiteInactive(siteId: string): Promise<void> {
  await db.sites.update(siteId, {
    active: false,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
  })
}

export async function markSiteActive(siteId: string): Promise<void> {
  await db.sites.update(siteId, {
    active: true,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
  })
}

export async function deleteSite(siteId: string): Promise<void> {
  const [beams, uprights, wireDecks, miscItems] = await Promise.all([
    db.beams.where('siteId').equals(siteId).toArray(),
    db.uprights.where('siteId').equals(siteId).toArray(),
    db.wireDecks.where('siteId').equals(siteId).toArray(),
    db.miscItems.where('siteId').equals(siteId).toArray(),
  ])
  const itemIds = [
    ...beams.map((b) => b.id),
    ...uprights.map((u) => u.id),
    ...wireDecks.map((w) => w.id),
    ...miscItems.map((m) => m.id),
  ]

  if (itemIds.length > 0) {
    await db.photos.where('itemId').anyOf(itemIds).delete()
  }
  await db.beams.where('siteId').equals(siteId).delete()
  await db.uprights.where('siteId').equals(siteId).delete()
  await db.wireDecks.where('siteId').equals(siteId).delete()
  await db.miscItems.where('siteId').equals(siteId).delete()
  await db.projectPhotos.where('siteId').equals(siteId).delete()
  await db.areas.where('siteId').equals(siteId).delete()
  await db.sites.delete(siteId)
}

export async function setSitePhoto(siteId: string, file: File): Promise<void> {
  await db.sites.update(siteId, {
    sitePhoto: file,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
  })
}

export async function createArea(
  siteId: string,
  name: string,
  assignedTo: string,
): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.areas.add({
    id,
    siteId,
    name: name.trim(),
    assignedTo: assignedTo.trim(),
    status: 'Not started',
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function updateAreaStatus(areaId: string, status: AreaStatus): Promise<void> {
  await db.areas.update(areaId, { status, updatedAt: Date.now() })
}
