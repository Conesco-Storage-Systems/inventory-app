import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { groupBeams, type BeamRow } from '../db/groupBeams'
import { groupMiscItems, type MiscItemRow } from '../db/groupMiscItems'
import { groupUprights, type UprightRow } from '../db/groupUprights'
import { groupWireDecks, type WireDeckRow } from '../db/groupWireDecks'
import { listBeamsBySite, listMiscItemsBySite, listUprightsBySite, listWireDecksBySite } from '../db/items'
import { linkBolLineItemToSalesOrder } from '../db/salesOrders'
import type { ItemType } from '../models/types'

function describeBeam(row: BeamRow): string {
  return [row.style, row.widthByLength, row.color, row.pinCount && `${row.pinCount} pin`, row.condition].filter(Boolean).join(', ')
}

function describeUpright(row: UprightRow): string {
  return [row.style, row.widthByHeight, row.color, row.gauge && `${row.gauge} ga`, row.condition].filter(Boolean).join(', ')
}

function describeWireDeck(row: WireDeckRow): string {
  return [row.style.join('/'), row.widthByLength, row.channelCount && `${row.channelCount} channel`, row.condition]
    .filter(Boolean)
    .join(', ')
}

function describeMisc(row: MiscItemRow): string {
  return [row.description, row.itemDescription, row.condition].filter(Boolean).join(', ')
}

interface SelectableRow {
  key: string
  itemType: ItemType
  itemIds: string[]
  description: string
  quantity: number
}

interface LinkBolLineItemDialogProps {
  bolId: string
  lineItemIndex: number
  siteId: string
  lineDescription: string
}

export default function LinkBolLineItemDialog({ bolId, lineItemIndex, siteId, lineDescription }: LinkBolLineItemDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [soNumber, setSoNumber] = useState('')
  const [rowKey, setRowKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const beams = useLiveQuery(() => listBeamsBySite(siteId), [siteId]) ?? []
  const uprights = useLiveQuery(() => listUprightsBySite(siteId), [siteId]) ?? []
  const wireDecks = useLiveQuery(() => listWireDecksBySite(siteId), [siteId]) ?? []
  const miscItems = useLiveQuery(() => listMiscItemsBySite(siteId), [siteId]) ?? []

  const rows: SelectableRow[] = [
    ...groupBeams(beams).map((row) => ({
      key: `beam:${row.key}`,
      itemType: 'beam' as ItemType,
      itemIds: row.ids,
      description: describeBeam(row),
      quantity: row.quantity,
    })),
    ...groupUprights(uprights).map((row) => ({
      key: `upright:${row.key}`,
      itemType: 'upright' as ItemType,
      itemIds: row.ids,
      description: describeUpright(row),
      quantity: row.quantity,
    })),
    ...groupWireDecks(wireDecks).map((row) => ({
      key: `wireDeck:${row.key}`,
      itemType: 'wireDeck' as ItemType,
      itemIds: row.ids,
      description: describeWireDeck(row),
      quantity: row.quantity,
    })),
    ...groupMiscItems(miscItems).map((row) => ({
      key: `misc:${row.key}`,
      itemType: 'misc' as ItemType,
      itemIds: row.ids,
      description: describeMisc(row),
      quantity: row.quantity,
    })),
  ]

  const selectedRow = rows.find((row) => row.key === rowKey)
  const ready = soNumber.trim() !== '' && !!selectedRow

  function open() {
    setSoNumber('')
    setRowKey('')
    setError('')
    dialogRef.current?.showModal()
  }

  function close() {
    dialogRef.current?.close()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRow) return
    setSaving(true)
    setError('')
    try {
      await linkBolLineItemToSalesOrder(bolId, lineItemIndex, {
        soNumber: soNumber.trim(),
        itemType: selectedRow.itemType,
        itemIds: selectedRow.itemIds,
        tiedDescription: selectedRow.description,
      })
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link this item.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" className="link-button no-print" onClick={open}>
        Link to Sales Order
      </button>
      <dialog ref={dialogRef} className="location-dialog">
        <form onSubmit={handleSubmit}>
          <h2>Link to Sales Order</h2>
          <p className="placeholder-note">{lineDescription}</p>
          <label>
            SO Number
            <input
              type="text"
              value={soNumber}
              onChange={(e) => setSoNumber(e.target.value)}
              placeholder="e.g. SOINV069752"
              autoFocus
            />
          </label>
          <label>
            Inventory Item
            <select value={rowKey} onChange={(e) => setRowKey(e.target.value)}>
              <option value="">Select the item this line represents…</option>
              {rows.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.description} ({row.quantity} on hand)
                </option>
              ))}
            </select>
          </label>
          {error && <p className="field-error">{error}</p>}
          <div className="dialog-actions">
            <button type="button" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={!ready || saving}>
              {saving ? 'Linking…' : 'Link'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
