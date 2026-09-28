import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSalesQuote } from '../db/salesQuotes'
import { useRole } from '../state/RoleContext'

export default function CreateSalesQuoteDialog() {
  const { userId, userEmail } = useRole()
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [quoteNumber, setQuoteNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  function open() {
    setQuoteNumber('')
    setCustomerName('')
    setCustomerAddress('')
    setNotes('')
    dialogRef.current?.showModal()
  }

  function close() {
    dialogRef.current?.close()
  }

  async function handleSelectInventory(e: React.FormEvent) {
    e.preventDefault()
    if (!quoteNumber.trim()) return
    setSaving(true)
    try {
      const quoteId = await createSalesQuote({
        quoteNumber,
        customerName,
        customerAddress,
        notes,
        createdById: userId ?? '',
        createdByEmail: userEmail ?? '',
      })
      close()
      navigate('/all-inventory', { state: { quoteId } })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" onClick={open}>
        Create Sales Quote
      </button>
      <dialog ref={dialogRef} className="location-dialog">
        <form onSubmit={handleSelectInventory}>
          <h2>Create Sales Quote</h2>
          <label>
            Quote #
            <input
              type="text"
              value={quoteNumber}
              onChange={(e) => setQuoteNumber(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            Name
            <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </label>
          <label>
            Address
            <input type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
          </label>
          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>
          <div className="dialog-actions">
            <button type="button" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !quoteNumber.trim()}>
              {saving ? 'Saving…' : 'Select Inventory'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
