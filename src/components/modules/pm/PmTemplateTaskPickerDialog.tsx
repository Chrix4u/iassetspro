'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { PM_TASK_TYPES, PM_TASK_TYPE_LABELS, type PmTaskType } from '@/lib/pm-task';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface PmTaskPickerRecord {
  id: string;
  taskNumber: number;
  description: string;
  taskType: PmTaskType;
  isActive: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludedTaskIds?: string[];
  onConfirm: (taskIds: string[]) => void | Promise<void>;
}

export function PmTemplateTaskPickerDialog({ open, onOpenChange, excludedTaskIds = [], onConfirm }: Props) {
  const [tasks, setTasks] = useState<PmTaskPickerRecord[]>([]);
  const [search, setSearch] = useState('');
  const [taskType, setTaskType] = useState<'all' | PmTaskType>('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const excluded = useMemo(() => new Set(excludedTaskIds), [excludedTaskIds]);

  useEffect(() => {
    if (!open) return;
    setSelectedTaskIds([]);
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('active', 'true');
      if (search.trim()) params.set('search', search.trim());
      if (taskType !== 'all') params.set('type', taskType);
      void api.get<PmTaskPickerRecord[]>(`/api/pm-tasks?${params.toString()}`)
        .then((response) => setTasks(response.success && Array.isArray(response.data) ? response.data : []))
        .catch(() => setTasks([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open, search, taskType]);

  const toggle = (id: string) => {
    setSelectedTaskIds((current) => current.includes(id) ? current.filter((taskId) => taskId !== id) : [...current, id]);
  };

  const confirm = async () => {
    if (!selectedTaskIds.length) return;
    setSubmitting(true);
    try {
      await onConfirm(selectedTaskIds);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return <ResponsiveDialog
    open={open}
    onOpenChange={onOpenChange}
    title="Select Existing Tasks"
    description="Choose active Task Library records from the currently selected plant. Task Numbers stay permanent; template order is managed separately."
    size="extra-wide"
    footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
      <Button onClick={() => void confirm()} disabled={submitting || selectedTaskIds.length === 0}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Add {selectedTaskIds.length || ''} Selected Task{selectedTaskIds.length === 1 ? '' : 's'}
      </Button>
    </div>}
  >
    <div className="space-y-4 py-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by Task Number or description" className="pl-9" />
        </div>
        <Select value={taskType} onValueChange={(value) => setTaskType(value as 'all' | PmTaskType)}>
          <SelectTrigger><SelectValue placeholder="Task Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Task Types</SelectItem>
            {PM_TASK_TYPES.map((type) => <SelectItem key={type} value={type}>{PM_TASK_TYPE_LABELS[type]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {loading ? <div className="flex min-h-36 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No active Task Library records match this search.</div>
        ) : tasks.map((task) => {
          const alreadyLinked = excluded.has(task.id);
          const checked = selectedTaskIds.includes(task.id);
          return <div
            key={task.id}
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${alreadyLinked ? 'opacity-55' : 'hover:bg-muted/40'}`}
          >
            <Checkbox
              checked={checked || alreadyLinked}
              disabled={alreadyLinked}
              onCheckedChange={() => !alreadyLinked && toggle(task.id)}
              aria-label={`Select Task #${task.taskNumber}`}
              className="mt-0.5"
            />
            <button
              type="button"
              disabled={alreadyLinked}
              onClick={() => !alreadyLinked && toggle(task.id)}
              className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold">Task #{task.taskNumber}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{PM_TASK_TYPE_LABELS[task.taskType]}</span>
                {alreadyLinked && <span className="text-[10px] font-medium text-muted-foreground">Already in template</span>}
              </div>
              <p className="mt-1 text-sm font-medium break-words">{task.description}</p>
            </button>
          </div>;
        })}
      </div>
    </div>
  </ResponsiveDialog>;
}
