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
  // Set when this location belongs to a Project (e.g. a big customer job
  // like Automann with locations all over the country) instead of being a
  // standalone Offsite Location. Project-owned locations and their items
  // are excluded from the main "All Offsite Inventory" — that material
  // belongs to the customer, not Conesco's own sellable stock.
  projectId?: string
  syncStatus: SyncStatus
}

export interface ProjectShare {
  id: string
  email: string
}

export interface Project {
  id: string
  name: string
  createdAt: number
  lastUpdatedBy: string
  lastUpdatedAt: number
  active?: boolean
  // Same soft-delete pattern as Site — moves to "Recently Deleted" for 60
  // days before being permanently purged.
  deletedAt?: number
  // Projects are person-specific — only the owner and whoever they've
  // shared it with see it (Admin included; ownership isn't role-based).
  // An empty ownerId means "created before this existed" and stays visible
  // to everyone rather than suddenly disappearing from anyone's screen.
  // Only the owner can change who it's shared with.
  ownerId?: string
  ownerEmail?: string
  sharedWith?: ProjectShare[]
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
  costPer: number
  sellPer: number
}

export interface Beam extends ItemBase {
  // Free text, same convention as width — usually just a plain number
  // ("144"), but a cut beam is sometimes a range as written on the sheet,
  // e.g. "101.5 - 102".
  length: string
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
  // Free text, same convention as Beam's width — usually "12'" or
  // "12' 6"", but a cut/repaired upright is sometimes a range as it's
  // written on the sheet, e.g. "8' - 10'" or "19'6" - 20'".
  height: string
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

// 'outbound' = material leaving this location (it fills in Ship From).
// 'inbound' = material coming into this location (it fills in Ship To).
export type BolDirection = 'outbound' | 'inbound'

export type PaymentTerm = 'PrePaid' | 'Collect' | '3rd Party'

export type TrailerLoadedBy = 'By Shipper' | 'By Driver' | ''

export type FreightCountedBy = 'By Shipper' | 'By Driver/pallets said to contain' | 'By Driver/Pieces' | ''

export interface BolLineItem {
  item: string
  description: string
  qtyShipped: number
  weight: string
  qtyReceived: string
  // Links back to the SalesOrderLineItem this row was drawn from, when it
  // came from a Sales Order — undefined for a manually-added line, or for
  // a BOL created before this link existed. A single Sales Order line item
  // can be split across more than one BOL over time (partial shipments),
  // so this is how the Sales Orders page adds up how much of it has
  // actually shipped so far.
  sourceLineItemId?: string
}

export interface BillOfLading {
  id: string
  siteId: string
  direction: BolDirection
  date: string
  loadNumber: string
  referenceDoc: string
  paymentTerm: PaymentTerm | ''
  shipFromCompany: string
  shipFromAddress: string
  shipFromPhone: string
  shipToCompany: string
  shipToContact: string
  shipToAddress: string
  shipToPhone: string
  carrier: string
  driverPhone: string
  brokerInfo: string
  trailerLoadedBy: TrailerLoadedBy
  freightCountedBy: FreightCountedBy
  // Hand-drawn e-signatures (data URLs), captured directly on the
  // signature line when clicked. Each has its own signed-at timestamp
  // since Shipper and Carrier can sign separately, at different times.
  shipperSignatureImage: string
  shipperSignedAt: number
  carrierSignatureImage: string
  carrierSignedAt: number
  // Explicit final confirmation, separate from having both signatures —
  // set only when "Mark as Shipped" is clicked.
  shippedAt: number
  lineItems: BolLineItem[]
  // The distinct Sales Order numbers this BOL's line items came from, set
  // once at creation — a real link (unlike referenceDoc, which is just
  // free text a user can edit) that the Sales Orders page uses to tell
  // whether a given Sales Order has shipped. Empty for a BOL not built
  // from any Sales Order.
  sourceSoNumbers: string[]
  createdAt: number
  lastUpdatedBy: string
  lastUpdatedAt: number
  syncStatus: SyncStatus
}

// A customer-facing spec sheet: a snapshot of selected inventory items
// (only the fields/photos the user chose to include) plus customer info.
// Like a Bill of Lading, it's a frozen document — later edits or deletes
// of the source items never change an already-generated sheet, so photos
// are copied in as data URIs rather than referencing the original photo.
export type CustomerSheetItemType = 'upright' | 'beam' | 'wireDeck' | 'misc'

export interface CustomerSheetField {
  label: string
  value: string
}

export interface CustomerSheetLineItem {
  itemType: CustomerSheetItemType
  itemLabel: string
  fields: CustomerSheetField[]
  photos: string[]
}

export interface CustomerSheet {
  id: string
  siteId: string
  date: string
  customerName: string
  customerCompany: string
  customerAddress: string
  customerPhone: string
  preparedBy: string
  lineItems: CustomerSheetLineItem[]
  createdAt: number
  lastUpdatedBy: string
  lastUpdatedAt: number
  syncStatus: SyncStatus
}

// A line item imported from a Sales Order report (an Excel export from
// SalesPad, via "Import Reports" — eventually a live API instead). Starts
// 'pending' — the Procurement role manually ties it to one specific
// inventory row at one location, which deducts that quantity immediately
// and moves the line item off the Procurement page onto that location's
// Sales Order list. One-to-one only: a line item ties to exactly one row,
// for its full ordered quantity — no splitting across rows/locations.
export type SalesOrderLineItemStatus = 'pending' | 'tied'

export interface SalesOrderLineItem {
  id: string
  soNumber: string
  description: string
  // SalesPad's warehouse code (e.g. "MARICOPA") — shown as a hint for
  // which location this probably belongs to, but matching is still manual;
  // warehouse codes don't necessarily match a Site's name exactly.
  warehouseCode: string
  quantityOrdered: number
  status: SalesOrderLineItemStatus
  tiedSiteId: string
  tiedSiteName: string
  tiedItemType: ItemType | ''
  // The underlying raw inventory record ids the deduction was taken from —
  // a grouped row can span several raw records.
  tiedItemIds: string[]
  tiedDescription: string
  tiedAt: number
  tiedBy: string
  importedAt: number
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

// A Sales Quote a sales person is building for a customer. Holding
// inventory against it never touches the item's own quantity — "available"
// is always computed as quantity minus the sum of active holds — so
// canceling a quote or one of its line items is just deleting a row, with
// nothing to reconcile.
export interface SalesQuote {
  id: string
  quoteNumber: string
  customerName: string
  customerAddress: string
  notes: string
  createdById: string
  createdByEmail: string
  // Set when the whole quote is canceled — its line items (holds) are
  // deleted at the same time, so a canceled quote never has any.
  canceledAt?: number
  createdAt: number
  lastUpdatedAt: number
  syncStatus: SyncStatus
}

// One held inventory group on a quote. Only ever exists while its hold is
// active — canceling a line item deletes this row outright rather than
// marking it canceled, so "every row in this table" is always the current
// list of active holds.
export interface SalesQuoteLineItem {
  id: string
  quoteId: string
  quoteNumber: string
  siteId: string
  siteName: string
  itemType: ItemType
  // The grouped row's raw record ids at the moment it was held — used to
  // match this hold back to a live inventory row later (by overlap, since
  // the row could have been edited/re-split since).
  itemIds: string[]
  description: string
  quantityHeld: number
  heldByEmail: string
  createdAt: number
  syncStatus: SyncStatus
}

// One (Sales Order #, location) pair's planned ship date, set from the
// "Schedule Shipment" button on that Sales Order's page — independent of
// any Bill of Lading, since a shipment can be scheduled before a BOL even
// exists. Unique per (soNumber, siteId): scheduling again for the same
// pair updates this row rather than creating another one.
export interface SalesOrderSchedule {
  id: string
  soNumber: string
  siteId: string
  siteName: string
  scheduledShipDate: string
  createdBy: string
  createdAt: number
  lastUpdatedBy: string
  lastUpdatedAt: number
  syncStatus: SyncStatus
}

// Records a delete that happened locally so it can be replayed against
// Supabase once back online — the deleted row itself no longer exists
// locally to carry a syncStatus of its own.
export type SyncTable =
  | 'sites'
  | 'projects'
  | 'beams'
  | 'uprights'
  | 'wireDecks'
  | 'miscItems'
  | 'photos'
  | 'projectPhotos'
  | 'billsOfLading'
  | 'customerSheets'
  | 'salesOrderLineItems'
  | 'salesOrderSchedules'
  | 'salesQuotes'
  | 'salesQuoteLineItems'

export interface PendingDelete {
  id: string
  table: SyncTable
  recordId: string
  deletedAt: number
}
