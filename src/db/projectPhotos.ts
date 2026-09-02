import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { touchSiteUpdated } from './locations'

export async function addProjectPhoto(siteId: string, file: File): Promise<void> {
  await db.projectPhotos.add({
    id: uuidv4(),
    siteId,
    blob: file,
    createdAt: Date.now(),
  })
  await touchSiteUpdated(siteId)
}

export async function listProjectPhotos(siteId: string) {
  return db.projectPhotos.where('siteId').equals(siteId).reverse().sortBy('createdAt')
}

export async function deleteProjectPhoto(photoId: string): Promise<void> {
  await db.projectPhotos.delete(photoId)
}
