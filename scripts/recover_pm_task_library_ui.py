from pathlib import Path
import textwrap

ROOT = Path(__file__).resolve().parents[1]

def write(rel: str, content: str) -> None:
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content).lstrip(), encoding='utf-8')

def replace_once(rel: str, old: str, new: str) -> None:
    path = ROOT / rel
    text = path.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'missing UI patch target in {rel}: {old[:80]!r}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')

# Navigation/route registration. Existing PM licensing boundary remains pm_schedules.
replace_once('src/types/index.ts', "  | 'pm-schedules'\n  | 'pm-templates'", "  | 'pm-schedules'\n  | 'pm-tasks'\n  | 'pm-templates'")
replace_once('src/lib/page-access.ts', "  'pm-schedules': ['pm_schedules.view'],\n  'pm-templates': ['pm_templates.view'],", "  'pm-schedules': ['pm_schedules.view'],\n  'pm-tasks': ['pm_tasks.view'],\n  'pm-templates': ['pm_templates.view'],")
replace_once('src/lib/page-access.ts', "  'pm-schedules': ['pm_schedules', 'assets'],\n  'pm-templates': ['pm_schedules', 'assets'],", "  'pm-schedules': ['pm_schedules', 'assets'],\n  'pm-tasks': ['pm_schedules', 'assets'],\n  'pm-templates': ['pm_schedules', 'assets'],")
replace_once('src/components/EAMApp.tsx', "  'pm-schedules': 'PM Schedules',\n  'pm-templates': 'PM Templates',", "  'pm-schedules': 'PM Schedules',\n  'pm-tasks': 'PM Task Library',\n  'pm-templates': 'PM Templates',")
replace_once('src/components/EAMApp.tsx', "  'pm-schedules': () => import('./modules/MaintenancePages').then(m => m.PmSchedulesPage),\n  'pm-templates': () => import('./modules/MaintenancePages').then(m => m.PmTemplatesPage),", "  'pm-schedules': () => import('./modules/MaintenancePages').then(m => m.PmSchedulesPage),\n  'pm-tasks': () => import('./modules/pm/PmTaskLibraryPage').then(m => m.PmTaskLibraryPage),\n  'pm-templates': () => import('./modules/MaintenancePages').then(m => m.PmTemplatesPage),")
replace_once('src/components/shared/Sidebar.tsx', "        { page: 'pm-schedules', label: 'PM Schedules', icon: Clock, moduleCode: 'pm_schedules' },\n        { page: 'pm-templates', label: 'PM Templates', icon: ClipboardCheck, moduleCode: 'pm_schedules' },", "        { page: 'pm-schedules', label: 'PM Schedules', icon: Clock, moduleCode: 'pm_schedules' },\n        { page: 'pm-tasks', label: 'Task Library', icon: ListChecks, moduleCode: 'pm_schedules' },\n        { page: 'pm-templates', label: 'PM Templates', icon: ClipboardCheck, moduleCode: 'pm_schedules' },")
replace_once('src/components/shared/MobileBottomNav.tsx', "activePages: ['pm-schedules', 'pm-templates', 'pm-triggers', 'pm-calendar']", "activePages: ['pm-schedules', 'pm-tasks', 'pm-templates', 'pm-triggers', 'pm-calendar']")
replace_once('src/components/CommandPalette.tsx', "    { id: 'pm-schedules', label: 'PM Schedules', icon: Clock, group: 'navigation', page: 'pm-schedules', keywords: ['preventive', 'schedule', 'planned'] },", "    { id: 'pm-schedules', label: 'PM Schedules', icon: Clock, group: 'navigation', page: 'pm-schedules', keywords: ['preventive', 'schedule', 'planned'] },\n    { id: 'pm-tasks', label: 'PM Task Library', icon: ListChecks, group: 'navigation', page: 'pm-tasks', keywords: ['preventive', 'task', 'library', 'mechanical', 'electrical', 'lubrication'] },")

