'use client';
import React, { useEffect, useMemo, useState } from 'react';
import type { ClipboardEvent } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { PM_TASK_TYPES, PM_TASK_TYPE_LABELS, type PmTaskType } from '@/lib/pm-task';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
interface BulkRow { clientId: string; description: string; taskType: string; errors: string[]; }
interface ServerRowError { row: number; messages: string[]; }
interface Props { open: boolean; onOpenChange: (open: boolean) => void; onSaved: (count: number) => void | Promise<void>; }
let rowSequence = 0;
const makeRow = (description = '', taskType = 'mechanical'): BulkRow => ({ clientId: `pm-bulk-${Date.now()}-${rowSequence += 1}`, description, taskType, errors: [] });
const normalizeType = (value: string) => value.trim().toLowerCase();
export function PmTaskBulkDialog({ open, onOpenChange, onSaved }: Props) {
  const [rows, setRows] = useState<BulkRow[]>([makeRow()]); const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setRows([makeRow()]); }, [open]);
  const nonBlankCount = useMemo(() => rows.filter((row) => row.description.trim() || row.taskType.trim()).length, [rows]);
  const updateRow = (id: string, patch: Partial<Pick<BulkRow, 'description' | 'taskType'>>) => setRows((current) => current.map((row) => row.clientId === id ? { ...row, ...patch, errors: [] } : row));
  const removeRow = (id: string) => setRows((current) => current.length === 1 ? [makeRow()] : current.filter((row) => row.clientId !== id));
  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text/plain'); if (!text.includes('\t') && !/\r?\n/.test(text)) return; event.preventDefault();
    const pasted = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => { const cells = line.split('\t'); return makeRow(cells[0]?.trim() ?? '', normalizeType(cells[1] ?? 'mechanical')); });
    if (pasted.length) setRows((current) => { const next = [...current]; next.splice(index, 1, ...pasted); return next; });
  };
  const saveAll = async () => {
    const payloadRows = rows.filter((row) => row.description.trim() || row.taskType.trim()); if (!payloadRows.length) { toast.error('Add at least one task before saving'); return; }
    const invalid = new Map<string, string[]>();
    for (const row of payloadRows) {
      const errors: string[] = []; if (!row.description.trim()) errors.push('Task Description is required');
      if (!PM_TASK_TYPES.includes(normalizeType(row.taskType) as PmTaskType)) errors.push(`Task Type must be one of ${Object.values(PM_TASK_TYPE_LABELS).join(', ')}`);
      if (errors.length) invalid.set(row.clientId, errors);
    }
    if (invalid.size) { setRows((current) => current.map((row) => ({ ...row, errors: invalid.get(row.clientId) ?? [] }))); toast.error('Correct the highlighted rows before saving'); return; }
    setSaving(true);
    try {
      const response = await apiFetch('/api/pm-tasks/bulk', { method: 'POST', body: JSON.stringify({ rows: payloadRows.map((row) => ({ description: row.description.trim(), taskType: normalizeType(row.taskType) })) }) });
      if (!response.success) {
        const rowErrors = Array.isArray(response.rowErrors) ? response.rowErrors as ServerRowError[] : [];
        if (rowErrors.length) { const server = new Map<string, string[]>(); for (const error of rowErrors) { const row = payloadRows[error.row - 1]; if (row) server.set(row.clientId, error.messages); } setRows((current) => current.map((row) => ({ ...row, errors: server.get(row.clientId) ?? row.errors }))); }
        toast.error(response.error || 'Failed to create PM tasks'); return;
      }
      const count = typeof response.count === 'number' ? response.count : payloadRows.length; toast.success(`${count} PM task${count === 1 ? '' : 's'} created`); onOpenChange(false); await onSaved(count);
    } finally { setSaving(false); }
  };
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Add Multiple PM Tasks" description="Enter multiple rows or paste two Excel columns: Task Description and Task Type. The entire batch is validated before Task Numbers are allocated." size="extra-wide" footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button variant="outline" onClick={() => setRows((current) => [...current, makeRow()])} disabled={saving}><Plus className="mr-2 h-4 w-4" /> Add Row</Button><div className="flex flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button onClick={() => void saveAll()} disabled={saving || nonBlankCount === 0}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save All</Button></div></div>}>
    <div className="space-y-3 py-2">{rows.map((row, index) => <div key={row.clientId} className="rounded-xl border bg-card p-3"><div className="grid gap-2 md:grid-cols-[3rem_minmax(0,1fr)_13rem_3rem] md:items-start"><div className="flex h-10 items-center font-mono text-xs text-muted-foreground">{index + 1}</div><Input value={row.description} onChange={(event) => updateRow(row.clientId, { description: event.target.value })} onPaste={(event) => handlePaste(index, event)} placeholder="Task Description" /><Select value={row.taskType} onValueChange={(value) => updateRow(row.clientId, { taskType: value })}><SelectTrigger><SelectValue placeholder="Task Type" /></SelectTrigger><SelectContent>{PM_TASK_TYPES.map((type) => <SelectItem key={type} value={type}>{PM_TASK_TYPE_LABELS[type]}</SelectItem>)}</SelectContent></Select><Button variant="ghost" size="icon" aria-label="Remove row" onClick={() => removeRow(row.clientId)}><Trash2 className="h-4 w-4" /></Button></div>{row.errors.map((error) => <p key={error} className="mt-1 text-xs text-destructive md:pl-12">{error}</p>)}</div>)}</div>
  </ResponsiveDialog>;
}
