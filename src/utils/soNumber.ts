// Raw SO numbers come from SalesPad already carrying an "SO" prefix and
// zero-padding (e.g. "SO042667") — strip both so it reads as "SO42667"
// instead of doubling up on the "SO" label.
export function formatSoNumber(raw: string): string {
  const digits = raw.replace(/^SO/i, '').replace(/^0+(?=\d)/, '')
  return `SO${digits}`
}
