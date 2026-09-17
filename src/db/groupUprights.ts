import type { Upright } from '../models/types'

export interface UprightRow {
  key: string
  ids: string[]
  color: string
  style: string
  width: number
  height: string
  widthByHeight: string
  columnLength: number
  columnWidth: number
  columnSizeDisplay: string
  footplateLength: number
  footplateWidth: number
  footplateSizeDisplay: string
  anchorHoleCount: number
  holeSize: string
  gauge: string
  condition: string
  quantity: number
  stamp: string
  bundleSize: string
  zone: string
  notes: string
  photoIds: string[]
  costPer: number
  sellPer: number
}

// Height is free text (like Beam's width) so it can hold a range for a
// cut/repaired upright (e.g. "8' - 10'") — this pulls out a rough numeric
// value (the low end when it's a range) for sorting only, never stored.
export function uprightHeightSortValue(height: string | undefined | null): number {
  if (!height) return 0
  const m = height.match(/(\d+)'\s*(\d+)?/)
  if (!m) return 0
  return Number(m[1]) * 12 + (m[2] ? Number(m[2]) : 0)
}

export function groupUprights(uprights: Upright[]): UprightRow[] {
  const rows = new Map<string, UprightRow>()

  for (const upright of uprights) {
    const key = [
      upright.color,
      upright.style,
      upright.width,
      upright.height,
      upright.columnLength,
      upright.columnWidth,
      upright.footplateLength,
      upright.footplateWidth,
      upright.anchorHoleCount,
      upright.holeSize,
      upright.gauge,
      upright.condition,
      upright.stamp,
      upright.bundleSize,
      upright.zone,
      upright.notes,
    ].join('|')

    const existing = rows.get(key)
    if (existing) {
      existing.quantity += upright.quantity
      existing.ids.push(upright.id)
      existing.photoIds.push(...upright.photoIds)
      continue
    }

    rows.set(key, {
      key,
      ids: [upright.id],
      color: upright.color,
      style: upright.style,
      width: upright.width,
      height: upright.height ?? '',
      widthByHeight: `${upright.width}" x ${upright.height ?? ''}`,
      columnLength: upright.columnLength,
      columnWidth: upright.columnWidth,
      columnSizeDisplay: `${upright.columnLength}" x ${upright.columnWidth}"`,
      footplateLength: upright.footplateLength,
      footplateWidth: upright.footplateWidth,
      footplateSizeDisplay: `${upright.footplateLength}" x ${upright.footplateWidth}"`,
      anchorHoleCount: upright.anchorHoleCount,
      holeSize: upright.holeSize,
      gauge: upright.gauge,
      condition: upright.condition,
      quantity: upright.quantity,
      stamp: upright.stamp,
      bundleSize: upright.bundleSize,
      zone: upright.zone,
      notes: upright.notes,
      photoIds: [...upright.photoIds],
      costPer: upright.costPer,
      sellPer: upright.sellPer,
    })
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (a.width !== b.width) return a.width - b.width
    return uprightHeightSortValue(a.height) - uprightHeightSortValue(b.height)
  })
}
