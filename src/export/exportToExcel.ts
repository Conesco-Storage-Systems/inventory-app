import * as XLSX from 'xlsx'
import JSZip from 'jszip'

export interface ExportSheet {
  name: string
  rows: Record<string, string | number>[]
  // Turns one column into real clickable Excel hyperlinks — `column` must
  // match a key already present in `rows`, whose value is the cell's
  // display text; `targets[i]` is the URL for rows[i] (undefined leaves
  // that row's cell as plain text).
  hyperlinks?: { column: string; targets: (string | undefined)[] }
}

function autoSizeColumns(worksheet: XLSX.WorkSheet, headers: string[], rows: Record<string, string | number>[]) {
  worksheet['!cols'] = headers.map((header) => {
    const longestValue = rows.reduce((max, row) => {
      const value = row[header]
      const length = value === undefined || value === null ? 0 : String(value).length
      return Math.max(max, length)
    }, header.length)
    return { wch: Math.min(Math.max(longestValue + 2, 10), 45) }
  })
}

// The free build of the xlsx package can write a hyperlink *relationship*
// on a cell (so it's genuinely clickable), but silently drops any custom
// cell style (font color, underline) set on write — that's a paid-tier
// feature there, and the workbook it produces only ever has the single
// default font no matter what a cell's `.s` is set to. This patches the
// generated .xlsx's own internal XML directly afterward — adding one
// purple, underlined font to styles.xml and pointing each hyperlink cell
// at it — so it actually renders like a real hyperlink instead of plain
// text that merely happens to be clickable.
async function applyHyperlinkStyle(
  buffer: Uint8Array,
  hyperlinkCells: { sheetIndex: number; address: string }[],
): Promise<Uint8Array> {
  if (hyperlinkCells.length === 0) return buffer

  const zip = await JSZip.loadAsync(buffer)
  const stylesFile = zip.file('xl/styles.xml')
  if (!stylesFile) return buffer // unexpected shape — leave the file exactly as the library produced it

  let stylesXml = await stylesFile.async('string')
  const fontsMatch = stylesXml.match(/<fonts count="(\d+)">/)
  const cellXfsMatch = stylesXml.match(/<cellXfs count="(\d+)">/)
  if (!fontsMatch || !cellXfsMatch) return buffer

  const newFontId = parseInt(fontsMatch[1], 10)
  const newStyleIndex = parseInt(cellXfsMatch[1], 10)

  stylesXml = stylesXml
    .replace(fontsMatch[0], `<fonts count="${newFontId + 1}">`)
    .replace('</fonts>', '<font><u/><sz val="12"/><color rgb="FF7030A0"/><name val="Calibri"/><family val="2"/></font></fonts>')
    .replace(cellXfsMatch[0], `<cellXfs count="${newStyleIndex + 1}">`)
    .replace('</cellXfs>', `<xf numFmtId="0" fontId="${newFontId}" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`)
  zip.file('xl/styles.xml', stylesXml)

  const bySheet = new Map<number, string[]>()
  for (const { sheetIndex, address } of hyperlinkCells) {
    const list = bySheet.get(sheetIndex) ?? []
    list.push(address)
    bySheet.set(sheetIndex, list)
  }

  for (const [sheetIndex, addresses] of bySheet) {
    const sheetFile = zip.file(`xl/worksheets/sheet${sheetIndex + 1}.xml`)
    if (!sheetFile) continue
    let sheetXml = await sheetFile.async('string')
    for (const address of addresses) {
      sheetXml = sheetXml.replaceAll(`<c r="${address}"`, `<c r="${address}" s="${newStyleIndex}"`)
    }
    zip.file(`xl/worksheets/sheet${sheetIndex + 1}.xml`, sheetXml)
  }

  return zip.generateAsync({ type: 'uint8array' })
}

export async function exportSheetsToExcel(sheets: ExportSheet[], filename: string): Promise<void> {
  const workbook = XLSX.utils.book_new()
  const hyperlinkCells: { sheetIndex: number; address: string }[] = []

  sheets.forEach((sheet, sheetIndex) => {
    const headers = sheet.rows.length > 0 ? Object.keys(sheet.rows[0]) : []
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows, { header: headers })
    autoSizeColumns(worksheet, headers, sheet.rows)

    if (sheet.hyperlinks) {
      const colIndex = headers.indexOf(sheet.hyperlinks.column)
      if (colIndex !== -1) {
        sheet.hyperlinks.targets.forEach((target, rowIndex) => {
          if (!target) return
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex })
          const cell = worksheet[cellAddress]
          if (cell) {
            cell.l = { Target: target }
            hyperlinkCells.push({ sheetIndex, address: cellAddress })
          }
        })
      }
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31))
  })

  const rawBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as Uint8Array
  const buffer = await applyHyperlinkStyle(rawBuffer, hyperlinkCells)
  const blob = new Blob([new Uint8Array(buffer)], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
