'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { PM_TASK_TYPES, PM_TASK_TYPE_LABELS, type PmTaskType } from '@/lib/pm-task';
import type { PmScheduleTaskMaster } from '@/lib/pm-schedule-task';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludedTaskIds?: string[];
  onConfirm: (tasks: PmScheduleTaskMaster[]) => void;
}

export function PmScheduleTaskPickerDialog({ open, onOpenChange, excludedTaskIds = [], onConfirm }: Props) {
  const [tasks, setTasks] = useState<PmScheduleTaskMaster[]>([]);
  const [search, setSearch] = useState('');
  const [taskType, setTaskType] = useState<'all' | PmTaskType>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const excluded = useMemo(() => new Set(excludedTaskIds), [excludedTaskIds]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ active: 'true' });
      if (search.trim()) params.set('search', search.trim());
      if (taskType !== 'all') params.set('type', taskType);
      setLoading(true);
      void api.get<PmScheduleTaskMaster[]>(`/api/pm-tasks?${params.toString()}`)
        .then((response) => setTasks(response.success && Array.isArray(response.data) ? response.data : []))
        .catch(() => setTasks([]))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [open, search, taskType]);

  useEffect(() => {
    if (!open) setSelected([]);
  }, [open]);

  const toggle = (id: string) => {
    if (excluded.has(id)) return;
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  const confirm = () => {
    const chosen = tasks.filter((task) => selected.includes(task.id) && !excluded.has(task.id));
    if (!chosen.length) return;
    onConfirm(chosen);
    setSelected([]);
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Task from Library"
      description="Choose permanent Task Master records. Task # and definition stay read-only; this schedule only owns planning configuration."
      size="extra-wide"
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={selected.length === 0}>Add {selected.length || ''} Selected</Button>
        </div>
      )}
    >
      <div className="space-y-4 py-2">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Task # or description" className="pl-9" />
          </div>
          <Select value={taskType} onValueChange={(value) => setTaskType(value as 'all' | PmTaskType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Disciplines</SelectItem>
              {PM_TASK_TYPES.map((type) => <SelectItem key={type} value={type}>{PM_TASK_TYPE_LABELS[type]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex min-h-36 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No active Task Library records match this search.</div>
          ) : tasks.map((task) => {
            const disabled = excluded.has(task.id);
            const checked = disabled || selected.includes(task.id);
            return (
              <div key={task.id} className={`flex items-start gap-3 rounded-xl border p-3 ${disabled ? 'opacity-55' : 'hover:bg-muted/40'}`}>
                <Checkbox checked={checked} disabled={disabled} onCheckedChange={() => toggle(task.id)} aria-label={`Select Task #${task.taskNumber}`} className="mt-0.5" />
                <button type="button" disabled={disabled} onClick={() => toggle(task.id)} className="min-w-0 flex-1 text-left disabled:cursor-not-allowed">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold">Task #{task.taskNumber}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{PM_TASK_TYPE_LABELS[task.taskType]}</span>
                    {disabled && <span className="text-[10px] text-muted-foreground">Already scheduled</span>}
                  </div>
                  <p className="mt-1 break-words text-sm font-medium">{task.description}</p>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
