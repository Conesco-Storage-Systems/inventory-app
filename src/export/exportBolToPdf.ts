import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

const MARGIN_PT = 0.35 * 72

export async function bolElementToPdfBlob(element: HTMLElement): Promise<Blob> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth - MARGIN_PT * 2
  const maxHeight = pageHeight - MARGIN_PT * 2

  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' })
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  const pxPerPt = canvas.height / imgHeight

  let consumed = 0
  let firstPage = true
  while (consumed < imgHeight) {
    const end = Math.min(consumed + maxHeight, imgHeight)

    // addImage has no way to clip a source region, so placing the same full
    // (much taller) image on every page — just repositioned — would bleed a
    // sliver of adjacent content into this page's top/bottom margins. Each
    // page instead gets its own cropped slice, sized to exactly its content
    // and nothing more.
    const startPx = Math.round(consumed * pxPerPt)
    const endPx = Math.min(canvas.height, Math.round(end * pxPerPt))
    const sliceHeightPx = Math.max(1, endPx - startPx)

    const sliceCanvas = document.createElement('canvas')
    sliceCanvas.width = canvas.width
    sliceCanvas.height = sliceHeightPx
    const ctx = sliceCanvas.getContext('2d')
    ctx?.drawImage(canvas, 0, startPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)
    const sliceData = sliceCanvas.toDataURL('image/png')
    const sliceHeightPt = sliceHeightPx / pxPerPt

    if (!firstPage) pdf.addPage()
    firstPage = false
    pdf.addImage(sliceData, 'PNG', MARGIN_PT, MARGIN_PT, imgWidth, sliceHeightPt)
    consumed = end
  }

  return pdf.output('blob')
}

// Lays out a sequence of DOM blocks (e.g. the header, the customer-info box,
// and one block per line item) onto letter pages. Unlike bolElementToPdfBlob
// above, each block is captured and placed as its own complete, independent
// image — never cropped out of a larger one — so a block's border or
// content can never be split across a page break: it either fits in full on
// the current page, or starts fresh at the top of a new one.
const BLOCK_GAP_PT = 6

export async function blockElementsToPdfBlob(blocks: HTMLElement[]): Promise<Blob> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth - MARGIN_PT * 2

  let pdfY = MARGIN_PT

  for (const block of blocks) {
    const canvas = await html2canvas(block, { scale: 2, backgroundColor: '#ffffff' })
    const blockHeight = (canvas.height * imgWidth) / canvas.width

    // Only push to a new page if something's already on this one — a block
    // taller than a full page still has to go somewhere, so it gets placed
    // (and allowed to overflow) rather than looping forever.
    if (pdfY > MARGIN_PT && pdfY + blockHeight > pageHeight - MARGIN_PT) {
      pdf.addPage()
      pdfY = MARGIN_PT
    }

    const imgData = canvas.toDataURL('image/png')
    pdf.addImage(imgData, 'PNG', MARGIN_PT, pdfY, imgWidth, blockHeight)
    pdfY += blockHeight + BLOCK_GAP_PT
  }

  return pdf.output('blob')
}

// Builds the block list for blockElementsToPdfBlob from a document's root
// element: each direct child becomes its own block, except children
// matching expandSelector (a wrapper around repeating blocks, e.g. the
// item-list container), whose own children are used instead — so that
// wrapper never becomes one giant unsplittable block itself.
export function collectPdfBlocks(root: HTMLElement, expandSelector: string): HTMLElement[] {
  const blocks: HTMLElement[] = []
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue
    if (child.matches(expandSelector)) {
      blocks.push(...Array.from(child.children).filter((c): c is HTMLElement => c instanceof HTMLElement))
    } else {
      blocks.push(child)
    }
  }
  return blocks
}

export function bolPdfFileName(loadNumber: string, date: string): string {
  const parts = ['BOL', loadNumber || 'unnumbered', date || 'undated']
  return `${parts.join('-').replace(/[^a-zA-Z0-9-]+/g, '_')}.pdf`
}
