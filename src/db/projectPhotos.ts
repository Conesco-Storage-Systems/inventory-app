import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { touchSiteUpdated } from './locations'
import { compressImageToFile } from '../export/compressImage'
import { enqueuePendingDelete } from './pendingDeletes'

export async function addProjectPhoto(siteId: string, file: File): Promise<void> {
  const blob = await compressImageToFile(file).catch(() => file)
  await db.projectPhotos.add({
    id: uuidv4(),
    siteId,
    blob,
    createdAt: Date.now(),
    uploadStatus: 'pending',
  })
  await touchSiteUpdated(siteId)
}

export async function listProjectPhotos(siteId: string) {
  return db.projectPhotos.where('siteId').equals(siteId).reverse().sortBy('createdAt')
}

export async function deleteProjectPhoto(photoId: string): Promise<void> {
  await enqueuePendingDelete('projectPhotos', photoId)
  await db.projectPhotos.delete(photoId)
}