write('src/components/modules/pm/PmTaskFormDialog.tsx', r'''
'use client';
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { PM_TASK_TYPES, PM_TASK_TYPE_LABELS, type PmTaskType } from '@/lib/pm-task';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export interface PmTaskFormRecord { id: string; taskNumber: number; description: string; taskType: PmTaskType; }
interface Props { open: boolean; onOpenChange: (open: boolean) => void; task?: PmTaskFormRecord | null; onSaved: () => void | Promise<void>; }
export function PmTaskFormDialog({ open, onOpenChange, task, onSaved }: Props) {
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<PmTaskType>('mechanical');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setDescription(task?.description ?? ''); setTaskType(task?.taskType ?? 'mechanical'); } }, [open, task]);
  const save = async () => {
    if (!description.trim()) { toast.error('Task Description is required'); return; }
    setSaving(true);
    try {
      const response = await apiFetch(task ? `/api/pm-tasks/${task.id}` : '/api/pm-tasks', {
        method: task ? 'PATCH' : 'POST', body: JSON.stringify({ description: description.trim(), taskType }),
      });
      if (!response.success) { toast.error(response.error || 'Failed to save PM task'); return; }
      toast.success(task ? 'PM task updated' : 'PM task created'); onOpenChange(false); await onSaved();
    } finally { setSaving(false); }
  };
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={task ? `Edit PM Task #${task.taskNumber}` : 'Add PM Task'} description="Task Number is generated by iAssetsPro and remains stable when templates or schedules are reordered." footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button onClick={() => void save()} disabled={saving || !description.trim()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{task ? 'Save Changes' : 'Create Task'}</Button></div>}>
    <div className="grid gap-5 py-2">
      <div className="grid gap-2"><Label htmlFor="pm-task-number">Task Number</Label><Input id="pm-task-number" value={task ? String(task.taskNumber) : 'Auto-generated on save'} readOnly className="bg-muted/50 font-mono" /></div>
      <div className="grid gap-2"><Label htmlFor="pm-task-description">Task Description</Label><Textarea id="pm-task-description" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Lubricate drive-end bearing" /></div>
      <div className="grid gap-2"><Label>Task Type</Label><Select value={taskType} onValueChange={(value) => setTaskType(value as PmTaskType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PM_TASK_TYPES.map((type) => <SelectItem key={type} value={type}>{PM_TASK_TYPE_LABELS[type]}</SelectItem>)}</SelectContent></Select></div>
    </div>
  </ResponsiveDialog>;
}
''')

write('src/components/modules/pm/PmTaskBulkDialog.tsx', r'''
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
''')

