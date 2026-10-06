import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import BlobImage from '../components/BlobImage'
import CameraCapture from '../components/CameraCapture'
import SignaturePad from '../components/SignaturePad'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import { addBolPhoto, deleteBolPhoto, listBolPhotos } from '../db/bolPhotos'
import {
  getBillOfLading,
  markBillOfLadingShipped,
  signBillOfLading,
  unmarkBillOfLadingShipped,
  updateBillOfLading,
} from '../db/billsOfLading'
import { bolElementToPdfBlob, bolPdfFileName } from '../export/exportBolToPdf'
import { shrinkBolToOnePage } from '../export/fitBolToPage'
import { saveBlobAs } from '../export/saveBlob'
import type { BillOfLading, BolLineItem, FreightCountedBy, PaymentTerm, TrailerLoadedBy } from '../models/types'
import { useRole } from '../state/RoleContext'
import { isMobileDevice } from '../utils/isMobileDevice'

const PAYMENT_TERMS: PaymentTerm[] = ['PrePaid', 'Collect', '3rd Party']
const TRAILER_LOADED_OPTIONS: TrailerLoadedBy[] = ['By Shipper', 'By Driver']
const FREIGHT_COUNTED_OPTIONS: FreightCountedBy[] = ['By Shipper', 'By Driver/pallets said to contain', 'By Driver/Pieces']

interface EditableLineItem extends Omit<BolLineItem, 'qtyShipped'> {
  qtyShipped: number | ''
}

interface BolDraft {
  date: string
  loadNumber: string
  referenceDoc: string
  paymentTerm: PaymentTerm | ''
  shipFromCompany: string
  shipFromAddress: string
  shipFromPhone: string
  shipToCompany: string
  shipToContact: string
  shipToAddress: string
  shipToPhone: string
  carrier: string
  driverPhone: string
  trailerLoadedBy: TrailerLoadedBy
  freightCountedBy: FreightCountedBy
  lineItems: EditableLineItem[]
}

function draftFromBol(bol: BillOfLading): BolDraft {
  return {
    date: bol.date,
    loadNumber: bol.loadNumber,
    referenceDoc: bol.referenceDoc,
    paymentTerm: bol.paymentTerm,
    shipFromCompany: bol.shipFromCompany,
    shipFromAddress: bol.shipFromAddress,
    shipFromPhone: bol.shipFromPhone,
    shipToCompany: bol.shipToCompany,
    shipToContact: bol.shipToContact,
    shipToAddress: bol.shipToAddress,
    shipToPhone: bol.shipToPhone,
    carrier: bol.carrier,
    driverPhone: bol.driverPhone,
    trailerLoadedBy: bol.trailerLoadedBy ?? '',
    freightCountedBy: bol.freightCountedBy ?? '',
    lineItems: bol.lineItems.map((li) => ({ ...li })),
  }
}

