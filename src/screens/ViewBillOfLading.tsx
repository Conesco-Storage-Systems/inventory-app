import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBillOfLading } from '../db/billsOfLading'
import { bolElementToPdfBlob, bolPdfFileName } from '../export/exportBolToPdf'
import { shrinkBolToOnePage } from '../export/fitBolToPage'
import { saveBlobAs } from '../export/saveBlob'

export default function ViewBillOfLading() {
  const { siteId, bolId } = useParams<{ siteId: string; bolId: string }>()
  const bol = useLiveQuery(() => (bolId ? getBillOfLading(bolId) : undefined), [bolId])
  const frameRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    function handleBeforePrint() {
      if (sheetRef.current && frameRef.current) {
        shrinkBolToOnePage(sheetRef.current, frameRef.current)
      }
    }
    function handleAfterPrint() {
      if (sheetRef.current && frameRef.current) {
        sheetRef.current.style.transform = ''
        sheetRef.current.style.transformOrigin = ''
        frameRef.current.style.height = ''
        frameRef.current.style.overflow = ''
      }
    }
    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [])

  async function handleSave() {
    if (!sheetRef.current || !frameRef.current || !bol) return
    setExportError(null)
    setSaving(true)
    const restore = shrinkBolToOnePage(sheetRef.current, frameRef.current)
    try {
      const blob = await bolElementToPdfBlob(sheetRef.current)
      const fileName = bolPdfFileName(bol.loadNumber, bol.date)
      await saveBlobAs(blob, fileName)
    } catch {
      setExportError('Could not save the PDF. Please try again.')
    } finally {
      restore()
      setSaving(false)
    }
  }

  if (bol === undefined) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    )
  }

  if (!bol) {
    return (
      <main className="page">
        <p>Bill of Lading not found.</p>
        <Link to={`/locations/${siteId}`}>Back to location</Link>
      </main>
    )
  }

  return (
    <main className="page page-wide bol-document">
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

      <div className="bol-print-frame" ref={frameRef}>
        <div className="bol-sheet" ref={sheetRef}>
          <div className="bol-header">
            <table className="bol-header-table">
              <tbody>
                <tr>
                  <td>Date: {bol.date}</td>
                </tr>
                <tr>
                  <td>Reference Doc: {bol.referenceDoc}</td>
                </tr>
                <tr>
                  <td>Load #: {bol.loadNumber}</td>
                </tr>
              </tbody>
            </table>
            <div className="bol-title">
              <h1>BILL OF LADING</h1>
              <div className="bol-payment-terms">
                {(['PrePaid', 'Collect', '3rd Party'] as const).map((term) => (
                  <span key={term}>
                    {bol.paymentTerm === term ? '☑' : '☐'} {term}
                  </span>
                ))}
              </div>
            </div>
            <div className="bol-logo">
              <img src="/conesco-logo.png" alt="Conesco" />
              <p className="bol-header-company">
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

          <div className="bol-parties">
            <div className="bol-party">
              <h3>SHIP FROM</h3>
              <p>
                <strong>Company:</strong> {bol.shipFromCompany}
              </p>
              <p>
                <strong>Address:</strong> {bol.shipFromAddress}
              </p>
              <p>
                <strong>Phone:</strong> {bol.shipFromPhone}
              </p>
              <p>
                <strong>Carrier:</strong> {bol.carrier}
              </p>
              <p>
                <strong>Driver Phone:</strong> {bol.driverPhone}
              </p>
            </div>
            <div className="bol-party">
              <h3>SHIP TO</h3>
              <p>
                <strong>Company:</strong> {bol.shipToCompany}
                {bol.shipToContact ? ` (Attn: ${bol.shipToContact})` : ''}
              </p>
              <p>
                <strong>Address:</strong> {bol.shipToAddress}
              </p>
              <p>
                <strong>Phone:</strong> {bol.shipToPhone}
              </p>
            </div>
          </div>

          <table className="bol-line-items">
            <thead>
              <tr>
                <th>QTY Shipped</th>
                <th>Weight (lbs)</th>
                <th>QTY Received</th>
                <th>Item Description</th>
              </tr>
            </thead>
            <tbody>
              {bol.lineItems.map((li, index) => (
                <tr key={index}>
                  <td>{li.qtyShipped}</td>
                  <td>{li.weight}</td>
                  <td>{li.qtyReceived}</td>
                  <td>{[li.item, li.description].filter(Boolean).join(' — ')}</td>
                </tr>
              ))}
              {Array.from({ length: Math.max(0, 5 - bol.lineItems.length) }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                </tr>
              ))}
              <tr className="bol-totals-row">
                <td></td>
                <td>lbs.</td>
                <td></td>
                <td className="bol-totals-label">← TOTALS</td>
              </tr>
            </tbody>
          </table>

          <div className="bol-signatures">
            <div className="bol-signature-block">
              <p className="bol-signature-line">X ________________________________ Date: __________</p>
              <p className="bol-signature-label">SHIPPER SIGNATURE</p>
              <p className="bol-signature-fine">
                This certifies that the above-named materials are properly classified, packaged, marked, and
                labeled, and are in proper condition for transportation according to the applicable
                regulations of the DOT. All cargo tendered for transportation is subject to inspection, and
                shipper grants consent to such inspection.
              </p>
            </div>
            <div className="bol-signature-block">
              <p className="bol-signature-line">X ________________________________ Date: __________</p>
              <p className="bol-signature-label">CARRIER SIGNATURE</p>
              <p className="bol-signature-fine">
                Carrier acknowledges receipt of materials and required placecards. Carrier certifies
                emergency response information was made available and/or carrier has the DOT emergency
                response guidebook or equivalent documentation in the vehicle. If driver will not take all
                items depicted on this BOL/PO, Conesco will not pay for the truck load. Driver should not
                accept the load and can leave the loading site. If driver leaves the site with a partial
                load, driver accepts the responsibility of not being fully compensated for the route.
              </p>
            </div>
          </div>

          <p className="bol-signature-fine bol-liability-note">
            NOTE: Liability Limitation for loss or damage in this shipment may be applicable. See 49 U.S.C -
            14706(c)(1)(A) and (B). Shipment subject to individually determined rates or contracts that have
            been agreed upon in writing between the carrier and shipper, if applicable, otherwise to the
            rates, classifications and rules that have been established by the carrier and are available to
            the shipper, on request, and to all applicable state and federal regulations.
          </p>

          <div className="bol-footer-row">
            <div className="bol-checklist">
              <p className="bol-signature-label">Trailer Loaded</p>
              <p>☐ By Shipper</p>
              <p>☐ By Driver</p>
            </div>
            <div className="bol-checklist">
              <p className="bol-signature-label">Freight Counted</p>
              <p>☐ By Shipper</p>
              <p>☐ By Driver/pallets said to contain</p>
              <p>☐ By Driver/Pieces</p>
            </div>
            <div className="bol-signature-block">
              <p className="bol-signature-line">X ________________________________ Date: __________</p>
              <p className="bol-signature-label">RECIPIENT SIGNATURE</p>
              <p className="bol-signature-fine">
                This is to certify that the above named and listed material has been properly and fully
                received in above stated quantities and condition.
              </p>
            </div>
          </div>

          <div className="bol-copyright">
            <span>© Conesco Storage Systems, Inc.</span>
            <span>www.CONESCO.com</span>
            <span>Page: 1/1</span>
          </div>
        </div>
      </div>
    </main>
  )
}
