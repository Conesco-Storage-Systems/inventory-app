import { useEffect, useState } from 'react'

export function useFieldOrder<T extends string>(
  storageKey: string,
  defaultOrder: T[],
  newKeyPositions?: Partial<Record<T, 'start' | 'end'>>,
) {
  const [order, setOrder] = useState<T[]>(() => {
    try {
      const stored = localStorage.getItem(`${storageKey}:order`)
      if (stored) {
        const parsed = (JSON.parse(stored) as T[]).filter((key) => defaultOrder.includes(key))
        let result = parsed
        for (const key of defaultOrder) {
          if (result.includes(key)) continue
          result =
            newKeyPositions?.[key] === 'start' ? [key, ...result] : [...result, key]
        }
        return result
      }
    } catch {
      // ignore malformed storage, fall back to default
    }
    return defaultOrder
  })

  const [locked, setLocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`${storageKey}:locked`) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}:order`, JSON.stringify(order))
    } catch {
      // ignore write failures (e.g. storage disabled)
    }
  }, [storageKey, order])

  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}:locked`, String(locked))
    } catch {
      // ignore write failures
    }
  }, [storageKey, locked])

  function moveField(draggedKey: T, overKey: T) {
    if (draggedKey === overKey) return
    setOrder((prev) => {
      const next = prev.filter((key) => key !== draggedKey)
      const overIndex = next.indexOf(overKey)
      next.splice(overIndex, 0, draggedKey)
      return next
    })
  }

  return { order, locked, setLocked, moveField }
}
