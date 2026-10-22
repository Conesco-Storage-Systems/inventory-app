import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import { deleteInventoryTransfer, getInventoryTransfer } from '../db/inventoryTransfers'
import {
  BEAM_EXPORT_COLUMNS,
  MISC_EXPORT_COLUMNS,
  UPRIGHT_EXPORT_COLUMNS,
  WIRE_DECK_EXPORT_COLUMNS,
} from '../export/inventoryExportRows'
import type { InventoryTransferLineItem, ItemType } from '../models/types'
import { useRole } from '../state/RoleContext'

function displayValue(value: string | number | undefined): string | number {
  return value === undefined || value === '' ? '—' : value
}

// One item type's slice of the transfer, broken out into its own section
// with just the columns that type actually has — same as the location's
// own inventory sheet, instead of one table mixing every item type's
// columns together.
const SECTION_CONFIG: { itemType: ItemType; title: string; columns: string[] }[] = [
  { itemType: 'upright', title: 'Uprights', columns: UPRIGHT_EXPORT_COLUMNS },
  { itemType: 'beam', title: 'Beams', columns: BEAM_EXPORT_COLUMNS },
  { itemType: 'wireDeck', title: 'Wire Decks', columns: WIRE_DECK_EXPORT_COLUMNS },
  { itemType: 'misc', title: 'Other', columns: MISC_EXPORT_COLUMNS },
]

function LineItemSection({
  title,
  columns,
  items,
}: {
  title: string
  columns: string[]
  items: InventoryTransferLineItem[]
}) {
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
            {items.map((li, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col}>{displayValue(li.fields?.[col])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function ViewInventoryTransfer() {
  const { permissions } = useRole()
  const navigate = useNavigate()
  const { transferId } = useParams<{ transferId: string }>()
  const transfer = useLiveQuery(() => (transferId ? getInventoryTransfer(transferId) : undefined), [transferId])
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function handleDelete() {
    if (!transferId) return
    await deleteInventoryTransfer(transferId)
    navigate('/sales-orders')
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

  if (transfer === undefined) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    )
  }

  if (!transfer) {
    return (
      <main className="page">
        <p>
          <Link to="/sales-orders">← Back</Link>
        </p>
        <p>Transfer not found.</p>
      </main>
    )
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to="/sales-orders">← Back</Link>
      </p>
      <h1>Inventory Transfer</h1>
      <p>
        <strong>{transfer.fromSiteName}</strong> → <strong>{transfer.toSiteName}</strong> on{' '}
        {new Date(`${transfer.scheduledDate}T00:00:00`).toLocaleDateString()}
      </p>
      <p className="placeholder-note">
        Confirmed by {transfer.createdBy || 'Unknown'} on {new Date(transfer.createdAt).toLocaleDateString()}
      </p>

      {permissions.manageSalesOrders && (
        <p>
          <button type="button" className="delete-button" onClick={() => setConfirmingDelete(true)}>
            Delete Transfer
          </button>
        </p>
      )}

      {SECTION_CONFIG.map((cfg) => (
        <LineItemSection
          key={cfg.itemType}
          title={cfg.title}
          columns={cfg.columns}
          items={transfer.lineItems.filter((li) => li.itemType === cfg.itemType)}
        />
      ))}

      {confirmingDelete && (
        <ConfirmDeleteDialog
          onConfirm={handleDelete}
          onClose={() => setConfirmingDelete(false)}
          message="Delete this transfer? Every item it moved will be sent back to its original location."
          confirmLabel="Delete Transfer"
          confirmingLabel="Deleting…"
        />
      )}
    </main>
  )
}
