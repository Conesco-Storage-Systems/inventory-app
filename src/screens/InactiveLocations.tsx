import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import DeleteLocationDialog from '../components/DeleteLocationDialog'
import MarkActiveDialog from '../components/MarkActiveDialog'

export default function InactiveLocations() {
  const sites = useLiveQuery(() => db.sites.orderBy('name').toArray(), []) ?? []
  const inactiveSites = sites.filter((site) => site.active === false && !site.deletedAt)
  const [deletingSite, setDeletingSite] = useState<{ id: string; name: string } | null>(null)
  const [markingActiveSiteId, setMarkingActiveSiteId] = useState<string | null>(null)

  return (
    <main className="page">
      <p>
        <Link to="/">← Locations</Link>
      </p>
      <h1>Inactive Offsites</h1>

      {inactiveSites.length === 0 ? (
        <p>No inactive locations.</p>
      ) : (
        <ul className="location-list">
          {inactiveSites.map((site) => (
            <li key={site.id} className="location-list-row">
              <div className="location-list-info">
                <Link to={`/locations/${site.id}`}>{site.name}</Link>
                {site.address && <span className="location-address"> — {site.address}</span>}
              </div>
              <div className="location-list-actions">
                <button type="button" onClick={() => setMarkingActiveSiteId(site.id)}>
                  Mark as Active
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

      {deletingSite && (
        <DeleteLocationDialog
          siteId={deletingSite.id}
          siteName={deletingSite.name}
          onClose={() => setDeletingSite(null)}
          onDeleted={() => setDeletingSite(null)}
        />
      )}

      {markingActiveSiteId && (
        <MarkActiveDialog
          siteId={markingActiveSiteId}
          onClose={() => setMarkingActiveSiteId(null)}
          onDone={() => setMarkingActiveSiteId(null)}
        />
      )}
    </main>
  )
}
