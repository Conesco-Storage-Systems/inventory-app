import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { compressImageToFile } from '../export/compressImage'
import { enqueuePendingDelete, enqueuePendingDeletes } from './pendingDeletes'
import { getEditorName } from '../state/editor'
import type { BulletinComment, BulletinPost, BulletinPostPhoto } from '../models/types'

export async function listBulletinPosts(): Promise<BulletinPost[]> {
  const posts = await db.bulletinPosts.toArray()
  return posts.sort((a, b) => b.createdAt - a.createdAt)
}

export async function createBulletinPost(body: string): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.bulletinPosts.add({
    id,
    authorEmail: getEditorName(),
    body,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  })
  return id
}

export async function updateBulletinPost(id: string, body: string): Promise<void> {
  await db.bulletinPosts.update(id, { body, updatedAt: Date.now(), syncStatus: 'pending' })
}

// Removes the post along with every comment and photo on it — nothing
// should outlive the post it belongs to.
export async function deleteBulletinPost(id: string): Promise<void> {
  const [comments, photos] = await Promise.all([
    db.bulletinComments.where('postId').equals(id).toArray(),
    db.bulletinPostPhotos.where('postId').equals(id).toArray(),
  ])
  const commentIds = comments.map((c) => c.id)
  const photoIds = photos.map((p) => p.id)

  if (commentIds.length > 0) {
    await enqueuePendingDeletes('bulletinComments', commentIds)
    await db.bulletinComments.bulkDelete(commentIds)
  }
  if (photoIds.length > 0) {
    await enqueuePendingDeletes('bulletinPostPhotos', photoIds)
    await db.bulletinPostPhotos.bulkDelete(photoIds)
    await db.bulletinPostPhotoBlobs.bulkDelete(photoIds)
  }
  await enqueuePendingDelete('bulletinPosts', id)
  await db.bulletinPosts.delete(id)
}

export async function listBulletinCommentsByPost(postId: string): Promise<BulletinComment[]> {
  const comments = await db.bulletinComments.where('postId').equals(postId).toArray()
  return comments.sort((a, b) => a.createdAt - b.createdAt)
}

export async function createBulletinComment(postId: string, body: string): Promise<void> {
  await db.bulletinComments.add({
    id: uuidv4(),
    postId,
    authorEmail: getEditorName(),
    body,
    createdAt: Date.now(),
    syncStatus: 'pending',
  })
}

export async function deleteBulletinComment(id: string): Promise<void> {
  await enqueuePendingDelete('bulletinComments', id)
  await db.bulletinComments.delete(id)
}

export async function addBulletinPostPhoto(postId: string, file: File): Promise<void> {
  const id = uuidv4()
  // compressImageToFile() never throws and never falls back to the raw
  // File (see its docstring) — no .catch() here, see items.ts's savePhotos
  // for why.
  const blob = await compressImageToFile(file)
  await db.bulletinPostPhotoBlobs.add({ id, blob })
  await db.bulletinPostPhotos.add({
    id,
    postId,
    createdAt: Date.now(),
    uploadStatus: 'pending',
  })
}

export async function listBulletinPostPhotos(postId: string): Promise<(BulletinPostPhoto & { blob: Blob })[]> {
  const photos = await db.bulletinPostPhotos.where('postId').equals(postId).toArray()
  if (photos.length === 0) return []
  const blobRows = await db.bulletinPostPhotoBlobs.bulkGet(photos.map((p) => p.id))
  return photos
    .map((p, i) => ({ ...p, blob: blobRows[i]?.blob }))
    .filter((p): p is BulletinPostPhoto & { blob: Blob } => p.blob instanceof Blob && p.blob.size > 0)
}

export async function deleteBulletinPostPhoto(photoId: string): Promise<void> {
  await enqueuePendingDelete('bulletinPostPhotos', photoId)
  await db.bulletinPostPhotos.delete(photoId)
  await db.bulletinPostPhotoBlobs.delete(photoId)
}