export default function ViewBillOfLading() {
  const { permissions } = useRole()
  const { siteId, bolId } = useParams<{ siteId: string; bolId: string }>()
  const routerLocation = useLocation()
  const bol = useLiveQuery(() => (bolId ? getBillOfLading(bolId) : undefined), [bolId])
  // Reached either from a location's own BOL list (back goes there) or
  // from a specific Sales Order's page (back goes there instead) — the
  // caller says which via navigation state.
  const backState = routerLocation.state as { backTo?: string; backLabel?: string } | null
  const backTo = backState?.backTo ?? `/locations/${siteId}`
  const backLabel = backState?.backLabel ?? 'location'
  const frameRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<BolDraft | null>(null)
  const [savingEdits, setSavingEdits] = useState(false)
  const [signingRole, setSigningRole] = useState<'shipper' | 'carrier' | null>(null)
  const [signing, setSigning] = useState(false)
  const [markingShipped, setMarkingShipped] = useState(false)
  const [confirmingUnship, setConfirmingUnship] = useState(false)
  const bolPhotos = useLiveQuery(() => (bolId ? listBolPhotos(bolId) : []), [bolId]) ?? []
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const selectedPhoto = bolPhotos.find((photo) => photo.id === selectedPhotoId) ?? null
  const [showCamera, setShowCamera] = useState(false)
  const [showPhotoMenu, setShowPhotoMenu] = useState(false)
  const bolPhotoInputRef = useRef<HTMLInputElement>(null)
  const photoMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showPhotoMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (photoMenuRef.current && !photoMenuRef.current.contains(e.target as Node)) {
        setShowPhotoMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPhotoMenu])

  function handleAddPhotoClick() {
    if (isMobileDevice) {
      bolPhotoInputRef.current?.click()
    } else {
      setShowPhotoMenu((prev) => !prev)
    }
  }

  async function handleBolPhotoCaptured(file: File) {
    if (!bolId) return
    await addBolPhoto(bolId, file)
  }

  async function handleBolPhotoFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const file of files) await handleBolPhotoCaptured(file)
  }

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

  function startEditing() {
    if (!bol) return
    setDraft(draftFromBol(bol))
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
    setDraft(null)
  }

  function updateDraft(changes: Partial<BolDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...changes } : prev))
  }

  function updateDraftLineItem(index: number, changes: Partial<EditableLineItem>) {
    setDraft((prev) =>
      prev ? { ...prev, lineItems: prev.lineItems.map((li, i) => (i === index ? { ...li, ...changes } : li)) } : prev,
    )
  }

  function addDraftLineItem() {
    setDraft((prev) =>
      prev
        ? { ...prev, lineItems: [...prev.lineItems, { item: '', description: '', qtyShipped: '', weight: '', qtyReceived: '' }] }
        : prev,
    )
  }

  function removeDraftLineItem(index: number) {
    setDraft((prev) => (prev ? { ...prev, lineItems: prev.lineItems.filter((_, i) => i !== index) } : prev))
  }

  async function handleSaveEdits() {
    if (!bol || !draft) return
    setSavingEdits(true)
    try {
      await updateBillOfLading(bol.id, {
        ...draft,
        brokerInfo: bol.brokerInfo,
        lineItems: draft.lineItems.map((li) => ({ ...li, qtyShipped: li.qtyShipped === '' ? 0 : li.qtyShipped })),
      })
      setIsEditing(false)
      setDraft(null)
    } finally {
      setSavingEdits(false)
    }
  }

  async function handleSaveSignature(dataUrl: string) {
    if (!bol || !signingRole) return
    setSigning(true)
    try {
      await signBillOfLading(bol.id, signingRole, dataUrl)
      setSigningRole(null)
    } finally {
      setSigning(false)
    }
  }

  async function handleMarkShipped() {
    if (!bol) return
    setMarkingShipped(true)
    try {
      await markBillOfLadingShipped(bol.id)
    } finally {
      setMarkingShipped(false)
    }
  }

  async function handleUnmarkShipped() {
    if (!bol) return
    await unmarkBillOfLadingShipped(bol.id)
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
        <Link to={backTo}>Back to {backLabel}</Link>
      </main>
    )
  }

  const canEditSignatures = permissions.generateBillOfLading && !bol.shippedAt
  // Line item quantities now feed directly into a Sales Order's shipped
  // vs. remaining totals, so once a BOL is actually shipped they're
  // locked — changing them after the fact would silently throw off
  // numbers that are already accounted for elsewhere. Same reasoning as
  // locking the signatures once shipped, just extended to line items.
  const lineItemsLocked = bol.shippedAt > 0

  return (
    <main className="page page-wide bol-document">
      <p className="no-print">
        <Link to={backTo}>← Back to {backLabel}</Link>
      </p>
      <div className="dialog-actions no-print">
        <button type="button" onClick={() => window.print()} disabled={isEditing}>
          Print
        </button>
        <button type="button" onClick={handleSave} disabled={isEditing || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {!isEditing && permissions.generateBillOfLading && (
          <button type="button" onClick={startEditing}>
            Edit
          </button>
        )}
        {isEditing && (
          <>
            <button type="button" onClick={handleSaveEdits} disabled={savingEdits}>
              {savingEdits ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={cancelEditing} disabled={savingEdits}>
              Cancel
            </button>
          </>
        )}
      </div>
      {exportError && <p className="field-error no-print">{exportError}</p>}

      <div className="bol-print-frame" ref={frameRef}>
        <div className="bol-sheet" ref={sheetRef}>
          <div className="bol-header">
            <table className="bol-header-table">
              <tbody>
                <tr>
                  <td>
                    Date:{' '}
                    {isEditing && draft ? (
                      <input
                        type="date"
                        className="bol-inline-input"
                        value={draft.date}
                        onChange={(e) => updateDraft({ date: e.target.value })}
                      />
                    ) : (
                      bol.date
                    )}
                  </td>
                </tr>
                <tr>
                  <td>
                    Reference Doc:{' '}
                    {isEditing && draft ? (
                      <input
                        type="text"
                        className="bol-inline-input"
                        value={draft.referenceDoc}
                        onChange={(e) => updateDraft({ referenceDoc: e.target.value })}
                      />
                    ) : (
                      bol.referenceDoc
                    )}
                  </td>
                </tr>
                <tr>
                  <td>
                    Truck #:{' '}
                    {isEditing && draft ? (
                      <input
                        type="text"
                        className="bol-inline-input"
                        value={draft.loadNumber}
                        onChange={(e) => updateDraft({ loadNumber: e.target.value })}
                      />
                    ) : (
                      bol.loadNumber
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="bol-title">
              <h1>BILL OF LADING</h1>
              <div className="bol-payment-terms">
                {isEditing && draft
                  ? PAYMENT_TERMS.map((term) => (
                      <label key={term} className="bol-inline-radio">
                        <input
                          type="radio"
                          name="bol-payment-term"
                          checked={draft.paymentTerm === term}
                          onChange={() => updateDraft({ paymentTerm: term })}
                        />
                        {term}
                      </label>
                    ))
                  : PAYMENT_TERMS.map((term) => (
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
              {isEditing && draft ? (
                <>
                  <p>
                    <strong>Company:</strong>{' '}
                    <input
                      type="text"
                      className="bol-inline-input"
                      value={draft.shipFromCompany}
                      onChange={(e) => updateDraft({ shipFromCompany: e.target.value })}
                    />
                  </p>
                  <p>
                    <strong>Address:</strong>{' '}
                    <input
                      type="text"
                      className="bol-inline-input"
                      value={draft.shipFromAddress}
                      onChange={(e) => updateDraft({ shipFromAddress: e.target.value })}
                    />
                  </p>
                  <p>
                    <strong>Phone:</strong>{' '}
                    <input
                      type="text"
                      className="bol-inline-input"
                      value={draft.shipFromPhone}
                      onChange={(e) => updateDraft({ shipFromPhone: e.target.value })}
                    />
                  </p>
                  <p>
                    <strong>Carrier:</strong>{' '}
                    <input
                      type="text"
                      className="bol-inline-input"
                      value={draft.carrier}
                      onChange={(e) => updateDraft({ carrier: e.target.value })}
                    />
                  </p>
                  <p>
                    <strong>Driver Phone:</strong>{' '}
                    <input
                      type="text"
                      className="bol-inline-input"
                      value={draft.driverPhone}
                      onChange={(e) => updateDraft({ driverPhone: e.target.value })}
                    />
                  </p>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
            <div className="bol-party">
              <h3>SHIP TO</h3>
              {isEditing && draft ? (
                <>
                  <p>
                    <strong>Company:</strong>{' '}
                    <input
                      type="text"
                      className="bol-inline-input"
                      value={draft.shipToCompany}
                      onChange={(e) => updateDraft({ shipToCompany: e.target.value })}
                    />
                  </p>
                  <p>
                    <strong>Attn:</strong>{' '}
                    <input
                      type="text"
                      className="bol-inline-input"
                      value={draft.shipToContact}
                      onChange={(e) => updateDraft({ shipToContact: e.target.value })}
                    />
                  </p>
                  <p>
                    <strong>Address:</strong>{' '}
                    <input
                      type="text"
                      className="bol-inline-input"
                      value={draft.shipToAddress}
                      onChange={(e) => updateDraft({ shipToAddress: e.target.value })}
                    />
                  </p>
                  <p>
                    <strong>Phone:</strong>{' '}
                    <input
                      type="text"
                      className="bol-inline-input"
                      value={draft.shipToPhone}
                      onChange={(e) => updateDraft({ shipToPhone: e.target.value })}
                    />
                  </p>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>

          <table className="bol-line-items">
            <thead>
              <tr>
                <th>QTY Shipped</th>
                <th>Weight (lbs)</th>
                <th>QTY Received</th>
                <th>Item Description</th>
                {isEditing && !lineItemsLocked && <th className="no-print"></th>}
              </tr>
            </thead>
            <tbody>
              {isEditing && draft && !lineItemsLocked
                ? draft.lineItems.map((li, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          type="number"
                          inputMode="numeric"
                          className="bol-inline-input"
                          value={li.qtyShipped}
                          onChange={(e) =>
                            updateDraftLineItem(index, {
                              qtyShipped: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="bol-inline-input"
                          value={li.weight}
                          onChange={(e) => updateDraftLineItem(index, { weight: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="bol-inline-input"
                          value={li.qtyReceived}
                          onChange={(e) => updateDraftLineItem(index, { qtyReceived: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="bol-inline-input"
                          placeholder="Item"
                          value={li.item}
                          onChange={(e) => updateDraftLineItem(index, { item: e.target.value })}
                        />
                        <input
                          type="text"
                          className="bol-inline-input"
                          placeholder="Description"
                          value={li.description}
                          onChange={(e) => updateDraftLineItem(index, { description: e.target.value })}
                        />
                      </td>
                      <td className="no-print">
                        <button type="button" className="delete-button" onClick={() => removeDraftLineItem(index)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                : bol.lineItems.map((li, index) => (
                    <tr key={index}>
                      <td>{li.qtyShipped}</td>
                      <td>{li.weight}</td>
                      <td>{li.qtyReceived}</td>
                      <td>{[li.item, li.description].filter(Boolean).join(' — ')}</td>
                    </tr>
                  ))}
              {(!isEditing || lineItemsLocked) &&
                Array.from({ length: Math.max(0, 5 - bol.lineItems.length) }).map((_, i) => (
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
                {isEditing && !lineItemsLocked && <td className="no-print"></td>}
              </tr>
            </tbody>
          </table>

          {isEditing && !lineItemsLocked && (
            <div className="no-print">
              <button type="button" onClick={addDraftLineItem}>
                + Add Line
              </button>
            </div>
          )}
          {isEditing && lineItemsLocked && (
            <p className="placeholder-note no-print">
              Line items can't be changed once this BOL has been marked shipped.
            </p>
          )}

          <div className="bol-signatures">
            <div className="bol-signature-block">
              {bol.shipperSignatureImage ? (
                canEditSignatures ? (
                  <button
                    type="button"
                    className="bol-signature-line bol-signature-signed bol-signature-signed-editable"
                    onClick={() => setSigningRole('shipper')}
                    disabled={isEditing}
                  >
                    <img src={bol.shipperSignatureImage} alt="Shipper signature" className="bol-signature-image" />
                    <span>Date: {new Date(bol.shipperSignedAt).toLocaleDateString()}</span>
                  </button>
                ) : (
                  <p className="bol-signature-line bol-signature-signed">
                    <img src={bol.shipperSignatureImage} alt="Shipper signature" className="bol-signature-image" />
                    <span>Date: {new Date(bol.shipperSignedAt).toLocaleDateString()}</span>
                  </p>
                )
              ) : canEditSignatures ? (
                <button
                  type="button"
                  className="bol-signature-line bol-signature-blank"
                  onClick={() => setSigningRole('shipper')}
                  disabled={isEditing}
                >
                  X ________________________________ Date: __________
                </button>
              ) : (
                <p className="bol-signature-line">X ________________________________ Date: __________</p>
              )}
              <p className="bol-signature-label">SHIPPER SIGNATURE</p>
              <p className="bol-signature-fine">
                This certifies that the above-named materials are properly classified, packaged, marked, and
                labeled, and are in proper condition for transportation according to the applicable
                regulations of the DOT. All cargo tendered for transportation is subject to inspection, and
                shipper grants consent to such inspection.
              </p>
            </div>
            <div className="bol-signature-block">
              {bol.carrierSignatureImage ? (
                canEditSignatures ? (
                  <button
                    type="button"
                    className="bol-signature-line bol-signature-signed bol-signature-signed-editable"
                    onClick={() => setSigningRole('carrier')}
                    disabled={isEditing}
                  >
                    <img src={bol.carrierSignatureImage} alt="Carrier signature" className="bol-signature-image" />
                    <span>Date: {new Date(bol.carrierSignedAt).toLocaleDateString()}</span>
                  </button>
                ) : (
                  <p className="bol-signature-line bol-signature-signed">
                    <img src={bol.carrierSignatureImage} alt="Carrier signature" className="bol-signature-image" />
                    <span>Date: {new Date(bol.carrierSignedAt).toLocaleDateString()}</span>
                  </p>
                )
              ) : canEditSignatures ? (
                <button
                  type="button"
                  className="bol-signature-line bol-signature-blank"
                  onClick={() => setSigningRole('carrier')}
                  disabled={isEditing}
                >
                  X ________________________________ Date: __________
                </button>
              ) : (
                <p className="bol-signature-line">X ________________________________ Date: __________</p>
              )}
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
              {isEditing && draft
                ? TRAILER_LOADED_OPTIONS.map((option) => (
                    <label key={option} className="bol-inline-radio">
                      <input
                        type="radio"
                        name="bol-trailer-loaded-by"
                        checked={draft.trailerLoadedBy === option}
                        onChange={() => updateDraft({ trailerLoadedBy: option })}
                      />
                      {option}
                    </label>
                  ))
                : TRAILER_LOADED_OPTIONS.map((option) => (
                    <p key={option}>
                      {bol.trailerLoadedBy === option ? '☑' : '☐'} {option}
                    </p>
                  ))}
            </div>
            <div className="bol-checklist">
              <p className="bol-signature-label">Freight Counted</p>
              {isEditing && draft
                ? FREIGHT_COUNTED_OPTIONS.map((option) => (
                    <label key={option} className="bol-inline-radio">
                      <input
                        type="radio"
                        name="bol-freight-counted-by"
                        checked={draft.freightCountedBy === option}
                        onChange={() => updateDraft({ freightCountedBy: option })}
                      />
                      {option}
                    </label>
                  ))
                : FREIGHT_COUNTED_OPTIONS.map((option) => (
                    <p key={option}>
                      {bol.freightCountedBy === option ? '☑' : '☐'} {option}
                    </p>
                  ))}
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

      {!!bol.shippedAt && (
        <div className="bol-mark-shipped">
          <p className="bol-shipped-confirmation">
            ✔ Marked as Shipped — {new Date(bol.shippedAt).toLocaleString()}
          </p>
          {permissions.generateBillOfLading && (
            <button type="button" className="no-print" onClick={() => setConfirmingUnship(true)}>
              Undo Mark as Shipped
            </button>
          )}
        </div>
      )}

      {confirmingUnship && (
        <ConfirmDeleteDialog
          onConfirm={handleUnmarkShipped}
          onClose={() => setConfirmingUnship(false)}
          message="Undo Mark as Shipped on this BOL? Line items and shipment photos become editable again, and any Sales Order this covers will no longer count it as shipped."
          confirmLabel="Undo"
          confirmingLabel="Undoing…"
        />
      )}

      {!bol.shippedAt && bol.shipperSignatureImage && bol.carrierSignatureImage && permissions.generateBillOfLading && (
        <div className="bol-mark-shipped no-print">
          <button type="button" onClick={handleMarkShipped} disabled={markingShipped || isEditing}>
            {markingShipped ? 'Marking…' : 'Mark as Shipped'}
          </button>
          <div className="photo-add-wrapper" ref={photoMenuRef}>
            <button type="button" onClick={handleAddPhotoClick} disabled={isEditing}>
              Add Photo
            </button>
            {!isMobileDevice && showPhotoMenu && (
              <div className="photo-add-menu">
                <button
                  type="button"
                  onClick={() => {
                    setShowCamera(true)
                    setShowPhotoMenu(false)
                  }}
                >
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    bolPhotoInputRef.current?.click()
                    setShowPhotoMenu(false)
                  }}
                >
                  Add From Files
                </button>
              </div>
            )}
          </div>
          <input
            ref={bolPhotoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="photo-file-input"
            onChange={handleBolPhotoFilesSelected}
          />
        </div>
      )}

      {bolPhotos.length > 0 && (
        <div className="item-section no-print">
          <h2>Shipment Photos</h2>
          <div className="photo-thumbnails">
            {bolPhotos.map((photo) => (
              <div
                className="photo-thumb photo-thumb-button"
                key={photo.id}
                onClick={() => setSelectedPhotoId(photo.id)}
              >
                <BlobImage blob={photo.blob} />
                {!bol.shippedAt && (
                  <button
                    type="button"
                    className="photo-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteBolPhoto(photo.id)
                    }}
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedPhoto && (
        <div className="photo-viewer-overlay" onClick={() => setSelectedPhotoId(null)}>
          <button
            type="button"
            className="photo-viewer-close"
            onClick={() => setSelectedPhotoId(null)}
            aria-label="Close"
          >
            ×
          </button>
          <div className="photo-viewer-image" onClick={(e) => e.stopPropagation()}>
            <BlobImage blob={selectedPhoto.blob} />
          </div>
        </div>
      )}

      {showCamera && (
        <CameraCapture onCapture={handleBolPhotoCaptured} onClose={() => setShowCamera(false)} />
      )}

      {signingRole && (
        <SignaturePad
          title={signingRole === 'shipper' ? 'Shipper Signature' : 'Carrier Signature'}
          existingImage={signingRole === 'shipper' ? bol.shipperSignatureImage : bol.carrierSignatureImage}
          onSave={handleSaveSignature}
          onCancel={() => setSigningRole(null)}
          saving={signing}
        />
      )}
    </main>
  )
}
