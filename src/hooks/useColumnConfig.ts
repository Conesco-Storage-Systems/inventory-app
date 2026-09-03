import { useEffect, useState } from 'react'

export function useColumnConfig<T extends string>(storageKey: string, defaultOrder: T[]) {
  const [order, setOrder] = useState<T[]>(() => {
    try {
      const stored = localStorage.getItem(`${storageKey}:order`)
      if (stored) {
        const parsed = (JSON.parse(stored) as T[]).filter((key) => defaultOrder.includes(key))
        let result = parsed
        for (const key of defaultOrder) {
          if (!result.includes(key)) result = [...result, key]
        }
        return result
      }
    } catch {
      // ignore malformed storage, fall back to default
    }
    return defaultOrder
  })

  const [hidden, setHidden] = useState<Set<T>>(() => {
    try {
      const stored = localStorage.getItem(`${storageKey}:hidden`)
      if (stored) {
        return new Set((JSON.parse(stored) as T[]).filter((key) => defaultOrder.includes(key)))
      }
    } catch {
      // ignore malformed storage
    }
    return new Set()
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
      localStorage.setItem(`${storageKey}:hidden`, JSON.stringify([...hidden]))
    } catch {
      // ignore write failures
    }
  }, [storageKey, hidden])

  function moveColumn(draggedKey: T, overKey: T) {
    if (draggedKey === overKey) return
    setOrder((prev) => {
      const next = prev.filter((key) => key !== draggedKey)
      const overIndex = next.indexOf(overKey)
      next.splice(overIndex, 0, draggedKey)
      return next
    })
  }

  function toggleHidden(key: T) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function setAllVisible(visible: boolean) {
    setHidden(visible ? new Set() : new Set(order))
  }

  const visibleOrder = order.filter((key) => !hidden.has(key))

  return { order, hidden, visibleOrder, moveColumn, toggleHidden, setAllVisible }
}
