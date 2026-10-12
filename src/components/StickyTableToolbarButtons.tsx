import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface StickyTableToolbarButtonsProps {
  // The .item-table-wrap this row's own table lives in — once that
  // table's section has fully scrolled past, these buttons stop being
  // relevant to show at all (same as the frozen header row).
  wrapperRef: RefObject<HTMLDivElement | null>
  // Whether the page is currently scrolled into this table's section.
  active: boolean
  // The sticky toolbar's own slot to portal these buttons into once
  // frozen — created and owned by the parent page, shared by whichever
  // section is currently active.
  portalTarget: HTMLDivElement | null
  children: ReactNode
}

// Same idea as StickyHeaderRow, applied to a table's own "Filter
// Columns"/"Sort" buttons instead of its header cells — they have no
// column-width alignment concern, so this is the simpler half of the
// same technique: once this row's own position scrolls above the
// toolbar, clone it (same elements, via portal, so clicking them still
// works normally) into the toolbar's button slot instead.
export default function StickyTableToolbarButtons({
  wrapperRef,
  active,
  portalTarget,
  children,
}: StickyTableToolbarButtonsProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [frozen, setFrozen] = useState(false)

  useEffect(() => {
    if (!active) {
      setFrozen(false)
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
      const rowRect = row.getBoundingClientRect()
      const wrapperRect = wrapper.getBoundingClientRect()
      setFrozen(rowRect.top < toolbarBottom && wrapperRect.bottom > toolbarBottom)
    }

    function onScrollOrResize() {
      if (frame) return
      frame = requestAnimationFrame(recompute)
    }

    recompute()
    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [active, wrapperRef])

  const showPortal = frozen && portalTarget

  return (
    <div ref={rowRef} className="table-toolbar-row" style={showPortal ? { visibility: 'hidden' } : undefined}>
      {showPortal ? createPortal(children, portalTarget) : children}
    </div>
  )
}
