import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import AddLocationDialog from '../components/AddLocationDialog'
import DeleteLocationDialog from '../components/DeleteLocationDialog'
import MarkInactiveDialog from '../components/MarkInactiveDialog'
import { useRole } from '../state/RoleContext'

export default function LocationsList() {
  const { permissions } = useRole()
  const navigate = useNavigate()
  const sites = useLiveQuery(() => db.sites.orderBy('name').toArray(), []) ?? []
  // Project-owned locations live under their project's own page, not here —
  // that material belongs to the customer, not Conesco's sellable stock.
  const activeSites = sites.filter((site) => site.active !== false && !site.deletedAt && !site.projectId)
  const [deletingSite, setDeletingSite] = useState<{ id: string; name: string } | null>(null)
  const [markingInactiveSiteId, setMarkingInactiveSiteId] = useState<string | null>(null)
  const [editingLocations, setEditingLocations] = useState(false)
  const canEditLocations = permissions.manageLocations || permissions.deleteLocations

  return (
    <main className="page page-wide">
      <nav className="tab-nav">
        <div className="tab-nav-tabs">
          {permissions.viewProcurementDashboard && (
            <Link className="tab-nav-link" to="/procurement">
              Procurement
            </Link>
          )}
          {permissions.viewProcurementDashboard && (
            <Link className="tab-nav-link" to="/sales-orders">
              Inventory Management
            </Link>
          )}
          {permissions.viewSalesDashboard && (
            <Link className="tab-nav-link" to="/sales-dashboard">
              Sales Dashboard
            </Link>
          )}
          <Link className="tab-nav-link" to="/projects">
            Project Management
          </Link>
        </div>
        {canEditLocations && (
          <button
            type="button"
            className={`tab-nav-link${editingLocations ? ' tab-nav-link--active' : ''}`}
            onClick={() => setEditingLocations((prev) => !prev)}
          >
            Edit Locations
          </button>
        )}
      </nav>

      <div className="locations-single-column">
        <div className="page-header">
          <h1>Offsite Locations</h1>
          {permissions.manageLocations && (
            <AddLocationDialog onCreated={(siteId) => navigate(`/locations/${siteId}`)} />
          )}
        </div>

        {activeSites.length === 0 ? (
          <p>No locations yet. Add one to get started.</p>
        ) : (
          <ul className="location-list">
            <li className="location-list-row all-inventory-row">
              <div className="location-list-info">
                <Link to="/all-inventory">View all Offsite Inventory</Link>
              </div>
            </li>
            {activeSites.map((site) => (
              <li key={site.id} className="location-list-row">
                <div className="location-list-info">
                  <Link to={`/locations/${site.id}`}>{site.name}</Link>
                </div>
                {editingLocations && canEditLocations && (
                  <div className="location-list-actions">
                    {permissions.manageLocations && (
                      <button type="button" onClick={() => setMarkingInactiveSiteId(site.id)}>
                        Mark as Inactive
                      </button>
                    )}
                    {permissions.deleteLocations && (
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => setDeletingSite({ id: site.id, name: site.name })}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="inactive-offsites-link">
          <Link to="/inactive-locations">Inactive Offsites</Link>
          {' · '}
          <Link to="/recently-deleted">Recently Deleted</Link>
        </p>
      </div>

      {deletingSite && (
        <DeleteLocationDialog
          siteId={deletingSite.id}
          siteName={deletingSite.name}
          onClose={() => setDeletingSite(null)}
          onDeleted={() => setDeletingSite(null)}
        />
      )}

      {markingInactiveSiteId && (
        <MarkInactiveDialog
          siteId={markingInactiveSiteId}
          onClose={() => setMarkingInactiveSiteId(null)}
          onDone={() => setMarkingInactiveSiteId(null)}
        />
      )}
    </main>
  )
}
