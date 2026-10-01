import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { enqueuePendingDelete } from './pendingDeletes'

export async function addBolPhoto(bolId: string, file: File): Promise<void> {
  await db.bolPhotos.add({
    id: uuidv4(),
    bolId,
    blob: file,
    createdAt: Date.now(),
    uploadStatus: 'pending',
  })
}

export async function listBolPhotos(bolId: string) {
  return db.bolPhotos.where('bolId').equals(bolId).reverse().sortBy('createdAt')
}

export async function deleteBolPhoto(photoId: string): Promise<void> {
  await enqueuePendingDelete('bolPhotos', photoId)
  await db.bolPhotos.delete(photoId)
}
