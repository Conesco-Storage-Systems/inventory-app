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
  // The actual image data lives in its own table (siteHeroPhotoBlobs), keyed
  // by this site's own id — see the comment on PhotoBlob further down for
  // why. A site record gets rewritten constantly (touchSiteUpdated runs on
  // nearly every item add/edit at that location), so an inline Blob here
  // would hit the same iOS Safari corruption bug far more often than any of
  // the dedicated photo tables did.
  sitePhotoPath?: string
  // True when the local hero photo blob is newer than whatever's at
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

// The Standing Racking counting tool's own record — a count of material
// still erected in a rack row, estimated from bay configurations rather
// than counted piece by piece. Not synced to Supabase yet: this is local
// only while the Bay Configuration / Row model is still being designed, to
// avoid repeated live schema changes before the shape settles.
export interface StandingMaterialCount {
  id: string
  // Freeform — this is often a prospective or not-yet-created site, so it
  // does not reference the real Site table. A later "attach to a project or
  // offsite" step is where this gets tied to a real location.
  siteName: string
  siteAddress: string
  siteInfo: string
  // Set once the Site Info section is confirmed — gates the "Create Bay
  // Configuration" button, which doesn't appear until then.
  confirmed: boolean
  createdAt: number
  updatedAt: number
}

// A reusable spec for "one bay" of a standing rack row — scoped to a single
// StandingMaterialCount, never shared across counts. A Row is built by
// saying how many bays of each configuration it has (plus optional
// Transition Bay overrides at configuration boundaries), and the material
// math is derived from these specs rather than counted piece by piece.
// Only physical-identity fields live here — no quantity/cost/sell/stamp/
// zone/photos, since a configuration isn't an inventory record itself.
export interface BayConfiguration {
  id: string
  standingCountId: string
  name: string
  upright: {
    style: string
    width: string
    height: string
    columnLength: string
    columnWidth: string
    footplateLength: string
    footplateWidth: string
    footplateThickness: string
    anchorHoleCount: string
    holeSize: string
    gauge: string
    color: string
    condition: string
  }
  beam: {
    // How many beam levels one bay has — every level uses this same beam
    // spec for now (no per-level variation yet).
    levelCount: string
    length: string
    step: string
    color: string
    pinCount: string
    style: string
    stickers: string
    condition: string
  }
  deck: {
    decksPerLevel: string
    length: string
    width: string
    channelCount: string
    style: string
    condition: string
  }
  createdAt: number
  updatedAt: number
}

// A physical rack row, built as an ordered run of bay-configuration
// segments (e.g. "2 bays of Config A, then 3 bays of Config B"). Material
// math is derived from this rather than stored:
//   - Beams/decks never share between bays, so each segment's own
//     bayCount x levelCount (x2 for beams, front+back rail) applies with no
//     boundary logic.
//   - Uprights DO share a frame at every junction between bays, including
//     at a configuration boundary — so total frames = total bays + 1, never
//     bayCount x2. By default the shared frame at a segment boundary is
//     counted under the FOLLOWING segment's spec (each segment "owns" the
//     leading frame of each of its own bays); a boundary index listed in
//     transitionOverrides flips that one frame to the PRECEDING segment's
//     spec instead — this is the "Transition Bay" the shared-frame can be
//     pinned to whichever side actually matches reality.
export interface RackRow {
  id: string
  standingCountId: string
  name: string
  // Free text the counter jots down to mark where on the physical row they
  // started counting — not used in the material math.
  startingPoint: string
  segments: Array<{ bayConfigId: string; bayCount: number }>
  transitionOverrides: number[]
  createdAt: number
  updatedAt: number
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
  // The real offsite Locations material for this project is sourced from
  // (e.g. Denver/Arizona/Georgia for Automann) — shared across every
  // Material Need on the project, used to compute how much of a needed
  // spec is actually on hand without re-picking sources every time.
  sourcingSiteIds?: string[]
  syncStatus: SyncStatus
}

