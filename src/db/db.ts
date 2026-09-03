import Dexie, { type Table } from 'dexie'
import type {
  Area,
  Beam,
  MiscItem,
  PendingDelete,
  PickerOption,
  Photo,
  ProjectPhoto,
  Site,
  Upright,
  WireDeck,
} from '../models/types'

class InventoryDB extends Dexie {
  sites!: Table<Site, string>
  areas!: Table<Area, string>
  pickerOptions!: Table<PickerOption, string>
  beams!: Table<Beam, string>
  uprights!: Table<Upright, string>
  wireDecks!: Table<WireDeck, string>
  miscItems!: Table<MiscItem, string>
  photos!: Table<Photo, string>
  projectPhotos!: Table<ProjectPhoto, string>
  pendingDeletes!: Table<PendingDelete, string>

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
  }
}

export const db = new InventoryDB()
