import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BeamTable from '../components/BeamTable'
import MiscItemTable from '../components/MiscItemTable'
import UprightTable from '../components/UprightTable'
import WireDeckTable from '../components/WireDeckTable'
import { db } from '../db/db'
import { groupBeams, type BeamRow } from '../db/groupBeams'
import { groupMiscItems, type MiscItemRow } from '../db/groupMiscItems'
import { groupUprights, type UprightRow } from '../db/groupUprights'
import { groupWireDecks, type WireDeckRow } from '../db/groupWireDecks'
import { createInventoryTransfer } from '../db/inventoryTransfers'
import { listBeamsBySite, listMiscItemsBySite, listUprightsBySite, listWireDecksBySite } from '../db/items'
import {
  BEAM_EXPORT_COLUMNS,
  beamExportRow,
  MISC_EXPORT_COLUMNS,
  miscExportRow,
  UPRIGHT_EXPORT_COLUMNS,
  uprightExportRow,
  WIRE_DECK_EXPORT_COLUMNS,
  wireDeckExportRow,
  type InventoryExportRow,
} from '../export/inventoryExportRows'
import type { InventoryTransferLineItem, ItemType } from '../models/types'
import { useRole } from '../state/RoleContext'

type ItemKind = 'upright' | 'beam' | 'wireDeck' | 'misc'

interface SelectedItem {
  itemType: ItemKind
  key: string
  row: UprightRow | BeamRow | WireDeckRow | MiscItemRow
}

function exportRowFor(item: SelectedItem): InventoryExportRow {
  switch (item.itemType) {
    case 'beam':
      return beamExportRow(item.row as BeamRow)
    case 'upright':
      return uprightExportRow(item.row as UprightRow)
    case 'wireDeck':
      return wireDeckExportRow(item.row as WireDeckRow)
    case 'misc':
      return miscExportRow(item.row as MiscItemRow)
  }
}

function displayValue(value: string | number): string | number {
  return value === '' ? '—' : value
}

