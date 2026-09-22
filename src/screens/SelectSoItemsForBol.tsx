import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import { listTiedSalesOrderLineItemsBySite } from '../db/salesOrders'
import { ITEM_TYPE_LABELS } from '../models/types'
import type { SoLineItemForBol } from './NewBillOfLading'
import { useRole } from '../state/RoleContext'

export default function SelectSoItemsForBol() {
  const { permissions } = useRole()
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const site = useLiveQuery(() => (siteId ? db.sites.get(siteId) : undefined), [siteId])
  const lineItems = useLiveQuery(() => (siteId ? listTiedSalesOrderLineItemsBySite(siteId) : []), [siteId]) ?? []
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function handleContinue() {
    const selected = lineItems.filter((li) => selectedIds.includes(li.id))
    const soLineItems: SoLineItemForBol[] = selected.map((li) => ({
      soNumber: li.soNumber,
      item: li.tiedItemType ? ITEM_TYPE_LABELS[li.tiedItemType] : '',
      description: li.tiedDescription,
      qty: li.quantityOrdered,
    }))
    navigate(`/locations/${siteId}/bol/new`, { state: { soLineItems } })
  }

  if (site === undefined) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    )
  }

  if (!site) {
    return (
      <main className="page">
        <p>Location not found.</p>
        <Link to="/">Back to locations</Link>
      </main>
    )
  }

  if (!permissions.generateBillOfLading) {
    return (
      <main className="page">
        <p>
          <Link to={`/locations/${siteId}`}>← Back</Link>
        </p>
        <p>Your role doesn't have permission to generate a Bill of Lading.</p>
      </main>
    )
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to={`/locations/${site.id}`}>← Back</Link>
      </p>
      <h1>Generate a New BOL — {site.name}</h1>
      <p className="placeholder-note">
        Only material tied to a Sales Order can ship. Select which line items are going out on this load — items
        from more than one SO can be combined if the same truck is carrying them.
      </p>

      {lineItems.length === 0 ? (
        <p className="placeholder-note">No Sales Order line items are tied to this location yet.</p>
      ) : (
        <div className="item-table-wrap">
          <table className="item-table">
            <thead>
              <tr>
                <th></th>
                <th>SO #</th>
                <th>Description</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => (
                <tr key={li.id}>
                  <td>
                    <input type="checkbox" checked={selectedIds.includes(li.id)} onChange={() => toggle(li.id)} />
                  </td>
                  <td>{li.soNumber}</td>
                  <td>{li.tiedDescription}</td>
                  <td>{li.quantityOrdered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="dialog-actions">
        <button type="button" onClick={handleContinue} disabled={selectedIds.length === 0}>
          Continue to BOL
        </button>
      </div>
    </main>
  )
}
