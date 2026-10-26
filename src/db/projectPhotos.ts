import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { touchSiteUpdated } from './locations'
import { compressImageToFile } from '../export/compressImage'
import { enqueuePendingDelete } from './pendingDeletes'
import type { ProjectPhoto } from '../models/types'

export async function addProjectPhoto(siteId: string, file: File): Promise<void> {
  const id = uuidv4()
  // compressImageToFile() never throws and never falls back to the raw
  // File (see its docstring) — no .catch() here, see items.ts's savePhotos
  // for why.
  const blob = await compressImageToFile(file)
  await db.projectPhotoBlobs.add({ id, blob })
  await db.projectPhotos.add({
    id,
    siteId,
    createdAt: Date.now(),
    uploadStatus: 'pending',
  })
  await touchSiteUpdated(siteId)
}

export async function listProjectPhotos(siteId: string): Promise<(ProjectPhoto & { blob: Blob })[]> {
  const photos = await db.projectPhotos.where('siteId').equals(siteId).reverse().sortBy('createdAt')
  if (photos.length === 0) return []
  const blobRows = await db.projectPhotoBlobs.bulkGet(photos.map((p) => p.id))
  return photos
    .map((p, i) => ({ ...p, blob: blobRows[i]?.blob }))
    .filter((p): p is ProjectPhoto & { blob: Blob } => p.blob instanceof Blob && p.blob.size > 0)
}

export async function deleteProjectPhoto(photoId: string): Promise<void> {
  await enqueuePendingDelete('projectPhotos', photoId)
  await db.projectPhotos.delete(photoId)
  await db.projectPhotoBlobs.delete(photoId)
}
