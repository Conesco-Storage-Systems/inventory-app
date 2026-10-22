import type { WireDeck } from '../models/types'

export interface WireDeckRow {
  key: string
  ids: string[]
  length: number
  width: number
  widthByLength: string
  channelCount: string
  style: string[]
  condition: string
  quantity: number
  bundleSize: string
  zone: string
  notes: string
  photoIds: string[]
  costPer: number
  sellPer: number
}

export function groupWireDecks(wireDecks: WireDeck[]): WireDeckRow[] {
  const rows = new Map<string, WireDeckRow>()

  for (const wireDeck of wireDecks) {
    // IndexedDB doesn't actually enforce the model's types — a record left
    // in a stale state can genuinely have a non-array here at runtime
    // despite what the TS type claims, and spreading that crashes this
    // function (and, with it, the whole page's render, since nothing in
    // this app catches render errors). Same defensive-coercion fix already
    // applied to the Upright sort helpers for the same reason.
    const style = Array.isArray(wireDeck.style) ? wireDeck.style : []
    const photoIds = Array.isArray(wireDeck.photoIds) ? wireDeck.photoIds : []
    const key = [
      wireDeck.length,
      wireDeck.width,
      wireDeck.channelCount,
      [...style].sort().join(','),
      wireDeck.condition,
      wireDeck.bundleSize,
      wireDeck.zone,
      wireDeck.notes,
    ].join('|')

    const existing = rows.get(key)
    if (existing) {
      existing.quantity += wireDeck.quantity
      existing.ids.push(wireDeck.id)
      existing.photoIds.push(...photoIds)
      continue
    }

    rows.set(key, {
      key,
      ids: [wireDeck.id],
      length: wireDeck.length,
      width: wireDeck.width,
      widthByLength: `${wireDeck.width} x ${wireDeck.length}`,
      channelCount: wireDeck.channelCount,
      style,
      condition: wireDeck.condition,
      quantity: wireDeck.quantity,
      bundleSize: wireDeck.bundleSize,
      zone: wireDeck.zone,
      notes: wireDeck.notes,
      photoIds: [...photoIds],
      costPer: wireDeck.costPer,
      sellPer: wireDeck.sellPer,
    })
  }

  return Array.from(rows.values()).sort((a, b) => a.width - b.width || a.length - b.length)
}
