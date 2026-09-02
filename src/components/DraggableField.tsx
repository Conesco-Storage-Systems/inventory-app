import type { ReactNode } from 'react'

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
  return (
    <div
      className={`field-row${draggable ? ' draggable' : ''}${isDragging ? ' dragging' : ''}`}
      draggable={draggable}
      onDragStart={() => onDragStartKey(fieldKey)}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOverKey(fieldKey)
      }}
      onDragEnd={onDragEnd}
    >
      {draggable && (
        <span className="drag-handle" aria-hidden="true">
          ⠿
        </span>
      )}
      {children}
    </div>
  )
}
