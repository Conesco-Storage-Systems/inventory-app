import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { compressImageToFile } from '../export/compressImage'
import { enqueuePendingDelete } from './pendingDeletes'
import type { BolPhoto } from '../models/types'

export async function addBolPhoto(bolId: string, file: File): Promise<void> {
  const id = uuidv4()
  const blob = await compressImageToFile(file).catch(() => file)
  await db.bolPhotoBlobs.add({ id, blob })
  await db.bolPhotos.add({
    id,
    bolId,
    createdAt: Date.now(),
    uploadStatus: 'pending',
  })
}

export async function listBolPhotos(bolId: string): Promise<(BolPhoto & { blob: Blob })[]> {
  const photos = await db.bolPhotos.where('bolId').equals(bolId).reverse().sortBy('createdAt')
  if (photos.length === 0) return []
  const blobRows = await db.bolPhotoBlobs.bulkGet(photos.map((p) => p.id))
  return photos
    .map((p, i) => ({ ...p, blob: blobRows[i]?.blob }))
    .filter((p): p is BolPhoto & { blob: Blob } => p.blob instanceof Blob && p.blob.size > 0)
}

export async function deleteBolPhoto(photoId: string): Promise<void> {
  await enqueuePendingDelete('bolPhotos', photoId)
  await db.bolPhotos.delete(photoId)
  await db.bolPhotoBlobs.delete(photoId)
}
