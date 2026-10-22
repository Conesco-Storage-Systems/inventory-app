// Strips inch marks and all whitespace so formatting differences (4" x 96", 4 x 96,
// 4x96) don't stop a dimension search like "4x96" from matching.
export function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/["″]/g, '').replace(/\s+/g, '')
}

const DIMENSION_PATTERN = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/

// Some fields only ever store a bare number ("3", "12") even though people
// naturally search for them with their unit written out ("3 pin", "12 ga").
// Without this, a search like "3 pin" only ever matched by coincidence —
// whichever row happened to carry that literal phrase in some unrelated
// free-text field (notes, stamp, an old import's style text) — rather than
// reliably matching every row whose actual pinCount is 3.
const UNIT_SUFFIXES: Record<string, string[]> = {
  pinCount: ['pin', 'pins'],
  step: ['step', 'steps'],
  gauge: ['ga', 'gauge'],
  channelCount: ['channel', 'channels'],
}

function matchesUnitField(key: string, value: unknown, term: string): boolean {
  const suffixes = UNIT_SUFFIXES[key]
  if (!suffixes) return false
  const normalizedValue = normalizeForSearch(String(value))
  if (!normalizedValue) return false
  return suffixes.some((suffix) => `${normalizedValue}${suffix}`.includes(term))
}

export function matchesSearch<T extends object>(row: T, term: string): boolean {
  return Object.entries(row).some(([key, value]) => {
    if (key === 'key' || key === 'ids' || key === 'photoIds' || key === 'siteId') return false
    const text = normalizeForSearch(Array.isArray(value) ? value.join(' ') : String(value))
    if (text.includes(term)) return true

    // A field like "57 x 44" should also match a partially-typed "44 x 5" search,
    // so compare against the numbers swapped too — not just once fully typed.
    const dimensionMatch = text.match(DIMENSION_PATTERN)
    if (dimensionMatch) {
      const [, a, b] = dimensionMatch
      if (`${b}x${a}`.includes(term)) return true
    }

    if (matchesUnitField(key, value, term)) return true

    return false
  })
}
