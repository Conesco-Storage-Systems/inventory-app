import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { enqueuePendingDelete, enqueuePendingDeletes } from './pendingDeletes'
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
    syncStatus: 'pending',
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
    syncStatus: 'pending',
  })
}

export async function touchSiteUpdated(siteId: string): Promise<void> {
  await db.sites.update(siteId, {
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

export async function markSiteInactive(siteId: string): Promise<void> {
  await db.sites.update(siteId, {
    active: false,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

export async function markSiteActive(siteId: string): Promise<void> {
  await db.sites.update(siteId, {
    active: true,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

const RECENTLY_DELETED_RETENTION_MS = 60 * 24 * 60 * 60 * 1000

// Soft delete — moves the location to "Recently Deleted" instead of erasing
// it. All of its items/photos stay exactly as they are; only the site
// record itself is flagged, so it drops out of every list until restored or
// permanently purged after 60 days.
export async function deleteSite(siteId: string): Promise<void> {
  await db.sites.update(siteId, {
    deletedAt: Date.now(),
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

export async function restoreSite(siteId: string): Promise<void> {
  const site = await db.sites.get(siteId)
  if (!site) return
  delete site.deletedAt

  await db.sites.put({
    ...site,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

// The real, irreversible cascade delete — only ever called once a location
// has sat in "Recently Deleted" past its retention window.
export async function permanentlyDeleteSite(siteId: string): Promise<void> {
  const [beams, uprights, wireDecks, miscItems, projectPhotos] = await Promise.all([
    db.beams.where('siteId').equals(siteId).toArray(),
    db.uprights.where('siteId').equals(siteId).toArray(),
    db.wireDecks.where('siteId').equals(siteId).toArray(),
    db.miscItems.where('siteId').equals(siteId).toArray(),
    db.projectPhotos.where('siteId').equals(siteId).toArray(),
  ])
  const itemIds = [
    ...beams.map((b) => b.id),
    ...uprights.map((u) => u.id),
    ...wireDecks.map((w) => w.id),
    ...miscItems.map((m) => m.id),
  ]
  const photos = itemIds.length > 0 ? await db.photos.where('itemId').anyOf(itemIds).toArray() : []

  await enqueuePendingDeletes('beams', beams.map((b) => b.id))
  await enqueuePendingDeletes('uprights', uprights.map((u) => u.id))
  await enqueuePendingDeletes('wireDecks', wireDecks.map((w) => w.id))
  await enqueuePendingDeletes('miscItems', miscItems.map((m) => m.id))
  await enqueuePendingDeletes('photos', photos.map((p) => p.id))
  await enqueuePendingDeletes('projectPhotos', projectPhotos.map((p) => p.id))
  await enqueuePendingDelete('sites', siteId)

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

// Runs on app load: anything that's been sitting in "Recently Deleted"
// longer than the retention window gets permanently removed. There's no
// background server process to do this on a schedule, so it only actually
// happens the next time someone opens the app after the window has passed.
export async function purgeExpiredDeletedSites(): Promise<void> {
  const now = Date.now()
  const expired = await db.sites
    .filter((site) => !!site.deletedAt && now - site.deletedAt! >= RECENTLY_DELETED_RETENTION_MS)
    .toArray()
  for (const site of expired) {
    await permanentlyDeleteSite(site.id)
  }
}

export async function setSitePhoto(siteId: string, file: File): Promise<void> {
  await db.sites.update(siteId, {
    sitePhoto: file,
    sitePhotoDirty: true,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

export async function removeSitePhoto(siteId: string): Promise<void> {
  const site = await db.sites.get(siteId)
  if (!site) return
  delete site.sitePhoto

  await db.sites.put({
    ...site,
    sitePhotoPath: '',
    sitePhotoDirty: true,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
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
