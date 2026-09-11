import type { ItemBase, Site } from '../models/types'

export interface WithSite {
  siteId: string
  siteName: string
}

// Groups each active site's own items separately (so items never merge
// across sites into one row — that would make the Location column
// meaningless) then flattens the results into one list, sorted by site name.
export function combineRowsAcrossSites<TItem extends ItemBase, TRow extends { key: string }>(
  items: TItem[],
  sites: Site[],
  groupFn: (items: TItem[]) => TRow[],
): (TRow & WithSite)[] {
  const activeSites = sites.filter((site) => site.active !== false && !site.deletedAt)
  const nameById = new Map(activeSites.map((site) => [site.id, site.name]))

  const bySite = new Map<string, TItem[]>()
  for (const item of items) {
    if (!nameById.has(item.siteId)) continue
    const bucket = bySite.get(item.siteId)
    if (bucket) bucket.push(item)
    else bySite.set(item.siteId, [item])
  }

  const combined: (TRow & WithSite)[] = []
  for (const [siteId, siteItems] of bySite) {
    const siteName = nameById.get(siteId) ?? ''
    for (const row of groupFn(siteItems)) {
      // Prefixed so two sites with an otherwise-identical item (a very
      // plausible collision) don't end up sharing the same React key.
      combined.push({ ...row, key: `${siteId}:${row.key}`, siteId, siteName })
    }
  }

  return combined.sort((a, b) => a.siteName.localeCompare(b.siteName))
}
