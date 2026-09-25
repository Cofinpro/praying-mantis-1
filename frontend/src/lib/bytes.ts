// "800 B", "12 KB", "2.4 MB": file sizes for people (1 KB = 1024 bytes, like the OS shows them)
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
