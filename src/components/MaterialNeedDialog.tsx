import { useRef, useState } from 'react'
import { BEAM_COLOR_OPTIONS, BEAM_PIN_COUNT_OPTIONS, BEAM_STEP_OPTIONS, BEAM_STYLE_OPTIONS, STICKERS_OPTIONS } from './BeamForm'
import InchInput from './InchInput'
import { CHANNEL_COUNT_OPTIONS, WIRE_DECK_STYLE_OPTIONS } from './WireDeckForm'
import { MISC_ITEM_OPTIONS } from './MiscItemForm'
import SingleSelectCheckboxGroup from './SingleSelectCheckboxGroup'
import { GAUGE_OPTIONS, UPRIGHT_STYLE_OPTIONS } from './UprightForm'
import { createMaterialNeed, updateMaterialNeed, type MaterialNeedInput } from '../db/materialNeeds'
import { CONDITIONS, ITEM_TYPE_LABELS, type ItemType, type MaterialNeed } from '../models/types'

interface MaterialNeedDialogProps {
  projectId: string
  jobSiteId: string
  existing?: MaterialNeed
  label: string
}

// Every field below (minus Photos, which doesn't apply to material that
// doesn't physically exist yet) mirrors the real "+ Add Item" forms field
// for field, option for option, so a Material Need captures everything
// those forms do — nothing gets missed for permitting/engineering. See
// the comment on MaterialNeed in models/types.ts for why live sourcing
// still only matches on the dimension fields, not all of these.
interface Draft {
  quantityNeeded: string
  notes: string
  condition: string
  conditionOther: string
  color: string
  colorOther: string
  style: string
  styleOther: string
  stamp: string
  length: string
  width: string
  pinCount: string
  pinCountOther: string
  stickers: string
  step: string
  stepOther: string
  height: string
  columnLength: string
  columnWidth: string
  footplateLength: string
  footplateWidth: string
  footplateThickness: string
  anchorHoleCount: string
  holeSize: string
  gauge: string
  gaugeOther: string
  channelCount: string
  channelCountOther: string
  wireDeckStyle: string[]
  wireDeckStyleOther: string
  description: string
  descriptionOther: string
  itemDescription: string
}

const EMPTY_DRAFT: Draft = {
  quantityNeeded: '',
  notes: '',
  condition: '',
  conditionOther: '',
  color: '',
  colorOther: '',
  style: '',
  styleOther: '',
  stamp: '',
  length: '',
  width: '',
  pinCount: '',
  pinCountOther: '',
  stickers: '',
  step: '',
  stepOther: '',
  height: '',
  columnLength: '',
  columnWidth: '',
  footplateLength: '',
  footplateWidth: '',
  footplateThickness: '',
  anchorHoleCount: '',
  holeSize: '',
  gauge: '',
  gaugeOther: '',
  channelCount: '',
  channelCountOther: '',
  wireDeckStyle: [],
  wireDeckStyleOther: '',
  description: '',
  descriptionOther: '',
  itemDescription: '',
}

// Splits a stored value back into (selected option, custom "Other" text)
// for editing — a value that isn't one of the base options is necessarily
// a previously-typed custom one, same as the real forms' own *Other split.
function splitOption(value: string, options: readonly string[]): { selected: string; other: string } {
  if (!value) return { selected: '', other: '' }
  return options.includes(value) ? { selected: value, other: '' } : { selected: 'Other', other: value }
}

function splitMultiOption(values: string[], options: readonly string[]): { selected: string[]; other: string } {
  const base = options.filter((o) => o !== 'Other')
  const custom = values.find((v) => !base.includes(v))
  if (custom === undefined) return { selected: values, other: '' }
  return { selected: [...values.filter((v) => v !== custom), 'Other'], other: custom }
}

