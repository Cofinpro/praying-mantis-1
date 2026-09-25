// CSV export for the Reports page, built in the browser from data we already have (no extra endpoint).

export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined }

// Excel and Sheets run a cell that starts with = + - @ (or a tab / CR) as a formula. Names are typed by
// users, so "=HYPERLINK(…)" as a name would become a live link: a leading ' makes it plain text again.
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: string | number | null | undefined): string {
  if (value == null) return ''
  let text = String(value)
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`
  // Quote a field with a comma, quote or line break, doubling the quotes inside (RFC 4180)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => cell(c.header)), ...rows.map((row) => columns.map((c) => cell(c.value(row))))]
  return lines.map((line) => line.join(',')).join('\r\n')
}

// Saves the text as a file: a Blob URL on a temporary <a download>, clicked and thrown away.
// The BOM (\uFEFF) makes Excel read the file as UTF-8, so "João" doesn't turn into "JoÃ£o".
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
