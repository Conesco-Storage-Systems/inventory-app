/**
 * Downscales an image blob to a data URI, keeping generated documents
 * (and the records that store them) a reasonable size regardless of how
 * large the original camera photo was.
 */
export function compressImageToDataUrl(blob: Blob, maxWidth = 800, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Could not get canvas context'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(objectUrl)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not load image'))
    }
    img.src = objectUrl
  })
}

function compressBlobToFile(blob: Blob, maxWidth: number, quality: number, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Could not get canvas context'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(objectUrl)
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error('Could not compress image'))
            return
          }
          resolve(new File([result], name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not load image'))
    }
    img.src = objectUrl
  })
}

/**
 * Same idea as compressImageToDataUrl, but produces a File — for photos
 * that get stored and synced as-is (item/BOL/project/site photos), rather
 * than baked into a generated document. A phone's camera photo can be a
 * large, multi-megabyte file and, depending on the phone's settings, isn't
 * necessarily even a JPEG (e.g. HEIC on iPhones) — decoding it through
 * <img>/canvas once here and re-encoding to JPEG normalizes both the size
 * and the format before it's ever stored, so every synced photo is small
 * and in a universally-supported format regardless of what the camera
 * actually produced.
 *
 * Safari/iOS decode HEIC natively through <img>, so that path is tried
 * first and left alone everywhere it already works. Chrome/Edge/Firefox
 * on Windows (and most non-Apple software) can't display HEIC at all —
 * picking one of those photos via "Add From Files" on a PC used to save
 * the record fine but never render it. Only on that failure do we convert
 * through heic-to (WASM, independent of the browser's own image codecs)
 * and retry, so browsers that already handle HEIC never pay for it.
 *
 * This never throws, and never falls back to the original File reference
 * either: a <input capture> File on iOS can be a lazy handle onto a
 * transient OS capture buffer, and a later camera shot can reuse that same
 * buffer — storing it as-is risks a subsequent photo silently overwriting
 * what an earlier record reads back. Every path here ends in a freshly
 * read, fully in-memory copy instead.
 */
export async function compressImageToFile(file: File, maxWidth = 1600, quality = 0.85): Promise<File> {
  try {
    return await compressBlobToFile(file, maxWidth, quality, file.name)
  } catch {
    try {
      const { isHeic, heicTo } = await import('heic-to')
      if (await isHeic(file).catch(() => false)) {
        const converted = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 })
        return await compressBlobToFile(converted, maxWidth, quality, file.name)
      }
    } catch {
      // Falls through to the detached-copy fallback below.
    }
    const buffer = await file.arrayBuffer()
    return new File([buffer], file.name, { type: file.type || 'image/jpeg' })
  }
}
