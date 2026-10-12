import type { CSSProperties, ReactNode } from 'react'

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
  return (
    <th
      className={`draggable-column-header${isDragging ? ' dragging' : ''}${draggable ? '' : ' not-draggable'}`}
      draggable={draggable}
      onDragStart={() => draggable && onDragStartKey(columnKey)}
      onDragOver={(e) => {
        if (!draggable) return
        e.preventDefault()
        onDragOverKey(columnKey)
      }}
      onDragEnd={onDragEnd}
      style={style}
    >
      {children}
    </th>
  )
}
