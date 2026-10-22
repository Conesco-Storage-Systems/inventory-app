import { v4 as uuidv4 } from 'uuid'
import { db } from './db'
import { untieAllMaterialNeedAllocations } from './materialNeedAllocations'
import { enqueuePendingDelete } from './pendingDeletes'
import type { MaterialNeed } from '../models/types'

export type MaterialNeedInput = Omit<MaterialNeed, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>

export async function createMaterialNeed(input: MaterialNeedInput): Promise<string> {
  const id = uuidv4()
  const now = Date.now()
  await db.materialNeeds.add({
    ...input,
    id,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  })
  return id
}

export async function listMaterialNeedsByProject(projectId: string): Promise<MaterialNeed[]> {
  return db.materialNeeds.where('projectId').equals(projectId).toArray()
}

export async function getMaterialNeed(id: string): Promise<MaterialNeed | undefined> {
  return db.materialNeeds.get(id)
}

export async function updateMaterialNeed(id: string, input: MaterialNeedInput): Promise<void> {
  await db.materialNeeds.update(id, {
    ...input,
    updatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

// Removes every allocation tied to this need before removing the need
// itself, so nothing is left pointing at a deleted need.
export async function deleteMaterialNeed(id: string): Promise<void> {
  await untieAllMaterialNeedAllocations(id)
  await enqueuePendingDelete('materialNeeds', id)
  await db.materialNeeds.delete(id)
}

// A short human label for this need's exact spec — e.g. a beam reads as
// 4" x 108", an upright as 42" x 25' (column 3"x3"). Used wherever the
// full spec matters (the Material Needs table, the need's own page) —
// everything needed to know what to tie to it.
export function materialNeedSpecLabel(need: MaterialNeed): string {
  switch (need.itemType) {
    case 'beam':
      return `${need.width}" x ${need.length}"`
    case 'upright':
      return need.columnLength || need.columnWidth
        ? `${need.width}" x ${need.height} (column ${need.columnLength}"x${need.columnWidth}")`
        : `${need.width}" x ${need.height}`
    case 'wireDeck':
      return `${need.width}" x ${need.length}"`
    case 'misc':
      return need.description
  }
}

// The same full-detail description format as describeItemRow.ts's row
// builders (reused across Sales Quotes, Customer Sheets, the Procurement
// tie dropdown) — built from this need's own fields instead of a grouped
// inventory row, since a need isn't tied to real records yet. Used on the
// Material Needs table's Spec column so it reads as a quick summary of
// everything to look for, with the full picture one click away on the
// need's own page.
export function materialNeedExtendedDescription(need: MaterialNeed): string {
  switch (need.itemType) {
    case 'beam':
      return [
        need.style,
        `${need.width} x ${need.length}`,
        need.color,
        need.pinCount && `${need.pinCount} pin`,
        need.step && `${need.step} step`,
        need.condition,
        need.stamp,
        need.stickers === 'Yes' && 'Stickers',
      ]
        .filter(Boolean)
        .join(', ')
    case 'upright': {
      const footplate =
        need.footplateLength || need.footplateWidth ? `${need.footplateLength}"x${need.footplateWidth}" FP` : ''
      return [
        need.style,
        `${need.width}" x ${need.height} x ${need.columnLength}"x${need.columnWidth}"`,
        need.color,
        footplate,
        need.condition,
        need.gauge && `${need.gauge} ga`,
      ]
        .filter(Boolean)
        .join(', ')
    }
    case 'wireDeck':
      return [
        need.wireDeckStyle.join('/'),
        `${need.width} x ${need.length}`,
        need.channelCount && `${need.channelCount} channel`,
        need.condition,
      ]
        .filter(Boolean)
        .join(', ')
    case 'misc':
      return [need.description, need.itemDescription, need.condition].filter(Boolean).join(', ')
  }
}

// A shorter version for the by-job-site chart's bar labels — just the
// primary size, no secondary details (e.g. an upright's column size) —
// so a bar label stays clean and scannable. That detail isn't lost: it's
// still on the Material Needs table and the need's own page via
// materialNeedSpecLabel above, which is what actually matters once you're
// tying inventory to it.
export function materialNeedChartLabel(need: MaterialNeed): string {
  switch (need.itemType) {
    case 'beam':
      return `${need.width}" x ${need.length}"`
    case 'upright':
      return `${need.width}" x ${need.height}`
    case 'wireDeck':
      return `${need.width}" x ${need.length}"`
    case 'misc':
      return need.description
  }
}
