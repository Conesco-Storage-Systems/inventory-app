import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BeamTable from '../components/BeamTable'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import EditBeamDialog from '../components/EditBeamDialog'
import EditMiscItemDialog from '../components/EditMiscItemDialog'
import EditUprightDialog from '../components/EditUprightDialog'
import EditWireDeckDialog from '../components/EditWireDeckDialog'
import MiscItemTable from '../components/MiscItemTable'
import SitePhotoPicker from '../components/SitePhotoPicker'
import UprightTable from '../components/UprightTable'
import WireDeckTable from '../components/WireDeckTable'
import { db } from '../db/db'
import { groupBeams, type BeamRow } from '../db/groupBeams'
import { groupMiscItems, type MiscItemRow } from '../db/groupMiscItems'
import { groupUprights, type UprightRow } from '../db/groupUprights'
import { groupWireDecks, type WireDeckRow } from '../db/groupWireDecks'
import {
  createBeam,
  createUpright,
  createWireDeck,
  deleteBeamGroup,
  deleteMiscItemGroup,
  deleteUprightGroup,
  deleteWireDeckGroup,
  listBeamsBySite,
  listMiscItemsBySite,
  listUprightsBySite,
  listWireDecksBySite,
} from '../db/items'
import { deleteBillOfLading, listBolsBySite } from '../db/billsOfLading'
import { deleteCustomerSheet, listCustomerSheetsBySite } from '../db/customerSheets'
import { removeSitePhoto, setSitePhoto, setSiteProject, updateSite } from '../db/locations'
import { exportSheetsToExcel } from '../export/exportToExcel'
import { parseInventoryWorkbook, type ImportParseResult } from '../import/parseInventoryImport'
import { useRole } from '../state/RoleContext'
import { matchesSearch, normalizeForSearch } from '../utils/searchMatch'

type ItemKind = 'upright' | 'beam' | 'wireDeck' | 'misc'

interface SelectedItem {
  itemType: ItemKind
  key: string
  row: UprightRow | BeamRow | WireDeckRow | MiscItemRow
}