write('src/components/modules/pm/PmTaskImportDialog.tsx', r'''
'use client';
import React, { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, TriangleAlert, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, getAuthHeaders } from '@/lib/api';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Button } from '@/components/ui/button'; import { Badge } from '@/components/ui/badge'; import { Input } from '@/components/ui/input';
interface PreviewRow { sourceRow: number; description: string; taskType: string; errors: string[]; warnings: string[]; }
interface PmTaskImportPreview { filename: string; totalRows: number; validRows: number; invalidRows: number; warningCount: number; structuralErrors: string[]; rows: PreviewRow[]; }
interface Props { open: boolean; onOpenChange: (open: boolean) => void; onSaved: (count: number) => void | Promise<void>; }
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
export function PmTaskImportDialog({ open, onOpenChange, onSaved }: Props) {
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<PmTaskImportPreview | null>(null); const [previewing, setPreviewing] = useState(false); const [confirming, setConfirming] = useState(false); const [downloading, setDownloading] = useState(false);
  const canConfirm = Boolean(preview && preview.totalRows > 0 && preview.invalidRows === 0 && preview.structuralErrors.length === 0 && !confirming);
  const handleOpenChange = (next: boolean) => { if (!next) { setFile(null); setPreview(null); } onOpenChange(next); };
  const selectFile = (event: ChangeEvent<HTMLInputElement>) => { setFile(event.target.files?.[0] ?? null); setPreview(null); };
  const downloadTemplate = async () => { setDownloading(true); try { const response = await fetch('/api/pm-tasks/import-template', { headers: getAuthHeaders() }); if (!response.ok) { toast.error('Failed to download PM task template'); return; } const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href=url; a.download='pm-task-import-template.xlsx'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); } finally { setDownloading(false); } };
  const previewFile = async () => {
    if (!file) { toast.error('Choose an Excel workbook first'); return; } setPreviewing(true);
    try { const formData = new FormData(); formData.append('file', file); const response = await apiFetch<PmTaskImportPreview>('/api/pm-tasks/import-preview', { method: 'POST', body: formData }); if (response.data) setPreview(response.data); if (!response.success) { toast.error(response.error || 'Workbook validation failed'); return; } toast.success('Workbook preview is ready'); } finally { setPreviewing(false); }
  };
  const confirmImport = async () => {
    if (!preview || !canConfirm) return; setConfirming(true);
    try { const response = await apiFetch('/api/pm-tasks/import-confirm', { method: 'POST', body: JSON.stringify({ filename: preview.filename, rows: preview.rows.map((row) => ({ sourceRow: row.sourceRow, description: row.description, taskType: row.taskType })) }) }); if (!response.success) { if (response.data) setPreview(response.data as PmTaskImportPreview); toast.error(response.error || 'PM task import failed'); return; } const count = typeof response.count === 'number' ? response.count : preview.validRows; toast.success(`${count} PM task${count === 1 ? '' : 's'} imported`); handleOpenChange(false); await onSaved(count); } finally { setConfirming(false); }
  };
  const tone = useMemo(() => !preview ? null : preview.structuralErrors.length || preview.invalidRows ? 'error' : preview.warningCount ? 'warning' : 'success', [preview]);
  return <ResponsiveDialog open={open} onOpenChange={handleOpenChange} title="Import PM Tasks from Excel" description="Preview the workbook before confirmation. Validation errors block the batch; duplicate warnings remain visible but never auto-merge tasks." size="extra-wide" footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => handleOpenChange(false)} disabled={previewing || confirming}>Cancel</Button><Button onClick={() => void confirmImport()} disabled={!canConfirm}>{confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm Import</Button></div>}>
    <div className="space-y-5 py-2"><div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">1. Prepare the workbook</p><p className="text-xs text-muted-foreground">Use the current iAssetsPro template.</p></div><Button variant="outline" onClick={() => void downloadTemplate()} disabled={downloading}><Download className="mr-2 h-4 w-4" /> Download Template</Button></div><div className="space-y-2"><p className="font-medium">2. Choose workbook</p><Input type="file" accept=".xlsx,.xls" onChange={selectFile} />{file && <div className="flex items-center gap-2 rounded-lg border p-2 text-sm"><FileSpreadsheet className="h-4 w-4" /><span className="flex-1 truncate">{file.name}</span><span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span></div>}<Button onClick={() => void previewFile()} disabled={!file || previewing}>{previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Preview Excel</Button></div>
    {preview && <div className="space-y-4"><div className="flex items-center gap-2">{tone==='error' ? <AlertCircle className="h-5 w-5 text-destructive" /> : tone==='warning' ? <TriangleAlert className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}<p className="font-medium">3. Review validation preview</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Total',preview.totalRows],['Valid',preview.validRows],['Invalid',preview.invalidRows],['Warnings',preview.warningCount]].map(([label,value]) => <div key={String(label)} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>)}</div>{preview.structuralErrors.map((error) => <p key={error} className="text-sm text-destructive">{error}</p>)}<div className="max-h-[22rem] overflow-auto rounded-xl border"><div className="min-w-[44rem] divide-y">{preview.rows.map((row) => <div key={row.sourceRow} className="grid grid-cols-[4rem_minmax(0,1fr)_9rem_16rem] gap-3 p-3 text-sm"><span className="font-mono">{row.sourceRow}</span><span>{row.description || '—'}</span><span className="capitalize">{row.taskType || '—'}</span><div>{row.errors.map((error) => <p key={error} className="text-xs text-destructive">{error}</p>)}{row.warnings.map((warning) => <p key={warning} className="text-xs text-amber-700 dark:text-amber-400">{warning}</p>)}{!row.errors.length && !row.warnings.length && <Badge variant="outline">Valid</Badge>}</div></div>)}</div></div>{preview.invalidRows > 0 && <p className="text-sm text-destructive">Fix invalid workbook rows and preview again.</p>}{preview.invalidRows === 0 && preview.warningCount > 0 && <p className="text-sm text-amber-700 dark:text-amber-400">Warnings do not block import; similar tasks are never auto-merged.</p>}</div>}</div>
  </ResponsiveDialog>;
}
''')

