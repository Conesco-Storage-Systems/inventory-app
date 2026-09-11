// A free-text "Other" condition is allowed (see CONDITIONS), so this can't
// stay a strict union of the fixed options.
export type Condition = string

export const CONDITIONS = ['Like New', 'Good', 'Poor', 'Rusty', 'Other'] as const

export type AreaStatus = 'Not started' | 'In progress' | 'Complete'

export const AREA_STATUSES: AreaStatus[] = ['Not started', 'In progress', 'Complete']

export type PickerFieldType = 'manufacturer' | 'style' | 'color'

export type SyncStatus = 'pending' | 'synced'

export type ItemType = 'beam' | 'upright' | 'wireDeck' | 'misc'

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  beam: 'Beam',
  wireDeck: 'Wire Deck',
  upright: 'Upright',
  misc: 'Other',
}

export interface Site {
  id: string
  name: string
  address: string
  otherInfo: string
  createdAt: number
  lastUpdatedBy: string
  lastUpdatedAt: number
  sitePhoto?: Blob
  sitePhotoPath?: string
  // True when the local sitePhoto blob is newer than whatever's at
  // sitePhotoPath remotely — set on every photo change, cleared once the
  // replacement upload actually succeeds. Needed because sitePhotoPath alone
  // can't tell "no photo yet" apart from "photo changed since this path was
  // last uploaded."
  sitePhotoDirty?: boolean
  active?: boolean
  // Set when a location is deleted — it moves to "Recently Deleted" instead
  // of disappearing immediately, and is permanently purged 60 days later.
  deletedAt?: number
  syncStatus: SyncStatus
}

export interface Area {
  id: string
  siteId: string
  name: string
  assignedTo: string
  status: AreaStatus
  createdAt: number
  updatedAt: number
}

export interface PickerOption {
  id: string
  fieldType: PickerFieldType
  value: string
  createdAt: number
}

export type SiteFieldKey =
  | 'color'
  | 'beamStyle'
  | 'uprightStyle'
  | 'gauge'
  | 'channelCount'
  | 'wireDeckStyle'
  | 'miscItem'

export interface ItemBase {
  id: string
  siteId: string
  areaId: string
  aisleOrBay: string
  quantity: number
  condition: Condition
  bundleSize: string
  zone: string
  notes: string
  photoIds: string[]
  recordedBy: string
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

export interface Beam extends ItemBase {
  length: number
  width: string
  color: string
  pinCount: string
  stamp: string
  style: string
  stickers: string
  step: string
}

export interface Upright extends ItemBase {
  color: string
  style: string
  width: number
  heightFeet: number
  heightInches: number
  columnLength: number
  columnWidth: number
  footplateLength: number
  footplateWidth: number
  anchorHoleCount: number
  holeSize: string
  gauge: string
  stamp: string
}

export interface WireDeck extends ItemBase {
  length: number
  width: number
  channelCount: string
  style: string[]
}

export interface MiscItem extends ItemBase {
  description: string
  itemDescription: string
}

export interface Photo {
  id: string
  itemType: ItemType
  itemId: string
  blob: Blob
  createdAt: number
  uploadStatus: 'pending' | 'uploading' | 'synced' | 'failed'
  remoteUrl?: string
}

export interface ProjectPhoto {
  id: string
  siteId: string
  blob: Blob
  createdAt: number
  uploadStatus: 'pending' | 'uploading' | 'synced' | 'failed'
  remoteUrl?: string
}

// Records a delete that happened locally so it can be replayed against
// Supabase once back online — the deleted row itself no longer exists
// locally to carry a syncStatus of its own.
export type SyncTable = 'sites' | 'beams' | 'uprights' | 'wireDecks' | 'miscItems' | 'photos' | 'projectPhotos'

export interface PendingDelete {
  id: string
  table: SyncTable
  recordId: string
  deletedAt: number
}
