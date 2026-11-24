import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BeamTable from '../components/BeamTable'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import MiscItemTable from '../components/MiscItemTable'
import RecountEditBeamDialog from '../components/RecountEditBeamDialog'
import RecountEditMiscItemDialog from '../components/RecountEditMiscItemDialog'
import RecountEditUprightDialog from '../components/RecountEditUprightDialog'
import RecountEditWireDeckDialog from '../components/RecountEditWireDeckDialog'
import UprightTable from '../components/UprightTable'
import WireDeckTable from '../components/WireDeckTable'
import { db } from '../db/db'
import type { BeamRow } from '../db/groupBeams'
import { groupBeams } from '../db/groupBeams'
import type { MiscItemRow } from '../db/groupMiscItems'
import { groupMiscItems } from '../db/groupMiscItems'
import type { UprightRow } from '../db/groupUprights'
import { groupUprights } from '../db/groupUprights'
import type { WireDeckRow } from '../db/groupWireDecks'
import { groupWireDecks } from '../db/groupWireDecks'
import {
  deleteRecountLineItemGroup,
  listRecountLineItems,
  recountLineItemsToBeams,
  recountLineItemsToMiscItems,
  recountLineItemsToUprights,
  recountLineItemsToWireDecks,
} from '../db/recounts'
import { useRole } from '../state/RoleContext'

type ItemKind = 'upright' | 'beam' | 'wireDeck' | 'misc'

interface SelectedItem {
  itemType: ItemKind
  key: string
  row: UprightRow | BeamRow | WireDeckRow | MiscItemRow
}

export default function RecountEntry() {
  const { permissions } = useRole()
  const navigate = useNavigate()
  const { siteId, recountId } = useParams<{ siteId: string; recountId: string }>()

  const site = useLiveQuery(() => (siteId ? db.sites.get(siteId) : undefined), [siteId])
  const recount = useLiveQuery(() => (recountId ? db.recounts.get(recountId) : undefined), [recountId])
  const lineItems = useLiveQuery(() => (recountId ? listRecountLineItems(recountId) : []), [recountId]) ?? []

  const uprightRows = groupUprights(recountLineItemsToUprights(lineItems))
  const beamRows = groupBeams(recountLineItemsToBeams(lineItems))
  const wireDeckRows = groupWireDecks(recountLineItemsToWireDecks(lineItems))
  const miscRows = groupMiscItems(recountLineItemsToMiscItems(lineItems))
  const hasItems = uprightRows.length > 0 || beamRows.length > 0 || wireDeckRows.length > 0 || miscRows.length > 0

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [activeAction, setActiveAction] = useState<'edit' | 'duplicate' | 'delete' | null>(null)

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

  async function handleConfirmDelete() {
    for (const item of selectedItems) {
      await deleteRecountLineItemGroup(item.row.ids)
    }
  }

  const selectedUprightKeys = new Set(selectedItems.filter((si) => si.itemType === 'upright').map((si) => si.key))
  const selectedBeamKeys = new Set(selectedItems.filter((si) => si.itemType === 'beam').map((si) => si.key))
  const selectedWireDeckKeys = new Set(selectedItems.filter((si) => si.itemType === 'wireDeck').map((si) => si.key))
  const selectedMiscKeys = new Set(selectedItems.filter((si) => si.itemType === 'misc').map((si) => si.key))
  const singleSelected = selectedItems.length === 1 ? selectedItems[0] : null

  if (!site || !recount || !recountId || !siteId) {
    return (
      <main className="page">
        <p>
          <Link to={`/locations/${siteId}`}>← Back</Link>
        </p>
      </main>
    )
  }

  if (recount.status !== 'draft') {
    return (
      <main className="page">
        <p>
          <Link to={`/locations/${siteId}`}>← Back</Link>
        </p>
        <p>This recount has already been committed.</p>
        <p>
          <Link to={`/locations/${siteId}/recounts/${recountId}/review`}>View it</Link>
        </p>
      </main>
    )
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to={`/locations/${siteId}`}>← Back to location</Link>
      </p>

      <div className="location-header-row">
        <div className="location-info">
          <h1>Recount — {site.name}</h1>
          {site.address && <p className="location-address">{site.address}</p>}
          {site.otherInfo && <p className="location-notes">{site.otherInfo}</p>}
        </div>
      </div>

      <p className="placeholder-note">
        Count line by line, the same way an initial count is done. Nothing here changes current inventory until you
        review and commit this recount.
      </p>

      <p className="add-item-row">
        {permissions.addItems && (
          <Link to={`/locations/${siteId}/recounts/${recountId}/items/new`}>
            <button type="button">+ Add item</button>
          </Link>
        )}
        {permissions.editItems && (
          <>
            <button type="button" disabled={selectedItems.length !== 1} onClick={() => setActiveAction('edit')}>
              Edit
            </button>
            <button type="button" disabled={selectedItems.length !== 1} onClick={() => setActiveAction('duplicate')}>
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
      </p>

      {!hasItems && <p className="placeholder-note">Nothing counted yet.</p>}

      {uprightRows.length > 0 && (
        <section className="item-section">
          <h2>Uprights</h2>
          <UprightTable
            rows={uprightRows}
            siteId={siteId}
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
            siteId={siteId}
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
            siteId={siteId}
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
            siteId={siteId}
            selectedKeys={selectedMiscKeys}
            onToggleSelect={(row) => toggleSelect('misc', row)}
          />
        </section>
      )}

      {singleSelected?.itemType === 'upright' && (activeAction === 'edit' || activeAction === 'duplicate') && (
        <RecountEditUprightDialog
          row={singleSelected.row as UprightRow}
          recountId={recountId}
          siteId={siteId}
          mode={activeAction}
          onClose={closeAction}
        />
      )}
      {singleSelected?.itemType === 'beam' && (activeAction === 'edit' || activeAction === 'duplicate') && (
        <RecountEditBeamDialog
          row={singleSelected.row as BeamRow}
          recountId={recountId}
          siteId={siteId}
          mode={activeAction}
          onClose={closeAction}
        />
      )}
      {singleSelected?.itemType === 'wireDeck' && (activeAction === 'edit' || activeAction === 'duplicate') && (
        <RecountEditWireDeckDialog
          row={singleSelected.row as WireDeckRow}
          recountId={recountId}
          siteId={siteId}
          mode={activeAction}
          onClose={closeAction}
        />
      )}
      {singleSelected?.itemType === 'misc' && (activeAction === 'edit' || activeAction === 'duplicate') && (
        <RecountEditMiscItemDialog
          row={singleSelected.row as MiscItemRow}
          recountId={recountId}
          siteId={siteId}
          mode={activeAction}
          onClose={closeAction}
        />
      )}
      {selectedItems.length > 0 && activeAction === 'delete' && (
        <ConfirmDeleteDialog onConfirm={handleConfirmDelete} onClose={closeAction} />
      )}

      <div className="save-item-row">
        <button type="button" onClick={() => navigate(`/locations/${siteId}/recounts/${recountId}/review`)}>
          Review &amp; commit
        </button>
      </div>
    </main>
  )
}
