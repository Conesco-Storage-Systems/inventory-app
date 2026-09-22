import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import { db } from '../db/db'
import { listTiedLineItemsBySoNumberAndSite } from '../db/salesOrders'

export default function ViewSalesOrder() {
  const { siteId, soNumber } = useParams<{ siteId: string; soNumber: string }>()
  const site = useLiveQuery(() => (siteId ? db.sites.get(siteId) : undefined), [siteId])
  const lineItems =
    useLiveQuery(
      () => (siteId && soNumber ? listTiedLineItemsBySoNumberAndSite(soNumber, siteId) : []),
      [siteId, soNumber],
    ) ?? []

  return (
    <main className="page page-wide">
      <p>
        <Link to={`/locations/${siteId}`}>← Back to {site?.name ?? 'location'}</Link>
      </p>
      <h1>
        Sales Order {soNumber} — {site?.name}
      </h1>

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
