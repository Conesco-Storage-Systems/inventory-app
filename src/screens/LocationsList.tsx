import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import AddLocationDialog from '../components/AddLocationDialog'
import AddProjectDialog from '../components/AddProjectDialog'
import DeleteLocationDialog from '../components/DeleteLocationDialog'
import DeleteProjectDialog from '../components/DeleteProjectDialog'
import MarkInactiveDialog from '../components/MarkInactiveDialog'
import MarkProjectInactiveDialog from '../components/MarkProjectInactiveDialog'
import { useRole } from '../state/RoleContext'

export default function LocationsList() {
  const { permissions } = useRole()
  const navigate = useNavigate()
  const sites = useLiveQuery(() => db.sites.orderBy('name').toArray(), []) ?? []
  const projects = useLiveQuery(() => db.projects.orderBy('name').toArray(), []) ?? []
  // Project-owned locations live under their project's own page, not here —
  // that material belongs to the customer, not Conesco's sellable stock.
  const activeSites = sites.filter((site) => site.active !== false && !site.deletedAt && !site.projectId)
  const activeProjects = projects.filter((project) => project.active !== false && !project.deletedAt)
  const [deletingSite, setDeletingSite] = useState<{ id: string; name: string } | null>(null)
  const [markingInactiveSiteId, setMarkingInactiveSiteId] = useState<string | null>(null)
  const [deletingProject, setDeletingProject] = useState<{ id: string; name: string } | null>(null)
  const [markingInactiveProjectId, setMarkingInactiveProjectId] = useState<string | null>(null)

  return (
    <main className="page page-wide">
      <div className="locations-projects-grid">
        <section>
          <div className="page-header">
            <h1>Offsite Locations</h1>
            {permissions.manageLocations && (
              <AddLocationDialog onCreated={(siteId) => navigate(`/locations/${siteId}`)} />
            )}
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
                  {(permissions.manageLocations || permissions.deleteLocations) && (
                    <div className="location-list-actions">
                      {permissions.manageLocations && (
                        <button type="button" onClick={() => setMarkingInactiveSiteId(site.id)}>
                          Mark as Inactive
                        </button>
                      )}
                      {permissions.deleteLocations && (
                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => setDeletingSite({ id: site.id, name: site.name })}
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
            <Link to="/inactive-locations">Inactive Offsites</Link>
            {' · '}
            <Link to="/recently-deleted">Recently Deleted</Link>
          </p>
        </section>

        <section>
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
        </section>
      </div>

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
