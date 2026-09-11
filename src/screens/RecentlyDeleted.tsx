import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import RestoreSiteDialog from '../components/RestoreSiteDialog'

const RETENTION_DAYS = 60
const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysRemaining(deletedAt: number): number {
  const elapsedDays = Math.floor((Date.now() - deletedAt) / MS_PER_DAY)
  return Math.max(0, RETENTION_DAYS - elapsedDays)
}

export default function RecentlyDeleted() {
  const sites = useLiveQuery(() => db.sites.orderBy('name').toArray(), []) ?? []
  const deletedSites = sites.filter((site) => !!site.deletedAt)
  const [restoringSite, setRestoringSite] = useState<{ id: string; name: string } | null>(null)

  return (
    <main className="page">
      <p>
        <Link to="/">← Locations</Link>
      </p>
      <h1>Recently Deleted</h1>
      <p className="placeholder-note">
        Deleted locations stay here for {RETENTION_DAYS} days before being permanently removed, unless
        restored.
      </p>

      {deletedSites.length === 0 ? (
        <p>Nothing here right now.</p>
      ) : (
        <ul className="location-list">
          {deletedSites.map((site) => (
            <li key={site.id} className="location-list-row">
              <div className="location-list-info">
                <span>{site.name}</span>
                {site.address && <span className="location-address"> — {site.address}</span>}
                <p className="last-updated-note">
                  Permanently deleted in {daysRemaining(site.deletedAt!)} day
                  {daysRemaining(site.deletedAt!) === 1 ? '' : 's'}
                </p>
              </div>
              <div className="location-list-actions">
                <button
                  type="button"
                  onClick={() => setRestoringSite({ id: site.id, name: site.name })}
                >
                  Restore
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {restoringSite && (
        <RestoreSiteDialog
          siteId={restoringSite.id}
          siteName={restoringSite.name}
          onClose={() => setRestoringSite(null)}
          onDone={() => setRestoringSite(null)}
        />
      )}
    </main>
  )
}
