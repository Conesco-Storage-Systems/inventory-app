import { useRef, useState } from 'react'
import {
  createProjectJobSite,
  linkProjectJobSiteToSite,
  updateProjectJobSite,
} from '../db/projectJobSites'
import type { ProjectJobSite, Site } from '../models/types'

interface ProjectJobSiteDialogProps {
  projectId: string
  existing?: ProjectJobSite
  // Real Locations already in this project — offered as an optional link
  // once this job site actually becomes one of them.
  projectSites: Site[]
  label: string
}

export default function ProjectJobSiteDialog({ projectId, existing, projectSites, label }: ProjectJobSiteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [linkedSiteId, setLinkedSiteId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  function open() {
    setName(existing?.name ?? '')
    setTargetDate(existing?.targetDate ?? '')
    setLinkedSiteId(existing?.linkedSiteId ?? '')
    setNotes(existing?.notes ?? '')
    dialogRef.current?.showModal()
  }

  function close() {
    dialogRef.current?.close()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      if (existing) {
        await updateProjectJobSite(existing.id, { name, targetDate, notes })
        if (linkedSiteId !== existing.linkedSiteId) {
          await linkProjectJobSiteToSite(existing.id, linkedSiteId)
        }
      } else {
        const id = await createProjectJobSite({ projectId, name, targetDate, notes })
        if (linkedSiteId) await linkProjectJobSiteToSite(id, linkedSiteId)
      }
      close()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" onClick={open}>
        {label}
      </button>
      <dialog ref={dialogRef} className="location-dialog">
        <form onSubmit={handleSubmit}>
          <h2>{existing ? 'Edit Job Site' : 'Add Job Site'}</h2>
          <label>
            Job site name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label>
            Target date
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </label>
          <label>
            Linked Location
            <select value={linkedSiteId} onChange={(e) => setLinkedSiteId(e.target.value)}>
              <option value="">Not linked yet</option>
              {projectSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </label>
          <div className="dialog-actions">
            <button type="button" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save Job Site'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
