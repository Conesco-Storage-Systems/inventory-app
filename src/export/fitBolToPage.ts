const PAGE_WIDTH_IN = 8.5
const PAGE_HEIGHT_IN = 11
const MARGIN_IN = 0.35
const PX_PER_IN = 96

export const BOL_PAGE_CONTENT_WIDTH_PX = (PAGE_WIDTH_IN - MARGIN_IN * 2) * PX_PER_IN
export const BOL_PAGE_CONTENT_HEIGHT_PX = (PAGE_HEIGHT_IN - MARGIN_IN * 2) * PX_PER_IN

/**
 * Measures the sheet's natural height and, if it's taller than one printed
 * page, scales it down (and collapses the wrapper to match) so it always
 * fits a single page — regardless of how content/CSS renders in practice.
 * Returns a function that restores the sheet to its normal, unscaled state.
 */
export function shrinkBolToOnePage(sheetEl: HTMLElement, wrapperEl: HTMLElement): () => void {
  sheetEl.style.transform = ''
  sheetEl.style.transformOrigin = ''
  wrapperEl.style.height = ''
  wrapperEl.style.overflow = ''

  const naturalHeight = sheetEl.scrollHeight
  const scale = naturalHeight > BOL_PAGE_CONTENT_HEIGHT_PX ? BOL_PAGE_CONTENT_HEIGHT_PX / naturalHeight : 1

  if (scale < 1) {
    sheetEl.style.transform = `scale(${scale})`
    sheetEl.style.transformOrigin = 'top left'
    wrapperEl.style.height = `${naturalHeight * scale}px`
    wrapperEl.style.overflow = 'hidden'
  }

  return () => {
    sheetEl.style.transform = ''
    sheetEl.style.transformOrigin = ''
    wrapperEl.style.height = ''
    wrapperEl.style.overflow = ''
  }
}
