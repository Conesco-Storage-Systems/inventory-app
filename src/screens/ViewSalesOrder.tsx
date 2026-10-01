import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import ScheduleShipmentDialog from '../components/ScheduleShipmentDialog'
import { db } from '../db/db'
import {
  deleteTiedSalesOrder,
  getSalesOrderSchedule,
  listTiedLineItemsBySoNumberAndSite,
  sumShippedQuantity,
} from '../db/salesOrders'
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
  const shippedByLineItem = new Map(
    lineItems.map((li) => [li.id, sumShippedQuantity([li.id], siteBols).qty]),
  )
  const hasRemainingToShip = lineItems.some(
    (li) => li.quantityOrdered - (shippedByLineItem.get(li.id) ?? 0) > 0,
  )
  // Already shipped (even partially) means some of the deducted inventory
  // is actually gone, not just reserved — deleting at that point would
  // incorrectly hand all of it back, so the delete option is withheld once
  // any quantity has shipped for this SO.
  const isShipped = lineItems.some((li) => (shippedByLineItem.get(li.id) ?? 0) > 0)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Every shipped BOL generated from this Sales Order at this location, so
  // any of them can be opened again later — not just the most recent one,
  // since a partially shipped order can end up with more than one. A BOL
  // still in draft (not yet signed/marked shipped) doesn't show here.
  const relatedBols = (soNumber ? siteBols.filter((b) => b.sourceSoNumbers.includes(soNumber) && b.shippedAt > 0) : [])
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)

  // An individual Sales Order always backs out to the Sales Orders
  // dashboard, regardless of how it was reached (the app-wide list, or a
  // location's own Sales Orders section) — it's never "owned" by one
  // location's page.
  const backTo = '/sales-orders'
  const backLabel = 'Sales Orders'

  async function handleDeleteSo() {
    if (!siteId || !soNumber) return
    await deleteTiedSalesOrder(soNumber, siteId)
    navigate(backTo)
  }

  function handleGenerateBol() {
    if (!siteId || !soNumber) return
    const soLineItems: SoLineItemForBol[] = lineItems
      .map((li) => ({
        id: li.id,
        soNumber: li.soNumber,
        item: li.tiedItemType ? ITEM_TYPE_LABELS[li.tiedItemType] : '',
        description: li.tiedDescription,
        qty: li.quantityOrdered - (shippedByLineItem.get(li.id) ?? 0),
      }))
      .filter((li) => li.qty > 0)
    navigate(`/locations/${siteId}/bol/new`, {
      state: { soLineItems, backTo: routerLocation.pathname, backLabel: `Sales Order ${formatSoNumber(soNumber)}` },
    })
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
              <button type="button" onClick={handleGenerateBol} disabled={!hasRemainingToShip}>
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
        <p className="placeholder-note">
          This Sales Order already has shipped quantity against it, so it can't be deleted.
        </p>
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
                <th>Qty Ordered</th>
                <th>Shipped</th>
                <th>Remaining</th>
                <th>Tied To</th>
                <th>Tied Date</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => {
                const shipped = shippedByLineItem.get(li.id) ?? 0
                return (
                  <tr key={li.id}>
                    <td>{li.warehouseCode}</td>
                    <td>{li.description}</td>
                    <td>{li.quantityOrdered}</td>
                    <td>{shipped}</td>
                    <td>{li.quantityOrdered - shipped}</td>
                    <td>{li.tiedDescription}</td>
                    <td>{li.tiedAt ? new Date(li.tiedAt).toLocaleDateString() : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {relatedBols.length > 0 && (
        <section className="item-section">
          <h2>Bills of Lading</h2>
          <ul className="location-list location-list--compact">
            {relatedBols.map((bol) => (
              <li key={bol.id} className="location-list-row">
                <div className="location-list-info">
                  <Link
                    to={`/locations/${siteId}/bol/${bol.id}`}
                    state={{ backTo: routerLocation.pathname, backLabel: `Sales Order ${formatSoNumber(soNumber ?? '')}` }}
                  >
                    {bol.loadNumber ? `Load ${bol.loadNumber}` : 'View BOL'} — {bol.date || 'no date'} — Shipped{' '}
                    {new Date(bol.shippedAt).toLocaleDateString()}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
