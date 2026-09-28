import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import { addSalesQuoteLineItem, computeHeldQuantity, getSalesQuote } from '../db/salesQuotes'
import type { ItemType } from '../models/types'
import { useRole } from '../state/RoleContext'

interface QuoteSelection {
  key: string
  itemType: ItemType
  siteId: string
  siteName: string
  description: string
  itemIds: string[]
  rawQuantity: number
}

export default function GenerateSalesQuote() {
  const { userEmail } = useRole()
  const { quoteId } = useParams<{ quoteId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const selections = (location.state as { selections?: QuoteSelection[] } | null)?.selections ?? []

  const quote = useLiveQuery(() => (quoteId ? getSalesQuote(quoteId) : undefined), [quoteId])
  const holds = useLiveQuery(() => db.salesQuoteLineItems.toArray(), []) ?? []

  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (quote === undefined) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    )
  }

  if (!quote) {
    return (
      <main className="page">
        <p>Sales Quote not found.</p>
        <Link to="/sales-dashboard">Back to Sales Dashboard</Link>
      </main>
    )
  }

  const activeQuote = quote

  // Re-checked here (not just the availability shown on the inventory
  // page) since another sales person could have placed a hold in the time
  // between selecting these items and saving quantities for them.
  function currentlyAvailable(selection: QuoteSelection): number {
    return Math.max(0, selection.rawQuantity - computeHeldQuantity(selection.itemIds, holds))
  }

  async function handleSaveQuote() {
    setError(null)
    const toSave: { selection: QuoteSelection; qty: number }[] = []

    for (const selection of selections) {
      const raw = quantities[selection.key]
      if (!raw) continue
      const qty = Number(raw)
      if (!Number.isFinite(qty) || qty <= 0) continue

      if (qty > currentlyAvailable(selection)) {
        setError(
          `Only ${currentlyAvailable(selection)} of "${selection.description}" is available now — someone may have just held some of it.`,
        )
        return
      }
      toSave.push({ selection, qty })
    }

    if (toSave.length === 0) {
      setError('Enter a quantity for at least one item.')
      return
    }

    setSaving(true)
    try {
      for (const { selection, qty } of toSave) {
        await addSalesQuoteLineItem({
          quoteId: activeQuote.id,
          quoteNumber: activeQuote.quoteNumber,
          siteId: selection.siteId,
          siteName: selection.siteName,
          itemType: selection.itemType,
          itemIds: selection.itemIds,
          description: selection.description,
          quantityHeld: qty,
          heldByEmail: userEmail ?? '',
        })
      }
      navigate(`/sales-quotes/${activeQuote.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to="/sales-dashboard">← Back to Sales Dashboard</Link>
      </p>
      <h1>Generate Quote — #{activeQuote.quoteNumber}</h1>

      {selections.length === 0 ? (
        <p className="placeholder-note">No items were selected.</p>
      ) : (
        <div className="item-table-wrap">
          <table className="item-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Description</th>
                <th>Available</th>
                <th>Quantity for Quote</th>
              </tr>
            </thead>
            <tbody>
              {selections.map((selection) => (
                <tr key={selection.key}>
                  <td>{selection.siteName}</td>
                  <td>{selection.description}</td>
                  <td>{currentlyAvailable(selection)}</td>
                  <td>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={currentlyAvailable(selection)}
                      value={quantities[selection.key] ?? ''}
                      onChange={(e) => setQuantities((prev) => ({ ...prev, [selection.key]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="field-error">{error}</p>}

      <div className="dialog-actions">
        <button type="button" onClick={handleSaveQuote} disabled={saving || selections.length === 0}>
          {saving ? 'Saving…' : 'Save Quote'}
        </button>
      </div>
    </main>
  )
}
