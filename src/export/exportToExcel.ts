import * as XLSX from 'xlsx'

export interface ExportSheet {
  name: string
  rows: Record<string, string | number>[]
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

export function exportSheetsToExcel(sheets: ExportSheet[], filename: string): void {
  const workbook = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const headers = sheet.rows.length > 0 ? Object.keys(sheet.rows[0]) : []
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows, { header: headers })
    autoSizeColumns(worksheet, headers, sheet.rows)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31))
  }

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
