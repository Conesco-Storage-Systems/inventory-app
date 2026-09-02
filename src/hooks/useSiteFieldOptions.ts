import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { SiteFieldKey } from '../models/types'

async function activeValuesForField(siteId: string, fieldKey: SiteFieldKey): Promise<string[]> {
  switch (fieldKey) {
    case 'color': {
      const [beams, uprights] = await Promise.all([
        db.beams.where('siteId').equals(siteId).toArray(),
        db.uprights.where('siteId').equals(siteId).toArray(),
      ])
      return [...beams.map((b) => b.color), ...uprights.map((u) => u.color)]
    }
    case 'beamStyle': {
      const beams = await db.beams.where('siteId').equals(siteId).toArray()
      return beams.map((b) => b.style)
    }
    case 'uprightStyle': {
      const uprights = await db.uprights.where('siteId').equals(siteId).toArray()
      return uprights.map((u) => u.style)
    }
    case 'gauge': {
      const uprights = await db.uprights.where('siteId').equals(siteId).toArray()
      return uprights.map((u) => u.gauge)
    }
    case 'channelCount': {
      const wireDecks = await db.wireDecks.where('siteId').equals(siteId).toArray()
      return wireDecks.map((w) => w.channelCount)
    }
    case 'wireDeckStyle': {
      const wireDecks = await db.wireDecks.where('siteId').equals(siteId).toArray()
      return wireDecks.flatMap((w) => w.style)
    }
    default:
      return []
  }
}

/**
 * Dropdown options = the fixed base list + whatever non-base values are
 * currently saved on this site's items. Editing or deleting an item that used
 * a custom "Other" value makes that value disappear here too, automatically.
 */
export function useSiteFieldOptions(
  siteId: string | undefined,
  fieldKey: SiteFieldKey,
  baseOptions: readonly string[],
): string[] {
  const activeValues =
    useLiveQuery(
      () => (siteId ? activeValuesForField(siteId, fieldKey) : Promise.resolve([])),
      [siteId, fieldKey],
    ) ?? []

  const withoutOther = baseOptions.filter((option) => option !== 'Other')
  const extra = Array.from(
    new Set(activeValues.filter((value) => value && !withoutOther.includes(value))),
  ).sort()
  return [...withoutOther, ...extra, 'Other']
}
