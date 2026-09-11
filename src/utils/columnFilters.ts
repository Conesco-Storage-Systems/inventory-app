import type { ColumnDef } from '../components/ReadOnlyItemTable'

// Distinct values available for each column's filter popup, computed from the
// full unfiltered row set so the option list doesn't shrink as filters are
// applied.
export function computeFilterOptions<TKey extends string, TRow>(
  rows: TRow[],
  columns: Record<TKey, ColumnDef<TRow>>,
): Record<TKey, string[]> {
  const result = {} as Record<TKey, string[]>
  for (const key of Object.keys(columns) as TKey[]) {
    const values = new Set<string>()
    for (const row of rows) {
      const value = columns[key].getValue(row)
      if (Array.isArray(value)) {
        for (const item of value) if (item) values.add(item)
      } else if (value) {
        values.add(value)
      }
    }
    result[key] = Array.from(values).sort()
  }
  return result
}

// A row passes if, for every column with an active (non-empty) filter, its
// value(s) intersect the selected set. No active filters = everything shows.
export function applyColumnFilters<TKey extends string, TRow>(
  rows: TRow[],
  columns: Record<TKey, ColumnDef<TRow>>,
  filters: Partial<Record<TKey, Set<string>>>,
): TRow[] {
  const activeEntries = (Object.entries(filters) as [TKey, Set<string> | undefined][]).filter(
    ([, values]) => values && values.size > 0,
  )
  if (activeEntries.length === 0) return rows

  return rows.filter((row) =>
    activeEntries.every(([key, values]) => {
      const value = columns[key].getValue(row)
      if (Array.isArray(value)) return value.some((item) => values!.has(item))
      return values!.has(value)
    }),
  )
}
