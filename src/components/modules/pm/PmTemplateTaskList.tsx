'use client';

import React, { useMemo, useState } from 'react';
import { GripVertical, LibraryBig, Trash2 } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PM_TASK_TYPES, PM_TASK_TYPE_LABELS, type PmTaskType } from '@/lib/pm-task';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface PmTemplateResolvedTask {
  associationId: string;
  templateId: string;
  pmTaskId: string | null;
  sequence: number;
  masterTaskNumber: number | null;
  description: string;
  discipline: PmTaskType | null;
  compatibilityActionType: string;
  requiredParts: string | null;
  estimatedMinutes: number | null;
  isLegacy: boolean;
  masterIsActive: boolean | null;
}

interface Props {
  tasks: PmTemplateResolvedTask[];
  disabled?: boolean;
  busyAssociationId?: string | null;
  onReorder: (associationIds: string[]) => void | Promise<void>;
  onRemove: (associationId: string) => void | Promise<void>;
  onConvertLegacy: (associationId: string, taskType: PmTaskType) => void | Promise<void>;
}

function SortableTaskRow({ task, disabled, busy, onRemove, onConvertLegacy }: {
  task: PmTemplateResolvedTask;
  disabled: boolean;
  busy: boolean;
  onRemove: (associationId: string) => void | Promise<void>;
  onConvertLegacy: (associationId: string, taskType: PmTaskType) => void | Promise<void>;
}) {
  const [legacyType, setLegacyType] = useState<PmTaskType>('mechanical');
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.associationId, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return <div ref={setNodeRef} style={style} className="rounded-xl border bg-card p-3 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <button type="button" aria-label={`Reorder sequence ${task.sequence}`} disabled={disabled} {...attributes} {...listeners} className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Sequence {task.sequence}</Badge>
          {task.masterTaskNumber !== null ? <Badge variant="secondary">Task #{task.masterTaskNumber}</Badge> : <Badge variant="outline" className="border-amber-300 text-amber-700">Legacy</Badge>}
          {task.discipline && <Badge variant="outline" className="capitalize">{PM_TASK_TYPE_LABELS[task.discipline]}</Badge>}
          {task.masterIsActive === false && <Badge variant="outline" className="border-red-300 text-red-700">Master inactive</Badge>}
        </div>
        <p className="mt-2 text-sm font-medium break-words"><span className="sr-only">Task Description: </span>{task.description}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Action: {task.compatibilityActionType.replace(/_/g, ' ')}</p>
        {task.isLegacy && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/10">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Legacy template-only task</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Add to Task Library to give this task a permanent Task Number and discipline.</p>
          {!disabled && <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Select value={legacyType} onValueChange={(value) => setLegacyType(value as PmTaskType)}>
              <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{PM_TASK_TYPES.map((type) => <SelectItem key={type} value={type}>{PM_TASK_TYPE_LABELS[type]}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onConvertLegacy(task.associationId, legacyType)}>
              <LibraryBig className="mr-2 h-3.5 w-3.5" />Add to Task Library
            </Button>
          </div>}
        </div>}
      </div>
      {!disabled && <Button type="button" variant="ghost" size="sm" disabled={busy} className="shrink-0 text-red-600 hover:text-red-700" onClick={() => void onRemove(task.associationId)}>
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />Remove from Template
      </Button>}
    </div>
  </div>;
}

export function PmTemplateTaskList({ tasks, disabled = false, busyAssociationId, onReorder, onRemove, onConvertLegacy }: Props) {
  const associationIds = useMemo(() => tasks.map((task) => task.associationId), [tasks]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = associationIds.indexOf(String(event.active.id));
    const newIndex = associationIds.indexOf(String(event.over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    void onReorder(reordered.map((task) => task.associationId));
  };

  if (tasks.length === 0) return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No tasks are linked to this template yet.</div>;

  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    <SortableContext items={associationIds} strategy={verticalListSortingStrategy}>
      <div className="space-y-2">
        {tasks.map((task) => <SortableTaskRow key={task.associationId} task={task} disabled={disabled} busy={busyAssociationId === task.associationId} onRemove={onRemove} onConvertLegacy={onConvertLegacy} />)}
      </div>
    </SortableContext>
  </DndContext>;
}
