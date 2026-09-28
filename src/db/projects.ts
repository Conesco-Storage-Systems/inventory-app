import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { enqueuePendingDelete } from './pendingDeletes'
import { getEditorName } from '../state/editor'
import type { Project } from '../models/types'

const RECENTLY_DELETED_RETENTION_MS = 60 * 24 * 60 * 60 * 1000

// Projects are person-specific. No owner set yet (created before this
// existed) means visible to everyone, same as always — nothing vanishes
// from anyone's screen just because this feature shipped.
export function canSeeProject(project: Project, userId: string | null): boolean {
  if (!project.ownerId) return true
  if (!userId) return false
  if (project.ownerId === userId) return true
  return (project.sharedWith ?? []).some((s) => s.id === userId)
}

export async function createProject(name: string, ownerId: string, ownerEmail: string): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.projects.add({
    id,
    name: name.trim(),
    createdAt: now,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: now,
    active: true,
    ownerId,
    ownerEmail,
    sharedWith: [],
    syncStatus: 'pending',
  })
  return id
}

// Only the owner may call these — enforced by the UI (ProjectDetail only
// shows the share controls to the owner), same as the rest of this app's
// permission checks.
export async function shareProject(projectId: string, userId: string, email: string): Promise<void> {
  const project = await db.projects.get(projectId)
  if (!project) return
  const sharedWith = project.sharedWith ?? []
  if (sharedWith.some((s) => s.id === userId)) return
  await db.projects.update(projectId, {
    sharedWith: [...sharedWith, { id: userId, email }],
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

export async function unshareProject(projectId: string, userId: string): Promise<void> {
  const project = await db.projects.get(projectId)
  if (!project) return
  await db.projects.update(projectId, {
    sharedWith: (project.sharedWith ?? []).filter((s) => s.id !== userId),
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

export async function listProjects() {
  return db.projects.orderBy('name').toArray()
}

export async function getProject(projectId: string) {
  return db.projects.get(projectId)
}

export async function markProjectInactive(projectId: string): Promise<void> {
  await db.projects.update(projectId, {
    active: false,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

export async function markProjectActive(projectId: string): Promise<void> {
  await db.projects.update(projectId, {
    active: true,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

// Soft delete — moves the project to "Recently Deleted" instead of erasing
// it. Locations inside it are left exactly as they are.
export async function deleteProject(projectId: string): Promise<void> {
  await db.projects.update(projectId, {
    deletedAt: Date.now(),
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

export async function restoreProject(projectId: string): Promise<void> {
  const project = await db.projects.get(projectId)
  if (!project) return
  delete project.deletedAt

  await db.projects.put({
    ...project,
    lastUpdatedBy: getEditorName(),
    lastUpdatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

// The real, irreversible delete — only ever called once a project has sat
// in "Recently Deleted" past its retention window. Any locations still
// assigned to it are ungrouped back into standalone Offsite Locations
// rather than being touched in any way — deleting the folder doesn't
// delete what was inside it.
export async function permanentlyDeleteProject(projectId: string): Promise<void> {
  const orphanedSites = await db.sites.filter((site) => site.projectId === projectId).toArray()
  for (const site of orphanedSites) {
    delete site.projectId
    await db.sites.put({
      ...site,
      lastUpdatedBy: getEditorName(),
      lastUpdatedAt: Date.now(),
      syncStatus: 'pending',
    })
  }

  await enqueuePendingDelete('projects', projectId)
  await db.projects.delete(projectId)
}

export async function purgeExpiredDeletedProjects(): Promise<void> {
  const now = Date.now()
  const expired = await db.projects
    .filter((project) => !!project.deletedAt && now - project.deletedAt! >= RECENTLY_DELETED_RETENTION_MS)
    .toArray()
  for (const project of expired) {
    await permanentlyDeleteProject(project.id)
  }
}
