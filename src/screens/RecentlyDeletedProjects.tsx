import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import RestoreProjectDialog from '../components/RestoreProjectDialog'
import { useRole } from '../state/RoleContext'

const RETENTION_DAYS = 60
const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysRemaining(deletedAt: number): number {
  const elapsedDays = Math.floor((Date.now() - deletedAt) / MS_PER_DAY)
  return Math.max(0, RETENTION_DAYS - elapsedDays)
}

export default function RecentlyDeletedProjects() {
  const { permissions } = useRole()
  const projects = useLiveQuery(() => db.projects.orderBy('name').toArray(), []) ?? []
  const deletedProjects = projects.filter((project) => !!project.deletedAt)
  const [restoringProject, setRestoringProject] = useState<{ id: string; name: string } | null>(null)

  return (
    <main className="page">
      <p>
        <Link to="/">← Locations</Link>
      </p>
      <h1>Recently Deleted Projects</h1>
      <p className="placeholder-note">
        Deleted projects stay here for {RETENTION_DAYS} days before being permanently removed, unless
        restored. Locations inside a deleted project are not affected.
      </p>

      {deletedProjects.length === 0 ? (
        <p>Nothing here right now.</p>
      ) : (
        <ul className="location-list">
          {deletedProjects.map((project) => (
            <li key={project.id} className="location-list-row">
              <div className="location-list-info">
                <span>{project.name}</span>
                <p className="last-updated-note">
                  Permanently deleted in {daysRemaining(project.deletedAt!)} day
                  {daysRemaining(project.deletedAt!) === 1 ? '' : 's'}
                </p>
              </div>
              {permissions.restoreLocations && (
                <div className="location-list-actions">
                  <button
                    type="button"
                    onClick={() => setRestoringProject({ id: project.id, name: project.name })}
                  >
                    Restore
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {restoringProject && (
        <RestoreProjectDialog
          projectId={restoringProject.id}
          projectName={restoringProject.name}
          onClose={() => setRestoringProject(null)}
          onDone={() => setRestoringProject(null)}
        />
      )}
    </main>
  )
}
