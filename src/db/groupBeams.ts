import type { Beam } from '../models/types'

export interface BeamRow {
  key: string
  ids: string[]
  length: number
  width: string
  widthByLength: string
  color: string
  pinCount: string
  stamp: string
  style: string
  stickers: string
  condition: string
  quantity: number
  bundleSize: string
  notes: string
  photoIds: string[]
}

export function groupBeams(beams: Beam[]): BeamRow[] {
  const rows = new Map<string, BeamRow>()

  for (const beam of beams) {
    const key = [
      beam.length,
      beam.width,
      beam.color,
      beam.pinCount,
      beam.stamp,
      beam.style,
      beam.stickers,
      beam.condition,
      beam.bundleSize,
      beam.notes,
    ].join('|')

    const existing = rows.get(key)
    if (existing) {
      existing.quantity += beam.quantity
      existing.ids.push(beam.id)
      existing.photoIds.push(...beam.photoIds)
      continue
    }

    rows.set(key, {
      key,
      ids: [beam.id],
      length: beam.length,
      width: beam.width,
      widthByLength: `${beam.width} x ${beam.length}`,
      color: beam.color,
      pinCount: beam.pinCount,
      stamp: beam.stamp,
      style: beam.style,
      stickers: beam.stickers,
      condition: beam.condition,
      quantity: beam.quantity,
      bundleSize: beam.bundleSize,
      notes: beam.notes,
      photoIds: [...beam.photoIds],
    })
  }

  return Array.from(rows.values()).sort(
    (a, b) => a.length - b.length || parseFloat(a.width) - parseFloat(b.width),
  )
}
