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
  costPer: number
  sellPer: number
}

export function groupMiscItems(miscItems: MiscItem[]): MiscItemRow[] {
  const rows = new Map<string, MiscItemRow>()

  for (const item of miscItems) {
    // IndexedDB doesn't actually enforce the model's types — a record left
    // in a stale state can genuinely have a non-array here at runtime
    // despite what the TS type claims, and spreading that crashes this
    // function (and, with it, the whole page's render).
    const photoIds = Array.isArray(item.photoIds) ? item.photoIds : []
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
      existing.photoIds.push(...photoIds)
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
      photoIds: [...photoIds],
      costPer: item.costPer,
      sellPer: item.sellPer,
    })
  }

  return Array.from(rows.values()).sort((a, b) => a.description.localeCompare(b.description))
}
