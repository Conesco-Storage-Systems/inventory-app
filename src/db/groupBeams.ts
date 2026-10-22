import type { Beam } from '../models/types'

// Beam width/length is free text (e.g. "144" or a range like "101.5-102"),
// so this pulls out the leading number for sorting rather than treating it
// as text — used by any screen sorting a Beams table by size. IndexedDB
// doesn't actually enforce the model's types, so a record left in a stale
// state can genuinely have a plain number (or null) here at runtime
// despite what the TS type claims — coerce defensively rather than
// trusting it, same fix already applied to the Upright sort helpers
// (uprightDimensionSortValue/uprightHeightSortValue) for the same reason.
export function leadingNumber(value: unknown): number {
  if (!value) return 0
  const text = typeof value === 'string' ? value : String(value)
  const match = text.match(/-?\d+(\.\d+)?/)
  return match ? parseFloat(match[0]) : 0
}

export interface BeamRow {
  key: string
  ids: string[]
  length: string
  width: string
  widthByLength: string
  color: string
  pinCount: string
  stamp: string
  style: string
  stickers: string
  step: string
  condition: string
  quantity: number
  bundleSize: string
  zone: string
  notes: string
  photoIds: string[]
  costPer: number
  sellPer: number
}

export function groupBeams(beams: Beam[]): BeamRow[] {
  const rows = new Map<string, BeamRow>()

  for (const beam of beams) {
    // IndexedDB doesn't actually enforce the model's types — a record left
    // in a stale state can genuinely have a non-array here at runtime
    // despite what the TS type claims, and spreading that crashes this
    // function (and, with it, the whole page's render).
    const photoIds = Array.isArray(beam.photoIds) ? beam.photoIds : []
    const key = [
      beam.length,
      beam.width,
      beam.color,
      beam.pinCount,
      beam.stamp,
      beam.style,
      beam.stickers,
      beam.step,
      beam.condition,
      beam.bundleSize,
      beam.zone,
      beam.notes,
    ].join('|')

    const existing = rows.get(key)
    if (existing) {
      existing.quantity += beam.quantity
      existing.ids.push(beam.id)
      existing.photoIds.push(...photoIds)
      continue
    }

    rows.set(key, {
      key,
      ids: [beam.id],
      length: beam.length ?? '',
      width: beam.width,
      widthByLength: `${beam.width} x ${beam.length}`,
      color: beam.color,
      pinCount: beam.pinCount,
      stamp: beam.stamp,
      style: beam.style,
      stickers: beam.stickers,
      step: beam.step ?? '',
      condition: beam.condition,
      quantity: beam.quantity,
      bundleSize: beam.bundleSize,
      zone: beam.zone,
      notes: beam.notes,
      photoIds: [...photoIds],
      costPer: beam.costPer,
      sellPer: beam.sellPer,
    })
  }

  return Array.from(rows.values()).sort(
    (a, b) => parseFloat(a.length) - parseFloat(b.length) || parseFloat(a.width) - parseFloat(b.width),
  )
}