function draftFromExisting(need: MaterialNeed): Draft {
  const condition = splitOption(need.condition, CONDITIONS)
  const color = splitOption(need.color, BEAM_COLOR_OPTIONS)
  const style = splitOption(need.style, need.itemType === 'upright' ? UPRIGHT_STYLE_OPTIONS : BEAM_STYLE_OPTIONS)
  const pinCount = splitOption(need.pinCount, BEAM_PIN_COUNT_OPTIONS)
  const step = splitOption(need.step, BEAM_STEP_OPTIONS)
  const gauge = splitOption(need.gauge, GAUGE_OPTIONS)
  const channelCount = splitOption(need.channelCount, CHANNEL_COUNT_OPTIONS)
  const wireDeckStyle = splitMultiOption(need.wireDeckStyle, WIRE_DECK_STYLE_OPTIONS)
  const description = splitOption(need.description, MISC_ITEM_OPTIONS)

  return {
    quantityNeeded: String(need.quantityNeeded),
    notes: need.notes,
    condition: condition.selected,
    conditionOther: condition.other,
    color: color.selected,
    colorOther: color.other,
    style: style.selected,
    styleOther: style.other,
    stamp: need.stamp,
    length: need.length,
    width: need.width,
    pinCount: pinCount.selected,
    pinCountOther: pinCount.other,
    stickers: need.stickers,
    step: step.selected,
    stepOther: step.other,
    height: need.height,
    columnLength: need.columnLength,
    columnWidth: need.columnWidth,
    footplateLength: need.footplateLength,
    footplateWidth: need.footplateWidth,
    footplateThickness: need.footplateThickness,
    anchorHoleCount: need.anchorHoleCount,
    holeSize: need.holeSize,
    gauge: gauge.selected,
    gaugeOther: gauge.other,
    channelCount: channelCount.selected,
    channelCountOther: channelCount.other,
    wireDeckStyle: wireDeckStyle.selected,
    wireDeckStyleOther: wireDeckStyle.other,
    description: description.selected,
    descriptionOther: description.other,
    itemDescription: need.itemDescription,
  }
}

// Bundle Size, Zone, Cost Per, and Sell Per are no longer captured by this
// dialog — but an older need may already have them set, so an edit here
// preserves whatever was already saved instead of blanking it out.
function resolve(itemType: ItemType, draft: Draft, projectId: string, jobSiteId: string, existing?: MaterialNeed): MaterialNeedInput {
  return {
    projectId,
    jobSiteId,
    itemType,
    quantityNeeded: Number(draft.quantityNeeded) || 0,
    notes: draft.notes,
    condition: draft.condition === 'Other' ? draft.conditionOther : draft.condition,
    bundleSize: existing?.bundleSize ?? '',
    zone: existing?.zone ?? '',
    costPer: existing?.costPer ?? 0,
    sellPer: existing?.sellPer ?? 0,
    color: draft.color === 'Other' ? draft.colorOther : draft.color,
    style: draft.style === 'Other' ? draft.styleOther : draft.style,
    stamp: draft.stamp,
    length: draft.length,
    width: draft.width,
    pinCount: draft.pinCount === 'Other' ? draft.pinCountOther : draft.pinCount,
    stickers: draft.stickers,
    step: draft.step === 'Other' ? draft.stepOther : draft.step,
    height: draft.height,
    columnLength: draft.columnLength,
    columnWidth: draft.columnWidth,
    footplateLength: draft.footplateLength,
    footplateWidth: draft.footplateWidth,
    footplateThickness: draft.footplateThickness,
    anchorHoleCount: draft.anchorHoleCount,
    holeSize: draft.holeSize,
    gauge: draft.gauge === 'Other' ? draft.gaugeOther : draft.gauge,
    channelCount: draft.channelCount === 'Other' ? draft.channelCountOther : draft.channelCount,
    wireDeckStyle: draft.wireDeckStyle.map((s) => (s === 'Other' ? draft.wireDeckStyleOther : s)),
    description: draft.description === 'Other' ? draft.descriptionOther : draft.description,
    itemDescription: draft.itemDescription,
  }
}

