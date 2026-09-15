import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCustomerSheet } from '../db/customerSheets'
import { bolElementToPdfBlob } from '../export/exportBolToPdf'

function sheetPdfFileName(customerName: string, date: string): string {
  const parts = ['Customer-Sheet', customerName || 'customer', date || 'undated']
  return `${parts.join('-').replace(/[^a-zA-Z0-9-]+/g, '_')}.pdf`
}

export default function ViewCustomerSheet() {
  const { siteId, sheetId } = useParams<{ siteId: string; sheetId: string }>()
  const sheet = useLiveQuery(() => (sheetId ? getCustomerSheet(sheetId) : undefined), [sheetId])
  const sheetRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [emailNote, setEmailNote] = useState<string | null>(null)

  async function handleSave() {
    if (!sheetRef.current || !sheet) return
    setExportError(null)
    setEmailNote(null)
    setSaving(true)
    try {
      const blob = await bolElementToPdfBlob(sheetRef.current)
      const fileName = sheetPdfFileName(sheet.customerName, sheet.date)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setExportError('Could not save the PDF. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleEmail() {
    if (!sheetRef.current || !sheet) return
    setExportError(null)
    setEmailNote(null)
    setEmailing(true)
    try {
      const blob = await bolElementToPdfBlob(sheetRef.current)
      const fileName = sheetPdfFileName(sheet.customerName, sheet.date)
      const subject = `Material Spec Sheet${sheet.customerName ? ` — ${sheet.customerName}` : ''}`

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      const body = `The customer sheet PDF has been downloaded as "${fileName}" — please attach it to this email before sending.`
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      setEmailNote(
        `Browsers won't let a web page attach a file to an email automatically — "${fileName}" was downloaded to your computer, and a new email draft is opening. Attach that file to the draft before sending.`,
      )
    } catch {
      setExportError('Could not prepare the email. Please try again.')
    } finally {
      setEmailing(false)
    }
  }

  if (sheet === undefined) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    )
  }

  if (!sheet) {
    return (
      <main className="page">
        <p>Customer sheet not found.</p>
        <Link to={`/locations/${siteId}`}>Back to location</Link>
      </main>
    )
  }

  return (
    <main className="page page-wide cs-document">
      <p className="no-print">
        <Link to={`/locations/${siteId}`}>← Back</Link>
      </p>
      <div className="dialog-actions no-print">
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={handleEmail} disabled={emailing}>
          {emailing ? 'Preparing…' : 'Email'}
        </button>
      </div>
      {exportError && <p className="field-error no-print">{exportError}</p>}
      {emailNote && <p className="placeholder-note no-print">{emailNote}</p>}

      <div className="cs-sheet" ref={sheetRef}>
        <div className="cs-header">
          <div className="cs-title">
            <h1>MATERIAL SPECIFICATION SHEET</h1>
            <p>Date: {sheet.date}</p>
          </div>
          <div className="cs-logo">
            <img src="/conesco-logo.png" alt="Conesco" />
            <p className="cs-header-company">
              Conesco Storage Systems Inc.
              <br />
              15660 E. Hinsdale Dr, Ste 100
              <br />
              Centennial, CO 80112
              <br />
              Phone: (303) 690-9591
            </p>
          </div>
        </div>

        <div className="cs-customer-box">
          <h3>PREPARED FOR</h3>
          <p>
            <strong>Name:</strong> {sheet.customerName}
          </p>
          <p>
            <strong>Company:</strong> {sheet.customerCompany}
          </p>
          <p>
            <strong>Address:</strong> {sheet.customerAddress}
          </p>
          <p>
            <strong>Phone:</strong> {sheet.customerPhone}
          </p>
          <p>
            <strong>Prepared By:</strong> {sheet.preparedBy}
          </p>
        </div>

        <div className="cs-items">
          {sheet.lineItems.map((li, index) => (
            <div className="cs-item-box" key={index}>
              <div className="cs-item-header">
                {li.itemLabel} — Qty {li.quantity}
              </div>
              {li.fields.length > 0 && (
                <div className="cs-item-fields">
                  {li.fields.map((field, fi) => (
                    <div className="cs-item-field" key={fi}>
                      <span className="cs-item-field-label">{field.label}</span>
                      <span className="cs-item-field-value">{field.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {li.photos.length > 0 && (
                <div className="cs-item-photos">
                  {li.photos.map((src, pi) => (
                    <img src={src} alt="" key={pi} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="cs-footer">© Conesco Storage Systems, Inc. — www.CONESCO.com</p>
      </div>
    </main>
  )
}
