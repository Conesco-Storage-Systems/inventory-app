import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { touchSiteUpdated } from './locations'
import { enqueuePendingDeletes } from './pendingDeletes'
import type { Beam, Condition, ItemType, Upright, WireDeck } from '../models/types'

export interface NewBeamInput {
  siteId: string
  quantity: number
  condition: Condition
  bundleSize: string
  zone: string
  notes: string
  length: number
  width: string
  color: string
  pinCount: string
  stamp: string
  style: string
  stickers: string
  photoFiles: File[]
}

export async function savePhotos(itemType: ItemType, itemId: string, files: File[]): Promise<string[]> {
  const ids: string[] = []
  for (const file of files) {
    const id = uuidv4()
    await db.photos.add({
      id,
      itemType,
      itemId,
      blob: file,
      createdAt: Date.now(),
      uploadStatus: 'pending',
    })
    ids.push(id)
  }
  return ids
}

export async function createBeam(input: NewBeamInput): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  const photoIds = await savePhotos('beam', id, input.photoFiles)

  const beam: Beam = {
    id,
    siteId: input.siteId,
    areaId: '',
    aisleOrBay: '',
    quantity: input.quantity,
    condition: input.condition,
    bundleSize: input.bundleSize,
    zone: input.zone,
    notes: input.notes,
    photoIds,
    recordedBy: '',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
    length: input.length,
    width: input.width,
    color: input.color,
    pinCount: input.pinCount,
    stamp: input.stamp,
    style: input.style,
    stickers: input.stickers,
  }

  await db.beams.add(beam)
  await touchSiteUpdated(input.siteId)
  return id
}

export async function listBeamsBySite(siteId: string): Promise<Beam[]> {
  return db.beams.where('siteId').equals(siteId).toArray()
}

export interface BeamEditInput {
  survivingId: string
  otherIds: string[]
  quantity: number
  condition: Condition
  bundleSize: string
  zone: string
  notes: string
  length: number
  width: string
  color: string
  pinCount: string
  stamp: string
  style: string
  stickers: string
  existingPhotoIds: string[]
  newPhotoFiles: File[]
}

export async function updateBeamGroup(input: BeamEditInput): Promise<void> {
  const existing = await db.beams.get(input.survivingId)
  if (!existing) return

  const newPhotoIds = await savePhotos('beam', input.survivingId, input.newPhotoFiles)
  const photoIds = [...input.existingPhotoIds, ...newPhotoIds]

  if (input.otherIds.length > 0) {
    await db.photos.where('itemId').anyOf(input.otherIds).modify({ itemId: input.survivingId })
    await enqueuePendingDeletes('beams', input.otherIds)
    await db.beams.bulkDelete(input.otherIds)
  }

  await db.beams.update(input.survivingId, {
    quantity: input.quantity,
    condition: input.condition,
    bundleSize: input.bundleSize,
    zone: input.zone,
    notes: input.notes,
    length: input.length,
    width: input.width,
    color: input.color,
    pinCount: input.pinCount,
    stamp: input.stamp,
    style: input.style,
    stickers: input.stickers,
    photoIds,
    updatedAt: Date.now(),
    syncStatus: 'pending',
  })
  await touchSiteUpdated(existing.siteId)
}

export async function getPhotosForItem(itemIds: string[]): Promise<{ id: string; blob: Blob }[]> {
  if (itemIds.length === 0) return []
  const photos = await db.photos.where('itemId').anyOf(itemIds).toArray()
  return photos.map((p) => ({ id: p.id, blob: p.blob }))
}

async function deletePhotosForItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return
  const photos = await db.photos.where('itemId').anyOf(itemIds).toArray()
  await enqueuePendingDeletes('photos', photos.map((p) => p.id))
  await db.photos.where('itemId').anyOf(itemIds).delete()
}

export async function deleteBeamGroup(ids: string[]): Promise<void> {
  const existing = await db.beams.get(ids[0])
  await deletePhotosForItems(ids)
  await enqueuePendingDeletes('beams', ids)
  await db.beams.bulkDelete(ids)
  if (existing) await touchSiteUpdated(existing.siteId)
}

export interface NewWireDeckInput {
  siteId: string
  quantity: number
  condition: Condition
  bundleSize: string
  zone: string
  notes: string
  length: number
  width: number
  channelCount: string
  style: string[]
  photoFiles: File[]
}

export async function createWireDeck(input: NewWireDeckInput): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  const photoIds = await savePhotos('wireDeck', id, input.photoFiles)

  const wireDeck: WireDeck = {
    id,
    siteId: input.siteId,
    areaId: '',
    aisleOrBay: '',
    quantity: input.quantity,
    condition: input.condition,
    bundleSize: input.bundleSize,
    zone: input.zone,
    notes: input.notes,
    photoIds,
    recordedBy: '',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
    length: input.length,
    width: input.width,
    channelCount: input.channelCount,
    style: input.style,
  }

  await db.wireDecks.add(wireDeck)
  await touchSiteUpdated(input.siteId)
  return id
}

export async function listWireDecksBySite(siteId: string): Promise<WireDeck[]> {
  return db.wireDecks.where('siteId').equals(siteId).toArray()
}

export interface WireDeckEditInput {
  survivingId: string
  otherIds: string[]
  quantity: number
  condition: Condition
  bundleSize: string
  zone: string
  notes: string
  length: number
  width: number
  channelCount: string
  style: string[]
  existingPhotoIds: string[]
  newPhotoFiles: File[]
}