export default function MaterialNeedDialog({ projectId, jobSiteId, existing, label }: MaterialNeedDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [itemType, setItemType] = useState<ItemType>('beam')
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)

  function open() {
    setItemType(existing?.itemType ?? 'beam')
    setDraft(existing ? draftFromExisting(existing) : EMPTY_DRAFT)
    dialogRef.current?.showModal()
  }

  function close() {
    dialogRef.current?.close()
  }

  function update(patch: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  const resolved = resolve(itemType, draft, projectId, jobSiteId, existing)
  const hasDimensions =
    itemType === 'beam'
      ? !!(resolved.width.trim() && resolved.length.trim())
      : itemType === 'upright'
        ? !!(resolved.width.trim() && resolved.height.trim() && resolved.columnLength.trim() && resolved.columnWidth.trim())
        : itemType === 'wireDeck'
          ? !!(resolved.width.trim() && resolved.length.trim())
          : !!resolved.description.trim()
  const canSave = resolved.quantityNeeded > 0 && !!resolved.condition.trim() && hasDimensions

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    try {
      if (existing) await updateMaterialNeed(existing.id, resolved)
      else await createMaterialNeed(resolved)
      close()
    } finally {
      setSaving(false)
    }
  }

  const otherInput = (value: string, onChange: (v: string) => void, placeholder?: string) => (
    <input type="text" className="other-input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  )

  const conditionField = (
    <>
      <SingleSelectCheckboxGroup
        legend="Condition"
        options={CONDITIONS}
        value={draft.condition}
        onChange={(condition) => update({ condition })}
      />
      {draft.condition === 'Other' && otherInput(draft.conditionOther, (v) => update({ conditionOther: v }), 'Enter condition')}
    </>
  )

  const commonTailFields = (
    <label>
      Notes
      <textarea value={draft.notes} onChange={(e) => update({ notes: e.target.value })} rows={2} />
    </label>
  )

  const beamFields = (
    <>
      <div className="field-row">
        <label>
          Length
          <input type="text" value={draft.length} onChange={(e) => update({ length: e.target.value })} />
        </label>
        <label>
          Width
          <input type="text" value={draft.width} onChange={(e) => update({ width: e.target.value })} />
        </label>
      </div>
      <SingleSelectCheckboxGroup legend="Color" options={BEAM_COLOR_OPTIONS} value={draft.color} onChange={(color) => update({ color })} />
      {draft.color === 'Other' && otherInput(draft.colorOther, (v) => update({ colorOther: v }))}
      <SingleSelectCheckboxGroup
        legend="Pin Count"
        options={BEAM_PIN_COUNT_OPTIONS}
        value={draft.pinCount}
        onChange={(pinCount) => update({ pinCount })}
      />
      {draft.pinCount === 'Other' && otherInput(draft.pinCountOther, (v) => update({ pinCountOther: v }), 'e.g. 2-3 pins')}
      <label>
        Stamp
        <input type="text" value={draft.stamp} onChange={(e) => update({ stamp: e.target.value })} />
      </label>
      <SingleSelectCheckboxGroup legend="Style" options={BEAM_STYLE_OPTIONS} value={draft.style} onChange={(style) => update({ style })} />
      {draft.style === 'Other' && otherInput(draft.styleOther, (v) => update({ styleOther: v }))}
      <SingleSelectCheckboxGroup legend="Stickers" options={STICKERS_OPTIONS} value={draft.stickers} onChange={(stickers) => update({ stickers })} />
      <SingleSelectCheckboxGroup legend="Step" options={BEAM_STEP_OPTIONS} value={draft.step} onChange={(step) => update({ step })} />
      {draft.step === 'Other' && otherInput(draft.stepOther, (v) => update({ stepOther: v }), 'Enter step')}
    </>
  )

  const uprightFields = (
    <>
      <SingleSelectCheckboxGroup legend="Color" options={BEAM_COLOR_OPTIONS} value={draft.color} onChange={(color) => update({ color })} />
      {draft.color === 'Other' && otherInput(draft.colorOther, (v) => update({ colorOther: v }))}
      <SingleSelectCheckboxGroup
        legend="Style"
        options={UPRIGHT_STYLE_OPTIONS}
        value={draft.style}
        onChange={(style) => update({ style })}
      />
      {draft.style === 'Other' && otherInput(draft.styleOther, (v) => update({ styleOther: v }))}
      <div className="field-row">
        <label>
          Width
          <input type="text" value={draft.width} onChange={(e) => update({ width: e.target.value })} />
        </label>
        <label>
          Height
          <input type="text" value={draft.height} onChange={(e) => update({ height: e.target.value })} />
        </label>
      </div>
      <label>
        Column Size
        <div className="dimension-pair">
          <InchInput value={draft.columnLength} onChange={(columnLength) => update({ columnLength })} />
          <span className="dimension-x">x</span>
          <InchInput value={draft.columnWidth} onChange={(columnWidth) => update({ columnWidth })} />
        </div>
      </label>
      <label>
        Footplate Size
        <div className="dimension-pair">
          <InchInput value={draft.footplateLength} onChange={(footplateLength) => update({ footplateLength })} />
          <span className="dimension-x">x</span>
          <InchInput value={draft.footplateWidth} onChange={(footplateWidth) => update({ footplateWidth })} />
        </div>
      </label>
      <label>
        Footplate Thickness
        <input
          type="text"
          placeholder={`e.g. 3/16" or 1/4"`}
          value={draft.footplateThickness}
          onChange={(e) => update({ footplateThickness: e.target.value })}
        />
      </label>
      <label>
        Number of Usable Anchor Holes in Footplate
        <input type="text" value={draft.anchorHoleCount} onChange={(e) => update({ anchorHoleCount: e.target.value })} />
      </label>
      <label>
        Hole Size
        <InchInput value={draft.holeSize} onChange={(holeSize) => update({ holeSize })} />
      </label>
      <SingleSelectCheckboxGroup legend="Gauge" options={GAUGE_OPTIONS} value={draft.gauge} onChange={(gauge) => update({ gauge })} />
      {draft.gauge === 'Other' && otherInput(draft.gaugeOther, (v) => update({ gaugeOther: v }))}
      <label>
        Stamp
        <input type="text" value={draft.stamp} onChange={(e) => update({ stamp: e.target.value })} />
      </label>
    </>
  )

  const wireDeckFields = (
    <>
      <div className="field-row">
        <label>
          Length
          <input type="number" inputMode="decimal" value={draft.length} onChange={(e) => update({ length: e.target.value })} />
        </label>
        <label>
          Width
          <input type="number" inputMode="decimal" value={draft.width} onChange={(e) => update({ width: e.target.value })} />
        </label>
      </div>
      <SingleSelectCheckboxGroup
        legend="Number of Channels"
        options={CHANNEL_COUNT_OPTIONS}
        value={draft.channelCount}
        onChange={(channelCount) => update({ channelCount })}
      />
      {draft.channelCount === 'Other' && otherInput(draft.channelCountOther, (v) => update({ channelCountOther: v }))}
      <fieldset className="checkbox-fieldset">
        <legend>Style</legend>
        <div className="checkbox-options">
          {WIRE_DECK_STYLE_OPTIONS.map((option) => (
            <label key={option} className="checkbox-option">
              <input
                type="checkbox"
                checked={draft.wireDeckStyle.includes(option)}
                onChange={() =>
                  update({
                    wireDeckStyle: draft.wireDeckStyle.includes(option)
                      ? draft.wireDeckStyle.filter((s) => s !== option)
                      : [...draft.wireDeckStyle, option],
                  })
                }
              />
              {option}
            </label>
          ))}
        </div>
        {draft.wireDeckStyle.includes('Other') && otherInput(draft.wireDeckStyleOther, (v) => update({ wireDeckStyleOther: v }))}
      </fieldset>
    </>
  )

  const miscFields = (
    <>
      <SingleSelectCheckboxGroup
        legend="Item"
        options={MISC_ITEM_OPTIONS}
        value={draft.description}
        onChange={(description) => update({ description })}
      />
      {draft.description === 'Other' && otherInput(draft.descriptionOther, (v) => update({ descriptionOther: v }), 'Enter item')}
      <label>
        Item Description
        <textarea value={draft.itemDescription} onChange={(e) => update({ itemDescription: e.target.value })} rows={2} />
      </label>
    </>
  )

  return (
    <>
      <button type="button" onClick={open}>
        {label}
      </button>
      <dialog ref={dialogRef} className="location-dialog">
        <form onSubmit={handleSubmit}>
          <h2>{existing ? 'Edit Material Need' : 'Add Material Need'}</h2>
          <label>
            Item type
            <select value={itemType} onChange={(e) => setItemType(e.target.value as ItemType)} disabled={!!existing}>
              {(Object.keys(ITEM_TYPE_LABELS) as ItemType[]).map((type) => (
                <option key={type} value={type}>
                  {ITEM_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          {itemType === 'beam' && beamFields}
          {itemType === 'upright' && uprightFields}
          {itemType === 'wireDeck' && wireDeckFields}
          {itemType === 'misc' && miscFields}
          {conditionField}

          <label>
            Quantity Needed
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.quantityNeeded}
              onChange={(e) => update({ quantityNeeded: e.target.value })}
            />
          </label>

          {commonTailFields}

          <div className="dialog-actions">
            <button type="button" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !canSave}>
              {saving ? 'Saving…' : 'Save Need'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
