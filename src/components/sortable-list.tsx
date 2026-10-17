"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

const announcements = {
  onDragStart: () => "Item diangkat. Pakai panah atas atau bawah untuk memindah, spasi untuk meletakkan.",
  onDragOver: () => "Item dipindah.",
  onDragEnd: () => "Item diletakkan.",
  onDragCancel: () => "Pengurutan dibatalkan.",
};

function Row({ id, children }: { id: number; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="Geser untuk mengurutkan"
      className="inline-flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted hover:bg-surface-muted active:cursor-grabbing"
    >
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden fill="currentColor">
        <circle cx="7" cy="5" r="1.5" />
        <circle cx="13" cy="5" r="1.5" />
        <circle cx="7" cy="10" r="1.5" />
        <circle cx="13" cy="10" r="1.5" />
        <circle cx="7" cy="15" r="1.5" />
        <circle cx="13" cy="15" r="1.5" />
      </svg>
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : undefined}
    >
      {children(handle)}
    </li>
  );
}

export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  className = "",
}: {
  items: T[];
  getId: (item: T) => number;
  onReorder: (ids: number[]) => void;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  className?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(Number(e.active.id)), ids.indexOf(Number(e.over.id))));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "Tekan spasi untuk mengangkat item, panah atas atau bawah untuk memindah, spasi lagi untuk meletakkan, Escape untuk batal.",
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={className}>
          {items.map((item) => (
            <Row key={getId(item)} id={getId(item)}>
              {(handle) => renderItem(item, handle)}
            </Row>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
