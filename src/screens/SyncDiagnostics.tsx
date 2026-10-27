import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getSyncDiagnosticsSnapshot,
  type SyncDiagnosticsSnapshot,
} from '../db/syncDiagnostics'
import { getRecentSyncErrors } from '../sync/syncEngine'
import { useRole } from '../state/RoleContext'

export default function SyncDiagnostics() {
  const { permissions } = useRole()
  const [snapshot, setSnapshot] = useState<SyncDiagnosticsSnapshot | null>(null)
  const [recentErrors, setRecentErrors] = useState<string[]>(() => getRecentSyncErrors())
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      setSnapshot(await getSyncDiagnosticsSnapshot())
      setRecentErrors(getRecentSyncErrors())
      setLastChecked(new Date())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  if (!permissions.viewSyncDiagnostics) {
    return (
      <main className="page">
        <p>
          <Link to="/">← Back</Link>
        </p>
        <p>Your role doesn't have permission to view this.</p>
      </main>
    )
  }

  return (
    <main className="page">
      <p>
        <Link to="/">← Back</Link>
      </p>
      <h1>Sync Diagnostics</h1>
      <p className="existing-photos-note">
        This only reads what's already stored on this device — it doesn't change anything.
        Use it to check whether a photo or record on THIS device actually left it, instead of
        digging through browser DevTools.
      </p>
      <div className="save-item-row">
        <button type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Checking…' : 'Refresh'}
        </button>
        {lastChecked && <span>Last checked {lastChecked.toLocaleTimeString()}</span>}
      </div>

      {snapshot && (
        <>
          <h2>Photos on this device</h2>
          <table className="item-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Total</th>
                <th>Synced</th>
                <th>Still trying</th>
                <th>Failed (never left this device)</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.photoTables.map((t) => (
                <tr key={t.label}>
                  <td>{t.label}</td>
                  <td>{t.total}</td>
                  <td>{t.synced}</td>
                  <td>{t.pending}</td>
                  <td className={t.failed > 0 ? 'field-error' : undefined}>{t.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {snapshot.photoTables.some((t) => t.failed > 0) && (
            <div>
              {snapshot.photoTables
                .filter((t) => t.failed > 0)
                .map((t) => (
                  <p key={t.label}>
                    <strong>{t.label} failed IDs</strong> (never uploaded — the image data read back
                    empty or corrupted on this device, so it was never sent): {t.failedIds.join(', ')}
                  </p>
                ))}
            </div>
          )}

          <h2>Site hero photos</h2>
          <p>
            Sites with a photo path set but no matching image stored on this device:{' '}
            <strong className={snapshot.siteHeroPhotos.missingBlob > 0 ? 'field-error' : undefined}>
              {snapshot.siteHeroPhotos.missingBlob}
            </strong>
            {snapshot.siteHeroPhotos.missingBlob > 0 && (
              <> — open each one's detail page once to trigger a retry. Site IDs: {snapshot.siteHeroPhotos.missingBlobIds.join(', ')}</>
            )}
          </p>
          <p>Sites with an unsent local photo change: {snapshot.siteHeroPhotos.dirty}</p>

          <h2>Other records waiting to sync</h2>
          <table className="item-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Pending (not yet confirmed synced)</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.entityTables.map((t) => (
                <tr key={t.label}>
                  <td>{t.label}</td>
                  <td>{t.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Deletes waiting to be sent: {snapshot.pendingDeletes}</p>
        </>
      )}

      <h2>Sync errors (this browser session)</h2>
      {recentErrors.length === 0 ? (
        <p>No sync errors reported since this page was last loaded.</p>
      ) : (
        <ul>
          {recentErrors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}
    </main>
  )
}
