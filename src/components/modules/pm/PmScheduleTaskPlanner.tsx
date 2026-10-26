'use client';

import React, { useEffect, useState } from 'react';
import { LibraryBig, Loader2, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import {
  pmScheduleTaskDraftFromMaster,
  type PmScheduleConditionSourceOption,
  type PmScheduleMeterOption,
  type PmScheduleTaskDraft,
  type PmScheduleTaskMaster,
} from '@/lib/pm-schedule-task';
import { Button } from '@/components/ui/button';
import { PmScheduleTaskCard } from '@/components/modules/pm/PmScheduleTaskCard';
import { PmScheduleTaskPickerDialog } from '@/components/modules/pm/PmScheduleTaskPickerDialog';

interface Props {
  tasks: PmScheduleTaskDraft[];
  onChange: (tasks: PmScheduleTaskDraft[]) => void;
  assetId: string;
  componentId?: string | null;
  disabled?: boolean;
}

export function PmScheduleTaskPlanner({ tasks, onChange, assetId, componentId = null, disabled = false }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [meterOptions, setMeterOptions] = useState<PmScheduleMeterOption[]>([]);
  const [conditionOptions, setConditionOptions] = useState<PmScheduleConditionSourceOption[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!assetId) {
      setMeterOptions([]);
      setConditionOptions([]);
      return () => { cancelled = true; };
    }

    setSourcesLoading(true);
    const conditionParams = new URLSearchParams({ assetId });
    if (componentId) conditionParams.set('componentId', componentId);
    void Promise.all([
      api.get<PmScheduleMeterOption[]>(`/api/pm-schedules/meter-sources?assetId=${encodeURIComponent(assetId)}`),
      api.get<PmScheduleConditionSourceOption[]>(`/api/pm-schedules/condition-sources?${conditionParams.toString()}`),
    ]).then(([meters, conditions]) => {
      if (cancelled) return;
      setMeterOptions(meters.success && Array.isArray(meters.data) ? meters.data : []);
      setConditionOptions(conditions.success && Array.isArray(conditions.data) ? conditions.data : []);
    }).catch(() => {
      if (!cancelled) {
        setMeterOptions([]);
        setConditionOptions([]);
      }
    }).finally(() => {
      if (!cancelled) setSourcesLoading(false);
    });

    return () => { cancelled = true; };
  }, [assetId, componentId]);

  const addTasks = (masters: PmScheduleTaskMaster[]) => {
    const existing = new Set(tasks.map((task) => task.pmTaskId));
    const added = masters.filter((master) => !existing.has(master.id)).map(pmScheduleTaskDraftFromMaster);
    if (added.length) onChange([...tasks, ...added]);
  };

  const patch = (index: number, values: Partial<PmScheduleTaskDraft>) => {
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

  return (
    <div data-testid="pm-schedule-task-planner" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Tasks & Planning</p>
          <p className="text-[11px] text-muted-foreground">Select Task Library records, then give each task its own TBM, UBM or CBM plan.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)} disabled={disabled} className="w-full sm:w-auto">
          <Plus className="mr-1.5 h-4 w-4" /> Add Task from Library
        </Button>
      </div>

      {!assetId && (
        <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Select an asset first so meter and condition sources can be validated.</div>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <LibraryBig className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No scheduled tasks yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Every active task-level PM schedule needs at least one Task Library record.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sourcesLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Refreshing meter and condition sources…</div>}
          {tasks.map((task, index) => (
            <PmScheduleTaskCard
              key={task.clientId}
              task={task}
              index={index}
              total={tasks.length}
              meterOptions={meterOptions}
              conditionOptions={conditionOptions}
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
        excludedTaskIds={tasks.map((task) => task.pmTaskId)}
        onConfirm={addTasks}
      />
    </div>
  );
}
