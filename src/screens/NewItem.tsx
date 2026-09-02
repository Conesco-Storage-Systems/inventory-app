import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BeamForm, { emptyBeamDraft, type BeamDraft } from '../components/BeamForm'
import UprightForm, { emptyUprightDraft, type UprightDraft } from '../components/UprightForm'
import WireDeckForm, { emptyWireDeckDraft, type WireDeckDraft } from '../components/WireDeckForm'
import { createBeam, createUpright, createWireDeck } from '../db/items'
import { ITEM_TYPE_LABELS, type Condition, type ItemType } from '../models/types'

const ITEM_TYPE_ORDER: ItemType[] = ['beam', 'wireDeck', 'upright', 'misc']

export default function NewItem() {
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const [itemType, setItemType] = useState<ItemType | ''>('')
  const [beamDraft, setBeamDraft] = useState<BeamDraft>(emptyBeamDraft)
  const [wireDeckDraft, setWireDeckDraft] = useState<WireDeckDraft>(emptyWireDeckDraft)
  const [uprightDraft, setUprightDraft] = useState<UprightDraft>(emptyUprightDraft)
  const [saving, setSaving] = useState(false)

  const beamReady = beamDraft.condition !== '' && beamDraft.quantity.trim() !== ''
  const wireDeckReady = wireDeckDraft.condition !== '' && wireDeckDraft.quantity.trim() !== ''
  const uprightReady = uprightDraft.condition !== '' && uprightDraft.quantity.trim() !== ''

  async function handleSaveBeam() {
    if (!siteId || !beamReady) return
    setSaving(true)
    try {
      await createBeam({
        siteId,
        quantity: Number(beamDraft.quantity),
        condition: beamDraft.condition as Condition,
        bundleSize: beamDraft.bundleSize,
        notes: beamDraft.notes,
        length: Number(beamDraft.length) || 0,
        width: beamDraft.width,
        color: beamDraft.color === 'Other' ? beamDraft.colorOther : beamDraft.color,
        pinCount: beamDraft.pinCount === 'Other' ? beamDraft.pinCountOther : beamDraft.pinCount,
        stamp: beamDraft.stamp,
        style: beamDraft.style === 'Other' ? beamDraft.styleOther : beamDraft.style,
        stickers: beamDraft.stickers,
        photoFiles: beamDraft.photos,
      })
      navigate(`/locations/${siteId}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveWireDeck() {
    if (!siteId || !wireDeckReady) return
    setSaving(true)
    try {
      await createWireDeck({
        siteId,
        quantity: Number(wireDeckDraft.quantity),
        condition: wireDeckDraft.condition as Condition,
        bundleSize: wireDeckDraft.bundleSize,
        notes: wireDeckDraft.notes,
        length: Number(wireDeckDraft.length) || 0,
        width: Number(wireDeckDraft.width) || 0,
        channelCount:
          wireDeckDraft.channelCount === 'Other'
            ? wireDeckDraft.channelCountOther
            : wireDeckDraft.channelCount,
        style: wireDeckDraft.style
          .map((s) => (s === 'Other' ? wireDeckDraft.styleOther : s))
          .filter(Boolean),
        photoFiles: wireDeckDraft.photos,
      })
      navigate(`/locations/${siteId}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveUpright() {
    if (!siteId || !uprightReady) return
    setSaving(true)
    try {
      await createUpright({
        siteId,
        quantity: Number(uprightDraft.quantity),
        condition: uprightDraft.condition as Condition,
        bundleSize: uprightDraft.bundleSize,
        notes: uprightDraft.notes,
        color: uprightDraft.color === 'Other' ? uprightDraft.colorOther : uprightDraft.color,
        style: uprightDraft.style === 'Other' ? uprightDraft.styleOther : uprightDraft.style,
        width: Number(uprightDraft.width) || 0,
        heightFeet: Number(uprightDraft.heightFeet) || 0,
        heightInches: Number(uprightDraft.heightInches) || 0,
        columnLength: Number(uprightDraft.columnLength) || 0,
        columnWidth: Number(uprightDraft.columnWidth) || 0,
        footplateLength: Number(uprightDraft.footplateLength) || 0,
        footplateWidth: Number(uprightDraft.footplateWidth) || 0,
        anchorHoleCount: Number(uprightDraft.anchorHoleCount) || 0,
        holeSize: uprightDraft.holeSize,
        gauge: uprightDraft.gauge === 'Other' ? uprightDraft.gaugeOther : uprightDraft.gauge,
        stamp: uprightDraft.stamp,
        photoFiles: uprightDraft.photos,
      })
      navigate(`/locations/${siteId}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page">
      <p>
        <Link to={`/locations/${siteId}`}>← Back</Link>
      </p>
      <h1>Add item</h1>

      <label className="item-type-picker">
        Item type
        <select
          value={itemType}
          onChange={(e) => setItemType(e.target.value as ItemType | '')}
        >
          <option value="" disabled>
            Select an item type…
          </option>
          {ITEM_TYPE_ORDER.map((type) => (
            <option key={type} value={type}>
              {ITEM_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>

      {itemType === 'beam' && (
        <>
          <BeamForm value={beamDraft} onChange={setBeamDraft} siteId={siteId} />
          <div className="save-item-row">
            <button type="button" onClick={handleSaveBeam} disabled={!beamReady || saving}>
              Save item
            </button>
          </div>
        </>
      )}

      {itemType === 'wireDeck' && (
        <>
          <WireDeckForm value={wireDeckDraft} onChange={setWireDeckDraft} siteId={siteId} />
          <div className="save-item-row">
            <button type="button" onClick={handleSaveWireDeck} disabled={!wireDeckReady || saving}>
              Save item
            </button>
          </div>
        </>
      )}

      {itemType === 'upright' && (
        <>
          <UprightForm value={uprightDraft} onChange={setUprightDraft} siteId={siteId} />
          <div className="save-item-row">
            <button type="button" onClick={handleSaveUpright} disabled={!uprightReady || saving}>
              Save item
            </button>
          </div>
        </>
      )}

      {itemType && itemType !== 'beam' && itemType !== 'wireDeck' && itemType !== 'upright' && (
        <p className="placeholder-note">
          {ITEM_TYPE_LABELS[itemType]} fields are coming in the next round of changes. Nothing is
          saved yet.
        </p>
      )}
    </main>
  )
}
