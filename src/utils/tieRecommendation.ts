// Heuristic "does this look like the same item" scorer — used to flag a
// likely inventory match for a freshly-imported Sales Order line item
// before anyone has to pick one by hand. This is not language
// understanding: it just looks for the same handful of identifying
// numbers (dimensions, footplate size, pin count, step, gauge) and colors
// showing up in both the imported line's free-text description and an
// inventory row's own description, and scores how many of them line up.
// A weak or empty match recommends nothing rather than guessing — these
// weights/threshold are a starting point and expected to get tuned once
// tested against real imported descriptions.

const COLOR_WORDS = ['orange', 'green', 'blue', 'red', 'gray', 'grey', 'yellow', 'white', 'pink', 'black']

// Points awarded per matched feature kind. Dimensions (and footplate
// size) are the strongest signal — two unrelated items rarely share an
// exact pair of measurements — while color alone is the weakest, since
// it repeats across many different items.
const FEATURE_WEIGHTS: Record<string, number> = {
  dim: 3,
  fp: 2,
  pin: 2,
  step: 2,
  ga: 1,
  color: 1,
}

// A row needs at least this many points before it's worth recommending —
// one dimension match alone clears it, but color/gauge alone never does.
export const MIN_RECOMMEND_SCORE = 3
export const MAX_RECOMMENDATIONS = 3

function sortedPair(a: string, b: string): string {
  const [x, y] = [Number(a), Number(b)].sort((n1, n2) => n1 - n2)
  return `${x}x${y}`
}

function extractFeatures(text: string): Map<string, number> {
  const features = new Map<string, number>()

  // A "<n> x <n>" pair, optionally followed by "FP" for a footplate size
  // (e.g. `3" x 96"` or `4x4 FP`) — captured as one feature per pair so a
  // footplate size isn't also double-counted as a generic dimension.
  const dimPattern = /(\d+(?:\.\d+)?)\s*["'″]?\s*x\s*(\d+(?:\.\d+)?)\s*["'″]?(\s*(?:bolt-?on\s*)?fp\b)?/gi
  for (const m of text.matchAll(dimPattern)) {
    const kind = m[3] ? 'fp' : 'dim'
    const key = `${kind}:${sortedPair(m[1], m[2])}`
    features.set(key, FEATURE_WEIGHTS[kind])
  }

  const pinMatch = text.match(/(\d+)[\s-]*pin\b/i)
  if (pinMatch) features.set(`pin:${pinMatch[1]}`, FEATURE_WEIGHTS.pin)

  const stepMatch = text.match(/(\d+(?:\.\d+)?)\s*["'″]?\s*step\b/i)
  if (stepMatch) features.set(`step:${Number(stepMatch[1])}`, FEATURE_WEIGHTS.step)

  const gaugeMatch = text.match(/(\d+)\s*ga\b/i)
  if (gaugeMatch) features.set(`ga:${gaugeMatch[1]}`, FEATURE_WEIGHTS.ga)

  for (const word of COLOR_WORDS) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) {
      features.set(`color:${word === 'grey' ? 'gray' : word}`, FEATURE_WEIGHTS.color)
    }
  }

  return features
}

function scoreMatch(importedText: string, candidateText: string): number {
  const imported = extractFeatures(importedText)
  const candidate = extractFeatures(candidateText)
  let score = 0
  for (const [key, weight] of imported) {
    if (candidate.has(key)) score += weight
  }
  return score
}

// Returns the best-matching rows' keys, best first, capped to
// MAX_RECOMMENDATIONS and filtered to those meeting MIN_RECOMMEND_SCORE.
// Empty when the imported description is blank or nothing scores well
// enough — callers should treat that as "no recommendation", not an error.
export function rankTieRecommendations<T extends { key: string; description: string }>(
  importedDescription: string,
  rows: T[],
): string[] {
  if (!importedDescription.trim()) return []
  return rows
    .map((row) => ({ key: row.key, score: scoreMatch(importedDescription, row.description) }))
    .filter((r) => r.score >= MIN_RECOMMEND_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECOMMENDATIONS)
    .map((r) => r.key)
}
