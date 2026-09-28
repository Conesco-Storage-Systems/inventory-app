import type { ColumnDef } from '../components/ReadOnlyItemTable'
import type { ItemType, SalesQuoteLineItem } from '../models/types'

// One extra row per active hold, inserted right after the live row it
// overlaps with (by raw record id) — same style/color/etc. columns as the
// main row, with quantity swapped for just the amount held (a row can be
// partially held, or held by more than one quote at once). A hold whose
// original row can no longer be found (edited/re-split away) is skipped
// rather than shown with blank fields.
export function mergeRowsWithHolds<T extends { key: string; ids: string[]; quantity: number }>(
  rows: T[],
  holds: SalesQuoteLineItem[],
  itemType: ItemType,
): (T & { heldByEmail?: string })[] {
  const merged: (T & { heldByEmail?: string })[] = []
  for (const row of rows) {
    merged.push(row)
    for (const hold of holds) {
      if (hold.itemType !== itemType) continue
      if (!row.ids.some((id) => hold.itemIds.includes(id))) continue
      merged.push({ ...row, key: `hold:${hold.id}`, quantity: hold.quantityHeld, heldByEmail: hold.heldByEmail })
    }
  }
  return merged
}

// Same columns as the main table, but the "quantity" and "select" columns
// (when present) get hold-aware overrides: a held row shows just its held
// amount and can't be selected again. The "Held By" name itself is shown
// via a separate fixed leading column (see ReadOnlyItemTable's
// `leadingColumn` prop) rather than one of these reorderable columns, so
// it always stays pinned to the left regardless of a viewer's saved
// column order.
export function withHoldAwareColumns<TRow extends { key: string; quantity: number }>(
  baseColumns: Record<string, ColumnDef<TRow>>,
): Record<string, ColumnDef<TRow & { heldByEmail?: string }>> {
  const columns: Record<string, ColumnDef<TRow & { heldByEmail?: string }>> = {}
  for (const [key, column] of Object.entries(baseColumns) as [string, ColumnDef<TRow>][]) {
    if (key === 'select') {
      columns.select = { ...column, render: (row) => (row.heldByEmail ? null : column.render(row)) }
    } else if (key === 'quantity') {
      columns.quantity = { ...column, render: (row) => (row.heldByEmail ? row.quantity : column.render(row)) }
    } else {
      columns[key] = column as ColumnDef<TRow & { heldByEmail?: string }>
    }
  }
  return columns
}
