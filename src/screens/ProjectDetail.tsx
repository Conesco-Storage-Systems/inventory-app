import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AddLocationDialog from '../components/AddLocationDialog'
import { listAllProfiles } from '../auth/authClient'
import { db } from '../db/db'
import { canSeeProject, shareProject, unshareProject } from '../db/projects'
import { useRole } from '../state/RoleContext'
import { formatDisplayName } from '../utils/displayName'

export default function ProjectDetail() {
  const { permissions, userId } = useRole()
  const { projectId } = useParams<{ projectId: string }>()
  const project = useLiveQuery(() => (projectId ? db.projects.get(projectId) : undefined), [projectId])
  const sites =
    useLiveQuery(
      () => (projectId ? db.sites.filter((site) => site.projectId === projectId).toArray() : []),
      [projectId],
    ) ?? []
  const activeSites = sites
    .filter((site) => site.active !== false && !site.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name))

  const isOwner = !!project && !!userId && project.ownerId === userId
  const [profiles, setProfiles] = useState<{ id: string; email: string }[]>([])
  const [selectedShareId, setSelectedShareId] = useState('')
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (!isOwner) return
    listAllProfiles().then(setProfiles)
  }, [isOwner])

  if (project === undefined) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    )
  }

  if (project === null || !project || !projectId) {
    return (
      <main className="page">
        <p>Project not found.</p>
        <Link to="/">Back to locations</Link>
      </main>
    )
  }

  if (!canSeeProject(project, userId)) {
    return (
      <main className="page">
        <p>
          <Link to="/">← Locations</Link>
        </p>
        <p>You don't have access to this project.</p>
      </main>
    )
  }

  const sharedWith = project.sharedWith ?? []
  const shareableProfiles = profiles.filter(
    (p) => p.id !== project.ownerId && !sharedWith.some((s) => s.id === p.id),
  )

  async function handleShare() {
    const profile = profiles.find((p) => p.id === selectedShareId)
    if (!profile || !projectId) return
    setSharing(true)
    try {
      await shareProject(projectId, profile.id, profile.email)
      setSelectedShareId('')
    } finally {
      setSharing(false)
    }
  }

  return (
    <main className="page">
      <p>
        <Link to="/">← Locations</Link>
      </p>
      <div className="page-header">
        <h1>{project.name}</h1>
        {permissions.manageLocations && (
          <AddLocationDialog projectId={projectId} />
        )}
      </div>

      {project.ownerEmail && <p className="placeholder-note">Owned by {formatDisplayName(project.ownerEmail)}</p>}

      {isOwner && (
        <div className="item-section">
          <h2>Shared With</h2>
          {sharedWith.length === 0 ? (
            <p className="placeholder-note">Only you can see this project so far.</p>
          ) : (
            <ul className="location-list location-list--compact">
              {sharedWith.map((s) => (
                <li key={s.id} className="location-list-row">
                  <div className="location-list-info">{formatDisplayName(s.email)}</div>
                  <button type="button" className="delete-button" onClick={() => unshareProject(projectId, s.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="field-row">
            <label>
              Share with
              <select value={selectedShareId} onChange={(e) => setSelectedShareId(e.target.value)}>
                <option value="">Select a person…</option>
                {shareableProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatDisplayName(p.email)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={handleShare} disabled={sharing || !selectedShareId}>
              {sharing ? 'Sharing…' : 'Share'}
            </button>
          </div>
        </div>
      )}

      {activeSites.length === 0 ? (
        <p>No locations in this project yet.</p>
      ) : (
        <ul className="location-list">
          <li className="location-list-row all-inventory-row">
            <div className="location-list-info">
              <Link to={`/projects/${projectId}/inventory`}>View all {project.name} Inventory</Link>
            </div>
          </li>
          {activeSites.map((site) => (
            <li key={site.id} className="location-list-row">
              <div className="location-list-info">
                <Link to={`/locations/${site.id}`}>{site.name}</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
