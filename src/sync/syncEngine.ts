import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/db'
import { supabase, supabaseConfigured } from './supabaseClient'
import type {
  Beam,
  BillOfLading,
  BolPhoto,
  CustomerSheet,
  InventoryTransfer,
  ItemType,
  MaterialNeed,
  MaterialNeedAllocation,
  MiscItem,
  Photo,
  Project,
  ProjectJobSite,
  ProjectPhoto,
  SalesOrderLineItem,
  SalesOrderSchedule,
  SalesQuote,
  SalesQuoteLineItem,
  Site,
  Upright,
  WireDeck,
} from '../models/types'

const STORAGE_BUCKET = 'inventory-photos'
const CURSOR_KEY = 'inventoryApp.syncCursors'

type Cursors = Record<string, number>

function getCursors(): Cursors {
  try {
    return JSON.parse(localStorage.getItem(CURSOR_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function setCursor(table: string, value: number): void {
  const cursors = getCursors()
  cursors[table] = Math.max(cursors[table] ?? 0, value)
  try {
    localStorage.setItem(CURSOR_KEY, JSON.stringify(cursors))
  } catch {
    // ignore write failures
  }
}

// Sync failures previously only ever went to the browser console, which a
// field user on their phone has no practical way to check — this also
// surfaces the most recent one as a small visible banner (see
// SyncErrorBanner.tsx), so a sync problem is actually diagnosable without
// devtools.
export const SYNC_ERROR_EVENT = 'inventoryApp:syncError'
const MAX_RECENT_SYNC_ERRORS = 8
// A single persistently-failing record (e.g. one bad row) re-fires every
// 30s and would otherwise permanently crowd out a different, maybe-more-
// relevant error from ever being seen — this keeps the most recent distinct
// messages instead of just the single latest one.
let recentSyncErrors: string[] = []

export function getRecentSyncErrors(): string[] {
  return recentSyncErrors
}

function describeSyncErrorArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.message
  if (arg && typeof arg === 'object') {
    const obj = arg as Record<string, unknown>
    if (typeof obj.message === 'string' && obj.message) return obj.message
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
  }
  return String(arg)
}

function reportSyncError(message: string, ...rest: unknown[]): void {
  console.error(message, ...rest)
  const detail = rest.length > 0 ? `${message} ${rest.map(describeSyncErrorArg).join(' — ')}` : message
  recentSyncErrors = [detail, ...recentSyncErrors.filter((m) => m !== detail)].slice(0, MAX_RECENT_SYNC_ERRORS)
  window.dispatchEvent(new CustomEvent(SYNC_ERROR_EVENT, { detail: recentSyncErrors }))
}

// ---------- generic item tables (beams / uprights / wire decks) ----------

interface ItemTableConfig {
  localTable: 'beams' | 'uprights' | 'wireDecks' | 'miscItems'
  remoteTable: string
  itemType: ItemType
  // Rows are handled loosely (any) here — each table has its own field
  // shape, and they all pass through Dexie's untyped db.table() lookup
  // anyway, so a shared generic buys nothing but variance headaches.
  toRemote: (row: any) => Record<string, unknown>
  fromRemote: (row: Record<string, unknown>) => any
}

async function pushItemTable(config: ItemTableConfig): Promise<void> {
  const table = db.table(config.localTable)
  const pending = await table.where('syncStatus').equals('pending').toArray()
  for (const row of pending) {
    try {
      const { error } = await supabase.from(config.remoteTable).upsert(config.toRemote(row))
      if (!error) {
        await table.update(row.id, { syncStatus: 'synced' })
      } else {
        reportSyncError(`[sync] push ${config.remoteTable}/${row.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push ${config.remoteTable}/${row.id} threw:`, err)
    }
  }
}

async function pullItemTable(config: ItemTableConfig): Promise<void> {
  const cursor = getCursors()[config.remoteTable] ?? 0
  const { data, error } = await supabase.from(config.remoteTable).select('*').gt('updated_at', cursor).order('updated_at', { ascending: true })
  if (error) {
    reportSyncError(`[sync] pull ${config.remoteTable} failed:`, error.message, error)
    return
  }
  if (!data) return

  const table = db.table(config.localTable)
  let maxUpdatedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.updated_at)

    try {
      const local = await table.get(remoteRow.id as string)
      // Last-write-wins by timestamp. If we have a local change that hasn't
      // synced yet and it's newer (or equal — don't let our own echo clobber
      // it), keep the local version and just note it for now.
      if (local && local.syncStatus === 'pending' && local.updatedAt >= updatedAt) {
        console.warn(`[sync] keeping local ${config.localTable}/${remoteRow.id} over an older/equal remote change`)
        if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
        continue
      }

      const mapped = config.fromRemote(remoteRow)
      // Recompute from the photos table itself rather than trusting
      // local?.photoIds — if this item's photos already synced to this
      // device before the item row did (e.g. the item's own push lagged a
      // cycle behind its photos), carrying forward local/empty photoIds
      // here would permanently strand them: pullPhotos() only re-links an
      // already-downloaded photo to its item once, on first download.
      const photoIds = (await db.photos.where('itemId').equals(remoteRow.id as string).toArray()).map((p) => p.id)
      await table.put({ ...mapped, photoIds, syncStatus: 'synced' })
      // Only advance the cursor past rows that actually applied — advancing
      // unconditionally (even on a row whose put() throws) would mean the
      // next pull's gt(cursor) never fetches that row again, permanently
      // losing it instead of retrying on the next sync pass.
      if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
    } catch (err) {
      reportSyncError(`[sync] pull ${config.remoteTable}/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor(config.remoteTable, maxUpdatedAt)
}

const beamConfig: ItemTableConfig = {
  localTable: 'beams',
  remoteTable: 'beams',
  itemType: 'beam',
  toRemote: (b) => ({
    id: b.id,
    site_id: b.siteId,
    quantity: b.quantity,
    condition: b.condition,
    bundle_size: b.bundleSize,
    zone: b.zone,
    notes: b.notes,
    recorded_by: b.recordedBy,
    length: b.length,
    width: b.width,
    color: b.color,
    pin_count: b.pinCount,
    stamp: b.stamp,
    style: b.style,
    stickers: b.stickers,
    step: b.step,
    cost_per: b.costPer,
    sell_per: b.sellPer,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
  }),
  fromRemote: (r) => ({
    id: r.id as string,
    siteId: r.site_id as string,
    areaId: '',
    aisleOrBay: '',
    quantity: r.quantity as number,
    condition: r.condition as Beam['condition'],
    bundleSize: r.bundle_size as string,
    zone: r.zone as string,
    notes: r.notes as string,
    recordedBy: r.recorded_by as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    length: (r.length as string) ?? '',
    width: r.width as string,
    color: r.color as string,
    pinCount: r.pin_count as string,
    stamp: r.stamp as string,
    style: r.style as string,
    stickers: r.stickers as string,
    step: (r.step as string) ?? '',
    costPer: (r.cost_per as number) ?? 0,
    sellPer: (r.sell_per as number) ?? 0,
  }),
}

const uprightConfig: ItemTableConfig = {
  localTable: 'uprights',
  remoteTable: 'uprights',
  itemType: 'upright',
  toRemote: (u) => ({
    id: u.id,
    site_id: u.siteId,
    quantity: u.quantity,
    condition: u.condition,
    bundle_size: u.bundleSize,
    zone: u.zone,
    notes: u.notes,
    recorded_by: u.recordedBy,
    color: u.color,
    style: u.style,
    width: u.width,
    height: u.height,
    column_length: u.columnLength,
    column_width: u.columnWidth,
    footplate_length: u.footplateLength,
    footplate_width: u.footplateWidth,
    footplate_thickness: u.footplateThickness,
    anchor_hole_count: u.anchorHoleCount,
    hole_size: u.holeSize,
    gauge: u.gauge,
    stamp: u.stamp,
    cost_per: u.costPer,
    sell_per: u.sellPer,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  }),
  fromRemote: (r) => ({
    id: r.id as string,
    siteId: r.site_id as string,
    areaId: '',
    aisleOrBay: '',
    quantity: r.quantity as number,
    condition: r.condition as Upright['condition'],
    bundleSize: r.bundle_size as string,
    zone: r.zone as string,
    notes: r.notes as string,
    recordedBy: r.recorded_by as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    color: r.color as string,
    style: r.style as string,
    width: (r.width as string) ?? '',
    height: (r.height as string) ?? '',
    columnLength: (r.column_length as string) ?? '',
    columnWidth: (r.column_width as string) ?? '',
    footplateLength: (r.footplate_length as string) ?? '',
    footplateWidth: (r.footplate_width as string) ?? '',
    footplateThickness: (r.footplate_thickness as string) ?? '',
    anchorHoleCount: (r.anchor_hole_count as string) ?? '',
    holeSize: r.hole_size as string,
    gauge: r.gauge as string,
    stamp: r.stamp as string,
    costPer: (r.cost_per as number) ?? 0,
    sellPer: (r.sell_per as number) ?? 0,
  }),
}

const wireDeckConfig: ItemTableConfig = {
  localTable: 'wireDecks',
  remoteTable: 'wire_decks',
  itemType: 'wireDeck',
  toRemote: (w) => ({
    id: w.id,
    site_id: w.siteId,
    quantity: w.quantity,
    condition: w.condition,
    bundle_size: w.bundleSize,
    zone: w.zone,
    notes: w.notes,
    recorded_by: w.recordedBy,
    length: w.length,
    width: w.width,
    channel_count: w.channelCount,
    style: w.style,
    cost_per: w.costPer,
    sell_per: w.sellPer,
    created_at: w.createdAt,
    updated_at: w.updatedAt,
  }),
  fromRemote: (r) => ({
    id: r.id as string,
    siteId: r.site_id as string,
    areaId: '',
    aisleOrBay: '',
    quantity: r.quantity as number,
    condition: r.condition as WireDeck['condition'],
    bundleSize: r.bundle_size as string,
    zone: r.zone as string,
    notes: r.notes as string,
    recordedBy: r.recorded_by as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    length: r.length as number,
    width: r.width as number,
    channelCount: r.channel_count as string,
    style: (r.style as string[]) ?? [],
    costPer: (r.cost_per as number) ?? 0,
    sellPer: (r.sell_per as number) ?? 0,
  }),
}

const miscItemConfig: ItemTableConfig = {
  localTable: 'miscItems',
  remoteTable: 'misc_items',
  itemType: 'misc',
  toRemote: (m) => ({
    id: m.id,
    site_id: m.siteId,
    quantity: m.quantity,
    condition: m.condition,
    bundle_size: m.bundleSize,
    zone: m.zone,
    notes: m.notes,
    recorded_by: m.recordedBy,
    description: m.description,
    item_description: m.itemDescription,
    cost_per: m.costPer,
    sell_per: m.sellPer,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  }),
  fromRemote: (r) => ({
    id: r.id as string,
    siteId: r.site_id as string,
    areaId: '',
    aisleOrBay: '',
    quantity: r.quantity as number,
    condition: r.condition as MiscItem['condition'],
    bundleSize: r.bundle_size as string,
    zone: r.zone as string,
    notes: r.notes as string,
    recordedBy: r.recorded_by as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    description: r.description as string,
    itemDescription: (r.item_description as string) ?? '',
    costPer: (r.cost_per as number) ?? 0,
    sellPer: (r.sell_per as number) ?? 0,
  }),
}

const ITEM_CONFIGS = [beamConfig, uprightConfig, wireDeckConfig, miscItemConfig]

// ---------- sites (including the site photo blob) ----------

function siteToRemote(site: Site): Record<string, unknown> {
  return {
    id: site.id,
    name: site.name,
    address: site.address,
    other_info: site.otherInfo,
    active: site.active ?? true,
    deleted_at: site.deletedAt ?? null,
    project_id: site.projectId ?? null,
    site_photo_path: site.sitePhotoPath || null,
    created_at: site.createdAt,
    last_updated_by: site.lastUpdatedBy,
    last_updated_at: site.lastUpdatedAt,
  }
}

async function pushSites(): Promise<void> {
  const pending = await db.sites.where('syncStatus').equals('pending').toArray()
  // A site can be "synced" (its name/address/etc. made it up fine) while its
  // photo specifically never did — e.g. it failed before the storage bucket
  // had a policy, or a previous replacement upload failed. That site won't
  // show up as "pending" anymore, so it has to be found separately or its
  // photo would be stranded forever.
  const syncedWithUnsentPhoto = await db.sites
    .filter((site) => site.syncStatus === 'synced' && !!site.sitePhotoDirty)
    .toArray()
  const pendingIds = new Set(pending.map((s) => s.id))
  const sitesToPush = [...pending, ...syncedWithUnsentPhoto.filter((s) => !pendingIds.has(s.id))]

  for (const site of sitesToPush) {
    try {
      let sitePhotoPath = site.sitePhotoPath
      let photoUploadFailed = false
      if (site.sitePhotoDirty) {
        const blobRow = await db.siteHeroPhotoBlobs.get(site.id)
        if (blobRow) {
          const bytes = await readBlobBytes(blobRow.blob)
          if (!bytes) {
            reportSyncError(`[sync] site photo for ${site.id} has no recoverable image data (corrupted local storage) — it needs to be re-added`)
          } else {
            // Versioned filename (not a fixed one) so the path itself changes
            // on every replacement — otherwise other devices would never
            // notice the photo changed, since they only re-download when the
            // path differs.
            const path = `${site.id}/site/${site.id}-${Date.now()}.jpg`
            const { error: uploadError } = await supabase.storage
              .from(STORAGE_BUCKET)
              .upload(path, bytes, { upsert: true, contentType: blobRow.blob.type || 'image/jpeg' })
            if (!uploadError) {
              sitePhotoPath = path
            } else if (isEmptyContentError(uploadError)) {
              // Deterministic server-side "nothing to upload" — leave
              // photoUploadFailed false so sitePhotoDirty clears below
              // instead of retrying forever.
              reportSyncError(`[sync] site photo for ${site.id} has no recoverable image data (corrupted local storage) — it needs to be re-added`)
            } else {
              photoUploadFailed = true
              reportSyncError(`[sync] site photo upload for ${site.id} failed:`, uploadError.message, JSON.stringify(uploadError))
            }
          }
        }
        // No blobRow at all means the photo was removed locally
        // (removeSitePhoto) — sitePhotoPath is already '' from that call,
        // and it just needs to go out below, nothing to upload.
      }

      const { error } = await supabase.from('sites').upsert(siteToRemote({ ...site, sitePhotoPath }))
      if (!error) {
        await db.sites.update(site.id, {
          syncStatus: 'synced',
          sitePhotoPath,
          sitePhotoDirty: photoUploadFailed,
        })
      } else {
        reportSyncError(`[sync] push sites/${site.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push sites/${site.id} threw:`, err)
    }
  }
}

async function pullSites(): Promise<void> {
  const cursor = getCursors().sites ?? 0
  const { data, error } = await supabase.from('sites').select('*').gt('last_updated_at', cursor).order('last_updated_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull sites failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.last_updated_at)

    try {
      const local = await db.sites.get(remoteRow.id as string)
      if (local && local.syncStatus === 'pending' && local.lastUpdatedAt >= updatedAt) {
        console.warn(`[sync] keeping local site/${remoteRow.id} over an older/equal remote change`)
        if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
        continue
      }

      const sitePhotoPath = (remoteRow.site_photo_path as string | null) || undefined
      // A transient failure here (network drop mid-download, same class as
      // any other "Load failed"/"Failed to fetch" blip) used to throw out of
      // this whole iteration before the site's own name/address/etc. below
      // ever got written locally — needlessly blocking a site's basic data
      // behind its hero photo. Isolate it so the photo can retry on its own
      // next pass without holding up the site record itself.
      try {
        if (sitePhotoPath && sitePhotoPath !== local?.sitePhotoPath) {
          const { data: blob, error: downloadError } = await supabase.storage.from(STORAGE_BUCKET).download(sitePhotoPath)
          if (blob) {
            await db.siteHeroPhotoBlobs.put({ id: remoteRow.id as string, blob })
          } else {
            reportSyncError(`[sync] site photo download for ${remoteRow.id} failed:`, downloadError?.message, downloadError)
          }
        } else if (!sitePhotoPath) {
          // Remote has no photo (removed elsewhere) — don't keep showing
          // whatever this device happened to have downloaded before.
          await db.siteHeroPhotoBlobs.delete(remoteRow.id as string)
        }
      } catch (photoErr) {
        reportSyncError(`[sync] site photo download for ${remoteRow.id} threw:`, photoErr)
      }

      await db.sites.put({
        id: remoteRow.id as string,
        name: remoteRow.name as string,
        address: remoteRow.address as string,
        otherInfo: remoteRow.other_info as string,
        active: remoteRow.active as boolean,
        deletedAt: (remoteRow.deleted_at as number | null) ?? undefined,
        projectId: (remoteRow.project_id as string | null) ?? undefined,
        sitePhotoPath,
        sitePhotoDirty: false,
        createdAt: remoteRow.created_at as number,
        lastUpdatedBy: remoteRow.last_updated_by as string,
        lastUpdatedAt: updatedAt,
        syncStatus: 'synced',
      })
      if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
    } catch (err) {
      reportSyncError(`[sync] pull site/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('sites', maxUpdatedAt)
}

// A retryMissingSitePhotoDownloads() helper used to run here, scanning every
// local site with a photo path and no local blob and re-downloading it, on
// every sync pass. Pulled back out: on a device whose local storage had just
// been wiped (e.g. a Safari "Clear Website Data"), that meant a large,
// repeating, every-30-seconds bulk re-download of every established site's
// photo at once, on a flaky mobile connection, at the same time brand-new
// sites were going through their own rapid push/pull cycles — and new
// sites' photos started getting replaced by other jobs' photos shortly
// after being taken. Root cause wasn't fully isolated before this was
// pulled; re-introduce only with a narrower scope (e.g. a single site at a
// time, not a full-table scan every pass) and only after confirming it
// can't run concurrently with itself across overlapping sync passes.

// ---------- projects ----------

function projectToRemote(project: Project): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    active: project.active ?? true,
    deleted_at: project.deletedAt ?? null,
    owner_id: project.ownerId ?? null,
    owner_email: project.ownerEmail ?? '',
    shared_with: project.sharedWith ?? [],
    sourcing_site_ids: project.sourcingSiteIds ?? [],
    created_at: project.createdAt,
    last_updated_by: project.lastUpdatedBy,
    last_updated_at: project.lastUpdatedAt,
  }
}

async function pushProjects(): Promise<void> {
  const pending = await db.projects.where('syncStatus').equals('pending').toArray()
  for (const project of pending) {
    try {
      const { error } = await supabase.from('projects').upsert(projectToRemote(project))
      if (!error) {
        await db.projects.update(project.id, { syncStatus: 'synced' })
      } else {
        reportSyncError(`[sync] push projects/${project.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push projects/${project.id} threw:`, err)
    }
  }
}

async function pullProjects(): Promise<void> {
  const cursor = getCursors().projects ?? 0
  const { data, error } = await supabase.from('projects').select('*').gt('last_updated_at', cursor).order('last_updated_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull projects failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.last_updated_at)

    try {
      const local = await db.projects.get(remoteRow.id as string)
      if (local && local.syncStatus === 'pending' && local.lastUpdatedAt >= updatedAt) {
        console.warn(`[sync] keeping local project/${remoteRow.id} over an older/equal remote change`)
        if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
        continue
      }

      await db.projects.put({
        id: remoteRow.id as string,
        name: remoteRow.name as string,
        active: remoteRow.active as boolean,
        deletedAt: (remoteRow.deleted_at as number | null) ?? undefined,
        ownerId: (remoteRow.owner_id as string | null) ?? '',
        ownerEmail: (remoteRow.owner_email as string) ?? '',
        sharedWith: (remoteRow.shared_with as Project['sharedWith']) ?? [],
        sourcingSiteIds: (remoteRow.sourcing_site_ids as string[]) ?? [],
        createdAt: remoteRow.created_at as number,
        lastUpdatedBy: remoteRow.last_updated_by as string,
        lastUpdatedAt: updatedAt,
        syncStatus: 'synced',
      })
      if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
    } catch (err) {
      reportSyncError(`[sync] pull project/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('projects', maxUpdatedAt)
}

// ---------- bills of lading ----------

function bolToRemote(bol: BillOfLading): Record<string, unknown> {
  return {
    id: bol.id,
    site_id: bol.siteId,
    direction: bol.direction,
    date: bol.date,
    load_number: bol.loadNumber,
    reference_doc: bol.referenceDoc,
    payment_term: bol.paymentTerm,
    ship_from_company: bol.shipFromCompany,
    ship_from_address: bol.shipFromAddress,
    ship_from_phone: bol.shipFromPhone,
    ship_to_company: bol.shipToCompany,
    ship_to_contact: bol.shipToContact,
    ship_to_address: bol.shipToAddress,
    ship_to_phone: bol.shipToPhone,
    carrier: bol.carrier,
    driver_phone: bol.driverPhone,
    broker_info: bol.brokerInfo,
    trailer_loaded_by: bol.trailerLoadedBy,
    freight_counted_by: bol.freightCountedBy,
    shipper_signature_image: bol.shipperSignatureImage,
    shipper_signed_at: bol.shipperSignedAt,
    carrier_signature_image: bol.carrierSignatureImage,
    carrier_signed_at: bol.carrierSignedAt,
    shipped_at: bol.shippedAt,
    line_items: bol.lineItems,
    source_so_numbers: bol.sourceSoNumbers,
    created_at: bol.createdAt,
    last_updated_by: bol.lastUpdatedBy,
    last_updated_at: bol.lastUpdatedAt,
  }
}

async function pushBolsOfLading(): Promise<void> {
  const pending = await db.billsOfLading.where('syncStatus').equals('pending').toArray()
  for (const bol of pending) {
    try {
      const { error } = await supabase.from('bills_of_lading').upsert(bolToRemote(bol))
      if (!error) {
        await db.billsOfLading.update(bol.id, { syncStatus: 'synced' })
      } else {
        reportSyncError(`[sync] push bills_of_lading/${bol.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push bills_of_lading/${bol.id} threw:`, err)
    }
  }
}

async function pullBolsOfLading(): Promise<void> {
  const cursor = getCursors().bills_of_lading ?? 0
  const { data, error } = await supabase.from('bills_of_lading').select('*').gt('last_updated_at', cursor).order('last_updated_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull bills_of_lading failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.last_updated_at)

    try {
      const local = await db.billsOfLading.get(remoteRow.id as string)
      if (local && local.syncStatus === 'pending' && local.lastUpdatedAt >= updatedAt) {
        console.warn(`[sync] keeping local billsOfLading/${remoteRow.id} over an older/equal remote change`)
        if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
        continue
      }

      await db.billsOfLading.put({
        id: remoteRow.id as string,
        siteId: remoteRow.site_id as string,
        direction: remoteRow.direction as BillOfLading['direction'],
        date: remoteRow.date as string,
        loadNumber: remoteRow.load_number as string,
        referenceDoc: remoteRow.reference_doc as string,
        paymentTerm: remoteRow.payment_term as BillOfLading['paymentTerm'],
        shipFromCompany: remoteRow.ship_from_company as string,
        shipFromAddress: remoteRow.ship_from_address as string,
        shipFromPhone: remoteRow.ship_from_phone as string,
        shipToCompany: remoteRow.ship_to_company as string,
        shipToContact: remoteRow.ship_to_contact as string,
        shipToAddress: remoteRow.ship_to_address as string,
        shipToPhone: remoteRow.ship_to_phone as string,
        carrier: remoteRow.carrier as string,
        driverPhone: remoteRow.driver_phone as string,
        brokerInfo: remoteRow.broker_info as string,
        trailerLoadedBy: (remoteRow.trailer_loaded_by as BillOfLading['trailerLoadedBy']) ?? '',
        freightCountedBy: (remoteRow.freight_counted_by as BillOfLading['freightCountedBy']) ?? '',
        shipperSignatureImage: (remoteRow.shipper_signature_image as string) ?? '',
        shipperSignedAt: (remoteRow.shipper_signed_at as number) ?? 0,
        carrierSignatureImage: (remoteRow.carrier_signature_image as string) ?? '',
        carrierSignedAt: (remoteRow.carrier_signed_at as number) ?? 0,
        shippedAt: (remoteRow.shipped_at as number) ?? 0,
        lineItems: (remoteRow.line_items as BillOfLading['lineItems']) ?? [],
        sourceSoNumbers: (remoteRow.source_so_numbers as string[]) ?? [],
        createdAt: remoteRow.created_at as number,
        lastUpdatedBy: remoteRow.last_updated_by as string,
        lastUpdatedAt: updatedAt,
        syncStatus: 'synced',
      })
      if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
    } catch (err) {
      reportSyncError(`[sync] pull billsOfLading/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('bills_of_lading', maxUpdatedAt)
}

function customerSheetToRemote(sheet: CustomerSheet): Record<string, unknown> {
  return {
    id: sheet.id,
    site_id: sheet.siteId,
    date: sheet.date,
    customer_name: sheet.customerName,
    customer_company: sheet.customerCompany,
    customer_address: sheet.customerAddress,
    customer_phone: sheet.customerPhone,
    prepared_by: sheet.preparedBy,
    line_items: sheet.lineItems,
    created_at: sheet.createdAt,
    last_updated_by: sheet.lastUpdatedBy,
    last_updated_at: sheet.lastUpdatedAt,
  }
}

async function pushCustomerSheets(): Promise<void> {
  const pending = await db.customerSheets.where('syncStatus').equals('pending').toArray()
  for (const sheet of pending) {
    try {
      const { error } = await supabase.from('customer_sheets').upsert(customerSheetToRemote(sheet))
      if (!error) {
        await db.customerSheets.update(sheet.id, { syncStatus: 'synced' })
      } else {
        reportSyncError(`[sync] push customer_sheets/${sheet.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push customer_sheets/${sheet.id} threw:`, err)
    }
  }
}

async function pullCustomerSheets(): Promise<void> {
  const cursor = getCursors().customer_sheets ?? 0
  const { data, error } = await supabase.from('customer_sheets').select('*').gt('last_updated_at', cursor).order('last_updated_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull customer_sheets failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.last_updated_at)

    try {
      const local = await db.customerSheets.get(remoteRow.id as string)
      if (local && local.syncStatus === 'pending' && local.lastUpdatedAt >= updatedAt) {
        console.warn(`[sync] keeping local customerSheets/${remoteRow.id} over an older/equal remote change`)
        if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
        continue
      }

      await db.customerSheets.put({
        id: remoteRow.id as string,
        siteId: remoteRow.site_id as string,
        date: remoteRow.date as string,
        customerName: remoteRow.customer_name as string,
        customerCompany: remoteRow.customer_company as string,
        customerAddress: remoteRow.customer_address as string,
        customerPhone: remoteRow.customer_phone as string,
        preparedBy: remoteRow.prepared_by as string,
        lineItems: (remoteRow.line_items as CustomerSheet['lineItems']) ?? [],
        createdAt: remoteRow.created_at as number,
        lastUpdatedBy: remoteRow.last_updated_by as string,
        lastUpdatedAt: updatedAt,
        syncStatus: 'synced',
      })
      if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
    } catch (err) {
      reportSyncError(`[sync] pull customerSheets/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('customer_sheets', maxUpdatedAt)
}

function salesOrderLineItemToRemote(li: SalesOrderLineItem): Record<string, unknown> {
  return {
    id: li.id,
    so_number: li.soNumber,
    description: li.description,
    warehouse_code: li.warehouseCode,
    quantity_ordered: li.quantityOrdered,
    status: li.status,
    tied_site_id: li.tiedSiteId || null,
    tied_site_name: li.tiedSiteName,
    tied_item_type: li.tiedItemType,
    tied_item_ids: li.tiedItemIds,
    tied_description: li.tiedDescription,
    tied_at: li.tiedAt,
    tied_by: li.tiedBy,
    flagged_duplicate: li.flaggedDuplicate ?? false,
    imported_at: li.importedAt,
    created_at: li.createdAt,
    updated_at: li.updatedAt,
  }
}

async function pushSalesOrderLineItems(): Promise<void> {
  const pending = await db.salesOrderLineItems.where('syncStatus').equals('pending').toArray()
  for (const li of pending) {
    try {
      const { error } = await supabase.from('sales_order_line_items').upsert(salesOrderLineItemToRemote(li))
      if (!error) {
        await db.salesOrderLineItems.update(li.id, { syncStatus: 'synced' })
      } else {
        reportSyncError(`[sync] push sales_order_line_items/${li.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push sales_order_line_items/${li.id} threw:`, err)
    }
  }
}

async function pullSalesOrderLineItems(): Promise<void> {
  const cursor = getCursors().sales_order_line_items ?? 0
  const { data, error } = await supabase.from('sales_order_line_items').select('*').gt('updated_at', cursor).order('updated_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull sales_order_line_items failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.updated_at)

    try {
      const local = await db.salesOrderLineItems.get(remoteRow.id as string)
      if (local && local.syncStatus === 'pending' && local.updatedAt >= updatedAt) {
        console.warn(`[sync] keeping local salesOrderLineItems/${remoteRow.id} over an older/equal remote change`)
        if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
        continue
      }

      await db.salesOrderLineItems.put({
        id: remoteRow.id as string,
        soNumber: remoteRow.so_number as string,
        description: remoteRow.description as string,
        warehouseCode: (remoteRow.warehouse_code as string) ?? '',
        quantityOrdered: remoteRow.quantity_ordered as number,
        status: remoteRow.status as SalesOrderLineItem['status'],
        tiedSiteId: (remoteRow.tied_site_id as string) ?? '',
        tiedSiteName: remoteRow.tied_site_name as string,
        tiedItemType: remoteRow.tied_item_type as SalesOrderLineItem['tiedItemType'],
        tiedItemIds: (remoteRow.tied_item_ids as string[]) ?? [],
        tiedDescription: remoteRow.tied_description as string,
        tiedAt: remoteRow.tied_at as number,
        tiedBy: remoteRow.tied_by as string,
        flaggedDuplicate: (remoteRow.flagged_duplicate as boolean) ?? false,
        importedAt: remoteRow.imported_at as number,
        createdAt: remoteRow.created_at as number,
        updatedAt,
        syncStatus: 'synced',
      })
      if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
    } catch (err) {
      reportSyncError(`[sync] pull salesOrderLineItems/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('sales_order_line_items', maxUpdatedAt)
}

// ---------- sales order schedules ----------

function salesOrderScheduleToRemote(schedule: SalesOrderSchedule): Record<string, unknown> {
  return {
    id: schedule.id,
    so_number: schedule.soNumber,
    site_id: schedule.siteId,
    site_name: schedule.siteName,
    scheduled_ship_date: schedule.scheduledShipDate,
    created_by: schedule.createdBy,
    created_at: schedule.createdAt,
    last_updated_by: schedule.lastUpdatedBy,
    last_updated_at: schedule.lastUpdatedAt,
  }
}

async function pushSalesOrderSchedules(): Promise<void> {
  const pending = await db.salesOrderSchedules.where('syncStatus').equals('pending').toArray()
  for (const schedule of pending) {
    try {
      // Two offline devices can each create their own new row for the same
      // (so_number, site_id) pair before either has synced — upsert must
      // target that unique pair (not just the differing local ids), or the
      // second device's insert permanently fails on the unique constraint
      // instead of overwriting with its (probably more current) ship date.
      const { error } = await supabase
        .from('sales_order_schedules')
        .upsert(salesOrderScheduleToRemote(schedule), { onConflict: 'so_number,site_id' })
      if (!error) {
        await db.salesOrderSchedules.update(schedule.id, { syncStatus: 'synced' })
      } else {
        reportSyncError(`[sync] push sales_order_schedules/${schedule.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push sales_order_schedules/${schedule.id} threw:`, err)
    }
  }
}

async function pullSalesOrderSchedules(): Promise<void> {
  const cursor = getCursors().sales_order_schedules ?? 0
  const { data, error } = await supabase.from('sales_order_schedules').select('*').gt('last_updated_at', cursor).order('last_updated_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull sales_order_schedules failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.last_updated_at)

    try {
      const local = await db.salesOrderSchedules.get(remoteRow.id as string)
      if (local && local.syncStatus === 'pending' && local.lastUpdatedAt >= updatedAt) {
        console.warn(`[sync] keeping local salesOrderSchedules/${remoteRow.id} over an older/equal remote change`)
        if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
        continue
      }

      await db.salesOrderSchedules.put({
        id: remoteRow.id as string,
        soNumber: remoteRow.so_number as string,
        siteId: remoteRow.site_id as string,
        siteName: remoteRow.site_name as string,
        scheduledShipDate: remoteRow.scheduled_ship_date as string,
        createdBy: remoteRow.created_by as string,
        createdAt: remoteRow.created_at as number,
        lastUpdatedBy: remoteRow.last_updated_by as string,
        lastUpdatedAt: updatedAt,
        syncStatus: 'synced',
      })
      if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
    } catch (err) {
      reportSyncError(`[sync] pull salesOrderSchedules/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('sales_order_schedules', maxUpdatedAt)
}

// ---------- sales quotes ----------

function salesQuoteToRemote(quote: SalesQuote): Record<string, unknown> {
  return {
    id: quote.id,
    quote_number: quote.quoteNumber,
    customer_name: quote.customerName,
    customer_address: quote.customerAddress,
    notes: quote.notes,
    created_by_id: quote.createdById || null,
    created_by_email: quote.createdByEmail,
    canceled_at: quote.canceledAt ?? null,
    created_at: quote.createdAt,
    last_updated_at: quote.lastUpdatedAt,
  }
}

async function pushSalesQuotes(): Promise<void> {
  const pending = await db.salesQuotes.where('syncStatus').equals('pending').toArray()
  for (const quote of pending) {
    try {
      const { error } = await supabase.from('sales_quotes').upsert(salesQuoteToRemote(quote))
      if (!error) {
        await db.salesQuotes.update(quote.id, { syncStatus: 'synced' })
      } else {
        reportSyncError(`[sync] push sales_quotes/${quote.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push sales_quotes/${quote.id} threw:`, err)
    }
  }
}

async function pullSalesQuotes(): Promise<void> {
  const cursor = getCursors().sales_quotes ?? 0
  const { data, error } = await supabase.from('sales_quotes').select('*').gt('last_updated_at', cursor).order('last_updated_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull sales_quotes failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.last_updated_at)

    try {
      const local = await db.salesQuotes.get(remoteRow.id as string)
      if (local && local.syncStatus === 'pending' && local.lastUpdatedAt >= updatedAt) {
        console.warn(`[sync] keeping local salesQuotes/${remoteRow.id} over an older/equal remote change`)
        if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
        continue
      }

      await db.salesQuotes.put({
        id: remoteRow.id as string,
        quoteNumber: remoteRow.quote_number as string,
        customerName: remoteRow.customer_name as string,
        customerAddress: remoteRow.customer_address as string,
        notes: remoteRow.notes as string,
        createdById: (remoteRow.created_by_id as string) ?? '',
        createdByEmail: remoteRow.created_by_email as string,
        canceledAt: (remoteRow.canceled_at as number | null) ?? undefined,
        createdAt: remoteRow.created_at as number,
        lastUpdatedAt: updatedAt,
        syncStatus: 'synced',
      })
      if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
    } catch (err) {
      reportSyncError(`[sync] pull salesQuotes/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('sales_quotes', maxUpdatedAt)
}

function salesQuoteLineItemToRemote(li: SalesQuoteLineItem): Record<string, unknown> {
  return {
    id: li.id,
    quote_id: li.quoteId,
    quote_number: li.quoteNumber,
    site_id: li.siteId || null,
    site_name: li.siteName,
    item_type: li.itemType,
    item_ids: li.itemIds,
    description: li.description,
    quantity_held: li.quantityHeld,
    held_by_email: li.heldByEmail,
    created_at: li.createdAt,
  }
}

async function pushSalesQuoteLineItems(): Promise<void> {
  const pending = await db.salesQuoteLineItems.where('syncStatus').equals('pending').toArray()
  for (const li of pending) {
    try {
      const { error } = await supabase.from('sales_quote_line_items').upsert(salesQuoteLineItemToRemote(li))
      if (!error) {
        await db.salesQuoteLineItems.update(li.id, { syncStatus: 'synced' })
      } else {
        reportSyncError(`[sync] push sales_quote_line_items/${li.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push sales_quote_line_items/${li.id} threw:`, err)
    }
  }
}

async function pullSalesQuoteLineItems(): Promise<void> {
  const cursor = getCursors().sales_quote_line_items ?? 0
  const { data, error } = await supabase.from('sales_quote_line_items').select('*').gt('created_at', cursor).order('created_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull sales_quote_line_items failed:', error.message, error)
    return
  }
  if (!data) return

  let maxCreatedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  for (const remoteRow of data) {
    const createdAt = Number(remoteRow.created_at)
    try {
      const existing = await db.salesQuoteLineItems.get(remoteRow.id as string)
      if (existing) {
        if (!pullFailed) maxCreatedAt = Math.max(maxCreatedAt, createdAt)
        continue
      }

      await db.salesQuoteLineItems.put({
        id: remoteRow.id as string,
        quoteId: remoteRow.quote_id as string,
        quoteNumber: remoteRow.quote_number as string,
        siteId: (remoteRow.site_id as string) ?? '',
        siteName: remoteRow.site_name as string,
        itemType: remoteRow.item_type as SalesQuoteLineItem['itemType'],
        itemIds: (remoteRow.item_ids as string[]) ?? [],
        description: remoteRow.description as string,
        quantityHeld: remoteRow.quantity_held as number,
        heldByEmail: remoteRow.held_by_email as string,
        createdAt,
        syncStatus: 'synced',
      })
      if (!pullFailed) maxCreatedAt = Math.max(maxCreatedAt, createdAt)
    } catch (err) {
      reportSyncError(`[sync] pull salesQuoteLineItems/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('sales_quote_line_items', maxCreatedAt)
}

// ---------- inventory transfers ----------

function inventoryTransferToRemote(transfer: InventoryTransfer): Record<string, unknown> {
  return {
    id: transfer.id,
    from_site_id: transfer.fromSiteId,
    from_site_name: transfer.fromSiteName,
    to_site_id: transfer.toSiteId,
    to_site_name: transfer.toSiteName,
    scheduled_date: transfer.scheduledDate,
    line_items: transfer.lineItems,
    created_by: transfer.createdBy,
    created_at: transfer.createdAt,
  }
}

async function pushInventoryTransfers(): Promise<void> {
  const pending = await db.inventoryTransfers.where('syncStatus').equals('pending').toArray()
  for (const transfer of pending) {
    try {
      const { error } = await supabase.from('inventory_transfers').upsert(inventoryTransferToRemote(transfer))
      if (!error) {
        await db.inventoryTransfers.update(transfer.id, { syncStatus: 'synced' })
      } else {
        reportSyncError(`[sync] push inventory_transfers/${transfer.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push inventory_transfers/${transfer.id} threw:`, err)
    }
  }
}

async function pullInventoryTransfers(): Promise<void> {
  const cursor = getCursors().inventory_transfers ?? 0
  const { data, error } = await supabase
    .from('inventory_transfers')
    .select('*')
    .gt('created_at', cursor)
    .order('created_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull inventory_transfers failed:', error.message, error)
    return
  }
  if (!data) return

  let maxCreatedAt = cursor
  // Rows are frozen once created (never edited) — a row already present
  // locally has nothing to reconcile, same as sales quote line items.
  let pullFailed = false
  for (const remoteRow of data) {
    const createdAt = Number(remoteRow.created_at)
    try {
      const existing = await db.inventoryTransfers.get(remoteRow.id as string)
      if (existing) {
        if (!pullFailed) maxCreatedAt = Math.max(maxCreatedAt, createdAt)
        continue
      }

      await db.inventoryTransfers.put({
        id: remoteRow.id as string,
        fromSiteId: remoteRow.from_site_id as string,
        fromSiteName: remoteRow.from_site_name as string,
        toSiteId: remoteRow.to_site_id as string,
        toSiteName: remoteRow.to_site_name as string,
        scheduledDate: remoteRow.scheduled_date as string,
        lineItems: (remoteRow.line_items as InventoryTransfer['lineItems']) ?? [],
        createdBy: remoteRow.created_by as string,
        createdAt,
        syncStatus: 'synced',
      })
      if (!pullFailed) maxCreatedAt = Math.max(maxCreatedAt, createdAt)
    } catch (err) {
      reportSyncError(`[sync] pull inventoryTransfers/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('inventory_transfers', maxCreatedAt)
}

// ---------- project job sites ----------

function projectJobSiteToRemote(jobSite: ProjectJobSite): Record<string, unknown> {
  return {
    id: jobSite.id,
    project_id: jobSite.projectId,
    name: jobSite.name,
    target_date: jobSite.targetDate,
    linked_site_id: jobSite.linkedSiteId || null,
    notes: jobSite.notes,
    created_at: jobSite.createdAt,
    updated_at: jobSite.updatedAt,
  }
}

async function pushProjectJobSites(): Promise<void> {
  const pending = await db.projectJobSites.where('syncStatus').equals('pending').toArray()
  for (const jobSite of pending) {
    try {
      const { error } = await supabase.from('project_job_sites').upsert(projectJobSiteToRemote(jobSite))
      if (!error) {
        await db.projectJobSites.update(jobSite.id, { syncStatus: 'synced' })
      } else {
        reportSyncError(`[sync] push project_job_sites/${jobSite.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push project_job_sites/${jobSite.id} threw:`, err)
    }
  }
}

async function pullProjectJobSites(): Promise<void> {
  const cursor = getCursors().project_job_sites ?? 0
  const { data, error } = await supabase
    .from('project_job_sites')
    .select('*')
    .gt('updated_at', cursor)
    .order('updated_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull project_job_sites failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  let pullFailed = false
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.updated_at)
    try {
      const local = await db.projectJobSites.get(remoteRow.id as string)
      if (local && local.syncStatus === 'pending' && local.updatedAt >= updatedAt) {
        console.warn(`[sync] keeping local projectJobSites/${remoteRow.id} over an older/equal remote change`)
        if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
        continue
      }

      await db.projectJobSites.put({
        id: remoteRow.id as string,
        projectId: remoteRow.project_id as string,
        name: remoteRow.name as string,
        targetDate: (remoteRow.target_date as string) ?? '',
        linkedSiteId: (remoteRow.linked_site_id as string) ?? '',
        notes: (remoteRow.notes as string) ?? '',
        createdAt: remoteRow.created_at as number,
        updatedAt,
        syncStatus: 'synced',
      })
      if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
    } catch (err) {
      reportSyncError(`[sync] pull projectJobSites/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('project_job_sites', maxUpdatedAt)
}

// ---------- material needs ----------

function materialNeedToRemote(need: MaterialNeed): Record<string, unknown> {
  return {
    id: need.id,
    project_id: need.projectId,
    job_site_id: need.jobSiteId,
    item_type: need.itemType,
    quantity_needed: need.quantityNeeded,
    notes: need.notes,
    condition: need.condition,
    bundle_size: need.bundleSize,
    zone: need.zone,
    cost_per: need.costPer,
    sell_per: need.sellPer,
    color: need.color,
    style: need.style,
    stamp: need.stamp,
    length: need.length,
    width: need.width,
    pin_count: need.pinCount,
    stickers: need.stickers,
    step: need.step,
    height: need.height,
    column_length: need.columnLength,
    column_width: need.columnWidth,
    footplate_length: need.footplateLength,
    footplate_width: need.footplateWidth,
    footplate_thickness: need.footplateThickness,
    anchor_hole_count: need.anchorHoleCount,
    hole_size: need.holeSize,
    gauge: need.gauge,
    channel_count: need.channelCount,
    wire_deck_style: need.wireDeckStyle,
    description: need.description,
    item_description: need.itemDescription,
    created_at: need.createdAt,
    updated_at: need.updatedAt,
  }
}

async function pushMaterialNeeds(): Promise<void> {
  const pending = await db.materialNeeds.where('syncStatus').equals('pending').toArray()
  for (const need of pending) {
    try {
      const { error } = await supabase.from('material_needs').upsert(materialNeedToRemote(need))
      if (!error) {
        await db.materialNeeds.update(need.id, { syncStatus: 'synced' })
      } else {
        reportSyncError(`[sync] push material_needs/${need.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push material_needs/${need.id} threw:`, err)
    }
  }
}

async function pullMaterialNeeds(): Promise<void> {
  const cursor = getCursors().material_needs ?? 0
  const { data, error } = await supabase
    .from('material_needs')
    .select('*')
    .gt('updated_at', cursor)
    .order('updated_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull material_needs failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  let pullFailed = false
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.updated_at)
    try {
      const local = await db.materialNeeds.get(remoteRow.id as string)
      if (local && local.syncStatus === 'pending' && local.updatedAt >= updatedAt) {
        console.warn(`[sync] keeping local materialNeeds/${remoteRow.id} over an older/equal remote change`)
        if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
        continue
      }

      await db.materialNeeds.put({
        id: remoteRow.id as string,
        projectId: remoteRow.project_id as string,
        jobSiteId: remoteRow.job_site_id as string,
        itemType: remoteRow.item_type as ItemType,
        quantityNeeded: remoteRow.quantity_needed as number,
        notes: (remoteRow.notes as string) ?? '',
        condition: (remoteRow.condition as string) ?? '',
        bundleSize: (remoteRow.bundle_size as string) ?? '',
        zone: (remoteRow.zone as string) ?? '',
        costPer: (remoteRow.cost_per as number) ?? 0,
        sellPer: (remoteRow.sell_per as number) ?? 0,
        color: (remoteRow.color as string) ?? '',
        style: (remoteRow.style as string) ?? '',
        stamp: (remoteRow.stamp as string) ?? '',
        length: (remoteRow.length as string) ?? '',
        width: (remoteRow.width as string) ?? '',
        pinCount: (remoteRow.pin_count as string) ?? '',
        stickers: (remoteRow.stickers as string) ?? '',
        step: (remoteRow.step as string) ?? '',
        height: (remoteRow.height as string) ?? '',
        columnLength: (remoteRow.column_length as string) ?? '',
        columnWidth: (remoteRow.column_width as string) ?? '',
        footplateLength: (remoteRow.footplate_length as string) ?? '',
        footplateWidth: (remoteRow.footplate_width as string) ?? '',
        footplateThickness: (remoteRow.footplate_thickness as string) ?? '',
        anchorHoleCount: (remoteRow.anchor_hole_count as string) ?? '',
        holeSize: (remoteRow.hole_size as string) ?? '',
        gauge: (remoteRow.gauge as string) ?? '',
        channelCount: (remoteRow.channel_count as string) ?? '',
        wireDeckStyle: (remoteRow.wire_deck_style as string[]) ?? [],
        description: (remoteRow.description as string) ?? '',
        itemDescription: (remoteRow.item_description as string) ?? '',
        createdAt: remoteRow.created_at as number,
        updatedAt,
        syncStatus: 'synced',
      })
      if (!pullFailed) maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)
    } catch (err) {
      reportSyncError(`[sync] pull materialNeeds/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('material_needs', maxUpdatedAt)
}

// ---------- material need allocations ----------

function materialNeedAllocationToRemote(allocation: MaterialNeedAllocation): Record<string, unknown> {
  return {
    id: allocation.id,
    material_need_id: allocation.materialNeedId,
    project_id: allocation.projectId,
    site_id: allocation.siteId,
    site_name: allocation.siteName,
    item_type: allocation.itemType,
    item_ids: allocation.itemIds,
    description: allocation.description,
    quantity: allocation.quantity,
    tied_at: allocation.tiedAt,
    tied_by: allocation.tiedBy,
  }
}

async function pushMaterialNeedAllocations(): Promise<void> {
  const pending = await db.materialNeedAllocations.where('syncStatus').equals('pending').toArray()
  for (const allocation of pending) {
    try {
      const { error } = await supabase.from('material_need_allocations').upsert(materialNeedAllocationToRemote(allocation))
      if (!error) {
        await db.materialNeedAllocations.update(allocation.id, { syncStatus: 'synced' })
      } else {
        reportSyncError(`[sync] push material_need_allocations/${allocation.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push material_need_allocations/${allocation.id} threw:`, err)
    }
  }
}

// Allocations are created once and never edited (only deleted, via untie),
// so a row already present locally has nothing to reconcile — same as
// sales quote line items.
async function pullMaterialNeedAllocations(): Promise<void> {
  const cursor = getCursors().material_need_allocations ?? 0
  const { data, error } = await supabase
    .from('material_need_allocations')
    .select('*')
    .gt('tied_at', cursor)
    .order('tied_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull material_need_allocations failed:', error.message, error)
    return
  }
  if (!data) return

  let maxTiedAt = cursor
  let pullFailed = false
  for (const remoteRow of data) {
    const tiedAt = Number(remoteRow.tied_at)
    try {
      const existing = await db.materialNeedAllocations.get(remoteRow.id as string)
      if (existing) {
        if (!pullFailed) maxTiedAt = Math.max(maxTiedAt, tiedAt)
        continue
      }

      await db.materialNeedAllocations.put({
        id: remoteRow.id as string,
        materialNeedId: remoteRow.material_need_id as string,
        projectId: remoteRow.project_id as string,
        siteId: remoteRow.site_id as string,
        siteName: (remoteRow.site_name as string) ?? '',
        itemType: remoteRow.item_type as ItemType,
        itemIds: (remoteRow.item_ids as string[]) ?? [],
        description: (remoteRow.description as string) ?? '',
        quantity: remoteRow.quantity as number,
        tiedAt,
        tiedBy: (remoteRow.tied_by as string) ?? '',
        syncStatus: 'synced',
      })
      if (!pullFailed) maxTiedAt = Math.max(maxTiedAt, tiedAt)
    } catch (err) {
      reportSyncError(`[sync] pull materialNeedAllocations/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('material_need_allocations', maxTiedAt)
}

// ---------- item photos ----------

// iOS Safari's IndexedDB can hand back a Blob whose `.size` property still
// reports the original (correct) byte count even though the underlying
// disk-backed data is actually gone — passing that Blob straight to
// fetch/XHR either silently serializes an empty body or fails outright,
// which is why checking `.size` alone wasn't enough (some corrupted photos
// still reported a nonzero size). Actually reading the bytes out via
// arrayBuffer() exposes the real state, and uploading that materialized
// buffer instead of the original Blob reference sidesteps whatever is
// broken in the browser's handling of the disk-backed reference itself.
async function readBlobBytes(blob: Blob): Promise<ArrayBuffer | null> {
  try {
    const buf = await blob.arrayBuffer()
    return buf.byteLength > 0 ? buf : null
  } catch {
    return null
  }
}

// Even an ArrayBuffer read out of a corrupted disk-backed Blob can still
// report a nonzero byteLength locally while genuinely containing nothing —
// readBlobBytes() can't catch every case. But Supabase's own server gives an
// unambiguous, deterministic answer when that happens: "No content
// provided" means it received zero bytes, full stop — retrying changes
// nothing, since the local data is what's gone, not the network. Treat this
// exactly like a client-side-detected corrupt blob (stop retrying) instead
// of a transient failure (keep retrying forever).
function isEmptyContentError(error: { message?: string } | null | undefined): boolean {
  return error?.message === 'No content provided'
}

async function pushPhotos(): Promise<void> {
  const pending = await db.photos.where('uploadStatus').equals('pending').toArray()
  for (const photo of pending) {
    try {
      const blobRow = await db.photoBlobs.get(photo.id)
      const bytes = blobRow ? await readBlobBytes(blobRow.blob) : null
      if (!bytes) {
        reportSyncError(`[sync] photo ${photo.id} has no recoverable image data (corrupted local storage) — it needs to be re-added`)
        await db.photos.update(photo.id, { uploadStatus: 'failed' })
        continue
      }

      const path = `${photo.itemId}/item/${photo.id}.jpg`
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, bytes, { upsert: true, contentType: blobRow!.blob.type || 'image/jpeg' })
      if (uploadError) {
        if (isEmptyContentError(uploadError)) {
          reportSyncError(`[sync] photo ${photo.id} has no recoverable image data (corrupted local storage) — it needs to be re-added`)
          await db.photos.update(photo.id, { uploadStatus: 'failed' })
        } else {
          reportSyncError(`[sync] photo upload for ${photo.id} failed:`, uploadError.message, JSON.stringify(uploadError))
        }
        continue
      }

      const { error } = await supabase.from('photos').upsert({
        id: photo.id,
        item_type: photo.itemType,
        item_id: photo.itemId,
        storage_path: path,
        created_at: photo.createdAt,
      })
      if (!error) {
        await db.photos.update(photo.id, { uploadStatus: 'synced', remoteUrl: path })
      } else {
        reportSyncError(`[sync] push photos/${photo.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push photos/${photo.id} threw:`, err)
    }
  }
}

// Downloads one remote photos row's blob and writes it (plus its
// metadata) locally — assumes the caller already knows it isn't local
// yet. Shared by the ordered backfill below and the targeted fetch a
// device can do for one specific item, so both apply a row identically.
async function downloadAndStorePhoto(remoteRow: Record<string, unknown>): Promise<boolean> {
  const path = remoteRow.storage_path as string
  const { data: blob, error: downloadError } = await supabase.storage.from(STORAGE_BUCKET).download(path)
  if (!blob) {
    reportSyncError(`[sync] photo download for ${remoteRow.id} failed:`, downloadError?.message, downloadError)
    return false
  }
  const photo: Photo = {
    id: remoteRow.id as string,
    itemType: remoteRow.item_type as ItemType,
    itemId: remoteRow.item_id as string,
    createdAt: Number(remoteRow.created_at),
    uploadStatus: 'synced',
    remoteUrl: path,
  }
  await db.photoBlobs.put({ id: photo.id, blob })
  await db.photos.put(photo)
  return true
}

async function pullPhotos(): Promise<void> {
  const cursor = getCursors().photos ?? 0
  const { data, error } = await supabase.from('photos').select('*').gt('created_at', cursor).order('created_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull photos failed:', error.message, error)
    return
  }
  if (!data) return

  let maxCreatedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  const touchedItemIds = new Set<string>()
  for (const remoteRow of data) {
    const createdAt = Number(remoteRow.created_at)
    try {
      const existing = await db.photos.get(remoteRow.id as string)
      if (existing) {
        // A photo's itemId isn't actually immutable — merging two item
        // groups on one device reassigns a photo to the surviving id and
        // re-pushes it (see items.ts) — so a device that already pulled this
        // photo needs to pick up that reassignment too, not just dedupe on
        // id and ignore the rest of the row forever.
        const remoteItemId = remoteRow.item_id as string
        if (existing.itemId !== remoteItemId) {
          await db.photos.update(existing.id, { itemId: remoteItemId })
          touchedItemIds.add(existing.itemId)
          touchedItemIds.add(remoteItemId)
        }
        if (!pullFailed) maxCreatedAt = Math.max(maxCreatedAt, createdAt)
        continue
      }

      const ok = await downloadAndStorePhoto(remoteRow)
      if (!ok) {
        pullFailed = true
        continue
      }
      touchedItemIds.add(remoteRow.item_id as string)
      if (!pullFailed) maxCreatedAt = Math.max(maxCreatedAt, createdAt)
    } catch (err) {
      reportSyncError(`[sync] pull photos/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('photos', maxCreatedAt)

  for (const itemId of touchedItemIds) {
    await refreshPhotoIds(itemId)
  }
}

// On-demand fetch for one specific item's photos, bypassing the normal
// ascending-by-created_at backfill entirely. A brand-new device's
// pullPhotos otherwise has to walk the ENTIRE system's photo history,
// oldest first, before it ever reaches whichever item someone actually
// opens — which can take many sync cycles if there's a large company-wide
// backlog. Called directly from the Photos screen so a photo shows up
// immediately regardless of backfill progress; doesn't touch the
// pullPhotos cursor, so it never interferes with that separate walk.
export async function fetchPhotosForItemNow(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0 || !supabaseConfigured) return
  const { data, error } = await supabase.from('photos').select('*').in('item_id', itemIds)
  if (error) {
    reportSyncError('[sync] fetch photos for item failed:', error.message, error)
    return
  }
  if (!data) return

  const touchedItemIds = new Set<string>()
  for (const remoteRow of data) {
    try {
      const existingBlob = await db.photoBlobs.get(remoteRow.id as string)
      if (existingBlob) continue
      const ok = await downloadAndStorePhoto(remoteRow)
      if (ok) touchedItemIds.add(remoteRow.item_id as string)
    } catch (err) {
      reportSyncError(`[sync] fetch photo ${remoteRow.id} threw:`, err)
    }
  }
  for (const itemId of touchedItemIds) {
    await refreshPhotoIds(itemId)
  }
}

async function refreshPhotoIds(itemId: string): Promise<void> {
  const photoIds = (await db.photos.where('itemId').equals(itemId).toArray()).map((p) => p.id)
  for (const localTable of ['beams', 'uprights', 'wireDecks', 'miscItems'] as const) {
    const table = db.table(localTable)
    const item = await table.get(itemId)
    if (item) await table.update(itemId, { photoIds })
  }
}

// ---------- project photos ----------

async function pushProjectPhotos(): Promise<void> {
  const pending = await db.projectPhotos.where('uploadStatus').equals('pending').toArray()
  for (const photo of pending) {
    try {
      const blobRow = await db.projectPhotoBlobs.get(photo.id)
      const bytes = blobRow ? await readBlobBytes(blobRow.blob) : null
      if (!bytes) {
        reportSyncError(`[sync] project photo ${photo.id} has no recoverable image data (corrupted local storage) — it needs to be re-added`)
        await db.projectPhotos.update(photo.id, { uploadStatus: 'failed' })
        continue
      }

      const path = `${photo.siteId}/project/${photo.id}.jpg`
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, bytes, { upsert: true, contentType: blobRow!.blob.type || 'image/jpeg' })
      if (uploadError) {
        if (isEmptyContentError(uploadError)) {
          reportSyncError(`[sync] project photo ${photo.id} has no recoverable image data (corrupted local storage) — it needs to be re-added`)
          await db.projectPhotos.update(photo.id, { uploadStatus: 'failed' })
        } else {
          reportSyncError(`[sync] project photo upload for ${photo.id} failed:`, uploadError.message, JSON.stringify(uploadError))
        }
        continue
      }

      const { error } = await supabase.from('project_photos').upsert({
        id: photo.id,
        site_id: photo.siteId,
        storage_path: path,
        created_at: photo.createdAt,
      })
      if (!error) {
        await db.projectPhotos.update(photo.id, { uploadStatus: 'synced', remoteUrl: path })
      } else {
        reportSyncError(`[sync] push project_photos/${photo.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push project_photos/${photo.id} threw:`, err)
    }
  }
}

async function pullProjectPhotos(): Promise<void> {
  const cursor = getCursors().project_photos ?? 0
  const { data, error } = await supabase.from('project_photos').select('*').gt('created_at', cursor).order('created_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull project_photos failed:', error.message, error)
    return
  }
  if (!data) return

  let maxCreatedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  for (const remoteRow of data) {
    const createdAt = Number(remoteRow.created_at)
    try {
      const existing = await db.projectPhotos.get(remoteRow.id as string)
      if (existing) {
        if (!pullFailed) maxCreatedAt = Math.max(maxCreatedAt, createdAt)
        continue
      }

      const path = remoteRow.storage_path as string
      const { data: blob, error: downloadError } = await supabase.storage.from(STORAGE_BUCKET).download(path)
      if (!blob) {
        reportSyncError(`[sync] project photo download for ${remoteRow.id} failed:`, downloadError?.message, downloadError)
        pullFailed = true
        continue
      }

      const photo: ProjectPhoto = {
        id: remoteRow.id as string,
        siteId: remoteRow.site_id as string,
        createdAt,
        uploadStatus: 'synced',
        remoteUrl: path,
      }
      await db.projectPhotoBlobs.put({ id: photo.id, blob })
      await db.projectPhotos.put(photo)
      if (!pullFailed) maxCreatedAt = Math.max(maxCreatedAt, createdAt)
    } catch (err) {
      reportSyncError(`[sync] pull project_photos/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('project_photos', maxCreatedAt)
}

// ---------- BOL photos ----------

async function pushBolPhotos(): Promise<void> {
  const pending = await db.bolPhotos.where('uploadStatus').equals('pending').toArray()
  for (const photo of pending) {
    try {
      const blobRow = await db.bolPhotoBlobs.get(photo.id)
      const bytes = blobRow ? await readBlobBytes(blobRow.blob) : null
      if (!bytes) {
        reportSyncError(`[sync] bol photo ${photo.id} has no recoverable image data (corrupted local storage) — it needs to be re-added`)
        await db.bolPhotos.update(photo.id, { uploadStatus: 'failed' })
        continue
      }

      const path = `bol/${photo.bolId}/${photo.id}.jpg`
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, bytes, { upsert: true, contentType: blobRow!.blob.type || 'image/jpeg' })
      if (uploadError) {
        if (isEmptyContentError(uploadError)) {
          reportSyncError(`[sync] bol photo ${photo.id} has no recoverable image data (corrupted local storage) — it needs to be re-added`)
          await db.bolPhotos.update(photo.id, { uploadStatus: 'failed' })
        } else {
          reportSyncError(`[sync] bol photo upload for ${photo.id} failed:`, uploadError.message, JSON.stringify(uploadError))
        }
        continue
      }

      const { error } = await supabase.from('bol_photos').upsert({
        id: photo.id,
        bol_id: photo.bolId,
        storage_path: path,
        created_at: photo.createdAt,
      })
      if (!error) {
        await db.bolPhotos.update(photo.id, { uploadStatus: 'synced', remoteUrl: path })
      } else {
        reportSyncError(`[sync] push bol_photos/${photo.id} failed:`, error.message, error)
      }
    } catch (err) {
      reportSyncError(`[sync] push bol_photos/${photo.id} threw:`, err)
    }
  }
}

async function pullBolPhotos(): Promise<void> {
  const cursor = getCursors().bol_photos ?? 0
  const { data, error } = await supabase.from('bol_photos').select('*').gt('created_at', cursor).order('created_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull bol_photos failed:', error.message, error)
    return
  }
  if (!data) return

  let maxCreatedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  for (const remoteRow of data) {
    const createdAt = Number(remoteRow.created_at)
    try {
      const existing = await db.bolPhotos.get(remoteRow.id as string)
      if (existing) {
        if (!pullFailed) maxCreatedAt = Math.max(maxCreatedAt, createdAt)
        continue
      }

      const path = remoteRow.storage_path as string
      const { data: blob, error: downloadError } = await supabase.storage.from(STORAGE_BUCKET).download(path)
      if (!blob) {
        reportSyncError(`[sync] bol photo download for ${remoteRow.id} failed:`, downloadError?.message, downloadError)
        pullFailed = true
        continue
      }

      const photo: BolPhoto = {
        id: remoteRow.id as string,
        bolId: remoteRow.bol_id as string,
        createdAt,
        uploadStatus: 'synced',
        remoteUrl: path,
      }
      await db.bolPhotoBlobs.put({ id: photo.id, blob })
      await db.bolPhotos.put(photo)
      if (!pullFailed) maxCreatedAt = Math.max(maxCreatedAt, createdAt)
    } catch (err) {
      reportSyncError(`[sync] pull bol_photos/${remoteRow.id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('bol_photos', maxCreatedAt)
}

// ---------- pending deletes ----------

const REMOTE_TABLE_NAMES: Record<string, string> = {
  wireDecks: 'wire_decks',
  miscItems: 'misc_items',
  projectPhotos: 'project_photos',
  bolPhotos: 'bol_photos',
  billsOfLading: 'bills_of_lading',
  customerSheets: 'customer_sheets',
  salesOrderLineItems: 'sales_order_line_items',
  salesOrderSchedules: 'sales_order_schedules',
  salesQuoteLineItems: 'sales_quote_line_items',
}

async function pushPendingDeletes(): Promise<void> {
  const pending = await db.pendingDeletes.toArray()
  for (const del of pending) {
    const remoteTable = REMOTE_TABLE_NAMES[del.table] ?? del.table
    try {
      const { error } = await supabase.from(remoteTable).delete().eq('id', del.recordId)
      if (error) {
        reportSyncError(`[sync] delete ${remoteTable}/${del.recordId} failed:`, error.message, error)
        continue
      }
      // A device that already pulled this row down before the delete has
      // no other way to find out it's gone — pulls only ever discover
      // new/changed rows. This tombstone is what every device's pull
      // checks to know to remove its own local copy too.
      const { error: tombstoneError } = await supabase.from('tombstones').insert({
        id: uuidv4(),
        table_name: del.table,
        record_id: del.recordId,
        deleted_at: Date.now(),
      })
      if (tombstoneError) {
        reportSyncError(`[sync] tombstone for ${del.table}/${del.recordId} failed:`, tombstoneError.message, tombstoneError)
        continue
      }
      await db.pendingDeletes.delete(del.id)
    } catch (err) {
      reportSyncError(`[sync] delete ${remoteTable}/${del.recordId} threw:`, err)
    }
  }
}

// ---------- tombstones ----------

const LOCAL_TABLE_NAMES = new Set([
  'sites',
  'projects',
  'beams',
  'uprights',
  'wireDecks',
  'miscItems',
  'photos',
  'projectPhotos',
  'bolPhotos',
  'billsOfLading',
  'customerSheets',
  'salesOrderLineItems',
  'salesOrderSchedules',
  'salesQuotes',
  'salesQuoteLineItems',
])

async function pullTombstones(): Promise<void> {
  const cursor = getCursors().tombstones ?? 0
  const { data, error } = await supabase.from('tombstones').select('*').gt('deleted_at', cursor).order('deleted_at', { ascending: true })
  if (error) {
    reportSyncError('[sync] pull tombstones failed:', error.message, error)
    return
  }
  if (!data) return

  let maxDeletedAt = cursor
  // Rows are now fetched in ascending timestamp order, so once any row in
  // this batch fails to fully apply, the cursor must stop advancing right
  // there — otherwise a later row's higher timestamp would silently push
  // the cursor past the failed row, and gt(cursor) would never surface it
  // again on a future pass.
  let pullFailed = false
  for (const remoteRow of data) {
    const deletedAt = Number(remoteRow.deleted_at)
    const tableName = remoteRow.table_name as string
    if (!LOCAL_TABLE_NAMES.has(tableName)) {
      if (!pullFailed) maxDeletedAt = Math.max(maxDeletedAt, deletedAt)
      continue
    }
    try {
      await db.table(tableName).delete(remoteRow.record_id as string)
      if (!pullFailed) maxDeletedAt = Math.max(maxDeletedAt, deletedAt)
    } catch (err) {
      reportSyncError(`[sync] applying tombstone for ${tableName}/${remoteRow.record_id} threw:`, err)
      pullFailed = true
    }
  }
  setCursor('tombstones', maxDeletedAt)
}

// ---------- orchestration ----------

let syncing = false
let syncStartedAt = 0
// If a pass gets stuck mid-request (e.g. connectivity drops right as a
// fetch is in flight, and it never rejects/times out on its own), this
// flag used to stay true forever — silently blocking every later sync
// attempt until the page was reloaded. Treating a pass that's been
// "running" this long as stuck instead lets a new attempt through; the
// old one, if it ever does resolve, just harmlessly resets the flag again.
const STUCK_SYNC_TIMEOUT_MS = 2 * 60 * 1000

export async function runSync(): Promise<void> {
  if (!supabaseConfigured) {
    console.warn('[sync] skipped — Supabase is not configured')
    return
  }
  if (syncing) {
    if (Date.now() - syncStartedAt < STUCK_SYNC_TIMEOUT_MS) {
      console.log('[sync] skipped — a sync is already in progress')
      return
    }
    console.warn('[sync] previous sync pass has been running for over 2 minutes — treating it as stuck and starting a new one')
  }
  if (!navigator.onLine) {
    console.log('[sync] skipped — browser reports offline')
    return
  }
  console.log('[sync] starting…')
  syncing = true
  syncStartedAt = Date.now()
  try {
    await pushPendingDeletes()
    await pushProjects()
    await pushSites()
    for (const config of ITEM_CONFIGS) await pushItemTable(config)
    await pushPhotos()
    await pushProjectPhotos()
    await pushBolPhotos()
    await pushBolsOfLading()
    await pushCustomerSheets()
    await pushSalesOrderLineItems()
    await pushSalesOrderSchedules()
    await pushSalesQuotes()
    await pushSalesQuoteLineItems()
    await pushInventoryTransfers()
    await pushProjectJobSites()
    await pushMaterialNeeds()
    await pushMaterialNeedAllocations()

    await pullTombstones()
    await pullProjects()
    await pullSites()
    for (const config of ITEM_CONFIGS) await pullItemTable(config)
    await pullPhotos()
    await pullProjectPhotos()
    await pullBolPhotos()
    await pullBolsOfLading()
    await pullCustomerSheets()
    await pullSalesOrderLineItems()
    await pullSalesOrderSchedules()
    await pullSalesQuotes()
    await pullSalesQuoteLineItems()
    await pullInventoryTransfers()
    await pullProjectJobSites()
    await pullMaterialNeeds()
    await pullMaterialNeedAllocations()
    console.log('[sync] finished')
  } catch (err) {
    reportSyncError('[sync] sync run failed', err)
  } finally {
    syncing = false
  }
}

let started = false

export function startAutoSync(): void {
  if (started || !supabaseConfigured) return
  started = true

  runSync()
  window.addEventListener('online', () => runSync())
  setInterval(runSync, 30_000)

  const remoteTables = [
    'sites',
    'projects',
    'beams',
    'uprights',
    'wire_decks',
    'misc_items',
    'photos',
    'project_photos',
    'bol_photos',
    'bills_of_lading',
    'customer_sheets',
    'sales_order_line_items',
    'sales_order_schedules',
    'sales_quotes',
    'sales_quote_line_items',
    'inventory_transfers',
    'project_job_sites',
    'material_needs',
    'material_need_allocations',
    'tombstones',
  ]
  // One shared channel/connection for every table instead of one each —
  // 16 separate realtime subscriptions per connected device adds up fast
  // across multiple devices, each holding its own connection open for the
  // entire session, which eats into the project's connection pool for no
  // real benefit (the callback is identical regardless of which table
  // fired it).
  let channel = supabase.channel('realtime:all')
  for (const table of remoteTables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => runSync())
  }
  channel.subscribe()
}