// One item type's slice of the selection, broken out into its own section
// with just the columns that type actually has — same as the location's
// own inventory sheet, instead of one table mixing every item type's
// columns together.
function LineItemSection({ title, columns, items }: { title: string; columns: string[]; items: SelectedItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="item-section">
      <h2>{title}</h2>
      <div className="item-table-wrap">
        <table className="item-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const row = exportRowFor(item)
              return (
                <tr key={`${item.itemType}:${item.key}`}>
                  {columns.map((col) => (
                    <td key={col}>{displayValue(row[col])}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const ITEM_KIND_TO_TYPE: Record<ItemKind, ItemType> = {
  upright: 'upright',
  beam: 'beam',
  wireDeck: 'wireDeck',
  misc: 'misc',
}

export default function CreateInventoryTransfer() {
  const { permissions } = useRole()
  const navigate = useNavigate()
  const sites = useLiveQuery(() => db.sites.toArray(), []) ?? []
  const activeSites = sites.filter((site) => site.active !== false && !site.deletedAt)

  const [fromSiteId, setFromSiteId] = useState('')
  const [toSiteId, setToSiteId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [step, setStep] = useState<'select' | 'confirm'>('select')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uprights = useLiveQuery(() => (fromSiteId ? listUprightsBySite(fromSiteId) : []), [fromSiteId]) ?? []
  const beams = useLiveQuery(() => (fromSiteId ? listBeamsBySite(fromSiteId) : []), [fromSiteId]) ?? []
  const wireDecks = useLiveQuery(() => (fromSiteId ? listWireDecksBySite(fromSiteId) : []), [fromSiteId]) ?? []
  const miscItems = useLiveQuery(() => (fromSiteId ? listMiscItemsBySite(fromSiteId) : []), [fromSiteId]) ?? []

  // Same grouping, same "quantity > 0" filter as the location's own
  // inventory sheet — a fully-allocated row has nothing left to transfer.
  const uprightRows = groupUprights(uprights).filter((row) => row.quantity > 0)
  const beamRows = groupBeams(beams).filter((row) => row.quantity > 0)
  const wireDeckRows = groupWireDecks(wireDecks).filter((row) => row.quantity > 0)
  const miscRows = groupMiscItems(miscItems).filter((row) => row.quantity > 0)
  const hasItems = uprightRows.length > 0 || beamRows.length > 0 || wireDeckRows.length > 0 || miscRows.length > 0

  const fromSite = activeSites.find((s) => s.id === fromSiteId)
  const toSite = activeSites.find((s) => s.id === toSiteId)
  const canInitiate = Boolean(
    fromSiteId && toSiteId && fromSiteId !== toSiteId && scheduledDate && selectedItems.length > 0,
  )

  function toggleSelect(itemType: ItemKind, row: UprightRow | BeamRow | WireDeckRow | MiscItemRow) {
    setSelectedItems((prev) => {
      const exists = prev.some((si) => si.itemType === itemType && si.key === row.key)
      if (exists) return prev.filter((si) => !(si.itemType === itemType && si.key === row.key))
      return [...prev, { itemType, key: row.key, row }]
    })
  }

  const selectedUprightKeys = new Set(selectedItems.filter((si) => si.itemType === 'upright').map((si) => si.key))
  const selectedBeamKeys = new Set(selectedItems.filter((si) => si.itemType === 'beam').map((si) => si.key))
  const selectedWireDeckKeys = new Set(selectedItems.filter((si) => si.itemType === 'wireDeck').map((si) => si.key))
  const selectedMiscKeys = new Set(selectedItems.filter((si) => si.itemType === 'misc').map((si) => si.key))

  function handleFromSiteChange(siteId: string) {
    setFromSiteId(siteId)
    setSelectedItems([])
  }

  async function handleConfirm() {
    if (!fromSite || !toSite) return
    setSaving(true)
    setError(null)
    try {
      const lineItems: InventoryTransferLineItem[] = selectedItems.map((item) => ({
        itemType: ITEM_KIND_TO_TYPE[item.itemType],
        itemIds: item.row.ids,
        quantity: item.row.quantity,
        fields: exportRowFor(item),
      }))
      const id = await createInventoryTransfer({
        fromSiteId: fromSite.id,
        fromSiteName: fromSite.name,
        toSiteId: toSite.id,
        toSiteName: toSite.name,
        scheduledDate,
        lineItems,
      })
      navigate(`/inventory-transfers/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong transferring this inventory.')
      setSaving(false)
    }
  }

  if (!permissions.viewProcurementDashboard) {
    return (
      <main className="page">
        <p>
          <Link to="/sales-orders">← Back</Link>
        </p>
        <p>Your role doesn't have permission to view this page.</p>
      </main>
    )
  }

  if (step === 'confirm' && fromSite && toSite) {
    return (
      <main className="page page-wide">
        <p>
          <button type="button" className="link-button" onClick={() => setStep('select')}>
            ← Back
          </button>
        </p>
        <h1>Confirm Inventory Transfer</h1>
        <p>
          <strong>{fromSite.name}</strong> → <strong>{toSite.name}</strong> on{' '}
          {new Date(`${scheduledDate}T00:00:00`).toLocaleDateString()}
        </p>

        <LineItemSection
          title="Uprights"
          columns={UPRIGHT_EXPORT_COLUMNS}
          items={selectedItems.filter((item) => item.itemType === 'upright')}
        />
        <LineItemSection
          title="Beams"
          columns={BEAM_EXPORT_COLUMNS}
          items={selectedItems.filter((item) => item.itemType === 'beam')}
        />
        <LineItemSection
          title="Wire Decks"
          columns={WIRE_DECK_EXPORT_COLUMNS}
          items={selectedItems.filter((item) => item.itemType === 'wireDeck')}
        />
        <LineItemSection
          title="Other"
          columns={MISC_EXPORT_COLUMNS}
          items={selectedItems.filter((item) => item.itemType === 'misc')}
        />

        {error && <p className="field-error">{error}</p>}

        <div className="dialog-actions">
          <button type="button" onClick={() => setStep('select')} disabled={saving}>
            Back
          </button>
          <button type="button" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Confirming…' : 'Confirm Transfer'}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to="/sales-orders">← Back</Link>
      </p>
      <h1>Create Inventory Transfer</h1>

      <div className="field-row">
        <label>
          From Location
          <select value={fromSiteId} onChange={(e) => handleFromSiteChange(e.target.value)}>
            <option value="">Select a location…</option>
            {activeSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          To Location
          <select value={toSiteId} onChange={(e) => setToSiteId(e.target.value)}>
            <option value="">Select a location…</option>
            {activeSites
              .filter((site) => site.id !== fromSiteId)
              .map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Scheduled Date
          <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        </label>
      </div>

      {fromSiteId && !hasItems && <p className="placeholder-note">No inventory is available at this location yet.</p>}

      {uprightRows.length > 0 && (
        <section className="item-section">
          <h2>Uprights</h2>
          <UprightTable
            rows={uprightRows}
            siteId={fromSiteId}
            selectedKeys={selectedUprightKeys}
            onToggleSelect={(row) => toggleSelect('upright', row)}
          />
        </section>
      )}

      {beamRows.length > 0 && (
        <section className="item-section">
          <h2>Beams</h2>
          <BeamTable
            rows={beamRows}
            siteId={fromSiteId}
            selectedKeys={selectedBeamKeys}
            onToggleSelect={(row) => toggleSelect('beam', row)}
          />
        </section>
      )}

      {wireDeckRows.length > 0 && (
        <section className="item-section">
          <h2>Wire Decks</h2>
          <WireDeckTable
            rows={wireDeckRows}
            siteId={fromSiteId}
            selectedKeys={selectedWireDeckKeys}
            onToggleSelect={(row) => toggleSelect('wireDeck', row)}
            searchActive={false}
          />
        </section>
      )}

      {miscRows.length > 0 && (
        <section className="item-section">
          <h2>Other</h2>
          <MiscItemTable
            rows={miscRows}
            siteId={fromSiteId}
            selectedKeys={selectedMiscKeys}
            onToggleSelect={(row) => toggleSelect('misc', row)}
          />
        </section>
      )}

      <div className="dialog-actions">
        <button type="button" onClick={() => setStep('confirm')} disabled={!canInitiate}>
          Initiate Transfer
        </button>
      </div>
    </main>
  )
}
