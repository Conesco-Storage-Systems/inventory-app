import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import DeleteProjectDialog from '../components/DeleteProjectDialog'
import MarkProjectActiveDialog from '../components/MarkProjectActiveDialog'
import { useRole } from '../state/RoleContext'

export default function InactiveProjects() {
  const { permissions } = useRole()
  const projects = useLiveQuery(() => db.projects.orderBy('name').toArray(), []) ?? []
  const inactiveProjects = projects.filter((project) => project.active === false && !project.deletedAt)
  const [deletingProject, setDeletingProject] = useState<{ id: string; name: string } | null>(null)
  const [markingActiveProjectId, setMarkingActiveProjectId] = useState<string | null>(null)

  return (
    <main className="page">
      <p>
        <Link to="/">← Locations</Link>
      </p>
      <h1>Inactive Projects</h1>

      {inactiveProjects.length === 0 ? (
        <p>No inactive projects.</p>
      ) : (
        <ul className="location-list">
          {inactiveProjects.map((project) => (
            <li key={project.id} className="location-list-row">
              <div className="location-list-info">
                <Link to={`/projects/${project.id}`}>{project.name}</Link>
              </div>
              {(permissions.manageLocations || permissions.deleteLocations) && (
                <div className="location-list-actions">
                  {permissions.manageLocations && (
                    <button type="button" onClick={() => setMarkingActiveProjectId(project.id)}>
                      Mark as Active
                    </button>
                  )}
                  {permissions.deleteLocations && (
                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => setDeletingProject({ id: project.id, name: project.name })}
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

      {deletingProject && (
        <DeleteProjectDialog
          projectId={deletingProject.id}
          projectName={deletingProject.name}
          onClose={() => setDeletingProject(null)}
          onDeleted={() => setDeletingProject(null)}
        />
      )}

      {markingActiveProjectId && (
        <MarkProjectActiveDialog
          projectId={markingActiveProjectId}
          onClose={() => setMarkingActiveProjectId(null)}
          onDone={() => setMarkingActiveProjectId(null)}
        />
      )}
    </main>
  )
}
