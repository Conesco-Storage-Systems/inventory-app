import type { Upright } from '../models/types'

export interface UprightRow {
  key: string
  ids: string[]
  color: string
  style: string
  width: number
  heightFeet: number
  heightInches: number
  heightDisplay: string
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
}

export function groupUprights(uprights: Upright[]): UprightRow[] {
  const rows = new Map<string, UprightRow>()

  for (const upright of uprights) {
    const key = [
      upright.color,
      upright.style,
      upright.width,
      upright.heightFeet,
      upright.heightInches,
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

    const heightDisplay =
      upright.heightInches === 0
        ? `${upright.heightFeet}'`
        : `${upright.heightFeet}' ${upright.heightInches}"`

    rows.set(key, {
      key,
      ids: [upright.id],
      color: upright.color,
      style: upright.style,
      width: upright.width,
      heightFeet: upright.heightFeet,
      heightInches: upright.heightInches,
      heightDisplay,
      widthByHeight: `${upright.width}" x ${heightDisplay}`,
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
    })
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (a.width !== b.width) return a.width - b.width
    const aHeight = a.heightFeet * 12 + a.heightInches
    const bHeight = b.heightFeet * 12 + b.heightInches
    return aHeight - bHeight
  })
}
