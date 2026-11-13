"use client";
import type { ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";

/** ما تضعه الصفّ على مقبض السحب ⠿ */
export interface DragHandle {
  ref: (el: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}

/**
 * طابور يُرتَّب بالسحب والإفلات (الفأرة، أو الإصبع على المقبض، أو لوحة المفاتيح: مسافة ثمّ الأسهم ثمّ مسافة).
 * onMove(id, beforeId): المريض وُضع قبل beforeId، أو في الآخر (null).
 */
export function SortableQueue({
  ids,
  onMove,
  onDragging,
  instructions,
  announcements,
  children,
}: {
  ids: string[];
  onMove: (id: string, beforeId: string | null, order: string[]) => void;
  onDragging: (on: boolean) => void;
  instructions: string;
  announcements: Announcements;
  children: ReactNode;
}) {
  const sensors = useSensors(
    // يبدأ السحب بعد حركة صغيرة: النقر العاديّ على المقبض لا يحرّك شيئاً
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      accessibility={{ screenReaderInstructions: { draggable: instructions }, announcements }}
      onDragStart={() => onDragging(true)}
      onDragCancel={() => onDragging(false)}
      onDragEnd={({ active, over }) => {
        onDragging(false);
        if (!over || active.id === over.id) return;
        const order = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
        const at = order.indexOf(String(active.id));
        onMove(String(active.id), order[at + 1] ?? null, order);
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** صفّ يتحرّك بسلاسة أثناء السحب؛ المقبض يُعطى للمحتوى. */
export function SortableRow({ id, className, children }: { id: string; className: string; children: (handle: DragHandle, dragging: boolean) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${className} ${isDragging ? "relative z-10 rounded-2xl bg-white shadow-xl ring-2 ring-brand-400" : ""}`}
      data-testid="queue-row"
    >
      {children({ ref: setActivatorNodeRef, attributes, listeners }, isDragging)}
    </li>
  );
}