// A planning destination within a project's build-out — e.g. "Caledon,
// Canada" for Automann — distinct from a real Location/Site: it may not
// have any actual inventory yet, or even exist as a Site at all, until
// someone physically starts moving material there. Once it does, linking
// it to that real Site (linkedSiteId) is what turns on live movement
// tracking (via Inventory Transfers into that Site) for this job site.
export interface ProjectJobSite {
  id: string
  projectId: string
  name: string
  targetDate: string
  linkedSiteId: string
  notes: string
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

// One line of planned material for a project job site — e.g. "1200
// Uprights, 42"x25' column 3"x3"" for Caledon. Carries the exact same
// fields as the real Add Item forms (so nothing gets missed for
// permitting/engineering purposes), with field names mirroring the real
// item records directly (Beam.width/length, Upright.width/height/
// columnLength/columnWidth, WireDeck.width/length, MiscItem.description)
// — only the fields relevant to itemType are ever set; the rest stay
// blank. "Sourced" is never computed from these — it's the sum of this
// need's real, explicitly tied MaterialNeedAllocation rows (see
// db/materialNeedAllocations.ts), created one at a time from the need's
// own screen.
export interface MaterialNeed {
  id: string
  projectId: string
  jobSiteId: string
  itemType: ItemType
  quantityNeeded: number
  notes: string
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus

  // Common to every item type, same as the real Add Item forms.
  condition: string
  bundleSize: string
  zone: string
  costPer: number
  sellPer: number

  // Beam + Upright
  color: string
  style: string
  stamp: string

  // Beam (also shares width/length with Wire Deck)
  length: string
  width: string
  pinCount: string
  stickers: string
  step: string

  // Upright (also shares width with Beam/Wire Deck)
  height: string
  columnLength: string
  columnWidth: string
  footplateLength: string
  footplateWidth: string
  footplateThickness: string
  anchorHoleCount: string
  holeSize: string
  gauge: string

  // Wire Deck (also shares width/length with Beam)
  channelCount: string
  wireDeckStyle: string[]

  // Misc ("Other")
  description: string
  itemDescription: string
}

// A tracking record of real, on-hand inventory earmarked toward one
// Material Need — created by "tying" from that need's own screen. This
// is purely for measuring/tracking where material for a project is
// sitting; it does NOT deduct from the source item's real quantity —
// the actual reservation happens later, when that inventory is tied to
// a Sales Order. "Sourced" for a need is the sum of its allocations, not
// a live guess — deleting an allocation (untying) just removes the record.
export interface MaterialNeedAllocation {
  id: string
  materialNeedId: string
  projectId: string
  siteId: string
  siteName: string
  itemType: ItemType
  // The underlying raw inventory record ids this tie points at — a
  // grouped row can span several raw records, same convention as
  // SalesOrderLineItem.tiedItemIds.
  itemIds: string[]
  description: string
  quantity: number
  tiedAt: number
  tiedBy: string
  syncStatus: SyncStatus
}

export type RecountStatus = 'draft' | 'committed'

// A physical recount of a location, done on-site line by line the same
// way an initial count is — never an Excel re-import. Only one 'draft'
// recount should exist per site at a time; once committed it's kept
// forever as history (never deleted), the same role the old Excel
// version tabs (v1/v2/v3...) used to serve. Local-only for now, same
// reasoning as StandingMaterialCount/SalesOrderDiscrepancy — shape may
// still move as this gets tested on the pilot location.
export interface Recount {
  id: string
  siteId: string
  siteName: string
  status: RecountStatus
  label: string
  startedAt: number
  startedBy: string
  committedAt: number
  committedBy: string
}

// One line counted during a Recount. Deliberately a single flat shape
// carrying every item-type field, only the ones relevant to itemType
// ever set — same pattern MaterialNeed already uses above for "mirrors
// the real Add Item forms, isn't real inventory yet." Kept in its own
// table rather than tagged onto beams/uprights/wireDecks/miscItems so it
// can never leak into any existing read of "current inventory" (grouping,
// exports, customer sheets, sync push, etc.) by construction.
export interface RecountLineItem {
  id: string
  recountId: string
  siteId: string
  itemType: ItemType
  quantity: number
  condition: string
  bundleSize: string
  zone: string
  notes: string
  costPer: number
  sellPer: number
  photoIds: string[]
  recordedBy: string

  // Beam + Upright
  color: string
  style: string
  stamp: string

