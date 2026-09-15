interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

interface FileSystemWritableFileStream {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
  }
}

/**
 * Opens the browser's native "Save As" picker (letting the user rename the
 * file and choose a folder) when supported — Chrome/Edge only. Falls back
 * to a plain auto-download for browsers without the File System Access API
 * (Firefox, Safari). Returns false if the user cancelled the picker, so the
 * caller can skip any "saved!" confirmation messaging.
 */
export async function saveBlobAs(blob: Blob, suggestedName: string): Promise<boolean> {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return true
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false
      throw err
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = suggestedName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return true
}
