import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import AddLocationDialog from '../components/AddLocationDialog'
import { db } from '../db/db'
import { useRole } from '../state/RoleContext'

export default function ProjectDetail() {
  const { permissions } = useRole()
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