write('src/components/modules/pm/PmTaskLibraryPage.tsx', r'''
'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, ListPlus, MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, getAuthHeaders } from '@/lib/api';
import { PM_TASK_TYPES, PM_TASK_TYPE_LABELS, type PmTaskType } from '@/lib/pm-task';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button'; import { Card, CardContent } from '@/components/ui/card'; import { Input } from '@/components/ui/input'; import { Badge } from '@/components/ui/badge'; import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'; import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PmTaskFormDialog, type PmTaskFormRecord } from './PmTaskFormDialog'; import { PmTaskBulkDialog } from './PmTaskBulkDialog'; import { PmTaskImportDialog } from './PmTaskImportDialog';
export interface PmTaskRecord extends PmTaskFormRecord { plantId: string; isActive: boolean; createdAt: string; updatedAt: string; plant?: { id: string; name: string; code: string } | null; createdBy?: { id: string; fullName: string; username: string } | null; }
type ActiveFilter = 'active' | 'inactive' | 'all';
export function PmTaskLibraryPage() {
  const { hasPermission, isAdmin } = useAuthStore(); const admin=isAdmin();
  const canCreate=admin||hasPermission('pm_tasks.create'); const canUpdate=admin||hasPermission('pm_tasks.update'); const canDelete=admin||hasPermission('pm_tasks.delete'); const canImport=admin||hasPermission('pm_tasks.import');
  const [tasks,setTasks]=useState<PmTaskRecord[]>([]); const [loading,setLoading]=useState(true); const [searchText,setSearchText]=useState(''); const [typeFilter,setTypeFilter]=useState<'all'|PmTaskType>('all'); const [activeFilter,setActiveFilter]=useState<ActiveFilter>('active');
  const [formOpen,setFormOpen]=useState(false); const [bulkOpen,setBulkOpen]=useState(false); const [importOpen,setImportOpen]=useState(false); const [editTask,setEditTask]=useState<PmTaskRecord|null>(null); const [deactivateTask,setDeactivateTask]=useState<PmTaskRecord|null>(null); const [mutating,setMutating]=useState(false); const [downloading,setDownloading]=useState(false);
  const fetchTasks=useCallback(async()=>{ setLoading(true); try { const params=new URLSearchParams(); if(searchText.trim()) params.set('search',searchText.trim()); if(typeFilter!=='all') params.set('type',typeFilter); if(activeFilter!=='all') params.set('active',String(activeFilter==='active')); const response=await apiFetch<PmTaskRecord[]>('/api/pm-tasks?'+params.toString()); if(response.success&&response.data) setTasks(response.data); else toast.error(response.error||'Failed to load PM tasks'); } finally { setLoading(false); } },[activeFilter,searchText,typeFilter]);
  useEffect(()=>{const timer=window.setTimeout(()=>void fetchTasks(),200); return()=>window.clearTimeout(timer);},[fetchTasks]);
  const showPlant=useMemo(()=>new Set(tasks.map((task)=>task.plantId)).size>1,[tasks]); const activeCount=tasks.filter((task)=>task.isActive).length;
  const handleDeactivate=async()=>{ if(!deactivateTask)return; setMutating(true); try { const response=await apiFetch(`/api/pm-tasks/${deactivateTask.id}`,{method:'DELETE'}); if(!response.success){toast.error(response.error||'Failed to deactivate PM task');return;} toast.success(`Task #${deactivateTask.taskNumber} deactivated`); setDeactivateTask(null); await fetchTasks(); } finally { setMutating(false); } };
  const handleReactivate=async(task:PmTaskRecord)=>{setMutating(true);try{const response=await apiFetch(`/api/pm-tasks/${task.id}`,{method:'PATCH',body:JSON.stringify({isActive:true})});if(!response.success){toast.error(response.error||'Failed to reactivate PM task');return;}toast.success(`Task #${task.taskNumber} reactivated`);await fetchTasks();}finally{setMutating(false);}};
  const downloadTemplate=async()=>{setDownloading(true);try{const response=await fetch('/api/pm-tasks/import-template',{headers:getAuthHeaders()});if(!response.ok){toast.error('Failed to download Excel template');return;}const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download='pm-task-import-template.xlsx';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}finally{setDownloading(false);}};
  const actions=(task:PmTaskRecord)=><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{canUpdate&&<DropdownMenuItem onClick={()=>{setEditTask(task);setFormOpen(true);}}><Pencil className="mr-2 h-4 w-4" />Edit Task</DropdownMenuItem>}{canUpdate&&!task.isActive&&<DropdownMenuItem onClick={()=>void handleReactivate(task)} disabled={mutating}><RotateCcw className="mr-2 h-4 w-4" />Reactivate</DropdownMenuItem>}{canDelete&&task.isActive&&<><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive" onClick={()=>setDeactivateTask(task)}>Deactivate Task</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>;
  return <div className="page-content space-y-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Preventive Maintenance</p><h1 className="text-2xl font-bold tracking-tight">PM Task Library</h1><p className="mt-1 text-sm text-muted-foreground">Create reusable tasks once, then select and reorder them in PM templates and schedules.</p></div><div className="flex flex-wrap gap-2">{canImport&&<Button variant="outline" size="sm" onClick={()=>void downloadTemplate()} disabled={downloading}><Download className="mr-1.5 h-4 w-4"/>Download Excel Template</Button>}{canImport&&<Button variant="outline" size="sm" onClick={()=>setImportOpen(true)}><Upload className="mr-1.5 h-4 w-4"/>Import Excel</Button>}{canCreate&&<Button variant="outline" size="sm" onClick={()=>setBulkOpen(true)}><ListPlus className="mr-1.5 h-4 w-4"/>Add Multiple Tasks</Button>}{canCreate&&<Button size="sm" onClick={()=>{setEditTask(null);setFormOpen(true);}}><Plus className="mr-1.5 h-4 w-4"/>Add Task</Button>}</div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Visible Tasks</p><p className="mt-1 text-2xl font-bold">{tasks.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active</p><p className="mt-1 text-2xl font-bold">{activeCount}</p></CardContent></Card><Card className="sm:col-span-2 lg:col-span-1"><CardContent className="flex items-center gap-3 p-4"><FileSpreadsheet className="h-5 w-5"/><div><p className="text-xs text-muted-foreground">Bulk creation</p><p className="text-sm font-semibold">Manual rows + Excel</p></div></CardContent></Card></div>
    <div className="flex flex-col gap-2 lg:flex-row"><div className="relative flex-1 lg:max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={searchText} onChange={(event)=>setSearchText(event.target.value)} placeholder="Search task number or description..."/></div><Select value={typeFilter} onValueChange={(value)=>setTypeFilter(value as 'all'|PmTaskType)}><SelectTrigger className="lg:w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All Task Types</SelectItem>{PM_TASK_TYPES.map((type)=><SelectItem key={type} value={type}>{PM_TASK_TYPE_LABELS[type]}</SelectItem>)}</SelectContent></Select><Select value={activeFilter} onValueChange={(value)=>setActiveFilter(value as ActiveFilter)}><SelectTrigger className="lg:w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="all">All Statuses</SelectItem></SelectContent></Select><Button variant="outline" size="icon" onClick={()=>void fetchTasks()}><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/></Button></div>
    <Card className="hidden md:block"><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Task Number</TableHead><TableHead>Task Description</TableHead><TableHead>Task Type</TableHead>{showPlant&&<TableHead>Plant</TableHead>}<TableHead>Status</TableHead><TableHead/></TableRow></TableHeader><TableBody>{loading&&Array.from({length:5}).map((_,i)=><TableRow key={i}><TableCell colSpan={showPlant?6:5}><Skeleton className="h-8 w-full"/></TableCell></TableRow>)}{!loading&&tasks.map((task)=><TableRow key={task.id}><TableCell className="font-mono font-semibold">#{task.taskNumber}</TableCell><TableCell>{task.description}</TableCell><TableCell><Badge variant="outline">{PM_TASK_TYPE_LABELS[task.taskType]}</Badge></TableCell>{showPlant&&<TableCell>{task.plant?.code||task.plant?.name||'—'}</TableCell>}<TableCell><Badge variant={task.isActive?'default':'secondary'}>{task.isActive?'Active':'Inactive'}</Badge></TableCell><TableCell>{actions(task)}</TableCell></TableRow>)}</TableBody></Table>{!loading&&!tasks.length&&<div className="py-14 text-center text-sm text-muted-foreground">No PM tasks match these filters.</div>}</CardContent></Card>
    <div className="space-y-3 md:hidden">{loading&&Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-32 w-full"/>)}{!loading&&tasks.map((task)=><Card key={task.id}><CardContent className="p-4"><div className="flex items-start gap-3"><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono font-bold">#{task.taskNumber}</span><Badge variant="outline">{PM_TASK_TYPE_LABELS[task.taskType]}</Badge><Badge variant={task.isActive?'default':'secondary'}>{task.isActive?'Active':'Inactive'}</Badge></div><p className="mt-2 text-sm font-medium">{task.description}</p>{showPlant&&<p className="mt-2 text-xs text-muted-foreground">Plant: {task.plant?.code||task.plant?.name||'—'}</p>}</div>{actions(task)}</div></CardContent></Card>)}</div>
    <PmTaskFormDialog open={formOpen} onOpenChange={(open)=>{setFormOpen(open);if(!open)setEditTask(null);}} task={editTask} onSaved={fetchTasks}/><PmTaskBulkDialog open={bulkOpen} onOpenChange={setBulkOpen} onSaved={async()=>{await fetchTasks();}}/><PmTaskImportDialog open={importOpen} onOpenChange={setImportOpen} onSaved={async()=>{await fetchTasks();}}/><ConfirmDialog open={Boolean(deactivateTask)} onOpenChange={(open)=>{if(!open)setDeactivateTask(null);}} title="Deactivate Task" description="Deactivate this PM task? Existing history remains intact and the task can be reactivated later." confirmLabel="Deactivate Task" variant="destructive" loading={mutating} onConfirm={()=>void handleDeactivate()}/>
  </div>;
}
''')

