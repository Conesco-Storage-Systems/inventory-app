import Dexie, { type Table } from 'dexie'
import type {
  Area,
  Beam,
  BillOfLading,
  BolPhoto,
  CustomerSheet,
  InventoryTransfer,
  MaterialNeed,
  MaterialNeedAllocation,
  MiscItem,
  PendingDelete,
  PickerOption,
  Photo,
  PhotoBlob,
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

class InventoryDB extends Dexie {
  sites!: Table<Site, string>
  siteHeroPhotoBlobs!: Table<PhotoBlob, string>
  areas!: Table<Area, string>
  pickerOptions!: Table<PickerOption, string>
  beams!: Table<Beam, string>
  uprights!: Table<Upright, string>
  wireDecks!: Table<WireDeck, string>
  miscItems!: Table<MiscItem, string>
  photos!: Table<Photo, string>
  photoBlobs!: Table<PhotoBlob, string>
  projectPhotos!: Table<ProjectPhoto, string>
  projectPhotoBlobs!: Table<PhotoBlob, string>
  bolPhotos!: Table<BolPhoto, string>
  bolPhotoBlobs!: Table<PhotoBlob, string>
  pendingDeletes!: Table<PendingDelete, string>
  projects!: Table<Project, string>
  billsOfLading!: Table<BillOfLading, string>
  customerSheets!: Table<CustomerSheet, string>
  salesOrderLineItems!: Table<SalesOrderLineItem, string>
  salesOrderSchedules!: Table<SalesOrderSchedule, string>
  salesQuotes!: Table<SalesQuote, string>
  salesQuoteLineItems!: Table<SalesQuoteLineItem, string>
  inventoryTransfers!: Table<InventoryTransfer, string>
  projectJobSites!: Table<ProjectJobSite, string>
  materialNeeds!: Table<MaterialNeed, string>
  materialNeedAllocations!: Table<MaterialNeedAllocation, string>

  constructor() {
    super('ConescoRackingInventory')
    this.version(1).stores({
      sites: 'id, name, createdAt',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
    })
    this.version(2).stores({
      sites: 'id, name, createdAt',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      siteFieldOptions: 'id, siteId, fieldKey, [siteId+fieldKey]',
    })
    // Site-scoped "Other" options are now derived live from each site's saved items
    // instead of a separate growing log, so this table is no longer needed.
    this.version(3).stores({
      sites: 'id, name, createdAt',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      siteFieldOptions: null,
    })
    this.version(4).stores({
      sites: 'id, name, createdAt',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      projectPhotos: 'id, siteId, createdAt',
    })
    // Adds sync bookkeeping so Supabase push/pull has somewhere to track state:
    // syncStatus on sites (items already had it), uploadStatus/remoteUrl on
    // project photos (item photos already had it), and a queue for deletes
    // that happened while offline (the deleted row itself can't carry state).
    this.version(5).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      pendingDeletes: 'id, table, recordId, deletedAt',
    }).upgrade(async (tx) => {
      await tx.table('sites').toCollection().modify((site) => {
        site.syncStatus = 'pending'
      })
      await tx.table('projectPhotos').toCollection().modify((photo) => {
        photo.uploadStatus = 'pending'
      })
    })
    // Beam Pin Count switched from spelled-out numbers ("Two") to digits
    // ("2") — renumber anything already saved and re-flag it for sync so
    // the change propagates to Supabase and other devices too.
    this.version(6).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      pendingDeletes: 'id, table, recordId, deletedAt',
    }).upgrade(async (tx) => {
      const PIN_COUNT_RENAME: Record<string, string> = {
        One: '1',
        Two: '2',
        Three: '3',
        Four: '4',
        Five: '5',
        Six: '6',
      }
      await tx.table('beams').toCollection().modify((beam) => {
        const renamed = PIN_COUNT_RENAME[beam.pinCount]
        if (renamed) {
          beam.pinCount = renamed
          beam.syncStatus = 'pending'
          beam.updatedAt = Date.now()
        }
      })
    })
    // Adds Projects — folders for big customer jobs (e.g. Automann) that
    // contain multiple locations. A location's projectId (a plain field,
    // no index needed) marks it as belonging to one instead of being a
    // standalone Offsite Location.
    this.version(7).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
    })
    // Adds Bills of Lading — generated shipping documents tied to a
    // location, with line items pulled from that location's own tracked
    // inventory. Purely a document for now; it does not touch inventory
    // quantities.
    this.version(8).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
    })
    // Adds Customer Sheets — customer-facing spec sheets built from
    // selected inventory items, with the user choosing exactly which
    // fields and photos to include per item. Frozen documents, same as
    // Bills of Lading — they don't stay linked to the source items.
    this.version(9).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
    })
    // Upright height becomes free text (same convention as Beam's width)
    // so a cut/repaired upright can carry a range exactly as written on
    // the sheet (e.g. "8' - 10'") instead of one exact number. Existing
    // records only have heightFeet/heightInches — fold them into the new
    // height field, and re-flag for sync so the fix reaches Supabase too.
    this.version(10).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
    }).upgrade(async (tx) => {
      await tx
        .table('uprights')
        .toCollection()
        .modify((upright) => {
          if (upright.height) return
          // A device that's sat dormant since before this migration existed
          // can reach this with neither the old heightFeet/heightInches
          // fields NOR a height ever set locally — there's nothing real to
          // convert. Defaulting to "0'" in that case previously fabricated
          // a fake zero height and flagged it 'pending', which could push
          // and overwrite a perfectly good height already on the server.
          // Leaving the record untouched here lets a normal sync pull fill
          // in the real value instead.
          if (upright.heightFeet == null && upright.heightInches == null) return
          const feet = upright.heightFeet ?? 0
          const inches = upright.heightInches ?? 0
          upright.height = inches > 0 ? `${feet}' ${inches}"` : `${feet}'`
          delete upright.heightFeet
          delete upright.heightInches
          upright.syncStatus = 'pending'
          upright.updatedAt = Date.now()
        })
    })
    // Beam length becomes free text (same convention as width/upright
    // height) so a cut beam can carry a range exactly as written on the
    // sheet (e.g. "101.5 - 102") instead of one exact number.
    this.version(11).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
    }).upgrade(async (tx) => {
      await tx
        .table('beams')
        .toCollection()
        .modify((beam) => {
          if (typeof beam.length === 'string') return
          // Same reasoning as the upright height fix: a device with no
          // real legacy numeric length to convert has nothing to push —
          // forcing it to 'pending' here could overwrite a correct server
          // value with a fabricated blank one.
          if (beam.length == null) return
          beam.length = String(beam.length)
          beam.syncStatus = 'pending'
          beam.updatedAt = Date.now()
        })
    })
    // Adds Sales Order line items — the Director of Procurement's tracking
    // page. Imported from a SalesPad Excel export (eventually a live API)
    // as 'pending', then manually tied to one specific inventory row at
    // one location, which deducts that quantity and moves the line item
    // onto that location's own Sales Order list.
    this.version(12).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
      salesOrderLineItems: 'id, soNumber, status, tiedSiteId, syncStatus, createdAt',
    })
    // Adds Sales Quotes — a sales person builds one for a customer, holds
    // inventory groups against it (never touching the item's own quantity;
    // "available" is always quantity minus active holds), and can release
    // a hold later by deleting it, no reconciliation needed.
    this.version(13).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
      salesOrderLineItems: 'id, soNumber, status, tiedSiteId, syncStatus, createdAt',
      salesQuotes: 'id, createdById, canceledAt, syncStatus, createdAt',
      salesQuoteLineItems: 'id, quoteId, siteId, itemType, syncStatus, createdAt',
    })
    // Adds Sales Order shipment scheduling — a planned ship date for one
    // (Sales Order #, location) pair, set independently of any Bill of
    // Lading, plus a real link (sourceSoNumbers) from a BOL back to the
    // Sales Orders it was generated from — the Sales Orders page uses both
    // to sort every order into Shipped / Scheduled / Not yet Scheduled.
    this.version(14).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
      salesOrderLineItems: 'id, soNumber, status, tiedSiteId, syncStatus, createdAt',
      salesOrderSchedules: 'id, soNumber, siteId, [soNumber+siteId], syncStatus, createdAt',
      salesQuotes: 'id, createdById, canceledAt, syncStatus, createdAt',
      salesQuoteLineItems: 'id, quoteId, siteId, itemType, syncStatus, createdAt',
    }).upgrade(async (tx) => {
      await tx
        .table('billsOfLading')
        .toCollection()
        .modify((bol) => {
          if (!bol.sourceSoNumbers) bol.sourceSoNumbers = []
        })
    })
    // Adds BOL photos — a real-time picture of the actual shipment, taken
    // on the BOL screen once signatures are in place.
    this.version(15).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      bolPhotos: 'id, bolId, uploadStatus, createdAt',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
      salesOrderLineItems: 'id, soNumber, status, tiedSiteId, syncStatus, createdAt',
      salesOrderSchedules: 'id, soNumber, siteId, [soNumber+siteId], syncStatus, createdAt',
      salesQuotes: 'id, createdById, canceledAt, syncStatus, createdAt',
      salesQuoteLineItems: 'id, quoteId, siteId, itemType, syncStatus, createdAt',
    })
    // Moves each photo's actual image Blob out of its metadata record and
    // into its own table, keyed by the same id — see the comment on
    // PhotoBlob in models/types.ts for why (a documented iOS Safari
    // IndexedDB bug where re-saving a record that carries a Blob under the
    // same key can silently corrupt it to 0 bytes). Existing photos are
    // carried forward: their blob is copied into the new table and
    // stripped from the old record, with no change to what's displayed or
    // what's still pending upload.
    this.version(16).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      photoBlobs: 'id',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      projectPhotoBlobs: 'id',
      bolPhotos: 'id, bolId, uploadStatus, createdAt',
      bolPhotoBlobs: 'id',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
      salesOrderLineItems: 'id, soNumber, status, tiedSiteId, syncStatus, createdAt',
      salesOrderSchedules: 'id, soNumber, siteId, [soNumber+siteId], syncStatus, createdAt',
      salesQuotes: 'id, createdById, canceledAt, syncStatus, createdAt',
      salesQuoteLineItems: 'id, quoteId, siteId, itemType, syncStatus, createdAt',
    }).upgrade(async (tx) => {
      const moves: Array<[string, string]> = [
        ['photos', 'photoBlobs'],
        ['projectPhotos', 'projectPhotoBlobs'],
        ['bolPhotos', 'bolPhotoBlobs'],
      ]
      for (const [metaTable, blobTable] of moves) {
        const rows = await tx.table(metaTable).toArray()
        const blobRows = rows.filter((row) => row.blob instanceof Blob).map((row) => ({ id: row.id, blob: row.blob }))
        if (blobRows.length > 0) {
          await tx.table(blobTable).bulkPut(blobRows)
        }
        await tx
          .table(metaTable)
          .toCollection()
          .modify((row) => {
            delete row.blob
          })
      }
    })
    // Same move as version 16, for the site's own hero photo — sites.sitePhoto
    // was the most aggravated case of this bug, since touchSiteUpdated()
    // rewrites the site record (and, until now, its inline photo Blob) on
    // nearly every item add/edit at that location, not just on an upload
    // status flip.
    this.version(17).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      photoBlobs: 'id',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      projectPhotoBlobs: 'id',
      bolPhotos: 'id, bolId, uploadStatus, createdAt',
      bolPhotoBlobs: 'id',
      siteHeroPhotoBlobs: 'id',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
      salesOrderLineItems: 'id, soNumber, status, tiedSiteId, syncStatus, createdAt',
      salesOrderSchedules: 'id, soNumber, siteId, [soNumber+siteId], syncStatus, createdAt',
      salesQuotes: 'id, createdById, canceledAt, syncStatus, createdAt',
      salesQuoteLineItems: 'id, quoteId, siteId, itemType, syncStatus, createdAt',
    }).upgrade(async (tx) => {
      const rows = await tx.table('sites').toArray()
      const blobRows = rows.filter((row) => row.sitePhoto instanceof Blob).map((row) => ({ id: row.id, blob: row.sitePhoto }))
      if (blobRows.length > 0) {
        await tx.table('siteHeroPhotoBlobs').bulkPut(blobRows)
      }
      await tx
        .table('sites')
        .toCollection()
        .modify((row) => {
          delete row.sitePhoto
        })
    })
    // Upright Column Length/Width and Footplate Length/Width become free
    // text (same convention as Beam length / Upright height) — these were
    // plain numbers, which silently discarded anything that wasn't a clean
    // decimal: typing a fraction like "1-5/8" got coerced to 0 at save
    // time instead of kept.
    this.version(18).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      photoBlobs: 'id',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      projectPhotoBlobs: 'id',
      bolPhotos: 'id, bolId, uploadStatus, createdAt',
      bolPhotoBlobs: 'id',
      siteHeroPhotoBlobs: 'id',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
      salesOrderLineItems: 'id, soNumber, status, tiedSiteId, syncStatus, createdAt',
      salesOrderSchedules: 'id, soNumber, siteId, [soNumber+siteId], syncStatus, createdAt',
      salesQuotes: 'id, createdById, canceledAt, syncStatus, createdAt',
      salesQuoteLineItems: 'id, quoteId, siteId, itemType, syncStatus, createdAt',
    }).upgrade(async (tx) => {
      const fields = ['columnLength', 'columnWidth', 'footplateLength', 'footplateWidth'] as const
      await tx
        .table('uprights')
        .toCollection()
        .modify((upright) => {
          if (typeof upright.columnLength === 'string') return
          let changed = false
          for (const field of fields) {
            // Same reasoning as the upright height / beam length fixes: a
            // device with nothing real set locally has nothing to push —
            // forcing it to 'pending' here could overwrite a correct
            // server value with a fabricated one.
            if (upright[field] == null) continue
            upright[field] = String(upright[field])
            changed = true
          }
          if (changed) {
            upright.syncStatus = 'pending'
            upright.updatedAt = Date.now()
          }
        })
    })
    // Upright Width and Anchor Hole Count become free text too (same
    // reasoning as the column/footplate fields above) — Width could lose a
    // fraction the same way, and Anchor Hole Count is converted purely for
    // consistency with the rest of this section now that the others are
    // free text.
    this.version(19).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      photoBlobs: 'id',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      projectPhotoBlobs: 'id',
      bolPhotos: 'id, bolId, uploadStatus, createdAt',
      bolPhotoBlobs: 'id',
      siteHeroPhotoBlobs: 'id',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
      salesOrderLineItems: 'id, soNumber, status, tiedSiteId, syncStatus, createdAt',
      salesOrderSchedules: 'id, soNumber, siteId, [soNumber+siteId], syncStatus, createdAt',
      salesQuotes: 'id, createdById, canceledAt, syncStatus, createdAt',
      salesQuoteLineItems: 'id, quoteId, siteId, itemType, syncStatus, createdAt',
    }).upgrade(async (tx) => {
      const fields = ['width', 'anchorHoleCount'] as const
      await tx
        .table('uprights')
        .toCollection()
        .modify((upright) => {
          if (typeof upright.width === 'string') return
          let changed = false
          for (const field of fields) {
            if (upright[field] == null) continue
            upright[field] = String(upright[field])
            changed = true
          }
          if (changed) {
            upright.syncStatus = 'pending'
            upright.updatedAt = Date.now()
          }
        })
    })
    // Defensive backfill — a record that somehow still has a plain number
    // in any of these fields (e.g. a device whose version 18/19 upgrade
    // didn't fully apply for any reason) used to crash every location
    // page's sort, since it violated what every consumer now assumes.
    // Checks each field independently (unlike 18/19's single-field guard)
    // so a partially-converted record still gets fully fixed, and is a
    // no-op wherever the earlier migrations already did their job.
    this.version(20).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      photoBlobs: 'id',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      projectPhotoBlobs: 'id',
      bolPhotos: 'id, bolId, uploadStatus, createdAt',
      bolPhotoBlobs: 'id',
      siteHeroPhotoBlobs: 'id',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
      salesOrderLineItems: 'id, soNumber, status, tiedSiteId, syncStatus, createdAt',
      salesOrderSchedules: 'id, soNumber, siteId, [soNumber+siteId], syncStatus, createdAt',
      salesQuotes: 'id, createdById, canceledAt, syncStatus, createdAt',
      salesQuoteLineItems: 'id, quoteId, siteId, itemType, syncStatus, createdAt',
    }).upgrade(async (tx) => {
      const fields = [
        'width',
        'anchorHoleCount',
        'columnLength',
        'columnWidth',
        'footplateLength',
        'footplateWidth',
      ] as const
      await tx
        .table('uprights')
        .toCollection()
        .modify((upright) => {
          let changed = false
          for (const field of fields) {
            if (upright[field] == null || typeof upright[field] === 'string') continue
            upright[field] = String(upright[field])
            changed = true
          }
          if (changed) {
            upright.syncStatus = 'pending'
            upright.updatedAt = Date.now()
          }
        })
    })
    // Adds Inventory Transfers — moves one or more whole inventory groups
    // from one location to another in a single confirmed action. Each
    // record here is a frozen receipt of a move that already happened
    // (siteId was already reassigned on the underlying item records at
    // confirm time) — there's nothing to migrate for existing data.
    this.version(21).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      photoBlobs: 'id',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      projectPhotoBlobs: 'id',
      bolPhotos: 'id, bolId, uploadStatus, createdAt',
      bolPhotoBlobs: 'id',
      siteHeroPhotoBlobs: 'id',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
      salesOrderLineItems: 'id, soNumber, status, tiedSiteId, syncStatus, createdAt',
      salesOrderSchedules: 'id, soNumber, siteId, [soNumber+siteId], syncStatus, createdAt',
      salesQuotes: 'id, createdById, canceledAt, syncStatus, createdAt',
      salesQuoteLineItems: 'id, quoteId, siteId, itemType, syncStatus, createdAt',
      inventoryTransfers: 'id, fromSiteId, toSiteId, syncStatus, createdAt',
    })
    // Adds the Project Management dashboard's Phase 1: planning "job
    // sites" within a project (destinations that may not be real Locations
    // yet) and the material needed at each one, tracked by exact spec so
    // it can be matched against live inventory at the project's chosen
    // sourcing Locations.
    this.version(22).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      photoBlobs: 'id',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      projectPhotoBlobs: 'id',
      bolPhotos: 'id, bolId, uploadStatus, createdAt',
      bolPhotoBlobs: 'id',
      siteHeroPhotoBlobs: 'id',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
      salesOrderLineItems: 'id, soNumber, status, tiedSiteId, syncStatus, createdAt',
      salesOrderSchedules: 'id, soNumber, siteId, [soNumber+siteId], syncStatus, createdAt',
      salesQuotes: 'id, createdById, canceledAt, syncStatus, createdAt',
      salesQuoteLineItems: 'id, quoteId, siteId, itemType, syncStatus, createdAt',
      inventoryTransfers: 'id, fromSiteId, toSiteId, syncStatus, createdAt',
      projectJobSites: 'id, projectId, linkedSiteId, syncStatus, createdAt',
      materialNeeds: 'id, projectId, jobSiteId, itemType, syncStatus, createdAt',
    })
    // Adds Material Need Allocations — a real, confirmed tie of actual
    // on-hand inventory to one Material Need (deducts immediately,
    // restored on untie), replacing the Phase 1 live cross-pool match.
    this.version(23).stores({
      sites: 'id, name, createdAt, syncStatus',
      areas: 'id, siteId, name, assignedTo, status, createdAt',
      pickerOptions: 'id, fieldType, value, [fieldType+value]',
      beams:
        'id, siteId, areaId, condition, manufacturer, style, color, length, width, step, pinCount, syncStatus, createdAt',
      uprights:
        'id, siteId, areaId, condition, manufacturer, style, weldedOrBolted, height, width, gauge, syncStatus, createdAt',
      wireDecks:
        'id, siteId, areaId, condition, length, width, channelSize, syncStatus, createdAt',
      miscItems: 'id, siteId, areaId, condition, syncStatus, createdAt',
      photos: 'id, itemType, itemId, uploadStatus, createdAt',
      photoBlobs: 'id',
      projectPhotos: 'id, siteId, uploadStatus, createdAt',
      projectPhotoBlobs: 'id',
      bolPhotos: 'id, bolId, uploadStatus, createdAt',
      bolPhotoBlobs: 'id',
      siteHeroPhotoBlobs: 'id',
      pendingDeletes: 'id, table, recordId, deletedAt',
      projects: 'id, name, createdAt, syncStatus',
      billsOfLading: 'id, siteId, createdAt, syncStatus',
      customerSheets: 'id, siteId, createdAt, syncStatus',
      salesOrderLineItems: 'id, soNumber, status, tiedSiteId, syncStatus, createdAt',
      salesOrderSchedules: 'id, soNumber, siteId, [soNumber+siteId], syncStatus, createdAt',
      salesQuotes: 'id, createdById, canceledAt, syncStatus, createdAt',
      salesQuoteLineItems: 'id, quoteId, siteId, itemType, syncStatus, createdAt',
      inventoryTransfers: 'id, fromSiteId, toSiteId, syncStatus, createdAt',
      projectJobSites: 'id, projectId, linkedSiteId, syncStatus, createdAt',
      materialNeeds: 'id, projectId, jobSiteId, itemType, syncStatus, createdAt',
      materialNeedAllocations: 'id, materialNeedId, projectId, siteId, syncStatus, tiedAt',
    })
  }
}

export const db = new InventoryDB()
