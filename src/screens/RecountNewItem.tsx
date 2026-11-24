import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BeamForm, { emptyBeamDraft, type BeamDraft } from '../components/BeamForm'
import MiscItemForm, { emptyMiscItemDraft, type MiscItemDraft } from '../components/MiscItemForm'
import UprightForm, { emptyUprightDraft, type UprightDraft } from '../components/UprightForm'
import WireDeckForm, { emptyWireDeckDraft, type WireDeckDraft } from '../components/WireDeckForm'
import { addRecountLineItem } from '../db/recounts'
import { ITEM_TYPE_LABELS, type ItemType } from '../models/types'
import { useRole } from '../state/RoleContext'

const ITEM_TYPE_ORDER: ItemType[] = ['beam', 'wireDeck', 'upright', 'misc']

export default function RecountNewItem() {
  const { permissions } = useRole()
  const { siteId, recountId } = useParams<{ siteId: string; recountId: string }>()
  const navigate = useNavigate()

  const [itemType, setItemType] = useState<ItemType | ''>('')
  const [beamDraft, setBeamDraft] = useState<BeamDraft>(emptyBeamDraft)
  const [wireDeckDraft, setWireDeckDraft] = useState<WireDeckDraft>(emptyWireDeckDraft)
  const [uprightDraft, setUprightDraft] = useState<UprightDraft>(emptyUprightDraft)
  const [miscDraft, setMiscDraft] = useState<MiscItemDraft>(emptyMiscItemDraft)
  const [saving, setSaving] = useState(false)

  const beamReady = beamDraft.condition !== '' && beamDraft.quantity.trim() !== ''
  const wireDeckReady = wireDeckDraft.condition !== '' && wireDeckDraft.quantity.trim() !== ''
  const uprightReady = uprightDraft.condition !== '' && uprightDraft.quantity.trim() !== ''
  const miscReady = miscDraft.condition !== '' && miscDraft.quantity.trim() !== ''

  function backToRecount() {
    navigate(`/locations/${siteId}/recounts/${recountId}`)
  }

  async function handleSaveBeam() {
    if (!siteId || !recountId || !beamReady) return
    setSaving(true)
    try {
      await addRecountLineItem({
        recountId,
        siteId,
        itemType: 'beam',
        quantity: Number(beamDraft.quantity),
        condition: beamDraft.condition === 'Other' ? beamDraft.conditionOther : beamDraft.condition,
        bundleSize: beamDraft.bundleSize,
        zone: beamDraft.zone,
        notes: beamDraft.notes,
        recordedBy: '',
        costPer: Number(beamDraft.costPer) || 0,
        sellPer: Number(beamDraft.sellPer) || 0,
        length: beamDraft.length,
        width: beamDraft.width,
        color: beamDraft.color === 'Other' ? beamDraft.colorOther : beamDraft.color,
        pinCount: beamDraft.pinCount === 'Other' ? beamDraft.pinCountOther : beamDraft.pinCount,
        stamp: beamDraft.stamp,
        style: beamDraft.style === 'Other' ? beamDraft.styleOther : beamDraft.style,
        stickers: beamDraft.stickers,
        step: beamDraft.step === 'Other' ? beamDraft.stepOther : beamDraft.step,
        height: '',
        columnLength: '',
        columnWidth: '',
        footplateLength: '',
        footplateWidth: '',
        footplateThickness: '',
        anchorHoleCount: '',
        holeSize: '',
        gauge: '',
        channelCount: '',
        wireDeckStyle: [],
        description: '',
        itemDescription: '',
        photoFiles: beamDraft.photos,
      })
      backToRecount()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveWireDeck() {
    if (!siteId || !recountId || !wireDeckReady) return
    setSaving(true)
    try {
      await addRecountLineItem({
        recountId,
        siteId,
        itemType: 'wireDeck',
        quantity: Number(wireDeckDraft.quantity),
        condition: wireDeckDraft.condition === 'Other' ? wireDeckDraft.conditionOther : wireDeckDraft.condition,
        bundleSize: wireDeckDraft.bundleSize,
        zone: wireDeckDraft.zone,
        notes: wireDeckDraft.notes,
        recordedBy: '',
        costPer: Number(wireDeckDraft.costPer) || 0,
        sellPer: Number(wireDeckDraft.sellPer) || 0,
        length: wireDeckDraft.length,
        width: wireDeckDraft.width,
        color: '',
        pinCount: '',
        stamp: '',
        style: '',
        stickers: '',
        step: '',
        height: '',
        columnLength: '',
        columnWidth: '',
        footplateLength: '',
        footplateWidth: '',
        footplateThickness: '',
        anchorHoleCount: '',
        holeSize: '',
        gauge: '',
        channelCount: wireDeckDraft.channelCount === 'Other' ? wireDeckDraft.channelCountOther : wireDeckDraft.channelCount,
        wireDeckStyle: wireDeckDraft.style.map((s) => (s === 'Other' ? wireDeckDraft.styleOther : s)).filter(Boolean),
        description: '',
        itemDescription: '',
        photoFiles: wireDeckDraft.photos,
      })
      backToRecount()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveUpright() {
    if (!siteId || !recountId || !uprightReady) return
    setSaving(true)
    try {
      await addRecountLineItem({
        recountId,
        siteId,
        itemType: 'upright',
        quantity: Number(uprightDraft.quantity),
        condition: uprightDraft.condition === 'Other' ? uprightDraft.conditionOther : uprightDraft.condition,
        bundleSize: uprightDraft.bundleSize,
        zone: uprightDraft.zone,
        notes: uprightDraft.notes,
        recordedBy: '',
        costPer: Number(uprightDraft.costPer) || 0,
        sellPer: Number(uprightDraft.sellPer) || 0,
        color: uprightDraft.color === 'Other' ? uprightDraft.colorOther : uprightDraft.color,
        style: uprightDraft.style === 'Other' ? uprightDraft.styleOther : uprightDraft.style,
        width: uprightDraft.width,
        height: uprightDraft.height,
        columnLength: uprightDraft.columnLength,
        columnWidth: uprightDraft.columnWidth,
        footplateLength: uprightDraft.footplateLength,
        footplateWidth: uprightDraft.footplateWidth,
        footplateThickness: uprightDraft.footplateThickness,
        anchorHoleCount: uprightDraft.anchorHoleCount,
        holeSize: uprightDraft.holeSize,
        gauge: uprightDraft.gauge === 'Other' ? uprightDraft.gaugeOther : uprightDraft.gauge,
        stamp: uprightDraft.stamp,
        length: '',
        pinCount: '',
        stickers: '',
        step: '',
        channelCount: '',
        wireDeckStyle: [],
        description: '',
        itemDescription: '',
        photoFiles: uprightDraft.photos,
      })
      backToRecount()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveMisc() {
    if (!siteId || !recountId || !miscReady) return
    setSaving(true)
    try {
      await addRecountLineItem({
        recountId,
        siteId,
        itemType: 'misc',
        quantity: Number(miscDraft.quantity),
        condition: miscDraft.condition === 'Other' ? miscDraft.conditionOther : miscDraft.condition,
        bundleSize: miscDraft.bundleSize,
        zone: miscDraft.zone,
        notes: miscDraft.notes,
        recordedBy: '',
        costPer: Number(miscDraft.costPer) || 0,
        sellPer: Number(miscDraft.sellPer) || 0,
        description: miscDraft.description === 'Other' ? miscDraft.descriptionOther : miscDraft.description,
        itemDescription: miscDraft.itemDescription,
        color: '',
        style: '',
        stamp: '',
        length: '',
        width: '',
        pinCount: '',
        stickers: '',
        step: '',
        height: '',
        columnLength: '',
        columnWidth: '',
        footplateLength: '',
        footplateWidth: '',
        footplateThickness: '',
        anchorHoleCount: '',
        holeSize: '',
        gauge: '',
        channelCount: '',
        wireDeckStyle: [],
        photoFiles: miscDraft.photos,
      })
      backToRecount()
    } finally {
      setSaving(false)
    }
  }

  if (!permissions.addItems) {
    return (
      <main className="page">
        <p>
          <Link to={`/locations/${siteId}/recounts/${recountId}`}>← Back</Link>
        </p>
        <p>Your role doesn't have permission to add items.</p>
      </main>
    )
  }

  return (
    <main className="page">
      <p>
        <Link to={`/locations/${siteId}/recounts/${recountId}`}>← Back to recount</Link>
      </p>
      <h1>Add counted line</h1>

      <label className="item-type-picker">
        Item type
        <select value={itemType} onChange={(e) => setItemType(e.target.value as ItemType | '')}>
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
              Save line
            </button>
          </div>
        </>
      )}

      {itemType === 'wireDeck' && (
        <>
          <WireDeckForm value={wireDeckDraft} onChange={setWireDeckDraft} siteId={siteId} />
          <div className="save-item-row">
            <button type="button" onClick={handleSaveWireDeck} disabled={!wireDeckReady || saving}>
              Save line
            </button>
          </div>
        </>
      )}

      {itemType === 'upright' && (
        <>
          <UprightForm value={uprightDraft} onChange={setUprightDraft} siteId={siteId} />
          <div className="save-item-row">
            <button type="button" onClick={handleSaveUpright} disabled={!uprightReady || saving}>
              Save line
            </button>
          </div>
        </>
      )}

      {itemType === 'misc' && (
        <>
          <MiscItemForm value={miscDraft} onChange={setMiscDraft} siteId={siteId} />
          <div className="save-item-row">
            <button type="button" onClick={handleSaveMisc} disabled={!miscReady || saving}>
              Save line
            </button>
          </div>
        </>
      )}
    </main>
  )
}