  // Beam (also shares width with Upright/Wire Deck)
  length: string
  width: string
  pinCount: string
  stickers: string
  step: string

  // Upright
  height: string
  columnLength: string
  columnWidth: string
  footplateLength: string
  footplateWidth: string
  footplateThickness: string
  anchorHoleCount: string
  holeSize: string
  gauge: string

  // Wire Deck
  channelCount: string
  wireDeckStyle: string[]

  // Misc ("Other")
  description: string
  itemDescription: string

  createdAt: number
  updatedAt: number
}

// A note/idea posted to the admin-only Bulletin Board — editable by its
// author, same reasoning as MaterialNeed (conflict-resolved by updatedAt
// on the server, see reject_stale_update_at).
export interface BulletinPost {
  id: string
  authorEmail: string
  body: string
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

// A reply to a BulletinPost — unlike the post itself, never edited after
// creation (same reasoning as MaterialNeedAllocation), so there's nothing
// to resolve conflicts on: a comment either exists or has been deleted.
export interface BulletinComment {
  id: string
  postId: string
  authorEmail: string
  body: string
  createdAt: number
  syncStatus: SyncStatus
}

export interface BulletinPostPhoto {
  id: string
  postId: string
  createdAt: number
  uploadStatus: 'pending' | 'uploading' | 'synced' | 'failed'
  remoteUrl?: string
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
  // Free text, same convention as height below — was a plain number,
  // which silently discarded a fraction like "1-5/8" at save time.
  width: string
  // Free text, same convention as Beam's width — usually "12'" or
  // "12' 6"", but a cut/repaired upright is sometimes a range as it's
  // written on the sheet, e.g. "8' - 10'" or "19'6" - 20'".
  height: string
  // Free text, same convention as height — was a plain number, but that
  // silently discarded anything that wasn't a clean decimal (a fraction
  // like "1-5/8" would get coerced to 0 at save time instead of kept).
  columnLength: string
  columnWidth: string
  footplateLength: string
  footplateWidth: string
  // Free text (e.g. "3/16" or "1/4") — a distinct measurement from the
  // footplate's length/width above, so it's its own field rather than
  // folded into either of them.
  footplateThickness: string
  // Free text — a count, so normally just digits, but kept free text for
  // consistency with the other footplate fields (and to avoid the same
  // Number()-coercion pitfall if a note ever gets appended here).
  anchorHoleCount: string
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
  createdAt: number
  uploadStatus: 'pending' | 'uploading' | 'synced' | 'failed'
  remoteUrl?: string
}

export interface ProjectPhoto {
  id: string
  siteId: string
  createdAt: number
  uploadStatus: 'pending' | 'uploading' | 'synced' | 'failed'
  remoteUrl?: string
}

// The actual image data for Photo/ProjectPhoto/BolPhoto lives in its own
// table (photoBlobs/projectPhotoBlobs/bolPhotoBlobs), keyed by the same id
// as its metadata row, rather than inline on the metadata itself. iOS
// Safari has a documented IndexedDB bug (WebKit #240216) where re-saving a
// record that carries a Blob under the same key can silently corrupt it
// down to 0 bytes — routine metadata writes (an upload status flip, a
// group-merge reassignment) would otherwise trigger exactly that read-
// modify-write pattern on every photo, every time. Keeping the blob in its
// own record means those routine writes never touch it at all.
export interface PhotoBlob {
  id: string
  blob: Blob
}

// A real-time photo of the actual shipment, taken on the BOL screen once
// it's ready to go (or already shipped) — so there's a record of what was
// physically on the truck, not just what the line items say.
export interface BolPhoto {
  id: string
  bolId: string
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
  // Epoch ms the order was created in SalesPad ("Created On" in the SO
  // report), and the SalesPad user id who created it ("Sales Person ID") —
  // 0 / '' on rows imported before these were captured, or from a report
  // whose sheet omits one of these columns.
  createdOn: number
  salespersonId: string
  // The (soNumber, description, warehouseCode, quantity) signature of the
  // original row this came from on import — set once and never touched
  // again, even when a partial tie splits this line into two rows (one
  // tied for what was available, one still pending for the rest). Import
  // de-dup checks this instead of the live quantityOrdered above, which
  // can shrink after a split and would otherwise look like a "new" row on
  // the next re-import of the same report. Absent on rows imported before
  // this field existed — de-dup falls back to computing it from their own
  // (never-split) current fields.
  importSourceKey?: string
  // SalesPad's internal per-line sequence number ("Audit Line Seq" in both
  // the SO report and the change log export) — undefined on rows imported
  // before/without this column. When present on both sides it's the exact,
  // edit-proof way to match a change-log row back to this line; absent, the
  // change-log matcher falls back to (soNumber, description, warehouseCode).
  // Never touched by a tie split — copied through like importSourceKey, so
  // every row a single original line gets split into still carries it.
  lineSeq?: number
  // Set at import time when this row's (soNumber, description,
  // warehouseCode, quantity) signature already matched an existing line
  // item — it still gets imported (so nothing from the report is ever
  // silently dropped), just flagged for review in its own section instead
  // of being mixed in with genuinely new rows.
  flaggedDuplicate?: boolean
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

export type SalesOrderDiscrepancyAction = 'updated' | 'deleted'

export interface SalesOrderDiscrepancyFieldChange {
  field: string
  oldValue: string
  newValue: string
}

// One open "needs attention" entry per affected SalesPad order line (or
// tied-split group of local rows sharing that same original line) — created
// the first time a Recent Changes import reports an edit/delete against a
// line that's already tied to inventory, and merged in place on every
// later import until a human resolves it, so there's only ever one thing
// to review per line instead of a pile of superseded edits. A line whose
// change-log event lands before it's been tied isn't flagged at all — its
// SalesOrderLineItem fields are just updated directly.
// Local-only for now (not wired into Supabase sync) — same reasoning as the
// Standing Racking tables: the shape is still being worked out through
// testing.
export interface SalesOrderDiscrepancy {
  id: string
  lineItemIds: string[]
  soNumber: string
  warehouseCode: string
  tiedSiteNames: string[]
  description: string
  action: SalesOrderDiscrepancyAction
  changes: SalesOrderDiscrepancyFieldChange[]
  firstDetectedAt: number
  lastChangedAt: number
  resolved: boolean
  resolvedAt: number
  resolvedBy: string
  createdAt: number
  updatedAt: number
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

// One grouped inventory row moved in full as part of an Inventory Transfer
// — never a partial quantity, so there's nothing here to reconcile against
// what's left behind at the source.
export interface InventoryTransferLineItem {
  itemType: ItemType
  itemIds: string[]
  quantity: number
  // A frozen snapshot of every data point this item carried at the moment
  // of transfer — the same unified column set "Export to Excel" uses (see
  // EXPORT_ROW_COLUMNS in src/export/inventoryExportRows.ts), with blank
  // entries for whatever doesn't apply to this item's type — so the
  // confirmation step and the saved record can show the full line item,
  // not just a collapsed description.
  fields: Record<string, string | number>
}

// Moves one or more whole inventory groups from one location to another in
// a single confirmed action — created only at the moment of confirmation
// (see createInventoryTransfer in src/db/inventoryTransfers.ts), so unlike
// a Sales Order tie there's no 'pending' state for this to sit in: a row
// here always means the move already happened. A frozen record, same as a
// Bill of Lading or Customer Sheet — never edited after creation.
export interface InventoryTransfer {
  id: string
  fromSiteId: string
  fromSiteName: string
  toSiteId: string
  toSiteName: string
  scheduledDate: string
  lineItems: InventoryTransferLineItem[]
  createdBy: string
  createdAt: number
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
  | 'bolPhotos'
  | 'billsOfLading'
  | 'customerSheets'
  | 'salesOrderLineItems'
  | 'salesOrderSchedules'
  | 'salesQuotes'
  | 'salesQuoteLineItems'
  | 'inventoryTransfers'
  | 'projectJobSites'
  | 'materialNeeds'
  | 'materialNeedAllocations'
  | 'bulletinPosts'
  | 'bulletinComments'
  | 'bulletinPostPhotos'

export interface PendingDelete {
  id: string
  table: SyncTable
  recordId: string
  deletedAt: number
}
