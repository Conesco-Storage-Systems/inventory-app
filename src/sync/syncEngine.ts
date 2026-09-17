import { db } from '../db/db'
import { supabase, supabaseConfigured } from './supabaseClient'
import type {
  Beam,
  BillOfLading,
  CustomerSheet,
  ItemType,
  MiscItem,
  Photo,
  Project,
  ProjectPhoto,
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
    const { error } = await supabase.from(config.remoteTable).upsert(config.toRemote(row))
    if (!error) {
      await table.update(row.id, { syncStatus: 'synced' })
    } else {
      console.error(`[sync] push ${config.remoteTable}/${row.id} failed:`, error.message, error)
    }
  }
}

async function pullItemTable(config: ItemTableConfig): Promise<void> {
  const cursor = getCursors()[config.remoteTable] ?? 0
  const { data, error } = await supabase.from(config.remoteTable).select('*').gt('updated_at', cursor)
  if (error) {
    console.error(`[sync] pull ${config.remoteTable} failed:`, error.message, error)
    return
  }
  if (!data) return

  const table = db.table(config.localTable)
  let maxUpdatedAt = cursor
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.updated_at)
    maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)

    const local = await table.get(remoteRow.id as string)
    // Last-write-wins by timestamp. If we have a local change that hasn't
    // synced yet and it's newer (or equal — don't let our own echo clobber
    // it), keep the local version and just note it for now.
    if (local && local.syncStatus === 'pending' && local.updatedAt >= updatedAt) {
      console.warn(`[sync] keeping local ${config.localTable}/${remoteRow.id} over an older/equal remote change`)
      continue
    }

    const mapped = config.fromRemote(remoteRow)
    const photoIds = local?.photoIds ?? []
    await table.put({ ...mapped, photoIds, syncStatus: 'synced' })
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
    length: r.length as number,
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
    width: r.width as number,
    height: (r.height as string) ?? '',
    columnLength: r.column_length as number,
    columnWidth: r.column_width as number,
    footplateLength: r.footplate_length as number,
    footplateWidth: r.footplate_width as number,
    anchorHoleCount: r.anchor_hole_count as number,
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
    .filter((site) => site.syncStatus === 'synced' && !!site.sitePhoto && !!site.sitePhotoDirty)
    .toArray()
  const pendingIds = new Set(pending.map((s) => s.id))
  const sitesToPush = [...pending, ...syncedWithUnsentPhoto.filter((s) => !pendingIds.has(s.id))]

  for (const site of sitesToPush) {
    let sitePhotoPath = site.sitePhotoPath
    let photoUploadFailed = false
    if (site.sitePhoto && site.sitePhotoDirty) {
      // Versioned filename (not a fixed one) so the path itself changes on
      // every replacement — otherwise other devices would never notice the
      // photo changed, since they only re-download when the path differs.
      const path = `${site.id}/site/${site.id}-${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, site.sitePhoto, { upsert: true, contentType: site.sitePhoto.type })
      if (!uploadError) {
        sitePhotoPath = path
      } else {
        photoUploadFailed = true
        console.error(`[sync] site photo upload for ${site.id} failed:`, uploadError.message, JSON.stringify(uploadError))
      }
    }

    const { error } = await supabase.from('sites').upsert(siteToRemote({ ...site, sitePhotoPath }))
    if (!error) {
      await db.sites.update(site.id, {
        syncStatus: 'synced',
        sitePhotoPath,
        sitePhotoDirty: photoUploadFailed,
      })
    } else {
      console.error(`[sync] push sites/${site.id} failed:`, error.message, error)
    }
  }
}

async function pullSites(): Promise<void> {
  const cursor = getCursors().sites ?? 0
  const { data, error } = await supabase.from('sites').select('*').gt('last_updated_at', cursor)
  if (error) {
    console.error('[sync] pull sites failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.last_updated_at)
    maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)

    const local = await db.sites.get(remoteRow.id as string)
    if (local && local.syncStatus === 'pending' && local.lastUpdatedAt >= updatedAt) {
      console.warn(`[sync] keeping local site/${remoteRow.id} over an older/equal remote change`)
      continue
    }

    let sitePhoto = local?.sitePhoto
    const sitePhotoPath = (remoteRow.site_photo_path as string | null) || undefined
    if (sitePhotoPath && sitePhotoPath !== local?.sitePhotoPath) {
      const { data: blob } = await supabase.storage.from(STORAGE_BUCKET).download(sitePhotoPath)
      if (blob) sitePhoto = blob
    } else if (!sitePhotoPath) {
      // Remote has no photo (removed elsewhere) — don't keep showing
      // whatever this device happened to have downloaded before.
      sitePhoto = undefined
    }

    await db.sites.put({
      id: remoteRow.id as string,
      name: remoteRow.name as string,
      address: remoteRow.address as string,
      otherInfo: remoteRow.other_info as string,
      active: remoteRow.active as boolean,
      deletedAt: (remoteRow.deleted_at as number | null) ?? undefined,
      projectId: (remoteRow.project_id as string | null) ?? undefined,
      sitePhoto,
      sitePhotoPath,
      sitePhotoDirty: false,
      createdAt: remoteRow.created_at as number,
      lastUpdatedBy: remoteRow.last_updated_by as string,
      lastUpdatedAt: updatedAt,
      syncStatus: 'synced',
    })
  }
  setCursor('sites', maxUpdatedAt)
}

// ---------- projects ----------

function projectToRemote(project: Project): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    active: project.active ?? true,
    deleted_at: project.deletedAt ?? null,
    created_at: project.createdAt,
    last_updated_by: project.lastUpdatedBy,
    last_updated_at: project.lastUpdatedAt,
  }
}

async function pushProjects(): Promise<void> {
  const pending = await db.projects.where('syncStatus').equals('pending').toArray()
  for (const project of pending) {
    const { error } = await supabase.from('projects').upsert(projectToRemote(project))
    if (!error) {
      await db.projects.update(project.id, { syncStatus: 'synced' })
    } else {
      console.error(`[sync] push projects/${project.id} failed:`, error.message, error)
    }
  }
}

async function pullProjects(): Promise<void> {
  const cursor = getCursors().projects ?? 0
  const { data, error } = await supabase.from('projects').select('*').gt('last_updated_at', cursor)
  if (error) {
    console.error('[sync] pull projects failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.last_updated_at)
    maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)

    const local = await db.projects.get(remoteRow.id as string)
    if (local && local.syncStatus === 'pending' && local.lastUpdatedAt >= updatedAt) {
      console.warn(`[sync] keeping local project/${remoteRow.id} over an older/equal remote change`)
      continue
    }

    await db.projects.put({
      id: remoteRow.id as string,
      name: remoteRow.name as string,
      active: remoteRow.active as boolean,
      deletedAt: (remoteRow.deleted_at as number | null) ?? undefined,
      createdAt: remoteRow.created_at as number,
      lastUpdatedBy: remoteRow.last_updated_by as string,
      lastUpdatedAt: updatedAt,
      syncStatus: 'synced',
    })
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
    line_items: bol.lineItems,
    created_at: bol.createdAt,
    last_updated_by: bol.lastUpdatedBy,
    last_updated_at: bol.lastUpdatedAt,
  }
}

async function pushBolsOfLading(): Promise<void> {
  const pending = await db.billsOfLading.where('syncStatus').equals('pending').toArray()
  for (const bol of pending) {
    const { error } = await supabase.from('bills_of_lading').upsert(bolToRemote(bol))
    if (!error) {
      await db.billsOfLading.update(bol.id, { syncStatus: 'synced' })
    } else {
      console.error(`[sync] push bills_of_lading/${bol.id} failed:`, error.message, error)
    }
  }
}

async function pullBolsOfLading(): Promise<void> {
  const cursor = getCursors().bills_of_lading ?? 0
  const { data, error } = await supabase.from('bills_of_lading').select('*').gt('last_updated_at', cursor)
  if (error) {
    console.error('[sync] pull bills_of_lading failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.last_updated_at)
    maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)

    const local = await db.billsOfLading.get(remoteRow.id as string)
    if (local && local.syncStatus === 'pending' && local.lastUpdatedAt >= updatedAt) {
      console.warn(`[sync] keeping local billsOfLading/${remoteRow.id} over an older/equal remote change`)
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
      lineItems: (remoteRow.line_items as BillOfLading['lineItems']) ?? [],
      createdAt: remoteRow.created_at as number,
      lastUpdatedBy: remoteRow.last_updated_by as string,
      lastUpdatedAt: updatedAt,
      syncStatus: 'synced',
    })
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
    const { error } = await supabase.from('customer_sheets').upsert(customerSheetToRemote(sheet))
    if (!error) {
      await db.customerSheets.update(sheet.id, { syncStatus: 'synced' })
    } else {
      console.error(`[sync] push customer_sheets/${sheet.id} failed:`, error.message, error)
    }
  }
}

async function pullCustomerSheets(): Promise<void> {
  const cursor = getCursors().customer_sheets ?? 0
  const { data, error } = await supabase.from('customer_sheets').select('*').gt('last_updated_at', cursor)
  if (error) {
    console.error('[sync] pull customer_sheets failed:', error.message, error)
    return
  }
  if (!data) return

  let maxUpdatedAt = cursor
  for (const remoteRow of data) {
    const updatedAt = Number(remoteRow.last_updated_at)
    maxUpdatedAt = Math.max(maxUpdatedAt, updatedAt)

    const local = await db.customerSheets.get(remoteRow.id as string)
    if (local && local.syncStatus === 'pending' && local.lastUpdatedAt >= updatedAt) {
      console.warn(`[sync] keeping local customerSheets/${remoteRow.id} over an older/equal remote change`)
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
  }
  setCursor('customer_sheets', maxUpdatedAt)
}

// ---------- item photos ----------

async function pushPhotos(): Promise<void> {
  const pending = await db.photos.where('uploadStatus').equals('pending').toArray()
  for (const photo of pending) {
    const path = `${photo.itemId}/item/${photo.id}.jpg`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, photo.blob, { upsert: true, contentType: photo.blob.type })
    if (uploadError) {
      console.error(`[sync] photo upload for ${photo.id} failed:`, uploadError.message, JSON.stringify(uploadError))
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
      console.error(`[sync] push photos/${photo.id} failed:`, error.message, error)
    }
  }
}

async function pullPhotos(): Promise<void> {
  const cursor = getCursors().photos ?? 0
  const { data, error } = await supabase.from('photos').select('*').gt('created_at', cursor)
  if (error) {
    console.error('[sync] pull photos failed:', error.message, error)
    return
  }
  if (!data) return

  let maxCreatedAt = cursor
  const touchedItemIds = new Set<string>()
  for (const remoteRow of data) {
    maxCreatedAt = Math.max(maxCreatedAt, Number(remoteRow.created_at))
    const existing = await db.photos.get(remoteRow.id as string)
    if (existing) continue

    const path = remoteRow.storage_path as string
    const { data: blob } = await supabase.storage.from(STORAGE_BUCKET).download(path)
    if (!blob) continue

    const photo: Photo = {
      id: remoteRow.id as string,
      itemType: remoteRow.item_type as ItemType,
      itemId: remoteRow.item_id as string,
      blob,
      createdAt: remoteRow.created_at as number,
      uploadStatus: 'synced',
      remoteUrl: path,
    }
    await db.photos.put(photo)
    touchedItemIds.add(photo.itemId)
  }
  setCursor('photos', maxCreatedAt)

  for (const itemId of touchedItemIds) {
    await refreshPhotoIds(itemId)
  }
}

async function refreshPhotoIds(itemId: string): Promise<void> {
  const photoIds = (await db.photos.where('itemId').equals(itemId).toArray()).map((p) => p.id)
  for (const localTable of ['beams', 'uprights', 'wireDecks'] as const) {
    const table = db.table(localTable)
    const item = await table.get(itemId)
    if (item) await table.update(itemId, { photoIds })
  }
}

// ---------- project photos ----------

async function pushProjectPhotos(): Promise<void> {
  const pending = await db.projectPhotos.where('uploadStatus').equals('pending').toArray()
  for (const photo of pending) {
    const path = `${photo.siteId}/project/${photo.id}.jpg`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, photo.blob, { upsert: true, contentType: photo.blob.type })
    if (uploadError) {
      console.error(`[sync] project photo upload for ${photo.id} failed:`, uploadError.message, JSON.stringify(uploadError))
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
      console.error(`[sync] push project_photos/${photo.id} failed:`, error.message, error)
    }
  }
}

async function pullProjectPhotos(): Promise<void> {
  const cursor = getCursors().project_photos ?? 0
  const { data, error } = await supabase.from('project_photos').select('*').gt('created_at', cursor)
  if (error) {
    console.error('[sync] pull project_photos failed:', error.message, error)
    return
  }
  if (!data) return

  let maxCreatedAt = cursor
  for (const remoteRow of data) {
    maxCreatedAt = Math.max(maxCreatedAt, Number(remoteRow.created_at))
    const existing = await db.projectPhotos.get(remoteRow.id as string)
    if (existing) continue

    const path = remoteRow.storage_path as string
    const { data: blob } = await supabase.storage.from(STORAGE_BUCKET).download(path)
    if (!blob) continue

    const photo: ProjectPhoto = {
      id: remoteRow.id as string,
      siteId: remoteRow.site_id as string,
      blob,
      createdAt: remoteRow.created_at as number,
      uploadStatus: 'synced',
      remoteUrl: path,
    }
    await db.projectPhotos.put(photo)
  }
  setCursor('project_photos', maxCreatedAt)
}

// ---------- pending deletes ----------

const REMOTE_TABLE_NAMES: Record<string, string> = {
  wireDecks: 'wire_decks',
  miscItems: 'misc_items',
  projectPhotos: 'project_photos',
  billsOfLading: 'bills_of_lading',
  customerSheets: 'customer_sheets',
}

async function pushPendingDeletes(): Promise<void> {
  const pending = await db.pendingDeletes.toArray()
  for (const del of pending) {
    const remoteTable = REMOTE_TABLE_NAMES[del.table] ?? del.table
    const { error } = await supabase.from(remoteTable).delete().eq('id', del.recordId)
    if (!error) {
      await db.pendingDeletes.delete(del.id)
    } else {
      console.error(`[sync] delete ${remoteTable}/${del.recordId} failed:`, error.message, error)
    }
  }
}

// ---------- orchestration ----------

let syncing = false

export async function runSync(): Promise<void> {
  if (!supabaseConfigured) {
    console.warn('[sync] skipped — Supabase is not configured')
    return
  }
  if (syncing) {
    console.log('[sync] skipped — a sync is already in progress')
    return
  }
  if (!navigator.onLine) {
    console.log('[sync] skipped — browser reports offline')
    return
  }
  console.log('[sync] starting…')
  syncing = true
  try {
    await pushPendingDeletes()
    await pushProjects()
    for (const config of ITEM_CONFIGS) await pushItemTable(config)
    await pushSites()
    await pushPhotos()
    await pushProjectPhotos()
    await pushBolsOfLading()
    await pushCustomerSheets()

    await pullProjects()
    for (const config of ITEM_CONFIGS) await pullItemTable(config)
    await pullSites()
    await pullPhotos()
    await pullProjectPhotos()
    await pullBolsOfLading()
    await pullCustomerSheets()
    console.log('[sync] finished')
  } catch (err) {
    console.error('[sync] sync run failed', err)
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
    'bills_of_lading',
    'customer_sheets',
  ]
  for (const table of remoteTables) {
    supabase
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => runSync())
      .subscribe()
  }
}
