import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCustomerSheet } from '../db/customerSheets'
import { bolElementToPdfBlob } from '../export/exportBolToPdf'
import { saveBlobAs } from '../export/saveBlob'

function sheetPdfFileName(customerName: string, date: string): string {
  const parts = ['Customer-Sheet', customerName || 'customer', date || 'undated']
  return `${parts.join('-').replace(/[^a-zA-Z0-9-]+/g, '_')}.pdf`
}

export default function ViewCustomerSheet() {
  const { siteId, sheetId } = useParams<{ siteId: string; sheetId: string }>()
  const sheet = useLiveQuery(() => (sheetId ? getCustomerSheet(sheetId) : undefined), [sheetId])
  const sheetRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function handleSave() {
    if (!sheetRef.current || !sheet) return
    setExportError(null)
    setSaving(true)
    try {
      const blob = await bolElementToPdfBlob(sheetRef.current)
      const fileName = sheetPdfFileName(sheet.customerName, sheet.date)
      await saveBlobAs(blob, fileName)
    } catch {
      setExportError('Could not save the PDF. Please try again.')
    } finally {
      setSaving(false)
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
      </div>
      {exportError && <p className="field-error no-print">{exportError}</p>}

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
              <div className="cs-item-header">{li.itemLabel}</div>
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
