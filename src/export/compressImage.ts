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

/**
 * Same idea as compressImageToDataUrl, but produces a File — for photos
 * that get stored and synced as-is (item/BOL/project photos), rather than
 * baked into a generated document. A phone's camera photo can be a large,
 * multi-megabyte file and, depending on the phone's settings, isn't
 * necessarily even a JPEG (e.g. HEIC on iPhones) — decoding it through
 * <img>/canvas once here and re-encoding to JPEG normalizes both the size
 * and the format before it's ever stored, so every synced photo is small
 * and in a universally-supported format regardless of what the camera
 * actually produced.
 */
export function compressImageToFile(file: File, maxWidth = 1600, quality = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
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
        (blob) => {
          if (!blob) {
            reject(new Error('Could not compress image'))
            return
          }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }))
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
