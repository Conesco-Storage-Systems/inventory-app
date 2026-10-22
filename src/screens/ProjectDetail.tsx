import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AddLocationDialog from '../components/AddLocationDialog'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import MaterialNeedDialog from '../components/MaterialNeedDialog'
import MaterialNeedsByJobSiteChart, {
  type ChartSourcingSegment,
  type MaterialNeedChartRow,
} from '../components/MaterialNeedsByJobSiteChart'
import ProjectJobSiteDialog from '../components/ProjectJobSiteDialog'
import { listAllProfiles } from '../auth/authClient'
import { db } from '../db/db'
import { leadingNumber } from '../db/groupBeams'
import { uprightDimensionSortValue, uprightHeightSortValue } from '../db/groupUprights'
import { listMaterialNeedAllocationsByProject, summarizeNeedAllocations } from '../db/materialNeedAllocations'
import {
  listMaterialNeedsByProject,
  materialNeedChartLabel,
  materialNeedExtendedDescription,
} from '../db/materialNeeds'
import { canSeeProject, shareProject, unshareProject } from '../db/projects'
import { deleteProjectJobSite, listProjectJobSites } from '../db/projectJobSites'
import {
  ITEM_TYPE_LABELS,
  type ItemType,
  type MaterialNeed,
  type MaterialNeedAllocation,
  type ProjectJobSite,
  type Site,
} from '../models/types'
import { useRole } from '../state/RoleContext'
import { formatDisplayName } from '../utils/displayName'

// Fixed, validated categorical order (see the dataviz skill) — assigned
// once per sourcing Location so the same Location is always the same
// color across every chart on this dashboard, not re-picked per chart.
const CATEGORICAL_COLORS = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
]

// Same fixed display order used everywhere else in the app (All Inventory,
// a location's own sheet, etc.): Uprights, Beams, Wire Decks, Other.
const CHART_ITEM_TYPES: ItemType[] = ['upright', 'beam', 'wireDeck', 'misc']
const ITEM_TYPE_SORT_ORDER: Record<ItemType, number> = Object.fromEntries(
  CHART_ITEM_TYPES.map((type, i) => [type, i]),
) as Record<ItemType, number>
const CHART_TITLES: Record<ItemType, string> = {
  beam: 'Beams',
  upright: 'Uprights',
  wireDeck: 'Wire Decks',
  misc: 'Other',
}

// Smallest to largest, width first then length/height — the same sort
// used by default on the real inventory sheets (Width x Length / Width x
// Height), so a bar chart's bars read in the same order a user already
// expects from browsing inventory. Misc has no dimensions, so it falls
// back to alphabetical by description.
function compareNeedsByDimension(a: MaterialNeed, b: MaterialNeed): number {
  if (a.itemType === 'misc') return a.description.localeCompare(b.description)
  const dimensionValue = (need: MaterialNeed) =>
    need.itemType === 'upright'
      ? uprightDimensionSortValue(need.width) * 100000 + uprightHeightSortValue(need.height)
      : leadingNumber(need.width) * 100000 + leadingNumber(need.length)
  return dimensionValue(a) - dimensionValue(b)
}

interface JobSiteSectionProps {
  projectId: string
  jobSite: ProjectJobSite
  needs: MaterialNeed[]
  allocations: MaterialNeedAllocation[]
  projectSites: Site[]
}

