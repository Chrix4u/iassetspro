'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  Activity, CheckCircle2, Clock3, ExternalLink, Gauge, Package, Plus,
  TimerReset, Wrench, XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useNavigationStore } from '@/stores/navigationStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

export interface TechnicianWorkspaceCapabilities {
  assignmentResponseStatus?: 'pending' | 'accepted' | 'declined';
  canRequestTools?: boolean;
  canRequestMaterials?: boolean;
  canLogDowntime?: boolean;
  canLogOwnTime?: boolean;
  canLogTeamTime?: boolean;
  isTeamLeader?: boolean;
}

interface Props {
  workOrderId: string;
  workOrder: any;
  capabilities: TechnicianWorkspaceCapabilities | null;
  onChanged: () => Promise<void>;
}

const ACTIVE_STATUSES = new Set(['in_progress', 'waiting_parts', 'waiting_tools', 'waiting_shutdown', 'waiting_permit', 'on_hold', 'pending_handover']);

function pretty(value?: string | null) {
  if (!value) return '-';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(value?: string | Date | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '-';
}

function toLocalInput(date = new Date()) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function minutesLabel(value?: number | null) {
  const minutes = Math.max(0, Number(value || 0));
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(2)} h`;
}

export function TechnicianWorkOrderV11Panels({ workOrderId, workOrder, capabilities, onChanged }: Props) {
  const navigate = useNavigationStore((s) => s.navigate);
  const [busy, setBusy] = useState<string | null>(null);
  const [downtime, setDowntime] = useState<any[]>([]);
  const [downtimeSummary, setDowntimeSummary] = useState<any>({ totalRecords: 0, ongoing: 0, totalMinutes: 0 });
  const [labor, setLabor] = useState<any[]>([]);
  const [laborSummary, setLaborSummary] = useState<any>({ totalEntries: 0, totalHours: 0, personalHours: 0, teamHours: 0 });
  const [personalTools, setPersonalTools] = useState<any[]>([]);
  const [stickyHeaderTarget, setStickyHeaderTarget] = useState<HTMLElement | null>(null);

  const [material, setMaterial] = useState({ itemName: '', quantity: '1', unit: 'each', urgency: 'normal', reason: '' });
  const [toolRequest, setToolRequest] = useState({ toolName: '', quantity: '1', urgency: 'normal', reason: '' });
  const [personalTool, setPersonalTool] = useState({ toolName: '', toolCode: '', condition: 'good', notes: '' });
  const [downtimeForm, setDowntimeForm] = useState({
    reason: '', category: 'unplanned', impactLevel: 'medium', downtimeStart: toLocalInput(), downtimeEnd: '', productionLoss: '', notes: '',
  });

  const loadPanels = useCallback(async () => {
    const teamLogs = capabilities?.isTeamLeader ? '?includeTeamLogs=true' : '';
    const [downRes, timeRes, personalToolsRes] = await Promise.all([
      api.get<any[]>(`/api/work-orders/${workOrderId}/downtime`),
      api.get<any>(`/api/work-orders/${workOrderId}/time-logs${teamLogs}`),
      api.get<any[]>(`/api/work-orders/${workOrderId}/personal-tools`),
    ]);
    if (downRes.success && Array.isArray(downRes.data)) {
      setDowntime(downRes.data);
      setDowntimeSummary((downRes as any).summary || { totalRecords: downRes.data.length, ongoing: 0, totalMinutes: 0 });
    }
    if (timeRes.success && timeRes.data) {
      setLabor(Array.isArray(timeRes.data.timeLogs) ? timeRes.data.timeLogs : []);
      setLaborSummary(timeRes.data.summary || { totalEntries: 0, totalHours: 0, personalHours: 0, teamHours: 0 });
    }
    if (personalToolsRes.success && Array.isArray(personalToolsRes.data)) setPersonalTools(personalToolsRes.data);
  }, [capabilities?.isTeamLeader, workOrderId]);

  useEffect(() => { void loadPanels(); }, [loadPanels]);

  useEffect(() => {
    const target = document.querySelector('div.sticky.top-0.z-20');
    if (target instanceof HTMLElement) setStickyHeaderTarget(target);
    return () => setStickyHeaderTarget(null);
  }, []);

  const run = async (key: string, action: () => Promise<any>, success: string, refreshParent = true) => {
    setBusy(key);
    try {
      const res = await action();
      if (!res.success) {
        toast.error(res.error || 'Action failed');
        return false;
      }
      toast.success(success);
      await loadPanels();
      if (refreshParent) await onChanged();
      return true;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const requestMaterial = async () => {
    if (material.itemName.trim().length < 2 || material.reason.trim().length < 3) {
      toast.error('Enter the material name and reason'); return;
    }
    const quantity = Number(material.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) { toast.error('Quantity must be greater than zero'); return; }
    const ok = await run('material', () => api.post(`/api/work-orders/${workOrderId}/materials`, {
      itemName: material.itemName.trim(), quantity, unit: material.unit.trim() || 'each', urgency: material.urgency,
      reason: material.reason.trim(),
    }), 'Material request submitted');
    if (ok) setMaterial({ itemName: '', quantity: '1', unit: 'each', urgency: 'normal', reason: '' });
  };

  const requestTool = async () => {
    if (toolRequest.toolName.trim().length < 2 || toolRequest.reason.trim().length < 3) {
      toast.error('Enter the tool name and reason'); return;
    }
    const quantity = Math.max(1, Math.floor(Number(toolRequest.quantity) || 1));
    const ok = await run('tool-request', () => api.post('/api/repairs/tool-requests', {
      workOrderId,
      items: [{ toolName: toolRequest.toolName.trim(), quantityRequested: quantity }],
      reason: toolRequest.reason.trim(), urgency: toolRequest.urgency,
    }), 'Tool request submitted');
    if (ok) setToolRequest({ toolName: '', quantity: '1', urgency: 'normal', reason: '' });
  };

  const addPersonalTool = async () => {
    if (personalTool.toolName.trim().length < 2) { toast.error('Enter the personal tool name'); return; }
    const ok = await run('personal-tool', () => api.post(`/api/work-orders/${workOrderId}/personal-tools`, {
      toolName: personalTool.toolName.trim(),
      toolCode: personalTool.toolCode.trim() || undefined,
      condition: personalTool.condition,
      notes: personalTool.notes.trim() || undefined,
    }), 'Personal tool recorded', false);
    if (ok) setPersonalTool({ toolName: '', toolCode: '', condition: 'good', notes: '' });
  };

  const recordDowntime = async () => {
    if (downtimeForm.reason.trim().length < 3) { toast.error('Downtime reason is required'); return; }
    const start = new Date(downtimeForm.downtimeStart);
    const end = downtimeForm.downtimeEnd ? new Date(downtimeForm.downtimeEnd) : null;
    if (!Number.isFinite(start.getTime())) { toast.error('Enter a valid downtime start'); return; }
    if (end && !Number.isFinite(end.getTime())) { toast.error('Enter a valid downtime end'); return; }
    if (end && end < start) { toast.error('Downtime end cannot be before start'); return; }
    const productionLoss = downtimeForm.productionLoss === '' ? undefined : Number(downtimeForm.productionLoss);
    if (productionLoss !== undefined && (!Number.isFinite(productionLoss) || productionLoss < 0)) { toast.error('Production loss must be a non-negative number'); return; }
    const ok = await run('downtime', () => api.post(`/api/work-orders/${workOrderId}/downtime`, {
      reason: downtimeForm.reason.trim(),
      category: downtimeForm.category,
      impactLevel: downtimeForm.impactLevel,
      downtimeStart: start.toISOString(),
      downtimeEnd: end?.toISOString(),
      productionLoss,
      notes: downtimeForm.notes.trim() || undefined,
    }), end ? 'Downtime recorded' : 'Ongoing downtime started', false);
    if (ok) setDowntimeForm({ reason: '', category: 'unplanned', impactLevel: 'medium', downtimeStart: toLocalInput(), downtimeEnd: '', productionLoss: '', notes: '' });
  };

  const endDowntime = (recordId: string) => run('end-downtime', () => api.patch(`/api/work-orders/${workOrderId}/downtime`, {
    recordId, downtimeEnd: new Date().toISOString(),
  }), 'Downtime ended', false);

  const stageIndex = useMemo(() => {
    const assignment = capabilities?.assignmentResponseStatus || workOrder.assignmentResponseStatus || 'pending';
    if (workOrder.status === 'closed' || workOrder.status === 'verified' || workOrder.status === 'completed') return 5;
    if (assignment !== 'accepted') return 0;
    if (workOrder.status === 'assigned') return 1;
    if (ACTIVE_STATUSES.has(workOrder.status)) return 2;
    return 1;
  }, [capabilities?.assignmentResponseStatus, workOrder.assignmentResponseStatus, workOrder.status]);

  const stages = [
    { label: 'Assignment', anchor: 'assignment' },
    { label: 'Preparation', anchor: 'preparation' },
    { label: 'Execution', anchor: 'execution' },
    { label: 'Resources', anchor: 'resources' },
    { label: 'Evidence', anchor: 'evidence' },
    { label: 'Completion', anchor: 'completion' },
  ];

  const materialRequests = Array.isArray(workOrder.repairMaterialRequests) ? workOrder.repairMaterialRequests : [];
  const toolRequests = Array.isArray(workOrder.repairToolRequests) ? workOrder.repairToolRequests : [];
  const canAddPersonalTool = Boolean(capabilities?.canLogOwnTime || capabilities?.canRequestMaterials || capabilities?.canRequestTools);

  const scrollToStage = (anchor: string) => {
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const lifecycleButtons = stages.map((stage, index) => {
    const isCurrent = index === stageIndex;
    const isComplete = index < stageIndex;
    return (
      <button
        key={stage.anchor}
        type="button"
        title={stage.label}
        aria-label={`Go to ${stage.label}`}
        aria-current={isCurrent ? 'step' : undefined}
        onClick={() => scrollToStage(stage.anchor)}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition-colors ${isCurrent ? 'border-primary bg-primary/10 text-primary' : isComplete ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground'}`}
      >
        {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : isCurrent ? <Activity className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
        <span className="hidden xl:inline">{stage.label}</span>
      </button>
    );
  });

  return (
    <div className="space-y-5">
      {stickyHeaderTarget && createPortal(
        <nav
          aria-label="Sticky work order lifecycle navigation"
          className="pointer-events-none absolute right-3 top-1/2 z-10 hidden max-w-[64vw] -translate-y-1/2 items-center justify-end xl:flex"
        >
          <div className="pointer-events-auto ml-auto flex max-w-full items-center justify-end gap-1 overflow-x-auto rounded-xl border bg-background/90 p-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75">
            {lifecycleButtons}
          </div>
        </nav>,
        stickyHeaderTarget,
      )}

      <section id="resources" className="scroll-mt-28 grid grid-cols-1 gap-5">
        <Card className="min-w-0">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" />Materials — Request & Status</CardTitle></CardHeader>
          <CardContent className="space-y-4 min-w-0">
            {capabilities?.canRequestMaterials && (
              <div className="grid grid-cols-2 lg:grid-cols-[minmax(12rem,2fr)_minmax(5.5rem,.7fr)_minmax(6rem,.8fr)_minmax(7rem,.9fr)_minmax(12rem,1.6fr)_auto] gap-2 rounded-lg border p-3 items-end min-w-0">
                <div className="min-w-0 col-span-2 lg:col-span-1"><Label>Material / spare part *</Label><Input className="min-w-0" value={material.itemName} onChange={(e) => setMaterial((v) => ({ ...v, itemName: e.target.value }))} placeholder="Bearing 6205, V-belt, grease..." /></div>
                <div className="min-w-0"><Label>Quantity</Label><Input className="min-w-0" type="number" min="0.01" step="0.01" value={material.quantity} onChange={(e) => setMaterial((v) => ({ ...v, quantity: e.target.value }))} /></div>
                <div className="min-w-0"><Label>Unit</Label><Input className="min-w-0" value={material.unit} onChange={(e) => setMaterial((v) => ({ ...v, unit: e.target.value }))} /></div>
                <div className="min-w-0"><Label>Urgency</Label><select className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={material.urgency} onChange={(e) => setMaterial((v) => ({ ...v, urgency: e.target.value }))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
                <div className="min-w-0"><Label>Reason *</Label><Input className="min-w-0" value={material.reason} onChange={(e) => setMaterial((v) => ({ ...v, reason: e.target.value }))} placeholder="Needed to complete repair" /></div>
                <Button className="w-full col-span-2 lg:col-span-1 lg:w-auto whitespace-nowrap" variant="outline" onClick={requestMaterial} disabled={busy !== null}><Plus className="h-4 w-4 mr-1" />Request Material</Button>
              </div>
            )}
            <div className="space-y-2">
              {materialRequests.length === 0 ? <p className="text-sm text-muted-foreground">No material requests yet.</p> : materialRequests.slice(0, 6).map((request: any) => (
                <div key={request.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{request.item?.name || request.itemName || 'Material'}</span><Badge variant="outline">{pretty(request.status)}</Badge></div>
                  <p className="text-xs text-muted-foreground mt-1">Requested {request.quantityRequested ?? request.quantity ?? '-'} {request.unit || ''} · {pretty(request.urgency)}</p>
                </div>
              ))}
            </div>
            <Button variant="ghost" className="w-full justify-between" onClick={() => navigate('repairs-material-requests', { workOrderId })}>Open full material workflow <ExternalLink className="h-4 w-4" /></Button>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" />Tools — Request, Issue & Personal Tools</CardTitle></CardHeader>
          <CardContent className="space-y-4 min-w-0">
            {capabilities?.canRequestTools && (
              <div className="grid grid-cols-2 lg:grid-cols-[minmax(13rem,2fr)_minmax(5.5rem,.65fr)_minmax(7rem,.85fr)_minmax(13rem,1.7fr)_auto] gap-2 rounded-lg border p-3 items-end min-w-0">
                <div className="min-w-0 col-span-2 lg:col-span-1"><Label>Tool required *</Label><Input className="min-w-0" value={toolRequest.toolName} onChange={(e) => setToolRequest((v) => ({ ...v, toolName: e.target.value }))} placeholder="Torque wrench, multimeter, puller..." /></div>
                <div className="min-w-0"><Label>Quantity</Label><Input className="min-w-0" type="number" min="1" step="1" value={toolRequest.quantity} onChange={(e) => setToolRequest((v) => ({ ...v, quantity: e.target.value }))} /></div>
                <div className="min-w-0"><Label>Urgency</Label><select className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={toolRequest.urgency} onChange={(e) => setToolRequest((v) => ({ ...v, urgency: e.target.value }))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
                <div className="min-w-0 col-span-2 lg:col-span-1"><Label>Reason *</Label><Input className="min-w-0" value={toolRequest.reason} onChange={(e) => setToolRequest((v) => ({ ...v, reason: e.target.value }))} placeholder="Required for disassembly / testing..." /></div>
                <Button className="w-full col-span-2 lg:col-span-1 lg:w-auto whitespace-nowrap" variant="outline" onClick={requestTool} disabled={busy !== null}><Plus className="h-4 w-4 mr-1" />Request Tool</Button>
              </div>
            )}
            <div className="space-y-2">
              {toolRequests.length === 0 ? <p className="text-sm text-muted-foreground">No store tool requests yet.</p> : toolRequests.slice(0, 5).map((request: any) => (
                <div key={request.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{request.requestNumber || request.toolName || 'Tool request'}</span><Badge variant="outline">{pretty(request.status)}</Badge></div>
                  <p className="text-xs text-muted-foreground mt-1">{(request.items || []).map((item: any) => item.tool?.name || item.toolName).filter(Boolean).join(', ') || request.tool?.name || request.toolName || 'Tools'} · {pretty(request.urgency)}</p>
                </div>
              ))}
            </div>

            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Personal / technician tools used on this job</p>
              {canAddPersonalTool && <div className="grid grid-cols-2 lg:grid-cols-[minmax(10rem,1.4fr)_minmax(9rem,1fr)_minmax(7rem,.75fr)_auto] gap-2 items-end min-w-0"><Input className="min-w-0" value={personalTool.toolName} onChange={(e) => setPersonalTool((v) => ({ ...v, toolName: e.target.value }))} placeholder="Tool name" /><Input className="min-w-0" value={personalTool.toolCode} onChange={(e) => setPersonalTool((v) => ({ ...v, toolCode: e.target.value }))} placeholder="Tool code (optional)" /><select className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={personalTool.condition} onChange={(e) => setPersonalTool((v) => ({ ...v, condition: e.target.value }))}><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option></select><Button className="w-full lg:w-auto whitespace-nowrap" variant="outline" onClick={addPersonalTool} disabled={busy !== null || personalTool.toolName.trim().length < 2}>Record Tool Used</Button></div>}
              {personalTools.slice(0, 6).map((tool: any) => <div key={tool.id || `${tool.toolName}-${tool.addedAt}`} className="rounded-lg bg-muted/40 p-2 text-xs flex items-center justify-between gap-2"><span>{tool.toolName}{tool.toolCode ? ` · ${tool.toolCode}` : ''}</span><Badge variant="outline">{pretty(tool.condition)}</Badge></div>)}
            </div>
            <Button variant="ghost" className="w-full justify-between" onClick={() => navigate('repairs-tool-requests', { workOrderId })}>Open full tool workflow <ExternalLink className="h-4 w-4" /></Button>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" />Equipment Downtime</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{downtimeSummary.totalRecords || 0}</p><p className="text-[11px] text-muted-foreground">Records</p></div><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{downtimeSummary.ongoing || 0}</p><p className="text-[11px] text-muted-foreground">Ongoing</p></div><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{minutesLabel(downtimeSummary.totalMinutes)}</p><p className="text-[11px] text-muted-foreground">Recorded</p></div></div>
            {capabilities?.canLogDowntime && (
              <div className="grid sm:grid-cols-2 gap-2 rounded-lg border p-3">
                <div className="sm:col-span-2"><Label>Downtime reason *</Label><Input value={downtimeForm.reason} onChange={(e) => setDowntimeForm((v) => ({ ...v, reason: e.target.value }))} placeholder="Machine stopped due to bearing failure..." /></div>
                <div><Label>Category</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={downtimeForm.category} onChange={(e) => setDowntimeForm((v) => ({ ...v, category: e.target.value }))}><option value="unplanned">Unplanned</option><option value="planned">Planned</option><option value="partial">Partial</option></select></div>
                <div><Label>Impact</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={downtimeForm.impactLevel} onChange={(e) => setDowntimeForm((v) => ({ ...v, impactLevel: e.target.value }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
                <div><Label>Started</Label><Input type="datetime-local" value={downtimeForm.downtimeStart} onChange={(e) => setDowntimeForm((v) => ({ ...v, downtimeStart: e.target.value }))} /></div>
                <div><Label>Ended (optional)</Label><Input type="datetime-local" value={downtimeForm.downtimeEnd} onChange={(e) => setDowntimeForm((v) => ({ ...v, downtimeEnd: e.target.value }))} /></div>
                <div><Label>Production loss (optional)</Label><Input type="number" min="0" step="0.01" value={downtimeForm.productionLoss} onChange={(e) => setDowntimeForm((v) => ({ ...v, productionLoss: e.target.value }))} /></div>
                <div><Label>Notes</Label><Input value={downtimeForm.notes} onChange={(e) => setDowntimeForm((v) => ({ ...v, notes: e.target.value }))} /></div>
                <Button className="sm:col-span-2 w-fit" variant="outline" onClick={recordDowntime} disabled={busy !== null}><TimerReset className="h-4 w-4 mr-1" />{downtimeForm.downtimeEnd ? 'Record Downtime' : 'Start Downtime'}</Button>
              </div>
            )}
            <div className="space-y-2">{downtime.length === 0 ? <p className="text-sm text-muted-foreground">No downtime recorded for this work order.</p> : downtime.slice(0, 8).map((row: any) => <div key={row.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-medium">{row.reason}</p><p className="text-xs text-muted-foreground">{pretty(row.category)} · {pretty(row.impactLevel)} · {fmt(row.downtimeStart)}</p></div>{row.downtimeEnd ? <Badge variant="outline">{minutesLabel(row.durationMinutes)}</Badge> : capabilities?.canLogDowntime ? <Button size="sm" variant="outline" onClick={() => endDowntime(row.id)} disabled={busy !== null}><XCircle className="h-3.5 w-3.5 mr-1" />End Downtime</Button> : <Badge variant="outline">Ongoing</Badge>}</div></div>)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock3 className="h-4 w-4" />Labor & Time History</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center"><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{laborSummary.totalEntries || 0}</p><p className="text-[11px] text-muted-foreground">Entries</p></div><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{Number(laborSummary.totalHours || 0).toFixed(2)}</p><p className="text-[11px] text-muted-foreground">Total h</p></div><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{Number(laborSummary.personalHours || 0).toFixed(2)}</p><p className="text-[11px] text-muted-foreground">Personal h</p></div><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{Number(laborSummary.teamHours || 0).toFixed(2)}</p><p className="text-[11px] text-muted-foreground">Team h</p></div></div>
            <div className="space-y-2">{labor.length === 0 ? <p className="text-sm text-muted-foreground">No labor entries recorded yet.</p> : labor.slice(-8).reverse().map((log: any) => <div key={log.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{log.user?.fullName || 'Technician'} · {pretty(log.action)}</span>{log.endTime ? <Badge variant="outline">{Number(log.duration || 0).toFixed(2)} h</Badge> : <Badge className="bg-emerald-600">Live</Badge>}</div><p className="text-xs text-muted-foreground mt-1">{fmt(log.startTime || log.timestamp)}{log.endTime ? ` → ${fmt(log.endTime)}` : ''}{log.activityType ? ` · ${pretty(log.activityType)}` : ''}</p>{log.notes && <p className="text-xs mt-1">{log.notes}</p>}</div>)}</div>
            <Button variant="ghost" className="w-full justify-between" onClick={() => navigate('technician-timesheet', { workOrderId })}>Open full timesheet <ExternalLink className="h-4 w-4" /></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
