import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import ScheduleShipmentDialog from '../components/ScheduleShipmentDialog'
import { db } from '../db/db'
import { deleteTiedSalesOrder, getSalesOrderSchedule, listTiedLineItemsBySoNumberAndSite } from '../db/salesOrders'
import type { SoLineItemForBol } from './NewBillOfLading'
import { ITEM_TYPE_LABELS } from '../models/types'
import { useRole } from '../state/RoleContext'
import { formatSoNumber } from '../utils/soNumber'

export default function ViewSalesOrder() {
  const { permissions } = useRole()
  const { siteId, soNumber } = useParams<{ siteId: string; soNumber: string }>()
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const site = useLiveQuery(() => (siteId ? db.sites.get(siteId) : undefined), [siteId])
  const lineItems =
    useLiveQuery(
      () => (siteId && soNumber ? listTiedLineItemsBySoNumberAndSite(soNumber, siteId) : []),
      [siteId, soNumber],
    ) ?? []
  const schedule = useLiveQuery(
    () => (siteId && soNumber ? getSalesOrderSchedule(soNumber, siteId) : undefined),
    [siteId, soNumber],
  )
  const siteBols = useLiveQuery(() => (siteId ? db.billsOfLading.where('siteId').equals(siteId).toArray() : []), [siteId]) ?? []
  // Already shipped means the deducted inventory is actually gone, not just
  // reserved — deleting at that point would incorrectly hand it back, so
  // the delete option is withheld once a signed, shipped BOL covers this SO.
  const isShipped = !!(soNumber && siteBols.some((b) => b.sourceSoNumbers.includes(soNumber) && b.shippedAt > 0))
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Reached either from a location's own Sales Orders list (back goes to
  // that location) or from the app-wide Sales Orders page (back goes
  // there instead) — the caller says which via navigation state.
  const backState = routerLocation.state as { backTo?: string; backLabel?: string } | null
  const backTo = backState?.backTo ?? `/locations/${siteId}`
  const backLabel = backState?.backLabel ?? (site?.name ?? 'location')

  async function handleDeleteSo() {
    if (!siteId || !soNumber) return
    await deleteTiedSalesOrder(soNumber, siteId)
    navigate(backTo)
  }

  function handleGenerateBol() {
    if (!siteId || !soNumber) return
    const soLineItems: SoLineItemForBol[] = lineItems.map((li) => ({
      soNumber: li.soNumber,
      item: li.tiedItemType ? ITEM_TYPE_LABELS[li.tiedItemType] : '',
      description: li.tiedDescription,
      qty: li.quantityOrdered,
    }))
    navigate(`/locations/${siteId}/bol/new`, { state: { soLineItems } })
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to={backTo}>← Back to {backLabel}</Link>
      </p>
      <div className="page-header">
        <h1>Sales Order {soNumber ? formatSoNumber(soNumber) : ''}</h1>
        {siteId && (
          <div className="dialog-actions">
            <ScheduleShipmentDialog
              soNumber={soNumber ?? ''}
              siteId={siteId}
              siteName={site?.name ?? ''}
              currentDate={schedule?.scheduledShipDate ?? ''}
            />
            {permissions.generateBillOfLading && (
              <button type="button" onClick={handleGenerateBol} disabled={lineItems.length === 0}>
                Generate BOL
              </button>
            )}
            {permissions.manageSalesOrders && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={lineItems.length === 0 || isShipped}
              >
                Delete SO
              </button>
            )}
          </div>
        )}
      </div>

      {isShipped && (
        <p className="placeholder-note">This Sales Order has already shipped, so it can't be deleted.</p>
      )}

      {confirmingDelete && (
        <ConfirmDeleteDialog
          onConfirm={handleDeleteSo}
          onClose={() => setConfirmingDelete(false)}
          message="Delete this Sales Order from this location? Its line items will go back to Procurement as pending, and the inventory quantity that was deducted for them will be restored."
        />
      )}

      {schedule?.scheduledShipDate && (
        <p className="placeholder-note">
          Scheduled to ship {new Date(`${schedule.scheduledShipDate}T00:00:00`).toLocaleDateString()}
        </p>
      )}

      {lineItems.length === 0 ? (
        <p className="placeholder-note">No line items from this Sales Order are tied to this location.</p>
      ) : (
        <div className="item-table-wrap">
          <table className="item-table">
            <thead>
              <tr>
                <th>Warehouse Code</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Tied To</th>
                <th>Tied Date</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => (
                <tr key={li.id}>
                  <td>{li.warehouseCode}</td>
                  <td>{li.description}</td>
                  <td>{li.quantityOrdered}</td>
                  <td>{li.tiedDescription}</td>
                  <td>{li.tiedAt ? new Date(li.tiedAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
