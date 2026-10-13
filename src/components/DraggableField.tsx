import type { PointerEvent, ReactNode } from 'react'

interface DraggableFieldProps {
  fieldKey: string
  draggable: boolean
  isDragging: boolean
  onDragStartKey: (key: string) => void
  onDragOverKey: (key: string) => void
  onDragEnd: () => void
  children: ReactNode
}

export default function DraggableField({
  fieldKey,
  draggable,
  isDragging,
  onDragStartKey,
  onDragOverKey,
  onDragEnd,
  children,
}: DraggableFieldProps) {
  // Pointer Events (not the native HTML5 drag-and-drop API) because that
  // API has no touch backing at all on iOS/mobile browsers — a draggable
  // element there just falls through to the OS's default long-press
  // text-selection/callout gesture instead of actually dragging. Pointer
  // Events fire consistently for mouse, touch, and pen, so one
  // implementation covers both desktop and mobile.
  function handlePointerDown(e: PointerEvent<HTMLSpanElement>) {
    if (!draggable) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    onDragStartKey(fieldKey)
  }

  function handlePointerMove(e: PointerEvent<HTMLSpanElement>) {
    if (!draggable || !isDragging) return
    // The captured pointer keeps firing on the handle itself even as the
    // finger moves elsewhere — ask the DOM what's actually under the
    // current screen position instead.
    const target = document.elementFromPoint(e.clientX, e.clientY)
    const row = target?.closest<HTMLElement>('[data-field-key]')
    if (row?.dataset.fieldKey) onDragOverKey(row.dataset.fieldKey)
  }

  function handlePointerUp() {
    if (!draggable) return
    onDragEnd()
  }

  return (
    <div
      data-field-key={fieldKey}
      className={`field-row${draggable ? ' draggable' : ''}${isDragging ? ' dragging' : ''}`}
    >
      {draggable && (
        <span
          className="drag-handle"
          aria-hidden="true"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          ⠿
        </span>
      )}
      {children}
    </div>
  )
}
