import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { BeamRow } from '../db/groupBeams'
import type { MiscItemRow } from '../db/groupMiscItems'
import type { UprightRow } from '../db/groupUprights'
import type { WireDeckRow } from '../db/groupWireDecks'
import { db } from '../db/db'
import {
  buildRecountComparison,
  commitRecount,
  listRecountLineItems,
  type RecountComparison,
  type RecountGroupComparison,
} from '../db/recounts'
import { ITEM_TYPE_LABELS } from '../models/types'

function describeRow(row: BeamRow | UprightRow | WireDeckRow | MiscItemRow): string {
  if ('description' in row) return [row.description, row.itemDescription].filter(Boolean).join(' — ')
  if ('widthByHeight' in row) return [row.widthByHeight, row.color, row.style, row.notes].filter(Boolean).join(' · ')
  if ('channelCount' in row) return [row.widthByLength, row.channelCount, row.style.join('/'), row.notes].filter(Boolean).join(' · ')
  return [row.widthByLength, row.color, row.style, row.notes].filter(Boolean).join(' · ')
}

function ComparisonSection<T extends { key: string; quantity: number; ids: string[] }>({
  title,
  rows,
}: {
  title: string
  rows: RecountGroupComparison<T>[]
}) {
  if (rows.length === 0) return null
  return (
    <div className="item-section">
      <h2>{title}</h2>
      <div className="item-table-wrap">
        <table className="item-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Current Qty</th>
              <th>Recount Qty</th>
              <th>Still Tied</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => {
              const row = (c.recount ?? c.old) as T
              const status = c.shortfall
                ? 'SHORTFALL — blocks commit'
                : !c.old
                  ? 'New item'
                  : !c.recount
                    ? 'Not found this count'
                    : 'OK'
              return (
                <tr key={i}>
                  <td className="col-notes">{describeRow(row as never)}</td>
                  <td>{c.old ? c.old.quantity : '—'}</td>
                  <td>{c.recount ? c.recount.quantity : '—'}</td>
                  <td>{c.remainingTiedQty || '—'}</td>
                  <td>{status}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function RecountReview() {
  const { siteId, recountId } = useParams<{ siteId: string; recountId: string }>()
  const navigate = useNavigate()
  const recount = useLiveQuery(() => (recountId ? db.recounts.get(recountId) : undefined), [recountId])
  const lineItems = useLiveQuery(() => (recountId ? listRecountLineItems(recountId) : []), [recountId]) ?? []
  const comparison = useLiveQuery(
    () => (recountId && recount?.status === 'draft' ? buildRecountComparison(recountId) : undefined),
    [recountId, recount?.status],
  )
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCommit() {
    if (!recountId) return
    setCommitting(true)
    setError(null)
    try {
      await commitRecount(recountId)
      navigate(`/locations/${siteId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not commit this recount.')
    } finally {
      setCommitting(false)
    }
  }

  if (!recount) {
    return (
      <main className="page">
        <p>
          <Link to={`/locations/${siteId}`}>← Back</Link>
        </p>
      </main>
    )
  }

  if (recount.status === 'committed') {
    return (
      <main className="page">
        <p>
          <Link to={`/locations/${siteId}`}>← Back</Link>
        </p>
        <h1>Recount — committed</h1>
        <p className="placeholder-note">
          Committed {new Date(recount.committedAt).toLocaleString()} by {recount.committedBy || 'unknown'}.
        </p>
        <div className="item-table-wrap">
          <table className="item-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => (
                <tr key={li.id}>
                  <td>{ITEM_TYPE_LABELS[li.itemType]}</td>
                  <td className="col-notes">
                    {li.itemType === 'misc'
                      ? [li.description, li.itemDescription].filter(Boolean).join(' — ')
                      : [li.color, li.style, li.length, li.width, li.height, li.notes].filter(Boolean).join(' · ')}
                  </td>
                  <td>{li.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    )
  }

  const result: RecountComparison | undefined = comparison

  return (
    <main className="page">
      <p>
        <Link to={`/locations/${siteId}/recounts/${recountId}`}>← Back to counting</Link>
      </p>
      <h1>Review recount</h1>
      <p className="placeholder-note">
        Nothing here is live inventory until you commit. A shortfall below means this spot's recount came up short
        against material still tied to an open, unshipped Sales Order — resolve that tie before committing.
      </p>

      {!result ? (
        <p>Comparing against current inventory…</p>
      ) : (
        <>
          <ComparisonSection title="Beams" rows={result.beams} />
          <ComparisonSection title="Uprights" rows={result.uprights} />
          <ComparisonSection title="Wire Decks" rows={result.wireDecks} />
          <ComparisonSection title="Other" rows={result.miscItems} />

          {error && <p className="field-error">{error}</p>}

          <div className="import-preview-actions">
            <button type="button" onClick={handleCommit} disabled={committing || result.hasBlockingShortfall}>
              {committing ? 'Committing…' : 'Commit recount'}
            </button>
          </div>
          {result.hasBlockingShortfall && (
            <p className="field-error">Resolve every shortfall above before this recount can be committed.</p>
          )}
        </>
      )}
    </main>
  )
}
