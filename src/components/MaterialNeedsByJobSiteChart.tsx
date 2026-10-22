// A horizontal stacked-bar chart: one bar per material need (job site +
// exact spec), its full length is the quantity needed, and it fills up
// with one colored segment per real Location it's actually being sourced
// from — so "20 of 100 beams needed in Las Vegas are on hand at Denver"
// reads directly as a 20%-filled, Denver-colored bar. Whatever's left
// unfilled is still needed. See the dataviz skill for the mark/color
// rules this follows (categorical palette in fixed order, 2px gaps
// between segments, direct end-label, legend for 2+ series, table-view
// fallback via the Material Needs table alongside it).

export interface ChartSourcingSegment {
  siteId: string
  siteName: string
  quantity: number
}

export interface MaterialNeedChartRow {
  id: string
  label: string
  quantityNeeded: number
  segments: ChartSourcingSegment[]
}

interface MaterialNeedsByJobSiteChartProps {
  title: string
  rows: MaterialNeedChartRow[]
  // siteId -> validated categorical hex, assigned once (in a fixed order)
  // across the whole dashboard so a given Location is always the same
  // color in every chart, not re-picked per chart.
  siteColorMap: Record<string, string>
}

const STILL_NEEDED_COLOR = '#c3c2b7'

export default function MaterialNeedsByJobSiteChart({ title, rows, siteColorMap }: MaterialNeedsByJobSiteChartProps) {
  if (rows.length === 0) return null

  const legendSiteIds = Array.from(new Set(rows.flatMap((row) => row.segments.map((s) => s.siteId))))
  const legendNames = new Map<string, string>()
  for (const row of rows) {
    for (const seg of row.segments) legendNames.set(seg.siteId, seg.siteName)
  }

  return (
    <section className="item-section needs-chart">
      <h2>{title} Needed by Job Site</h2>
      <div className="needs-chart-legend">
        {legendSiteIds.map((siteId) => (
          <span key={siteId} className="needs-chart-legend-item">
            <span className="needs-chart-swatch" style={{ background: siteColorMap[siteId] ?? STILL_NEEDED_COLOR }} />
            {legendNames.get(siteId)}
          </span>
        ))}
        <span className="needs-chart-legend-item">
          <span className="needs-chart-swatch" style={{ background: STILL_NEEDED_COLOR }} />
          Still Needed
        </span>
      </div>

      {rows.map((row) => {
        const sourced = row.segments.reduce((sum, s) => sum + s.quantity, 0)
        const surplus = Math.max(0, sourced - row.quantityNeeded)
        let remainingPercent = 100
        return (
          <div className="need-bar-row" key={row.id}>
            <div className="need-bar-label">{row.label}</div>
            <div className="need-bar-track">
              {row.segments.map((seg) => {
                if (remainingPercent <= 0 || seg.quantity <= 0) return null
                const percent = Math.min((seg.quantity / row.quantityNeeded) * 100, remainingPercent)
                remainingPercent -= percent
                return (
                  <div
                    key={seg.siteId}
                    className="need-bar-segment"
                    tabIndex={0}
                    data-tooltip={`${seg.siteName}: ${seg.quantity}`}
                    style={{ width: `${percent}%`, background: siteColorMap[seg.siteId] ?? STILL_NEEDED_COLOR }}
                  />
                )
              })}
            </div>
            <div className="need-bar-value">
              {Math.min(sourced, row.quantityNeeded)} of {row.quantityNeeded}
              {surplus > 0 ? ` (+${surplus} surplus)` : ''}
            </div>
          </div>
        )
      })}
    </section>
  )
}
