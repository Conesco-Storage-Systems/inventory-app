import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

interface FrozenState {
  top: number
  // Where the real table's columns sit horizontally on the page — the
  // overlay itself now spans the full screen width (to look like one
  // continuous bar with the toolbar above it), so this offset is what
  // keeps the actual header cells lined up with the real columns within
  // that full-width bar instead of starting flush at the left edge.
  left: number
  colWidths: number[]
  totalWidth: number
}

interface StickyHeaderRowProps {
  // The .item-table-wrap div this header's table lives in — its own
  // horizontal scroll is what the frozen clone has to track, and its
  // position is what the clone gets fixed to.
  wrapperRef: RefObject<HTMLDivElement | null>
  // Whether the page is currently scrolled into this table's own
  // section (Uprights/Beams/etc) — only the active one ever needs to
  // freeze; the others just render normally.
  active: boolean
  // The <th> elements themselves (not wrapped in a <tr> — this component
  // owns the <tr> so it can render the exact same cells twice: once
  // normally, once in the frozen clone).
  children: ReactNode
}

// A real sticky `<thead>` doesn't work here: .item-table-wrap needs
// overflow-x:auto for wide tables, and per the CSS overflow spec, a
// container with overflow set on only one axis gets the other axis
// forced to 'auto' too — making that wrapper (which never actually
// scrolls on its own) the sticky containing block instead of the page,
// so position:sticky silently stops tracking page scroll at all. This
// works around it by cloning the header row into a position:fixed
// overlay once the real one scrolls out of view, with its horizontal
// scroll kept in sync with the real wrapper by hand.
export default function StickyHeaderRow({ wrapperRef, active, children }: StickyHeaderRowProps) {
  const rowRef = useRef<HTMLTableRowElement>(null)
  const overlayTableRef = useRef<HTMLTableElement>(null)
  const [frozen, setFrozen] = useState<FrozenState | null>(null)

  useEffect(() => {
    if (!active) {
      setFrozen(null)
      return
    }
    let frame = 0

    function recompute() {
      frame = 0
      const wrapper = wrapperRef.current
      const row = rowRef.current
      if (!wrapper || !row) return
      const toolbar = document.querySelector('.sticky-toolbar')
      const toolbarBottom = toolbar?.getBoundingClientRect().bottom ?? 0
      const wrapperRect = wrapper.getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      const shouldFreeze = rowRect.top < toolbarBottom && wrapperRect.bottom > toolbarBottom
      if (!shouldFreeze) {
        setFrozen(null)
        return
      }
      const colWidths = Array.from(row.children).map((cell) => cell.getBoundingClientRect().width)
      const totalWidth = colWidths.reduce((sum, w) => sum + w, 0)
      // The wrapper's own box edge isn't always the same as where its first
      // cell actually starts (e.g. a collapsed table border eats a
      // fraction of a pixel) — anchoring to the wrapper left a small,
      // page-dependent gap between the clone and the real columns. The
      // first real cell's own edge is what the clone actually needs to
      // match, so anchor to that instead (converted back to a
      // scroll-independent offset, same as wrapperRect.left was, so the
      // existing translateX(left - scrollLeft) sync logic still applies).
      const firstCellRect = row.children[0]?.getBoundingClientRect()
      const left = firstCellRect ? firstCellRect.left + wrapper.scrollLeft : wrapperRect.left
      setFrozen({ top: toolbarBottom, left, colWidths, totalWidth })
    }

    function onScrollOrResize() {
      if (frame) return
      frame = requestAnimationFrame(recompute)
    }

    recompute()
    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)
    const wrapperEl = wrapperRef.current
    wrapperEl?.addEventListener('scroll', onScrollOrResize, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
      wrapperEl?.removeEventListener('scroll', onScrollOrResize)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [active, wrapperRef])

  useEffect(() => {
    if (!frozen) return
    const left = frozen.left
    const wrapperEl = wrapperRef.current
    function syncScroll() {
      if (!wrapperEl || !overlayTableRef.current) return
      // left shifts the table right to where the real columns sit on the
      // page (since the overlay itself now spans the full screen width);
      // scrollLeft then shifts it back left as the real table is
      // scrolled sideways, same as before. This is a margin rather than a
      // transform so the browser positions it through the same layout
      // pipeline as the real (non-transformed) table — a transform is
      // composited separately and can round sub-pixel positions slightly
      // differently, which showed up as a hairline visual misalignment
      // even though the measured coordinates matched exactly.
      overlayTableRef.current.style.marginLeft = `${left - wrapperEl.scrollLeft}px`
    }
    syncScroll()
    wrapperEl?.addEventListener('scroll', syncScroll, { passive: true })
    return () => wrapperEl?.removeEventListener('scroll', syncScroll)
  }, [frozen, wrapperRef])

  // Forces each cloned cell to the exact pixel width measured from its
  // real counterpart, with box-sizing:border-box so "width" unambiguously
  // means the full rendered width (padding and border included) — the
  // same thing getBoundingClientRect() measured. A <colgroup> alone
  // turned out not to be reliable here: table-layout:fixed's column-width
  // algorithm doesn't consistently treat a <col> width as the *total*
  // rendered width once a cell's own padding is involved, which showed up
  // as the clone's columns drifting slightly out of alignment with the
  // real ones as they moved further from the first column.
  const colWidths = frozen?.colWidths
  const clonedChildren = colWidths
    ? Children.map(children, (child, i) => {
        if (!isValidElement(child)) return child
        const width = colWidths[i]
        if (width == null) return child
        const existingStyle = (child.props as { style?: CSSProperties }).style
        return cloneElement(child as ReactElement<{ style?: CSSProperties }>, {
          style: { ...existingStyle, width, minWidth: width, maxWidth: width, boxSizing: 'border-box' },
        })
      })
    : children

  return (
    <>
      <tr ref={rowRef} style={frozen ? { visibility: 'hidden' } : undefined}>
        {children}
      </tr>
      {frozen &&
        createPortal(
          <div className="frozen-header-overlay" style={{ top: frozen.top }}>
            <table ref={overlayTableRef} className="item-table frozen-header-table" style={{ width: frozen.totalWidth }}>
              <thead>
                <tr>{clonedChildren}</tr>
              </thead>
            </table>
          </div>,
          document.body,
        )}
    </>
  )
}
