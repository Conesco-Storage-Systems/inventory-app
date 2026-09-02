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
  notes: string
  photoIds: string[]
}

export function groupWireDecks(wireDecks: WireDeck[]): WireDeckRow[] {
  const rows = new Map<string, WireDeckRow>()

  for (const wireDeck of wireDecks) {
    const key = [
      wireDeck.length,
      wireDeck.width,
      wireDeck.channelCount,
      [...wireDeck.style].sort().join(','),
      wireDeck.condition,
      wireDeck.bundleSize,
      wireDeck.notes,
    ].join('|')

    const existing = rows.get(key)
    if (existing) {
      existing.quantity += wireDeck.quantity
      existing.ids.push(wireDeck.id)
      existing.photoIds.push(...wireDeck.photoIds)
      continue
    }

    rows.set(key, {
      key,
      ids: [wireDeck.id],
      length: wireDeck.length,
      width: wireDeck.width,
      widthByLength: `${wireDeck.width} x ${wireDeck.length}`,
      channelCount: wireDeck.channelCount,
      style: wireDeck.style,
      condition: wireDeck.condition,
      quantity: wireDeck.quantity,
      bundleSize: wireDeck.bundleSize,
      notes: wireDeck.notes,
      photoIds: [...wireDeck.photoIds],
    })
  }

  return Array.from(rows.values()).sort((a, b) => a.width - b.width || a.length - b.length)
}
