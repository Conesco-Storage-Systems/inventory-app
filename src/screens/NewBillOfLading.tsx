import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { createBillOfLading } from '../db/billsOfLading'
import { db } from '../db/db'
import { groupBeams, type BeamRow } from '../db/groupBeams'
import { groupMiscItems, type MiscItemRow } from '../db/groupMiscItems'
import { groupUprights, type UprightRow } from '../db/groupUprights'
import { groupWireDecks, type WireDeckRow } from '../db/groupWireDecks'
import { listBeamsBySite, listMiscItemsBySite, listUprightsBySite, listWireDecksBySite } from '../db/items'
import type { BolDirection, BolLineItem, PaymentTerm } from '../models/types'
import { useRole } from '../state/RoleContext'

const PAYMENT_TERMS: PaymentTerm[] = ['PrePaid', 'Collect', '3rd Party']

interface AvailableRow {
  key: string
  itemLabel: string
  description: string
  available: number
}

interface EditableLineItem extends Omit<BolLineItem, 'qtyShipped'> {
  qtyShipped: number | ''
}

function describeBeam(row: BeamRow): string {
  return [row.style, row.widthByLength, row.color, row.pinCount && `${row.pinCount} pin`, row.step && `${row.step} step`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeUpright(row: UprightRow): string {
  return [row.style, row.widthByHeight, row.color, row.gauge && `${row.gauge} ga`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeWireDeck(row: WireDeckRow): string {
  return [row.style.join('/'), row.widthByLength, row.channelCount && `${row.channelCount} channel`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeMisc(row: MiscItemRow): string {
  return [row.description, row.itemDescription, row.condition].filter(Boolean).join(', ')
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function NewBillOfLading() {
  const { permissions } = useRole()
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const preselectedKeys = (location.state as { preselected?: string[] } | null)?.preselected
  const appliedPreselectRef = useRef(false)
  const site = useLiveQuery(() => (siteId ? db.sites.get(siteId) : undefined), [siteId])
  const uprights = useLiveQuery(() => (siteId ? listUprightsBySite(siteId) : []), [siteId]) ?? []
  const beams = useLiveQuery(() => (siteId ? listBeamsBySite(siteId) : []), [siteId]) ?? []
  const wireDecks = useLiveQuery(() => (siteId ? listWireDecksBySite(siteId) : []), [siteId]) ?? []
  const miscItems = useLiveQuery(() => (siteId ? listMiscItemsBySite(siteId) : []), [siteId]) ?? []

  const availableRows: AvailableRow[] = [
    ...groupBeams(beams).map((row) => ({
      key: `beam:${row.key}`,
      itemLabel: 'Used Beams',
      description: describeBeam(row),
      available: row.quantity,
    })),
    ...groupUprights(uprights).map((row) => ({
      key: `upright:${row.key}`,
      itemLabel: 'Used Uprights',
      description: describeUpright(row),
      available: row.quantity,
    })),
    ...groupWireDecks(wireDecks).map((row) => ({
      key: `wireDeck:${row.key}`,
      itemLabel: 'Used Wire Decks',
      description: describeWireDeck(row),
      available: row.quantity,
    })),
    ...groupMiscItems(miscItems).map((row) => ({
      key: `misc:${row.key}`,
      itemLabel: row.description || 'Other',
      description: describeMisc(row),
      available: row.quantity,
    })),
  ]

  const [direction, setDirection] = useState<BolDirection>('outbound')
  const [date, setDate] = useState(todayIso())
  const [loadNumber, setLoadNumber] = useState('')
  const [referenceDoc, setReferenceDoc] = useState('')
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm | ''>('')
  const [otherCompany, setOtherCompany] = useState('')
  const [otherContact, setOtherContact] = useState('')
  const [otherAddress, setOtherAddress] = useState('')
  const [otherPhone, setOtherPhone] = useState('')
  const [carrier, setCarrier] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [brokerInfo, setBrokerInfo] = useState('')
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([])
  const [selectedRowKey, setSelectedRowKey] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (appliedPreselectRef.current) return
    if (!preselectedKeys || preselectedKeys.length === 0) {
      appliedPreselectRef.current = true
      return
    }
    if (availableRows.length === 0) return
    const matched = preselectedKeys
      .map((key) => availableRows.find((row) => row.key === key))
      .filter((row): row is AvailableRow => !!row)
    if (matched.length > 0) {
      setLineItems((prev) => [
        ...prev,
        ...matched.map((row) => ({
          item: row.itemLabel,
          description: row.description,
          qtyShipped: row.available,
          weight: '',
          qtyReceived: '',
        })),
      ])
    }
    appliedPreselectRef.current = true
  }, [availableRows, preselectedKeys])

  if (site === undefined) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    )
  }

  if (!site) {
    return (
      <main className="page">
        <p>Location not found.</p>
        <Link to="/">Back to locations</Link>
      </main>
    )
  }

  if (!permissions.generateBillOfLading) {
    return (
      <main className="page">
        <p>
          <Link to={`/locations/${siteId}`}>← Back</Link>
        </p>
        <p>Your role doesn't have permission to generate a Bill of Lading.</p>
      </main>
    )
  }

  function handleAddLineItem() {
    const row = availableRows.find((r) => r.key === selectedRowKey)
    if (!row) return
    setLineItems((prev) => [
      ...prev,
      { item: row.itemLabel, description: row.description, qtyShipped: row.available, weight: '', qtyReceived: '' },
    ])
    setSelectedRowKey('')
  }

  function updateLineItem(index: number, changes: Partial<EditableLineItem>) {
    setLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, ...changes } : li)))
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (!siteId || !site) return
    setSaving(true)
    try {
      const bolId = await createBillOfLading({
        siteId,
        direction,
        date,
        loadNumber,
        referenceDoc,
        paymentTerm,
        shipFromCompany: direction === 'outbound' ? site.name : otherCompany,
        shipFromAddress: direction === 'outbound' ? site.address : otherAddress,
        shipFromPhone: direction === 'outbound' ? '' : otherPhone,
        shipToCompany: direction === 'outbound' ? otherCompany : site.name,
        shipToContact: direction === 'outbound' ? otherContact : '',
        shipToAddress: direction === 'outbound' ? otherAddress : site.address,
        shipToPhone: direction === 'outbound' ? otherPhone : '',
        carrier,
        driverPhone,
        brokerInfo,
        lineItems: lineItems.map((li) => ({ ...li, qtyShipped: li.qtyShipped === '' ? 0 : li.qtyShipped })),
      })
      navigate(`/locations/${siteId}/bol/${bolId}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to={`/locations/${siteId}`}>← Back</Link>
      </p>
      <h1>New Bill of Lading</h1>

      <div className="site-edit-form">
        <label>
          Direction
          <select value={direction} onChange={(e) => setDirection(e.target.value as BolDirection)}>
            <option value="outbound">Shipping FROM {site.name} (outbound)</option>
            <option value="inbound">Shipping TO {site.name} (inbound)</option>
          </select>
        </label>

        <div className="field-row">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Load #
            <input type="text" value={loadNumber} onChange={(e) => setLoadNumber(e.target.value)} />
          </label>
          <label>
            Reference Doc #
            <input type="text" value={referenceDoc} onChange={(e) => setReferenceDoc(e.target.value)} />
          </label>
        </div>

        <fieldset className="checkbox-fieldset">
          <legend>Payment Term</legend>
          <div className="checkbox-options">
            {PAYMENT_TERMS.map((term) => (
              <label key={term} className="checkbox-option">
                <input
                  type="radio"
                  name="paymentTerm"
                  checked={paymentTerm === term}
                  onChange={() => setPaymentTerm(term)}
                />
                {term}
              </label>
            ))}
          </div>
        </fieldset>

        <p>
          <strong>{direction === 'outbound' ? 'Ship From' : 'Ship To'}:</strong> {site.name}
          {site.address ? ` — ${site.address}` : ''}
        </p>

        <h2>{direction === 'outbound' ? 'Ship To' : 'Ship From'}</h2>
        <label>
          Company
          <input type="text" value={otherCompany} onChange={(e) => setOtherCompany(e.target.value)} />
        </label>
        {direction === 'outbound' && (
          <label>
            Contact
            <input type="text" value={otherContact} onChange={(e) => setOtherContact(e.target.value)} />
          </label>
        )}
        <label>
          Address
          <input type="text" value={otherAddress} onChange={(e) => setOtherAddress(e.target.value)} />
        </label>
        <label>
          Phone
          <input type="text" value={otherPhone} onChange={(e) => setOtherPhone(e.target.value)} />
        </label>

        <div className="field-row">
          <label>
            Carrier
            <input type="text" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          </label>
          <label>
            Driver Phone
            <input type="text" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
          </label>
        </div>

        <label>
          Broker Information
          <textarea value={brokerInfo} onChange={(e) => setBrokerInfo(e.target.value)} rows={2} />
        </label>
      </div>

      <h2>Line Items</h2>
      <div className="field-row">
        <label>
          Add item from inventory
          <select value={selectedRowKey} onChange={(e) => setSelectedRowKey(e.target.value)}>
            <option value="">Select an item…</option>
            {availableRows.map((row) => (
              <option key={row.key} value={row.key}>
                {row.itemLabel} — {row.description} ({row.available} available)
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={handleAddLineItem} disabled={!selectedRowKey}>
          + Add to BOL
        </button>
      </div>

      {lineItems.length === 0 ? (
        <p className="placeholder-note">No line items added yet.</p>
      ) : (
        <div className="item-table-wrap">
          <table className="item-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Description</th>
                <th>Qty Shipped</th>
                <th>Weight (lbs)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, index) => (
                <tr key={index}>
                  <td>{li.item}</td>
                  <td>
                    <input
                      type="text"
                      value={li.description}
                      onChange={(e) => updateLineItem(index, { description: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={li.qtyShipped}
                      onChange={(e) =>
                        updateLineItem(index, {
                          qtyShipped: e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={li.weight}
                      onChange={(e) => updateLineItem(index, { weight: e.target.value })}
                    />
                  </td>
                  <td>
                    <button type="button" className="delete-button" onClick={() => removeLineItem(index)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="save-item-row">
        <button type="button" onClick={handleSave} disabled={saving || lineItems.length === 0}>
          {saving ? 'Saving…' : 'Generate Bill of Lading'}
        </button>
      </div>
    </main>
  )
}
