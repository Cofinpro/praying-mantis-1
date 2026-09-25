// Saves a Blob as a file: a Blob URL on a temporary <a download>, clicked and thrown away.
// Used for CSV exports (lib/csv.ts) and training materials, which need the login token and so can't be a plain link.
export function saveFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Revoke on the next tick: some browsers start the download asynchronously after click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
