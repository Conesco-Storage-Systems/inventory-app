import type { ReactNode } from 'react'

interface DraggableColumnHeaderProps<T extends string> {
  columnKey: T
  isDragging: boolean
  onDragStartKey: (key: T) => void
  onDragOverKey: (key: T) => void
  onDragEnd: () => void
  children: ReactNode
}

export default function DraggableColumnHeader<T extends string>({
  columnKey,
  isDragging,
  onDragStartKey,
  onDragOverKey,
  onDragEnd,
  children,
}: DraggableColumnHeaderProps<T>) {
  return (
    <th
      className={`draggable-column-header${isDragging ? ' dragging' : ''}`}
      draggable
      onDragStart={() => onDragStartKey(columnKey)}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOverKey(columnKey)
      }}
      onDragEnd={onDragEnd}
    >
      {children}
    </th>
  )
}
