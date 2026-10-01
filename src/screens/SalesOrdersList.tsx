import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { sumShippedQuantity } from '../db/salesOrders'
import type { BillOfLading, SalesOrderLineItem, SalesOrderSchedule } from '../models/types'
import { useRole } from '../state/RoleContext'
import { formatSoNumber } from '../utils/soNumber'

interface SalesOrderGroup {
  soNumber: string
  siteId: string
  siteName: string
  latestTiedAt: number
  lineItemIds: string[]
  totalOrderedQty: number
}

type Bucket = 'shipped' | 'partiallyShipped' | 'scheduled' | 'notScheduled'

interface ClassifiedGroup extends SalesOrderGroup {
  bucket: Bucket
  // What the date column shows for this row — meaning depends on the
  // bucket (shipped date / scheduled ship date / last tied date).
  displayDate: number | null
}

// One row per (Sales Order #, location) pair — the same order can span
// more than one location (different line items tied to different
// warehouses), so it's grouped this way rather than one row per SO,
// sorted by location first so everything from the same site clusters
// together.
function groupBySoAndSite(lineItems: SalesOrderLineItem[]): SalesOrderGroup[] {
  const map = new Map<string, SalesOrderGroup>()
  for (const li of lineItems) {
    const key = `${li.soNumber}|${li.tiedSiteId}`
    const existing = map.get(key)
    if (existing) {
      existing.latestTiedAt = Math.max(existing.latestTiedAt, li.tiedAt)
      existing.lineItemIds.push(li.id)
      existing.totalOrderedQty += li.quantityOrdered
    } else {
      map.set(key, {
        soNumber: li.soNumber,
        siteId: li.tiedSiteId,
        siteName: li.tiedSiteName,
        latestTiedAt: li.tiedAt,
        lineItemIds: [li.id],
        totalOrderedQty: li.quantityOrdered,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const bySite = a.siteName.localeCompare(b.siteName)
    if (bySite !== 0) return bySite
    return b.latestTiedAt - a.latestTiedAt
  })
}

// Shipped: every unit tied to this (SO, location) pair has shipped on one
// or more signed BOLs. Partially Shipped: some of it has, but not all —
// e.g. 150 of 300 beams went out on a BOL while the rest are still here.
// Scheduled: has a planned ship date set via Schedule Shipment — a BOL in
// progress but not yet shipped isn't enough on its own. Not yet Scheduled:
// neither.
function classify(group: SalesOrderGroup, bols: BillOfLading[], schedules: SalesOrderSchedule[]): ClassifiedGroup {
  const { qty: shippedQty, lastShippedAt } = sumShippedQuantity(group.lineItemIds, bols)
  if (shippedQty > 0 && group.totalOrderedQty > 0) {
    if (shippedQty >= group.totalOrderedQty) {
      return { ...group, bucket: 'shipped', displayDate: lastShippedAt }
    }
    return { ...group, bucket: 'partiallyShipped', displayDate: lastShippedAt }
  }

  const schedule = schedules.find((s) => s.soNumber === group.soNumber && s.siteId === group.siteId)
  if (schedule) {
    return {
      ...group,
      bucket: 'scheduled',
      displayDate: new Date(`${schedule.scheduledShipDate}T00:00:00`).getTime(),
    }
  }

  return { ...group, bucket: 'notScheduled', displayDate: group.latestTiedAt }
}

function SalesOrderSection({ title, groups }: { title: string; groups: ClassifiedGroup[] }) {
  return (
    <section className="item-section">
      <h2>{title}</h2>
      {groups.length === 0 ? (
        <p className="placeholder-note">None yet.</p>
      ) : (
        <ul className="sales-order-list">
          {groups.map((group) => (
            <li key={`${group.soNumber}|${group.siteId}`} className="sales-order-row">
              <Link to={`/locations/${group.siteId}/sales-orders/${encodeURIComponent(group.soNumber)}`}>
                {formatSoNumber(group.soNumber)}
              </Link>
              <span className="sales-order-row-location">{group.siteName}</span>
              <span className="sales-order-row-date">
                {group.displayDate ? new Date(group.displayDate).toLocaleDateString() : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function SalesOrdersList() {
  const { permissions } = useRole()
  const sites = useLiveQuery(() => db.sites.toArray(), []) ?? []
  const activeSiteIds = new Set(
    sites.filter((site) => site.active !== false && !site.deletedAt).map((site) => site.id),
  )
  const tiedLineItems =
    (useLiveQuery(() => db.salesOrderLineItems.where('status').equals('tied').toArray(), []) ?? []).filter((li) =>
      activeSiteIds.has(li.tiedSiteId),
    )
  const bols = useLiveQuery(() => db.billsOfLading.toArray(), []) ?? []
  const schedules = useLiveQuery(() => db.salesOrderSchedules.toArray(), []) ?? []

  const classified = groupBySoAndSite(tiedLineItems).map((group) => classify(group, bols, schedules))
  const shipped = classified.filter((g) => g.bucket === 'shipped')
  const partiallyShipped = classified.filter((g) => g.bucket === 'partiallyShipped')
  const scheduled = classified.filter((g) => g.bucket === 'scheduled')
  const notScheduled = classified.filter((g) => g.bucket === 'notScheduled')

  if (!permissions.viewProcurementDashboard) {
    return (
      <main className="page">
        <p>
          <Link to="/">← Back</Link>
        </p>
        <p>Your role doesn't have permission to view this page.</p>
      </main>
    )
  }

  return (
    <main className="page">
      <p>
        <Link to="/">← Back</Link>
      </p>
      <h1>Sales Orders</h1>

      {classified.length === 0 ? (
        <p className="placeholder-note">No Sales Orders have been tied to inventory yet.</p>
      ) : (
        <>
          <SalesOrderSection title="Not yet Scheduled" groups={notScheduled} />
          <SalesOrderSection title="Scheduled" groups={scheduled} />
          <SalesOrderSection title="Partially Shipped" groups={partiallyShipped} />
          <SalesOrderSection title="Shipped" groups={shipped} />
        </>
      )}
    </main>
  )
}
