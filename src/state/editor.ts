const STORAGE_KEY = 'inventoryApp.editorName'

export function getEditorName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setEditorName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, name.trim())
  } catch {
    // ignore write failures (e.g. storage disabled)
  }
}
