'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LibraryBig, Loader2, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import {
  formatPmAssignmentEstimatedTime,
  pmAssignmentDraftFromMaster,
  totalPmAssignmentEstimatedMinutes,
  type PmAssignmentAssetMeterOption,
  type PmAssignmentConditionSourceOption,
  type PmAssignmentTaskDraft,
  type PmAssignmentTaskMaster,
} from '@/lib/pm-assignment-draft';
import { Button } from '@/components/ui/button';
import { PmAssignmentTaskCard } from '@/components/modules/pm/PmAssignmentTaskCard';
import { PmScheduleTaskPickerDialog } from '@/components/modules/pm/PmScheduleTaskPickerDialog';

interface Props {
  tasks: PmAssignmentTaskDraft[];
  onChange: (tasks: PmAssignmentTaskDraft[]) => void;
  assetId: string;
  componentId?: string | null;
  disabled?: boolean;
}

export function PmAssignmentTaskPlanner({ tasks, onChange, assetId, componentId = null, disabled = false }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [meters, setMeters] = useState<PmAssignmentAssetMeterOption[]>([]);
  const [conditions, setConditions] = useState<PmAssignmentConditionSourceOption[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const clientSequence = useRef(0);

  const nextClientId = useCallback((pmTaskId: string) => {
    clientSequence.current += 1;
    return `${pmTaskId}:direct:${clientSequence.current}`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!assetId) {
      setMeters([]);
      setConditions([]);
      return () => { cancelled = true; };
    }

    setSourcesLoading(true);
    const conditionParams = new URLSearchParams({ assetId });
    if (componentId) conditionParams.set('componentId', componentId);
    void Promise.all([
      api.get<any[]>(`/api/assets/${encodeURIComponent(assetId)}/meters`),
      api.get<PmAssignmentConditionSourceOption[]>(`/api/pm-schedules/condition-sources?${conditionParams.toString()}`),
    ]).then(([meterResponse, conditionResponse]) => {
      if (cancelled) return;
      const meterRows = meterResponse.success && Array.isArray(meterResponse.data)
        ? meterResponse.data.filter((meter) => meter.isActive !== false).map((meter) => ({
            id: String(meter.id),
            name: String(meter.name),
            unit: String(meter.unit),
            currentValue: Number(meter.currentValue),
            lastReadingAt: meter.lastReadingAt ? String(meter.lastReadingAt) : null,
            isActive: meter.isActive !== false,
          }))
        : [];
      setMeters(meterRows);
      setConditions(conditionResponse.success && Array.isArray(conditionResponse.data) ? conditionResponse.data : []);
    }).catch(() => {
      if (!cancelled) {
        setMeters([]);
        setConditions([]);
      }
    }).finally(() => {
      if (!cancelled) setSourcesLoading(false);
    });

    return () => { cancelled = true; };
  }, [assetId, componentId]);

  const addTasks = (masters: PmAssignmentTaskMaster[]) => {
    const added = masters.map((master) => pmAssignmentDraftFromMaster(master, nextClientId(master.id)));
    if (added.length) onChange([...tasks, ...added]);
  };

  const patch = (index: number, values: Partial<PmAssignmentTaskDraft>) => {
    onChange(tasks.map((task, taskIndex) => taskIndex === index ? { ...task, ...values } : task));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= tasks.length) return;
    const next = [...tasks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (index: number) => onChange(tasks.filter((_, taskIndex) => taskIndex !== index));
  const totalMinutes = totalPmAssignmentEstimatedMinutes(tasks);

  return (
    <div data-testid="pm-assignment-task-planner" className="space-y-2">
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Tasks & Planning</p>
          <p className="text-[11px] text-muted-foreground">Configure each task independently. The same Task Library task can be added again with different planning conditions.</p>
          <p className="mt-1 text-xs"><span className="text-muted-foreground">Tasks:</span> <strong>{tasks.length}</strong> <span className="mx-1.5 text-muted-foreground">·</span> <span className="text-muted-foreground">Total estimated time:</span> <strong>{formatPmAssignmentEstimatedTime(totalMinutes)}</strong>{totalMinutes > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({(totalMinutes / 60).toFixed(2)} h)</span>}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)} disabled={disabled || !assetId} className="h-8 w-full text-xs sm:w-auto">
          <Plus className="mr-1.5 h-4 w-4" /> Add Task from Library
        </Button>
      </div>

      {!assetId && <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">Select an asset first.</div>}

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <LibraryBig className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No PM tasks added yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Load a Task Template above or add Task Library records here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sourcesLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Refreshing asset meters and condition sources…</div>}
          {tasks.map((task, index) => (
            <PmAssignmentTaskCard
              key={task.clientId}
              task={task}
              index={index}
              total={tasks.length}
              meters={meters}
              conditions={conditions}
              sourcesLoading={sourcesLoading}
              onChange={(values) => patch(index, values)}
              onMove={(direction) => move(index, direction)}
              onRemove={() => remove(index)}
            />
          ))}
        </div>
      )}

      <PmScheduleTaskPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludedTaskIds={[]}
        onConfirm={addTasks}
      />
    </div>
  );
}