write('src/__tests__/pm/pm-task-library-ui-contract.test.ts', r'''
import { describe, expect, it } from 'vitest'; import fs from 'node:fs'; import path from 'node:path';
const read=(rel:string)=>{const f=path.join(process.cwd(),rel);return fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';};
const types=read('src/types/index.ts'), access=read('src/lib/page-access.ts'), app=read('src/components/EAMApp.tsx'), sidebar=read('src/components/shared/Sidebar.tsx'), mobile=read('src/components/shared/MobileBottomNav.tsx'), palette=read('src/components/CommandPalette.tsx'), page=read('src/components/modules/pm/PmTaskLibraryPage.tsx'), form=read('src/components/modules/pm/PmTaskFormDialog.tsx'), bulk=read('src/components/modules/pm/PmTaskBulkDialog.tsx'), importer=read('src/components/modules/pm/PmTaskImportDialog.tsx');
describe('PM Task Library UI',()=>{
 it('registers first-class PM navigation behind pm_tasks.view',()=>{expect(types).toContain("| 'pm-tasks'");expect(access).toContain("'pm-tasks': ['pm_tasks.view']");expect(app).toContain("'pm-tasks': 'PM Task Library'");expect(sidebar).toContain("page: 'pm-tasks'");expect(mobile).toContain("'pm-tasks'");expect(palette).toContain("id: 'pm-tasks'");});
 it('shows task identity and all creation paths',()=>{for(const label of ['Task Number','Task Description','Task Type','Status','Add Task','Add Multiple Tasks','Download Excel Template','Import Excel'])expect(page).toContain(label);expect(page).toContain("hasPermission('pm_tasks.create')");expect(page).toContain("hasPermission('pm_tasks.import')");});
 it('keeps Task Number immutable',()=>{expect(form).toContain('Task Number');expect(form).toContain('readOnly');expect(form).toContain('description: description.trim()');expect(form).not.toContain('taskNumber: Number');});
 it('supports transactional bulk paste',()=>{expect(bulk).toContain('Save All');expect(bulk).toContain('Add Row');expect(bulk).toContain('onPaste');expect(bulk).toContain("split('\\t')");expect(bulk).toContain("split(/\\r?\\n/)");expect(bulk).toContain("apiFetch('/api/pm-tasks/bulk'");expect(bulk).not.toContain('taskNumber:');});
 it('previews and confirms Excel explicitly',()=>{expect(importer).toContain('accept=".xlsx,.xls"');expect(importer).toContain('new FormData()');expect(importer).toContain("formData.append('file', file)");expect(importer).toContain("apiFetch<PmTaskImportPreview>('/api/pm-tasks/import-preview'");expect(importer).toContain("'/api/pm-tasks/import-confirm'");expect(importer).toContain("'/api/pm-tasks/import-template'");expect(importer).toContain('disabled={!canConfirm');});
 it('wires real dialogs and soft lifecycle actions',()=>{expect(page).toContain('PmTaskBulkDialog');expect(page).toContain('PmTaskImportDialog');expect(page).toContain('setBulkOpen(true)');expect(page).toContain('setImportOpen(true)');expect(page).toContain("method:'DELETE'");expect(page).toContain('isActive:true');});
});
''')

print('PM task library UI recovery staged')