export async function updateWireDeckGroup(input: WireDeckEditInput): Promise<void> {
  const existing = await db.wireDecks.get(input.survivingId)
  if (!existing) return

  const newPhotoIds = await savePhotos('wireDeck', input.survivingId, input.newPhotoFiles)
  const photoIds = [...input.existingPhotoIds, ...newPhotoIds]

  if (input.otherIds.length > 0) {
    await db.photos.where('itemId').anyOf(input.otherIds).modify({ itemId: input.survivingId })
    await enqueuePendingDeletes('wireDecks', input.otherIds)
    await db.wireDecks.bulkDelete(input.otherIds)
  }

  await db.wireDecks.update(input.survivingId, {
    quantity: input.quantity,
    condition: input.condition,
    bundleSize: input.bundleSize,
    zone: input.zone,
    notes: input.notes,
    length: input.length,
    width: input.width,
    channelCount: input.channelCount,
    style: input.style,
    photoIds,
    updatedAt: Date.now(),
    syncStatus: 'pending',
  })
  await touchSiteUpdated(existing.siteId)
}

export async function deleteWireDeckGroup(ids: string[]): Promise<void> {
  const existing = await db.wireDecks.get(ids[0])
  await deletePhotosForItems(ids)
  await enqueuePendingDeletes('wireDecks', ids)
  await db.wireDecks.bulkDelete(ids)
  if (existing) await touchSiteUpdated(existing.siteId)
}

export interface NewUprightInput {
  siteId: string
  quantity: number
  condition: Condition
  bundleSize: string
  zone: string
  notes: string
  color: string
  style: string
  width: number
  heightFeet: number
  heightInches: number
  columnLength: number
  columnWidth: number
  footplateLength: number
  footplateWidth: number
  anchorHoleCount: number
  holeSize: string
  gauge: string
  stamp: string
  photoFiles: File[]
}

export async function createUpright(input: NewUprightInput): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  const photoIds = await savePhotos('upright', id, input.photoFiles)

  const upright: Upright = {
    id,
    siteId: input.siteId,
    areaId: '',
    aisleOrBay: '',
    quantity: input.quantity,
    condition: input.condition,
    bundleSize: input.bundleSize,
    zone: input.zone,
    notes: input.notes,
    photoIds,
    recordedBy: '',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
    color: input.color,
    style: input.style,
    width: input.width,
    heightFeet: input.heightFeet,
    heightInches: input.heightInches,
    columnLength: input.columnLength,
    columnWidth: input.columnWidth,
    footplateLength: input.footplateLength,
    footplateWidth: input.footplateWidth,
    anchorHoleCount: input.anchorHoleCount,
    holeSize: input.holeSize,
    gauge: input.gauge,
    stamp: input.stamp,
  }

  await db.uprights.add(upright)
  await touchSiteUpdated(input.siteId)
  return id
}

export async function listUprightsBySite(siteId: string): Promise<Upright[]> {
  return db.uprights.where('siteId').equals(siteId).toArray()
}

export interface UprightEditInput {
  survivingId: string
  otherIds: string[]
  quantity: number
  condition: Condition
  bundleSize: string
  zone: string
  notes: string
  color: string
  style: string
  width: number
  heightFeet: number
  heightInches: number
  columnLength: number
  columnWidth: number
  footplateLength: number
  footplateWidth: number
  anchorHoleCount: number
  holeSize: string
  gauge: string
  stamp: string
  existingPhotoIds: string[]
  newPhotoFiles: File[]
}

export async function updateUprightGroup(input: UprightEditInput): Promise<void> {
  const existing = await db.uprights.get(input.survivingId)
  if (!existing) return

  const newPhotoIds = await savePhotos('upright', input.survivingId, input.newPhotoFiles)
  const photoIds = [...input.existingPhotoIds, ...newPhotoIds]

  if (input.otherIds.length > 0) {
    await db.photos.where('itemId').anyOf(input.otherIds).modify({ itemId: input.survivingId })
    await enqueuePendingDeletes('uprights', input.otherIds)
    await db.uprights.bulkDelete(input.otherIds)
  }

  await db.uprights.update(input.survivingId, {
    quantity: input.quantity,
    condition: input.condition,
    bundleSize: input.bundleSize,
    zone: input.zone,
    notes: input.notes,
    color: input.color,
    style: input.style,
    width: input.width,
    heightFeet: input.heightFeet,
    heightInches: input.heightInches,
    columnLength: input.columnLength,
    columnWidth: input.columnWidth,
    footplateLength: input.footplateLength,
    footplateWidth: input.footplateWidth,
    anchorHoleCount: input.anchorHoleCount,
    holeSize: input.holeSize,
    gauge: input.gauge,
    stamp: input.stamp,
    photoIds,
    updatedAt: Date.now(),
    syncStatus: 'pending',
  })
  await touchSiteUpdated(existing.siteId)
}

export async function deleteUprightGroup(ids: string[]): Promise<void> {
  const existing = await db.uprights.get(ids[0])
  await deletePhotosForItems(ids)
  await enqueuePendingDeletes('uprights', ids)
  await db.uprights.bulkDelete(ids)
  if (existing) await touchSiteUpdated(existing.siteId)
}
