import { db } from './db'
import { getEditorName } from '../state/editor'

export async function listOpenSalesOrderDiscrepancies() {
  const all = await db.salesOrderDiscrepancies.toArray()
  return all.filter((d) => !d.resolved).sort((a, b) => b.lastChangedAt - a.lastChangedAt)
}

// Just clears the flag — the actual inventory/tie adjustment it called for
// is made by hand elsewhere, same as deciding how to redistribute a
// quantity change across a tie is a human judgment call, not something
// this resolves automatically.
export async function resolveSalesOrderDiscrepancy(id: string): Promise<void> {
  await db.salesOrderDiscrepancies.update(id, {
    resolved: true,
    resolvedAt: Date.now(),
    resolvedBy: getEditorName(),
    updatedAt: Date.now(),
  })
}
