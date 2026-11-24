import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { createStandingMaterialCount } from '../db/standingMaterialCounts'
import { useRole } from '../state/RoleContext'

export default function StandingRacking() {
  const { permissions } = useRole()
  const navigate = useNavigate()
  const counts = useLiveQuery(() => db.standingMaterialCounts.orderBy('createdAt').toArray(), []) ?? []

  if (!permissions.viewCountingTools) {
    return (
      <main className="page">
        <p>
          <Link to="/">← Back</Link>
        </p>
        <p>Your role doesn't have permission to view this.</p>
      </main>
    )
  }

  async function handleNewCount() {
    const id = await createStandingMaterialCount()
    navigate(`/counting-tools/standing-racking/${id}`)
  }

  return (
    <main className="page">
      <p>
        <Link to="/counting-tools">← Back</Link>
      </p>
      <div className="page-header">
        <h1>Standing Racking</h1>
        <button type="button" onClick={handleNewCount}>
          + New Count
        </button>
      </div>

      {counts.length === 0 ? (
        <p>No counts yet. Add one to get started.</p>
      ) : (
        <ul className="location-list">
          {counts.map((count) => (
            <li key={count.id} className="location-list-row">
              <div className="location-list-info">
                <Link to={`/counting-tools/standing-racking/${count.id}`}>{count.siteName || 'Untitled site'}</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
