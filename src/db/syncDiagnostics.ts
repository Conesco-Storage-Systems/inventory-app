import { db } from './db'

export interface PhotoTableDiagnostics {
  label: string
  total: number
  synced: number
  pending: number
  failed: number
  failedIds: string[]
}

export interface EntityTableDiagnostics {
  label: string
  pending: number
}

export interface SiteHeroPhotoDiagnostics {
  // sitePhotoPath is set locally but no matching blob exists on this
  // device — the exact stuck state fetchSitePhotoNow() exists to heal.
  // Always worth surfacing even though it's self-healing on next visit,
  // since "is anything actually stuck right now" is the whole point of
  // this screen.
  missingBlob: number
  missingBlobIds: string[]
  dirty: number
}

export interface SyncDiagnosticsSnapshot {
  photoTables: PhotoTableDiagnostics[]
  siteHeroPhotos: SiteHeroPhotoDiagnostics
  entityTables: EntityTableDiagnostics[]
  pendingDeletes: number
}

const FAILED_ID_SAMPLE_LIMIT = 25

async function photoTableDiagnostics<T extends { uploadStatus: string }>(
  label: string,
  table: { toArray: () => Promise<T[]> } & { get: (id: string) => Promise<T | undefined> },
): Promise<PhotoTableDiagnostics> {
  const rows = await table.toArray()
  const failed = rows.filter((r) => r.uploadStatus === 'failed')
  return {
    label,
    total: rows.length,
    synced: rows.filter((r) => r.uploadStatus === 'synced').length,
    pending: rows.filter((r) => r.uploadStatus === 'pending' || r.uploadStatus === 'uploading').length,
    failed: failed.length,
    failedIds: failed.slice(0, FAILED_ID_SAMPLE_LIMIT).map((r) => (r as unknown as { id: string }).id),
  }
}

async function entityTableDiagnostics(
  label: string,
  table: { toArray: () => Promise<{ syncStatus?: string }[]> },
): Promise<EntityTableDiagnostics> {
  const rows = await table.toArray()
  return { label, pending: rows.filter((r) => r.syncStatus === 'pending').length }
}

// Everything here is read-only — it only reports what's already stored
// locally, same as the laptop/phone IndexedDB console checks this is
// meant to replace, so there's no sync or data-risk from loading this
// screen.
export async function getSyncDiagnosticsSnapshot(): Promise<SyncDiagnosticsSnapshot> {
  const [photos, projectPhotos, bolPhotos, bulletinPostPhotos, sites] = await Promise.all([
    photoTableDiagnostics('Item Photos', db.photos),
    photoTableDiagnostics('Project Photos', db.projectPhotos),
    photoTableDiagnostics('BOL Photos', db.bolPhotos),
    photoTableDiagnostics('Bulletin Photos', db.bulletinPostPhotos),
    db.sites.toArray(),
  ])

  const sitesWithPath = sites.filter((s) => !!s.sitePhotoPath)
  const missingBlobSites: string[] = []
  for (const site of sitesWithPath) {
    const blob = await db.siteHeroPhotoBlobs.get(site.id)
    if (!blob) missingBlobSites.push(site.id)
  }

  const entityTables = await Promise.all([
    entityTableDiagnostics('Beams', db.beams),
    entityTableDiagnostics('Uprights', db.uprights),
    entityTableDiagnostics('Wire Decks', db.wireDecks),
    entityTableDiagnostics('Misc Items', db.miscItems),
    entityTableDiagnostics('Sites', db.sites),
    entityTableDiagnostics('Projects', db.projects),
    entityTableDiagnostics('Bills of Lading', db.billsOfLading),
    entityTableDiagnostics('Customer Sheets', db.customerSheets),
    entityTableDiagnostics('Sales Order Line Items', db.salesOrderLineItems),
    entityTableDiagnostics('Sales Order Schedules', db.salesOrderSchedules),
    entityTableDiagnostics('Sales Quotes', db.salesQuotes),
    entityTableDiagnostics('Sales Quote Line Items', db.salesQuoteLineItems),
    entityTableDiagnostics('Inventory Transfers', db.inventoryTransfers),
    entityTableDiagnostics('Project Job Sites', db.projectJobSites),
    entityTableDiagnostics('Material Needs', db.materialNeeds),
    entityTableDiagnostics('Material Need Allocations', db.materialNeedAllocations),
    entityTableDiagnostics('Bulletin Posts', db.bulletinPosts),
    entityTableDiagnostics('Bulletin Comments', db.bulletinComments),
  ])

  return {
    photoTables: [photos, projectPhotos, bolPhotos, bulletinPostPhotos],
    siteHeroPhotos: {
      missingBlob: missingBlobSites.length,
      missingBlobIds: missingBlobSites.slice(0, FAILED_ID_SAMPLE_LIMIT),
      dirty: sites.filter((s) => s.sitePhotoDirty).length,
    },
    entityTables,
    pendingDeletes: await db.pendingDeletes.count(),
  }
}
