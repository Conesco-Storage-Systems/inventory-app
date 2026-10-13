import type { CSSProperties, PointerEvent, ReactNode } from 'react'

interface DraggableColumnHeaderProps<T extends string> {
  columnKey: T
  isDragging: boolean
  onDragStartKey: (key: T) => void
  onDragOverKey: (key: T) => void
  onDragEnd: () => void
  children: ReactNode
  draggable?: boolean
  // Lets StickyHeaderRow's frozen clone force this cell to an exact
  // measured width (see its own comment for why) — unused otherwise.
  style?: CSSProperties
}

export default function DraggableColumnHeader<T extends string>({
  columnKey,
  isDragging,
  onDragStartKey,
  onDragOverKey,
  onDragEnd,
  children,
  draggable = true,
  style,
}: DraggableColumnHeaderProps<T>) {
  // Pointer Events (not the native HTML5 drag-and-drop API) because that
  // API has no touch backing at all on iOS/mobile browsers — a draggable
  // header there just falls through to the OS's default long-press
  // text-selection/callout gesture instead of actually dragging. Pointer
  // Events fire consistently for mouse, touch, and pen, so one
  // implementation covers both desktop and mobile.
  function handlePointerDown(e: PointerEvent<HTMLTableCellElement>) {
    if (!draggable) return
    // Let an interactive child (the filter icon button) handle its own
    // tap instead of this starting a column drag.
    if ((e.target as HTMLElement).closest('button, input, select, textarea')) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    onDragStartKey(columnKey)
  }

  function handlePointerMove(e: PointerEvent<HTMLTableCellElement>) {
    if (!draggable || !isDragging) return
    // The captured pointer keeps firing on the header that started the
    // drag even as the finger/cursor moves elsewhere — ask the DOM what's
    // actually under the current screen position instead.
    const target = document.elementFromPoint(e.clientX, e.clientY)
    const header = target?.closest<HTMLElement>('[data-column-key]')
    if (header?.dataset.columnKey) onDragOverKey(header.dataset.columnKey as T)
  }

  function handlePointerUp() {
    if (!draggable) return
    onDragEnd()
  }

  return (
    <th
      data-column-key={columnKey}
      className={`draggable-column-header${isDragging ? ' dragging' : ''}${draggable ? '' : ' not-draggable'}`}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {children}
    </th>
  )
}
