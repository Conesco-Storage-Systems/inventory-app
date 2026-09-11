// Strips inch marks and all whitespace so formatting differences (4" x 96", 4 x 96,
// 4x96) don't stop a dimension search like "4x96" from matching.
export function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/["″]/g, '').replace(/\s+/g, '')
}

const DIMENSION_PATTERN = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/

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
    return false
  })
}
