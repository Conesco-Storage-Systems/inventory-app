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

// iPhones save camera-roll photos as HEIC by default. Safari/iOS decode
// that natively through <img>, but Chrome/Edge/Firefox on Windows (and
// most non-Apple software) can't display HEIC at all — picking one of
// those photos via "Add From Files" on a PC silently produced an
// undecodable image (the record saved fine, but the photo itself never
// rendered). heic2any does the HEIC decode in WASM, independent of the
// browser's own image codecs, so it works the same everywhere.
function looksLikeHeic(file: File): boolean {
  const type = file.type.toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') return true
  return /\.hei[cf]$/i.test(file.name)
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const { default: heic2any } = await import('heic2any')
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
  const blob = Array.isArray(result) ? result[0] : result
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
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
export async function compressImageToFile(file: File, maxWidth = 1600, quality = 0.85): Promise<File> {
  const sourceFile = looksLikeHeic(file) ? await convertHeicToJpeg(file) : file
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(sourceFile)
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
