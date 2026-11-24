import type { BayConfiguration, RackRow } from '../models/types'

export interface RowMaterialTotal {
  configId: string
  config: BayConfiguration
  count: number
}

export interface RowMaterialTotals {
  uprights: RowMaterialTotal[]
  beams: RowMaterialTotal[]
  decks: RowMaterialTotal[]
}

function addTo(counts: Map<string, number>, configId: string, amount: number) {
  if (amount <= 0) return
  counts.set(configId, (counts.get(configId) ?? 0) + amount)
}

function toList(counts: Map<string, number>, configsById: Map<string, BayConfiguration>): RowMaterialTotal[] {
  return Array.from(counts.entries())
    .map(([configId, count]) => {
      const config = configsById.get(configId)
      return config ? { configId, config, count } : null
    })
    .filter((entry): entry is RowMaterialTotal => entry !== null)
}

// Uprights share a frame at every bay-to-bay junction, including at a
// configuration boundary, so total frames = total bays + 1 — never
// bayCount x 2. Each segment "owns" the leading frame of each of its own
// bays by default (so a boundary frame counts under the FOLLOWING
// segment's spec); a transitionOverrides entry flips that one shared frame
// to the PRECEDING segment's spec instead. Beams and decks never share
// between bays, so they need no boundary logic at all — just bayCount x
// levelCount (x2 for beams, front+back rail) per segment.
export function computeRowMaterials(row: RackRow, configsById: Map<string, BayConfiguration>): RowMaterialTotals {
  const uprightCounts = new Map<string, number>()
  const beamCounts = new Map<string, number>()
  const deckCounts = new Map<string, number>()
  const segs = row.segments

  segs.forEach((seg, i) => {
    let ownFrames = seg.bayCount
    if (i > 0 && row.transitionOverrides.includes(i - 1)) {
      ownFrames -= 1
      addTo(uprightCounts, segs[i - 1].bayConfigId, 1)
    }
    addTo(uprightCounts, seg.bayConfigId, ownFrames)

    const config = configsById.get(seg.bayConfigId)
    if (config) {
      const levelCount = Number(config.beam.levelCount) || 0
      const decksPerLevel = Number(config.deck.decksPerLevel) || 0
      addTo(beamCounts, seg.bayConfigId, seg.bayCount * levelCount * 2)
      addTo(deckCounts, seg.bayConfigId, seg.bayCount * levelCount * decksPerLevel)
    }
  })

  // The row's trailing end always needs one more frame than the bays
  // account for — it belongs to the last segment since nothing follows it.
  if (segs.length > 0) {
    addTo(uprightCounts, segs[segs.length - 1].bayConfigId, 1)
  }

  return {
    uprights: toList(uprightCounts, configsById),
    beams: toList(beamCounts, configsById),
    decks: toList(deckCounts, configsById),
  }
}