export default function LocationDetail() {
  const { permissions } = useRole()
  const { siteId } = useParams<{ siteId: string }>()
  const site = useLiveQuery(() => (siteId ? db.sites.get(siteId) : undefined), [siteId])
  const uprights = useLiveQuery(() => (siteId ? listUprightsBySite(siteId) : []), [siteId]) ?? []
  const beams = useLiveQuery(() => (siteId ? listBeamsBySite(siteId) : []), [siteId]) ?? []
  const wireDecks = useLiveQuery(() => (siteId ? listWireDecksBySite(siteId) : []), [siteId]) ?? []
  const miscItems = useLiveQuery(() => (siteId ? listMiscItemsBySite(siteId) : []), [siteId]) ?? []
  const bols = useLiveQuery(() => (siteId ? listBolsBySite(siteId) : []), [siteId]) ?? []
  const customerSheets = useLiveQuery(() => (siteId ? listCustomerSheetsBySite(siteId) : []), [siteId]) ?? []

  const toolbarObserverRef = useRef<IntersectionObserver | null>(null)
  const [toolbarStuck, setToolbarStuck] = useState(false)

  const toolbarSentinelRef = useCallback((node: HTMLDivElement | null) => {
    toolbarObserverRef.current?.disconnect()
    toolbarObserverRef.current = null
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setToolbarStuck(!entry.isIntersecting), {
      threshold: 0,
    })
    observer.observe(node)
    toolbarObserverRef.current = observer
  }, [])

  const importFileInputRef = useRef<HTMLInputElement>(null)
  const [importFileName, setImportFileName] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ImportParseResult | null>(null)
  const [importParsing, setImportParsing] = useState(false)
  const [importParseError, setImportParseError] = useState<string | null>(null)
  const [importCommitting, setImportCommitting] = useState(false)
  const [importResultMessage, setImportResultMessage] = useState<string | null>(null)

  async function handleImportFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportFileName(file.name)
    setImportPreview(null)
    setImportParseError(null)
    setImportResultMessage(null)
    setImportParsing(true)
    try {
      const result = await parseInventoryWorkbook(file)
      setImportPreview(result)
    } catch {
      setImportParseError('Could not read that file. Make sure it is a valid Excel file.')
    } finally {
      setImportParsing(false)
    }
  }

  function cancelImportPreview() {
    setImportPreview(null)
    setImportFileName(null)
    setImportParseError(null)
  }

  async function confirmImport() {
    if (!importPreview || !siteId) return
    setImportCommitting(true)
    try {
      for (const upright of importPreview.uprights) {
        await createUpright({ ...upright, siteId, photoFiles: [] })
      }
      for (const beam of importPreview.beams) {
        await createBeam({ ...beam, siteId, photoFiles: [] })
      }
      for (const wireDeck of importPreview.wireDecks) {
        await createWireDeck({ ...wireDeck, siteId, photoFiles: [] })
      }
      setImportResultMessage(
        `Imported ${importPreview.uprights.length} uprights, ${importPreview.beams.length} beams, and ${importPreview.wireDecks.length} wire decks.`,
      )
      setImportPreview(null)
      setImportFileName(null)
    } finally {
      setImportCommitting(false)
    }
  }

  const importFlaggedCount = importPreview
    ? [...importPreview.uprights, ...importPreview.beams, ...importPreview.wireDecks].filter((row) =>
        row.notes.startsWith('['),
      ).length
    : 0

  const [editingSite, setEditingSite] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [addressDraft, setAddressDraft] = useState('')
  const [otherInfoDraft, setOtherInfoDraft] = useState('')
  const [projectDraft, setProjectDraft] = useState('')
  const [savingSite, setSavingSite] = useState(false)
  const projects = useLiveQuery(() => db.projects.orderBy('name').toArray(), []) ?? []

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [activeAction, setActiveAction] = useState<'edit' | 'duplicate' | 'delete' | null>(null)
  const [deletingBolId, setDeletingBolId] = useState<string | null>(null)
  const [deletingCustomerSheetId, setDeletingCustomerSheetId] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')

  const uprightRows = groupUprights(uprights)
  const beamRows = groupBeams(beams)
  const wireDeckRows = groupWireDecks(wireDecks)
  const miscRows = groupMiscItems(miscItems)

  const normalizedSearch = normalizeForSearch(searchTerm)
  const displayedUprightRows = normalizedSearch
    ? uprightRows.filter((row) => matchesSearch(row, normalizedSearch))
    : uprightRows
  const displayedBeamRows = normalizedSearch
    ? beamRows.filter((row) => matchesSearch(row, normalizedSearch))
    : beamRows

  function toggleSelect(itemType: ItemKind, row: UprightRow | BeamRow | WireDeckRow | MiscItemRow) {
    setSelectedItems((prev) => {
      const exists = prev.some((si) => si.itemType === itemType && si.key === row.key)
      if (exists) return prev.filter((si) => !(si.itemType === itemType && si.key === row.key))
      return [...prev, { itemType, key: row.key, row }]
    })
  }

  function closeAction() {
    setActiveAction(null)
    setSelectedItems([])
  }

  async function handleConfirmDeleteBol() {
    if (!deletingBolId) return
    await deleteBillOfLading(deletingBolId)
    setDeletingBolId(null)
  }

  async function handleConfirmDeleteCustomerSheet() {
    if (!deletingCustomerSheetId) return
    await deleteCustomerSheet(deletingCustomerSheetId)
    setDeletingCustomerSheetId(null)
  }

  async function handleConfirmDelete() {
    for (const item of selectedItems) {
      if (item.itemType === 'upright') await deleteUprightGroup(item.row.ids)
      else if (item.itemType === 'beam') await deleteBeamGroup(item.row.ids)
      else if (item.itemType === 'wireDeck') await deleteWireDeckGroup(item.row.ids)
      else await deleteMiscItemGroup(item.row.ids)
    }
  }

  const displayedWireDeckRows = normalizedSearch
    ? wireDeckRows.filter((row) => matchesSearch(row, normalizedSearch))
    : wireDeckRows
  const displayedMiscRows = normalizedSearch
    ? miscRows.filter((row) => matchesSearch(row, normalizedSearch))
    : miscRows

  const singleSelected = selectedItems.length === 1 ? selectedItems[0] : null
  const selectedUprightKeys = new Set(
    selectedItems.filter((si) => si.itemType === 'upright').map((si) => si.key),
  )
  const selectedBeamKeys = new Set(selectedItems.filter((si) => si.itemType === 'beam').map((si) => si.key))
  const selectedWireDeckKeys = new Set(
    selectedItems.filter((si) => si.itemType === 'wireDeck').map((si) => si.key),
  )
  const selectedMiscKeys = new Set(selectedItems.filter((si) => si.itemType === 'misc').map((si) => si.key))

  if (site === undefined) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    )
  }

  if (site === null || !site) {
    return (
      <main className="page">
        <p>Location not found.</p>
        <Link to="/">Back to locations</Link>
      </main>
    )
  }

  function startEditingSite() {
    if (!site) return
    setNameDraft(site.name)
    setAddressDraft(site.address)
    setOtherInfoDraft(site.otherInfo)
    setProjectDraft(site.projectId ?? '')
    setEditingSite(true)
  }

  async function handleSaveSite() {
    if (!site) return
    setSavingSite(true)
    try {
      await updateSite(site.id, nameDraft, addressDraft, otherInfoDraft)
      if ((site.projectId ?? '') !== projectDraft) {
        await setSiteProject(site.id, projectDraft || null)
      }
      setEditingSite(false)
    } finally {
      setSavingSite(false)
    }
  }

  async function handleSitePhotoSelected(file: File) {
    if (siteId) await setSitePhoto(siteId, file)
  }

  async function handleSitePhotoRemoved() {
    if (siteId) await removeSitePhoto(siteId)
  }

  function handleExport() {
    if (!site) return

    const blankRow = {
      Quantity: 0 as string | number,
      Item: '',
      Style: '',
      'Width x Length': '',
      'Width x Height': '',
      Color: '',
      'Pin Count': '',
      Step: '',
      'Column Size': '',
      'Footplate Size': '',
      'Anchor Hole Count': '' as string | number,
      'Hole Size': '',
      Gauge: '',
      'Number of Channels': '',
      'Item Description': '',
      Condition: '',
      Stamp: '',
      Stickers: '',
      'Bundle Size': '',
      Zone: '',
      Notes: '',
      'Cost Per': '' as string | number,
      'Sell Per': '' as string | number,
      Photos: 0 as string | number,
    }

    const rows = [
      ...uprightRows.map((row) => ({
        ...blankRow,
        Quantity: row.quantity,
        Item: 'Upright',
        Style: row.style,
        'Width x Height': row.widthByHeight,
        Color: row.color,
        'Column Size': row.columnSizeDisplay,
        'Footplate Size': row.footplateSizeDisplay,
        'Anchor Hole Count': row.anchorHoleCount,
        'Hole Size': row.holeSize,
        Gauge: row.gauge,
        Condition: row.condition,
        Stamp: row.stamp,
        'Bundle Size': row.bundleSize,
        Zone: row.zone,
        Notes: row.notes,
        'Cost Per': row.costPer,
        'Sell Per': row.sellPer,
        Photos: row.photoIds.length,
      })),
      ...beamRows.map((row) => ({
        ...blankRow,
        Quantity: row.quantity,
        Item: 'Beam',
        Style: row.style,
        'Width x Length': row.widthByLength,
        Color: row.color,
        'Pin Count': row.pinCount,
        Step: row.step,
        Condition: row.condition,
        Stamp: row.stamp,
        Stickers: row.stickers,
        'Bundle Size': row.bundleSize,
        Zone: row.zone,
        Notes: row.notes,
        'Cost Per': row.costPer,
        'Sell Per': row.sellPer,
        Photos: row.photoIds.length,
      })),
      ...wireDeckRows.map((row) => ({
        ...blankRow,
        Quantity: row.quantity,
        Item: 'Wire Deck',
        Style: row.style.join(', '),
        'Width x Length': row.widthByLength,
        'Number of Channels': row.channelCount,
        Condition: row.condition,
        'Bundle Size': row.bundleSize,
        Zone: row.zone,
        Notes: row.notes,
        'Cost Per': row.costPer,
        'Sell Per': row.sellPer,
        Photos: row.photoIds.length,
      })),
      ...miscRows.map((row) => ({
        ...blankRow,
        Quantity: row.quantity,
        Item: 'Other',
        Style: row.description,
        'Item Description': row.itemDescription,
        Condition: row.condition,
        'Bundle Size': row.bundleSize,
        Zone: row.zone,
        Notes: row.notes,
        'Cost Per': row.costPer,
        'Sell Per': row.sellPer,
        Photos: row.photoIds.length,
      })),
    ]

    exportSheetsToExcel(
      [{ name: 'Inventory', rows }],
      `${site.name.replace(/[^a-z0-9]+/gi, '-')}-inventory.xlsx`,
    )
  }

  const hasItems =
    uprightRows.length > 0 || beamRows.length > 0 || wireDeckRows.length > 0 || miscRows.length > 0

  return (
    <main className="page page-wide">
      <p>
        <Link to="/">← Locations</Link>
      </p>

      <div className="location-header-row">
        <div className="location-info">
          {editingSite ? (
            <div className="site-edit-form">
              <label>
                Offsite location name
                <input type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
              </label>
              <label>
                Address
                <input
                  type="text"
                  value={addressDraft}
                  onChange={(e) => setAddressDraft(e.target.value)}
                />
              </label>
              <label>
                Other info
                <textarea
                  value={otherInfoDraft}
                  onChange={(e) => setOtherInfoDraft(e.target.value)}
                  rows={3}
                />
              </label>
              <label>
                Project
                <select value={projectDraft} onChange={(e) => setProjectDraft(e.target.value)}>
                  <option value="">None — standalone Offsite Location</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="dialog-actions">
                <button type="button" onClick={() => setEditingSite(false)} disabled={savingSite}>
                  Cancel
                </button>
                <button type="button" onClick={handleSaveSite} disabled={savingSite || !nameDraft.trim()}>
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1>{site.name}</h1>
              {site.address && <p className="location-address">{site.address}</p>}
              {site.otherInfo && <p className="location-notes">{site.otherInfo}</p>}
              {permissions.manageLocations && (
                <p className="edit-site-row">
                  <button type="button" onClick={startEditingSite}>
                    Edit
                  </button>
                </p>
              )}
            </>
          )}
        </div>
        <div className="locked-image-box">
          <SitePhotoPicker
            photo={site.sitePhoto}
            alt={`${site.name} site photo`}
            onSelect={handleSitePhotoSelected}
            onRemove={handleSitePhotoRemoved}
          />
          <p className="project-images-link">
            <Link to={`/locations/${site.id}/project-images`}>View project images</Link>
          </p>
        </div>
      </div>

      <p className="add-item-row">
        {permissions.addItems && (
          <Link to={`/locations/${site.id}/items/new`}>
            <button type="button">+ Add item</button>
          </Link>
        )}
        {hasItems && (
          <button type="button" onClick={handleExport} className="export-button">
            Export to Excel
          </button>
        )}
        {permissions.addItems && (
          <button type="button" onClick={() => importFileInputRef.current?.click()}>
            Import Data
          </button>
        )}
        <input
          ref={importFileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="photo-file-input"
          onChange={handleImportFileSelected}
        />
      </p>

      {importParsing && <p className="placeholder-note">Reading {importFileName}…</p>}

      {importParseError && <p className="field-error">{importParseError}</p>}

      {importResultMessage && <p className="placeholder-note">{importResultMessage}</p>}

      {importPreview && (
        <div className="import-preview">
          <p>
            Ready to import from <strong>{importFileName}</strong>:
          </p>
          <ul>
            <li>{importPreview.uprights.length} Uprights</li>
            <li>{importPreview.beams.length} Beams</li>
            <li>{importPreview.wireDecks.length} Wire Decks</li>
          </ul>
          {importPreview.otherSkipped > 0 && (
            <p className="placeholder-note">
              {importPreview.otherSkipped} row{importPreview.otherSkipped === 1 ? '' : 's'} for other item
              types (not supported yet) will be skipped.
            </p>
          )}
          {importFlaggedCount > 0 && (
            <p className="placeholder-note">
              {importFlaggedCount} row{importFlaggedCount === 1 ? '' : 's'} had a missing quantity or a size
              that couldn't be fully read — they'll still be imported, flagged in their Notes so you can
              review them.
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" onClick={cancelImportPreview} disabled={importCommitting}>
              Cancel
            </button>
            <button type="button" onClick={confirmImport} disabled={importCommitting}>
              {importCommitting ? 'Importing…' : 'Confirm Import'}
            </button>
          </div>
        </div>
      )}

      {bols.length > 0 && (
        <details className="item-section collapsible-section">
          <summary className="collapsible-section-summary">Bills of Lading ({bols.length})</summary>
          <ul className="location-list location-list--compact">
            {bols.map((bol) => (
              <li key={bol.id} className="location-list-row bol-list-row">
                <div className="location-list-info">
                  <Link to={`/locations/${site.id}/bol/${bol.id}`}>
                    {bol.date || 'Undated'}
                    {bol.loadNumber ? ` — Load #${bol.loadNumber}` : ''}
                    {bol.direction === 'outbound' ? ` to ${bol.shipToCompany}` : ` from ${bol.shipFromCompany}`}
                  </Link>
                </div>
                {permissions.generateBillOfLading && (
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => setDeletingBolId(bol.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {customerSheets.length > 0 && (
        <details className="item-section collapsible-section">
          <summary className="collapsible-section-summary">Customer Sheets ({customerSheets.length})</summary>
          <ul className="location-list location-list--compact">
            {customerSheets.map((sheet) => (
              <li key={sheet.id} className="location-list-row bol-list-row">
                <div className="location-list-info">
                  <Link to={`/locations/${site.id}/customer-sheet/${sheet.id}`}>
                    {sheet.date || 'Undated'}
                    {sheet.customerName ? ` — ${sheet.customerName}` : ''}
                    {sheet.customerCompany ? ` (${sheet.customerCompany})` : ''}
                  </Link>
                </div>
                {permissions.generateCustomerSheet && (
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => setDeletingCustomerSheetId(sheet.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!hasItems && <p className="placeholder-note">No items added yet.</p>}

      {hasItems && (
        <>
          <div ref={toolbarSentinelRef} />
          <div className={`sticky-toolbar${toolbarStuck ? ' sticky-toolbar--stuck' : ''}`}>
          <div className="item-search-row">
            <input
              type="text"
              className="item-search-input"
              placeholder="Search…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="item-section-header-actions">
            {site.lastUpdatedBy && (
              <p className="last-updated-note">
                Last updated by {site.lastUpdatedBy} at{' '}
                {new Date(site.lastUpdatedAt).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}{' '}
                on {new Date(site.lastUpdatedAt).toLocaleDateString()}
              </p>
            )}
            <div className="selection-actions">
              {permissions.generateBillOfLading && (
                selectedItems.length > 0 ? (
                  <Link
                    to={`/locations/${site.id}/bol/new`}
                    state={{ preselected: selectedItems.map((si) => `${si.itemType}:${si.key}`) }}
                  >
                    <button type="button">New BOL</button>
                  </Link>
                ) : (
                  <button type="button" disabled>
                    New BOL
                  </button>
                )
              )}
              {permissions.generateCustomerSheet && (
                selectedItems.length > 0 ? (
                  <Link
                    to={`/locations/${site.id}/customer-sheet/new`}
                    state={{ preselected: selectedItems.map((si) => `${si.itemType}:${si.key}`) }}
                  >
                    <button type="button">Generate PDF</button>
                  </Link>
                ) : (
                  <button type="button" disabled>
                    Generate PDF
                  </button>
                )
              )}
              {permissions.editItems && (
                <>
                  <button
                    type="button"
                    disabled={selectedItems.length !== 1}
                    onClick={() => setActiveAction('edit')}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={selectedItems.length !== 1}
                    onClick={() => setActiveAction('duplicate')}
                  >
                    Duplicate
                  </button>
                </>
              )}
              {permissions.deleteItems && (
                <button
                  type="button"
                  className="delete-button"
                  disabled={selectedItems.length === 0}
                  onClick={() => setActiveAction('delete')}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
          </div>
        </>
      )}

      {uprightRows.length > 0 && (
        <section className="item-section">
          <h2>Uprights</h2>
          <UprightTable
            rows={displayedUprightRows}
            siteId={site.id}
            selectedKeys={selectedUprightKeys}
            onToggleSelect={(row) => toggleSelect('upright', row)}
          />
        </section>
      )}

      {beamRows.length > 0 && (
        <section className="item-section">
          <h2>Beams</h2>
          <BeamTable
            rows={displayedBeamRows}
            siteId={site.id}
            selectedKeys={selectedBeamKeys}
            onToggleSelect={(row) => toggleSelect('beam', row)}
          />
        </section>
      )}

      {wireDeckRows.length > 0 && (
        <section className="item-section">
          <h2>Wire Decks</h2>
          <WireDeckTable
            rows={displayedWireDeckRows}
            siteId={site.id}
            selectedKeys={selectedWireDeckKeys}
            onToggleSelect={(row) => toggleSelect('wireDeck', row)}
            searchActive={!!normalizedSearch}
          />
        </section>
      )}

      {miscRows.length > 0 && (
        <section className="item-section">
          <h2>Other</h2>
          <MiscItemTable
            rows={displayedMiscRows}
            siteId={site.id}
            selectedKeys={selectedMiscKeys}
            onToggleSelect={(row) => toggleSelect('misc', row)}
          />
        </section>
      )}

      {singleSelected?.itemType === 'upright' && (activeAction === 'edit' || activeAction === 'duplicate') && (
        <EditUprightDialog
          row={singleSelected.row as UprightRow}
          siteId={site.id}
          mode={activeAction}
          onClose={closeAction}
        />
      )}
      {singleSelected?.itemType === 'beam' && (activeAction === 'edit' || activeAction === 'duplicate') && (
        <EditBeamDialog
          row={singleSelected.row as BeamRow}
          siteId={site.id}
          mode={activeAction}
          onClose={closeAction}
        />
      )}
      {singleSelected?.itemType === 'wireDeck' && (activeAction === 'edit' || activeAction === 'duplicate') && (
        <EditWireDeckDialog
          row={singleSelected.row as WireDeckRow}
          siteId={site.id}
          mode={activeAction}
          onClose={closeAction}
        />
      )}
      {singleSelected?.itemType === 'misc' && (activeAction === 'edit' || activeAction === 'duplicate') && (
        <EditMiscItemDialog
          row={singleSelected.row as MiscItemRow}
          siteId={site.id}
          mode={activeAction}
          onClose={closeAction}
        />
      )}
      {selectedItems.length > 0 && activeAction === 'delete' && (
        <ConfirmDeleteDialog onConfirm={handleConfirmDelete} onClose={closeAction} />
      )}
      {deletingBolId && (
        <ConfirmDeleteDialog onConfirm={handleConfirmDeleteBol} onClose={() => setDeletingBolId(null)} />
      )}
      {deletingCustomerSheetId && (
        <ConfirmDeleteDialog
          onConfirm={handleConfirmDeleteCustomerSheet}
          onClose={() => setDeletingCustomerSheetId(null)}
        />
      )}
    </main>
  )
}