function JobSiteSection({ projectId, jobSite, needs, allocations, projectSites }: JobSiteSectionProps) {
  const navigate = useNavigate()
  const [confirmingDeleteSite, setConfirmingDeleteSite] = useState(false)

  // Uprights, then Beams, then Wire Decks, then Other — same fixed order
  // as everywhere else in the app, regardless of the order needs were
  // added in.
  const sortedNeeds = [...needs].sort((a, b) => ITEM_TYPE_SORT_ORDER[a.itemType] - ITEM_TYPE_SORT_ORDER[b.itemType])

  return (
    <div className="item-section">
      {jobSite.notes && <p className="placeholder-note">{jobSite.notes}</p>}

      <div className="page-header job-site-header">
        <h2 className="job-site-name">{jobSite.name}</h2>
        <div className="selection-actions">
          <ProjectJobSiteDialog
            projectId={projectId}
            existing={jobSite}
            projectSites={projectSites}
            label="Edit Job Site"
          />
          <button type="button" className="delete-button" onClick={() => setConfirmingDeleteSite(true)}>
            Delete Job Site
          </button>
        </div>
      </div>
      <div className="item-table-wrap">
        <table className="item-table">
          <thead>
            <tr>
              <th>Item Type</th>
              <th>Spec</th>
              <th>Needed</th>
              <th>Tied</th>
              <th>Remaining</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {sortedNeeds.length === 0 && (
              <tr>
                <td colSpan={6}>No material needs added yet.</td>
              </tr>
            )}
            {sortedNeeds.map((need) => {
              const summary = summarizeNeedAllocations(need.id, allocations)
              const gap = need.quantityNeeded - summary.total
              return (
                <tr
                  key={need.id}
                  className="clickable-row"
                  onClick={() => navigate(`/projects/${projectId}/material-needs/${need.id}`)}
                >
                  <td>{ITEM_TYPE_LABELS[need.itemType]}</td>
                  <td>{materialNeedExtendedDescription(need)}</td>
                  <td>{need.quantityNeeded}</td>
                  <td>{summary.total}</td>
                  <td>{gap > 0 ? gap : gap < 0 ? `${Math.abs(gap)} surplus` : 'Met'}</td>
                  <td>{need.notes || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p>
        <MaterialNeedDialog projectId={projectId} jobSiteId={jobSite.id} label="+ Add Material Need" />
      </p>

      {confirmingDeleteSite && (
        <ConfirmDeleteDialog
          onConfirm={() => deleteProjectJobSite(jobSite.id)}
          onClose={() => setConfirmingDeleteSite(false)}
          message="Delete this job site? Every material need under it (and anything tied to it) will be deleted too."
        />
      )}
    </div>
  )
}

export default function ProjectDetail() {
  const { permissions, userId } = useRole()
  const { projectId } = useParams<{ projectId: string }>()
  const project = useLiveQuery(() => (projectId ? db.projects.get(projectId) : undefined), [projectId])
  const allSites = useLiveQuery(() => db.sites.toArray(), []) ?? []
  const sites =
    useLiveQuery(
      () => (projectId ? db.sites.filter((site) => site.projectId === projectId).toArray() : []),
      [projectId],
    ) ?? []
  const activeSites = sites
    .filter((site) => site.active !== false && !site.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name))

  const siteNameById = new Map(allSites.map((site) => [site.id, site.name]))

  const jobSites = useLiveQuery(() => (projectId ? listProjectJobSites(projectId) : []), [projectId]) ?? []
  const materialNeeds = useLiveQuery(() => (projectId ? listMaterialNeedsByProject(projectId) : []), [projectId]) ?? []
  const allocations = useLiveQuery(() => (projectId ? listMaterialNeedAllocationsByProject(projectId) : []), [projectId]) ?? []

  // Fixed color per Location, assigned in a stable (alphabetical) order so
  // the same Location is always the same color across every chart, no
  // matter which order ties happened in.
  const allocationSiteIds = Array.from(new Set(allocations.map((a) => a.siteId))).sort((a, b) =>
    (siteNameById.get(a) ?? '').localeCompare(siteNameById.get(b) ?? ''),
  )
  const siteColorMap: Record<string, string> = {}
  allocationSiteIds.forEach((siteId, i) => {
    siteColorMap[siteId] = CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]
  })

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

  const jobSiteNameById = new Map(jobSites.map((js) => [js.id, js.name]))
  const needsByJobSite = new Map<string, MaterialNeed[]>()
  for (const need of materialNeeds) {
    const list = needsByJobSite.get(need.jobSiteId)
    if (list) list.push(need)
    else needsByJobSite.set(need.jobSiteId, [need])
  }

  const chartRowsByType = new Map<ItemType, MaterialNeedChartRow[]>()
  for (const itemType of CHART_ITEM_TYPES) {
    const rows: MaterialNeedChartRow[] = materialNeeds
      .filter((need) => need.itemType === itemType)
      .sort(compareNeedsByDimension)
      .map((need) => {
        const summary = summarizeNeedAllocations(need.id, allocations)
        const segments: ChartSourcingSegment[] = summary.bySite.map((s) => ({
          siteId: s.siteId,
          siteName: s.siteName,
          quantity: s.quantity,
        }))
        return {
          id: need.id,
          label: `${jobSiteNameById.get(need.jobSiteId) ?? 'Unknown job site'} - ${materialNeedChartLabel(need)}`,
          quantityNeeded: need.quantityNeeded,
          segments,
        }
      })
    chartRowsByType.set(itemType, rows)
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to="/">← Locations</Link>
      </p>
      <h1 className="project-dashboard-title">{project.name}</h1>
      <div className="project-dashboard-layout">
        <div className="project-dashboard-left dashboard-card">
          <div className="page-header">
            <h1>Locations</h1>
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

          {permissions.manageLocations && (
            <p>
              <AddLocationDialog projectId={projectId} label="+ Add Location" linkStyle />
            </p>
          )}
        </div>

        <div className="project-dashboard-right dashboard-card">
          {CHART_ITEM_TYPES.map((itemType) => (
            <MaterialNeedsByJobSiteChart
              key={itemType}
              title={CHART_TITLES[itemType]}
              rows={chartRowsByType.get(itemType) ?? []}
              siteColorMap={siteColorMap}
            />
          ))}
        </div>
      </div>

      <div className="dashboard-card">
        <div className="page-header">
          <h2>Sites Needing Material</h2>
          <ProjectJobSiteDialog projectId={projectId} projectSites={activeSites} label="+ Add Job Site" />
        </div>
        {jobSites.length === 0 && <p className="placeholder-note">No job sites added yet.</p>}

        {jobSites.map((jobSite) => (
          <JobSiteSection
            key={jobSite.id}
            projectId={projectId}
            jobSite={jobSite}
            needs={needsByJobSite.get(jobSite.id) ?? []}
            allocations={allocations}
            projectSites={activeSites}
          />
        ))}
      </div>
    </main>
  )
}
