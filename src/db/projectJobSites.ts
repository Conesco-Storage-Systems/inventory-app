import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { untieAllMaterialNeedAllocations } from './materialNeedAllocations'
import { enqueuePendingDelete, enqueuePendingDeletes } from './pendingDeletes'

export interface NewProjectJobSiteInput {
  projectId: string
  name: string
  targetDate: string
  notes: string
}

export async function createProjectJobSite(input: NewProjectJobSiteInput): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.projectJobSites.add({
    id,
    projectId: input.projectId,
    name: input.name.trim(),
    targetDate: input.targetDate,
    linkedSiteId: '',
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  })
  return id
}

export async function listProjectJobSites(projectId: string) {
  const rows = await db.projectJobSites.where('projectId').equals(projectId).toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getProjectJobSite(id: string) {
  return db.projectJobSites.get(id)
}

export interface ProjectJobSiteEditInput {
  name: string
  targetDate: string
  notes: string
}

export async function updateProjectJobSite(id: string, input: ProjectJobSiteEditInput): Promise<void> {
  await db.projectJobSites.update(id, {
    name: input.name.trim(),
    targetDate: input.targetDate,
    notes: input.notes,
    updatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

// Links this planning job site to a real Location once material actually
// starts moving there — turns on live movement tracking (via Inventory
// Transfers into that Location) for it. Pass '' to unlink.
export async function linkProjectJobSiteToSite(id: string, siteId: string): Promise<void> {
  await db.projectJobSites.update(id, {
    linkedSiteId: siteId,
    updatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

// Deletes the job site and every Material Need under it, untying any
// allocations on those needs first — there's nothing else referencing
// a job site id, so this can't orphan any other record.
export async function deleteProjectJobSite(id: string): Promise<void> {
  const needs = await db.materialNeeds.where('jobSiteId').equals(id).toArray()
  const needIds = needs.map((n) => n.id)
  for (const needId of needIds) {
    await untieAllMaterialNeedAllocations(needId)
  }
  if (needIds.length > 0) {
    await enqueuePendingDeletes('materialNeeds', needIds)
    await db.materialNeeds.bulkDelete(needIds)
  }
  await enqueuePendingDelete('projectJobSites', id)
  await db.projectJobSites.delete(id)
}
