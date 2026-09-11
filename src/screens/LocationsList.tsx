import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import AddLocationDialog from '../components/AddLocationDialog'
import DeleteLocationDialog from '../components/DeleteLocationDialog'
import MarkInactiveDialog from '../components/MarkInactiveDialog'

export default function LocationsList() {
  const navigate = useNavigate()
  const sites = useLiveQuery(() => db.sites.orderBy('name').toArray(), []) ?? []
  const activeSites = sites.filter((site) => site.active !== false && !site.deletedAt)
  const [deletingSite, setDeletingSite] = useState<{ id: string; name: string } | null>(null)
  const [markingInactiveSiteId, setMarkingInactiveSiteId] = useState<string | null>(null)

  return (
    <main className="page">
      <div className="page-header">
        <h1>Locations</h1>
        <AddLocationDialog onCreated={(siteId) => navigate(`/locations/${siteId}`)} />
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
              <div className="location-list-actions">
                <button type="button" onClick={() => setMarkingInactiveSiteId(site.id)}>
                  Mark as Inactive
                </button>
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => setDeletingSite({ id: site.id, name: site.name })}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="inactive-offsites-link">
        <Link to="/inactive-locations">Inactive Offsites</Link>
        {' · '}
        <Link to="/recently-deleted">Recently Deleted</Link>
      </p>

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
