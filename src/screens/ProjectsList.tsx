import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { canSeeProject } from '../db/projects'
import AddProjectDialog from '../components/AddProjectDialog'
import DeleteProjectDialog from '../components/DeleteProjectDialog'
import MarkProjectInactiveDialog from '../components/MarkProjectInactiveDialog'
import { useRole } from '../state/RoleContext'

export default function ProjectsList() {
  const { permissions, userId } = useRole()
  const navigate = useNavigate()
  const projects = useLiveQuery(() => db.projects.orderBy('name').toArray(), []) ?? []
  const activeProjects = projects
    .filter((project) => project.active !== false && !project.deletedAt)
    .filter((project) => canSeeProject(project, userId))
  const [deletingProject, setDeletingProject] = useState<{ id: string; name: string } | null>(null)
  const [markingInactiveProjectId, setMarkingInactiveProjectId] = useState<string | null>(null)

  return (
    <main className="page">
      <p>
        <Link to="/">← Back</Link>
      </p>
      <div className="page-header">
        <h1>Projects</h1>
        {permissions.manageLocations && (
          <AddProjectDialog onCreated={(projectId) => navigate(`/projects/${projectId}`)} />
        )}
      </div>

      {activeProjects.length === 0 ? (
        <p>No projects yet. Add one to get started.</p>
      ) : (
        <ul className="location-list">
          {activeProjects.map((project) => (
            <li key={project.id} className="location-list-row">
              <div className="location-list-info">
                <Link to={`/projects/${project.id}`}>{project.name}</Link>
              </div>
              {(permissions.manageLocations || permissions.deleteLocations) && (
                <div className="location-list-actions">
                  {permissions.manageLocations && (
                    <button type="button" onClick={() => setMarkingInactiveProjectId(project.id)}>
                      Mark as Inactive
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

      <p className="inactive-offsites-link">
        <Link to="/inactive-projects">Inactive Projects</Link>
        {' · '}
        <Link to="/recently-deleted-projects">Recently Deleted</Link>
      </p>

      {deletingProject && (
        <DeleteProjectDialog
          projectId={deletingProject.id}
          projectName={deletingProject.name}
          onClose={() => setDeletingProject(null)}
          onDeleted={() => setDeletingProject(null)}
        />
      )}

      {markingInactiveProjectId && (
        <MarkProjectInactiveDialog
          projectId={markingInactiveProjectId}
          onClose={() => setMarkingInactiveProjectId(null)}
          onDone={() => setMarkingInactiveProjectId(null)}
        />
      )}
    </main>
  )
}
