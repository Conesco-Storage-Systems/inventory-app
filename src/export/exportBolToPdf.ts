import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

const MARGIN_PT = 0.35 * 72

export async function bolElementToPdfBlob(element: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' })
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const imgWidth = pageWidth - MARGIN_PT * 2
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  const maxHeight = pageHeight - MARGIN_PT * 2

  let heightLeft = imgHeight
  let position = MARGIN_PT

  pdf.addImage(imgData, 'PNG', MARGIN_PT, position, imgWidth, imgHeight)
  heightLeft -= maxHeight

  while (heightLeft > 0) {
    position = MARGIN_PT - (imgHeight - heightLeft)
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', MARGIN_PT, position, imgWidth, imgHeight)
    heightLeft -= maxHeight
  }

  return pdf.output('blob')
}

export function bolPdfFileName(loadNumber: string, date: string): string {
  const parts = ['BOL', loadNumber || 'unnumbered', date || 'undated']
  return `${parts.join('-').replace(/[^a-zA-Z0-9-]+/g, '_')}.pdf`
}
