import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BayConfigurationDialog from '../components/BayConfigurationDialog'
import RackRowDialog from '../components/RackRowDialog'
import StartingPointEditor from '../components/StartingPointEditor'
import { computeRowMaterials } from '../db/computeRowMaterials'
import { db } from '../db/db'
import { addRackRow, updateRackRowStartingPoint } from '../db/rackRows'
import { confirmStandingMaterialCount } from '../db/standingMaterialCounts'
import type { BayConfiguration, RackRow } from '../models/types'
import { useRole } from '../state/RoleContext'

export default function StandingRackingDetail() {
  const { permissions } = useRole()
  const { countId } = useParams<{ countId: string }>()
  const [siteName, setSiteName] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [siteInfo, setSiteInfo] = useState('')
  const [loadedDraft, setLoadedDraft] = useState(false)
  const [editing, setEditing] = useState(false)

  const count = useLiveQuery(
    () => (countId ? db.standingMaterialCounts.get(countId) : undefined),
    [countId],
  )

  const bayConfigurations =
    useLiveQuery<BayConfiguration[]>(
      () =>
        countId
          ? db.bayConfigurations.where('standingCountId').equals(countId).toArray()
          : Promise.resolve([]),
      [countId],
    ) ?? []

  const rackRows =
    useLiveQuery<RackRow[]>(
      () => (countId ? db.rackRows.where('standingCountId').equals(countId).toArray() : Promise.resolve([])),
      [countId],
    ) ?? []

  const configsById = new Map(bayConfigurations.map((c) => [c.id, c]))

  // Seed the editable draft from the loaded record once, not on every
  // change — otherwise typing would keep getting overwritten by the
  // useLiveQuery result lagging one keystroke behind. An unconfirmed count
  // starts straight in edit mode; a confirmed one starts in the compact view.
  if (count && !loadedDraft) {
    setSiteName(count.siteName)
    setSiteAddress(count.siteAddress)
    setSiteInfo(count.siteInfo)
    setEditing(!count.confirmed)
    setLoadedDraft(true)
  }

  async function handleConfirm() {
    if (!count) return
    await confirmStandingMaterialCount(count.id, { siteName, siteAddress, siteInfo })
    setEditing(false)
  }

  function startEditing() {
    if (!count) return
    setSiteName(count.siteName)
    setSiteAddress(count.siteAddress)
    setSiteInfo(count.siteInfo)
    setEditing(true)
  }

  async function handleAddRow() {
    if (!count) return
    await addRackRow(count.id, `Row ${rackRows.length + 1}`)
  }

  if (!permissions.viewCountingTools) {
    return (
      <main className="page page-wide">
        <p>
          <Link to="/">← Back</Link>
        </p>
        <p>Your role doesn't have permission to view this.</p>
      </main>
    )
  }

  if (!count) {
    return (
      <main className="page page-wide">
        <p>
          <Link to="/counting-tools/standing-racking">← Standing Racking</Link>
        </p>
        <p>Count not found.</p>
      </main>
    )
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to="/counting-tools/standing-racking">← Standing Racking</Link>
      </p>

      <div className="location-header-row">
        <div className="location-info site-info-card">
          {editing ? (
            <div className="site-edit-form">
              <label>
                Site Name
                <input type="text" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
              </label>
              <label>
                Site Address
                <input type="text" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
              </label>
              <label>
                Site Info
                <textarea value={siteInfo} onChange={(e) => setSiteInfo(e.target.value)} rows={3} />
              </label>
              <div className="dialog-actions">
                <button type="button" onClick={handleConfirm}>
                  Confirm
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1>{count.siteName || 'Untitled site'}</h1>
              {count.siteAddress && <p className="location-address">{count.siteAddress}</p>}
              {count.siteInfo && <p className="location-notes">{count.siteInfo}</p>}
              <p className="edit-site-row">
                <button type="button" onClick={startEditing}>
                  Edit
                </button>
              </p>
            </>
          )}
        </div>
      </div>

      {!editing && (
        <>
          <p className="add-item-row">
            <button type="button" onClick={handleAddRow}>
              Add Row
            </button>
          </p>

          {rackRows.map((row) => {
            const totals = computeRowMaterials(row, configsById)
            const uprightTotal = totals.uprights.reduce((sum, t) => sum + t.count, 0)
            const beamTotal = totals.beams.reduce((sum, t) => sum + t.count, 0)
            const deckTotal = totals.decks.reduce((sum, t) => sum + t.count, 0)
            return (
              <div key={row.id} className="dashboard-card">
                <h2>{row.name}</h2>
                <StartingPointEditor
                  value={row.startingPoint}
                  onSave={(startingPoint) => updateRackRowStartingPoint(row.id, startingPoint)}
                />

                <p>
                  <BayConfigurationDialog standingCountId={count.id} />
                  {bayConfigurations.length > 0 && (
                    <RackRowDialog bayConfigurations={bayConfigurations} existing={row} />
                  )}
                </p>

                {row.segments.length > 0 && (
                  <p className="location-notes">
                    {uprightTotal} uprights, {beamTotal} beams, {deckTotal} wire decks
                  </p>
                )}
              </div>
            )
          })}

          {bayConfigurations.length > 0 && (
            <ul className="location-list">
              {bayConfigurations.map((config) => (
                <li key={config.id} className="location-list-row">
                  <div className="location-list-info">{config.name}</div>
                  <div className="location-list-actions">
                    <BayConfigurationDialog standingCountId={count.id} existing={config} label="Edit" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
