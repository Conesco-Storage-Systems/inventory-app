import type { MiscItem } from '../models/types'

export interface MiscItemRow {
  key: string
  ids: string[]
  description: string
  itemDescription: string
  condition: string
  quantity: number
  bundleSize: string
  zone: string
  notes: string
  photoIds: string[]
}

export function groupMiscItems(miscItems: MiscItem[]): MiscItemRow[] {
  const rows = new Map<string, MiscItemRow>()

  for (const item of miscItems) {
    const key = [
      item.description,
      item.itemDescription,
      item.condition,
      item.bundleSize,
      item.zone,
      item.notes,
    ].join('|')

    const existing = rows.get(key)
    if (existing) {
      existing.quantity += item.quantity
      existing.ids.push(item.id)
      existing.photoIds.push(...item.photoIds)
      continue
    }

    rows.set(key, {
      key,
      ids: [item.id],
      description: item.description,
      itemDescription: item.itemDescription ?? '',
      condition: item.condition,
      quantity: item.quantity,
      bundleSize: item.bundleSize,
      zone: item.zone,
      notes: item.notes,
      photoIds: [...item.photoIds],
    })
  }

  return Array.from(rows.values()).sort((a, b) => a.description.localeCompare(b.description))
}
