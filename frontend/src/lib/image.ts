// Shrinks a photo in the browser before upload: a phone picture is 3-10 MB, the avatar needs ~20 KB.
// Center-crops to a square (like the round avatar shows it), scales to `size` px, encodes as JPEG.

export async function toSquareJpeg(file: File, size = 256, quality = 0.85): Promise<Blob> {
  // createImageBitmap decodes JPEG/PNG/WebP/HEIC (where the browser supports it) and applies EXIF rotation
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available')
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close()

  // canvas.toBlob is callback-based; wrap it so the caller can await it
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))), 'image/jpeg', quality),
  )
}
