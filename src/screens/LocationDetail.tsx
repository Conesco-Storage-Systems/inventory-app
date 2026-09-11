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
import { removeSitePhoto, setSitePhoto, updateSite } from '../db/locations'
import { exportSheetsToExcel } from '../export/exportToExcel'
import { parseInventoryWorkbook, type ImportParseResult } from '../import/parseInventoryImport'

// Strips inch marks and all whitespace so formatting differences (4" x 96", 4 x 96,
// 4x96) don't stop a dimension search like "4x96" from matching.
function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/["″]/g, '').replace(/\s+/g, '')
}

const DIMENSION_PATTERN = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/

function matchesSearch<T extends object>(row: T, term: string): boolean {
  return Object.entries(row).some(([key, value]) => {
    if (key === 'key' || key === 'ids' || key === 'photoIds') return false
    const text = normalizeForSearch(Array.isArray(value) ? value.join(' ') : String(value))
    if (text.includes(term)) return true

    // A field like "57 x 44" should also match a partially-typed "44 x 5" search,
    // so compare against the numbers swapped too — not just once fully typed.
    const dimensionMatch = text.match(DIMENSION_PATTERN)
    if (dimensionMatch) {
      const [, a, b] = dimensionMatch
      if (`${b}x${a}`.includes(term)) return true
    }
    return false
  })
}

type ItemKind = 'upright' | 'beam' | 'wireDeck' | 'misc'

interface SelectedItem {
  itemType: ItemKind
  key: string
  row: UprightRow | BeamRow | WireDeckRow | MiscItemRow
}

export default function LocationDetail() {
  const { siteId } = useParams<{ siteId: string }>()
  const site = useLiveQuery(() => (siteId ? db.sites.get(siteId) : undefined), [siteId])
  const uprights = useLiveQuery(() => (siteId ? listUprightsBySite(siteId) : []), [siteId]) ?? []
  const beams = useLiveQuery(() => (siteId ? listBeamsBySite(siteId) : []), [siteId]) ?? []
  const wireDecks = useLiveQuery(() => (siteId ? listWireDecksBySite(siteId) : []), [siteId]) ?? []
  const miscItems = useLiveQuery(() => (siteId ? listMiscItemsBySite(siteId) : []), [siteId]) ?? []

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
  const [savingSite, setSavingSite] = useState(false)

  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)
  const [activeAction, setActiveAction] = useState<'edit' | 'duplicate' | 'delete' | null>(null)

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
    setSelectedItem((prev) =>
      prev && prev.itemType === itemType && prev.key === row.key ? null : { itemType, key: row.key, row },
    )
  }

  function closeAction() {
    setActiveAction(null)
    setSelectedItem(null)
  }

  async function handleConfirmDelete() {
    if (!selectedItem) return
    if (selectedItem.itemType === 'upright') await deleteUprightGroup(selectedItem.row.ids)
    else if (selectedItem.itemType === 'beam') await deleteBeamGroup(selectedItem.row.ids)
    else if (selectedItem.itemType === 'wireDeck') await deleteWireDeckGroup(selectedItem.row.ids)
    else await deleteMiscItemGroup(selectedItem.row.ids)
  }

  const displayedWireDeckRows = normalizedSearch
    ? wireDeckRows.filter((row) => matchesSearch(row, normalizedSearch))
    : wireDeckRows
  const displayedMiscRows = normalizedSearch
    ? miscRows.filter((row) => matchesSearch(row, normalizedSearch))
    : miscRows

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
    setEditingSite(true)
  }

  async function handleSaveSite() {
    if (!site) return
    setSavingSite(true)
    try {
      await updateSite(site.id, nameDraft, addressDraft, otherInfoDraft)
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
              <p className="edit-site-row">
                <button type="button" onClick={startEditingSite}>
                  Edit
                </button>
              </p>
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
        <Link to={`/locations/${site.id}/items/new`}>
          <button type="button">+ Add item</button>
        </Link>
        {hasItems && (
          <button type="button" onClick={handleExport} className="export-button">
            Export to Excel
          </button>
        )}
        <button type="button" onClick={() => importFileInputRef.current?.click()}>
          Import Data
        </button>
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
              <button type="button" disabled={!selectedItem} onClick={() => setActiveAction('edit')}>
                Edit
              </button>
              <button type="button" disabled={!selectedItem} onClick={() => setActiveAction('duplicate')}>
                Duplicate
              </button>
              <button
                type="button"
                className="delete-button"
                disabled={!selectedItem}
                onClick={() => setActiveAction('delete')}
              >
                Delete
              </button>
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
            selectedKey={selectedItem?.itemType === 'upright' ? selectedItem.key : null}
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
            selectedKey={selectedItem?.itemType === 'beam' ? selectedItem.key : null}
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
            selectedKey={selectedItem?.itemType === 'wireDeck' ? selectedItem.key : null}
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
            selectedKey={selectedItem?.itemType === 'misc' ? selectedItem.key : null}
            onToggleSelect={(row) => toggleSelect('misc', row)}
          />
        </section>
      )}

      {selectedItem?.itemType === 'upright' && (activeAction === 'edit' || activeAction === 'duplicate') && (
        <EditUprightDialog
          row={selectedItem.row as UprightRow}
          siteId={site.id}
          mode={activeAction}
          onClose={closeAction}
        />
      )}
      {selectedItem?.itemType === 'beam' && (activeAction === 'edit' || activeAction === 'duplicate') && (
        <EditBeamDialog
          row={selectedItem.row as BeamRow}
          siteId={site.id}
          mode={activeAction}
          onClose={closeAction}
        />
      )}
      {selectedItem?.itemType === 'wireDeck' && (activeAction === 'edit' || activeAction === 'duplicate') && (
        <EditWireDeckDialog
          row={selectedItem.row as WireDeckRow}
          siteId={site.id}
          mode={activeAction}
          onClose={closeAction}
        />
      )}
      {selectedItem?.itemType === 'misc' && (activeAction === 'edit' || activeAction === 'duplicate') && (
        <EditMiscItemDialog
          row={selectedItem.row as MiscItemRow}
          siteId={site.id}
          mode={activeAction}
          onClose={closeAction}
        />
      )}
      {selectedItem && activeAction === 'delete' && (
        <ConfirmDeleteDialog onConfirm={handleConfirmDelete} onClose={closeAction} />
      )}
    </main>
  )
}
