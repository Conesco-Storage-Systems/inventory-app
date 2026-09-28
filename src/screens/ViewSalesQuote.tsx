import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { cancelSalesQuote, cancelSalesQuoteLineItem, getSalesQuote, listLineItemsByQuote } from '../db/salesQuotes'

export default function ViewSalesQuote() {
  const { quoteId } = useParams<{ quoteId: string }>()
  const quote = useLiveQuery(() => (quoteId ? getSalesQuote(quoteId) : undefined), [quoteId])
  const lineItems = useLiveQuery(() => (quoteId ? listLineItemsByQuote(quoteId) : []), [quoteId]) ?? []
  const [cancelingQuote, setCancelingQuote] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

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

  async function handleCancelQuote() {
    setCancelingQuote(true)
    try {
      await cancelSalesQuote(activeQuote.id)
    } finally {
      setCancelingQuote(false)
      setConfirmingCancel(false)
    }
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to="/sales-dashboard">← Back to Sales Dashboard</Link>
      </p>
      <div className="page-header">
        <h1>Quote #{quote.quoteNumber}</h1>
        {!quote.canceledAt && (
          <button type="button" className="delete-button" onClick={() => setConfirmingCancel(true)}>
            Cancel Quote
          </button>
        )}
      </div>

      {quote.canceledAt && <p className="placeholder-note">This quote was canceled — all its holds have been released.</p>}

      <p>
        <strong>Customer:</strong> {quote.customerName || '—'}
      </p>
      <p>
        <strong>Address:</strong> {quote.customerAddress || '—'}
      </p>
      {quote.notes && (
        <p>
          <strong>Notes:</strong> {quote.notes}
        </p>
      )}

      <h2>Held Items</h2>
      {lineItems.length === 0 ? (
        <p className="placeholder-note">No items are being held on this quote.</p>
      ) : (
        <div className="item-table-wrap">
          <table className="item-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Description</th>
                <th>Quantity Held</th>
                {!quote.canceledAt && <th></th>}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => (
                <tr key={li.id}>
                  <td>{li.siteName}</td>
                  <td>{li.description}</td>
                  <td>{li.quantityHeld}</td>
                  {!quote.canceledAt && (
                    <td>
                      <button type="button" className="delete-button" onClick={() => cancelSalesQuoteLineItem(li.id)}>
                        Release
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmingCancel && (
        <div className="delete-confirm">
          <p>Cancel this whole quote? Every held item above will be released back to available inventory.</p>
          <div className="dialog-actions">
            <button type="button" onClick={() => setConfirmingCancel(false)} disabled={cancelingQuote}>
              Go Back
            </button>
            <button type="button" className="delete-confirm-button" onClick={handleCancelQuote} disabled={cancelingQuote}>
              {cancelingQuote ? 'Canceling…' : 'Cancel Quote'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
