'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  Activity, CheckCircle2, ClipboardList, Clock3, ExternalLink, Gauge, Loader2, Package, Plus,
  TimerReset, Wrench, XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useNavigationStore } from '@/stores/navigationStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { downtimeReason, materialRequestReason, toolRequestReason } from '@/lib/technician-reason-defaults';

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

type InventoryOption = {
  id: string;
  name: string;
  itemCode?: string | null;
  unitOfMeasure?: string | null;
  currentStock?: number | null;
  location?: string | null;
};

type ToolOption = {
  id: string;
  name: string;
  toolCode?: string | null;
  status?: string | null;
  condition?: string | null;
  quantity?: number | null;
  location?: string | null;
};

type SearchableResourceOption = {
  id: string;
  label: string;
  detail?: string;
  searchText: string;
};

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

function SearchableResourceSelect({
  selectedId,
  options,
  placeholder,
  emptyText,
  disabled,
  onSelect,
}: {
  selectedId: string;
  options: SearchableResourceOption[];
  placeholder: string;
  emptyText: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = useMemo(() => options.find((option) => option.id === selectedId) || null, [options, selectedId]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(
    () => options.filter((option) => !normalizedQuery || option.searchText.includes(normalizedQuery)).slice(0, 100),
    [normalizedQuery, options],
  );

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        value={open ? query : selected?.label || ''}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (selectedId) onSelect('');
        }}
      />
      {open && !disabled && (
        <div role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
          {filteredOptions.length ? filteredOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === selectedId}
              className="flex w-full min-w-0 flex-col items-start rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option.id);
                setQuery(option.label);
                setOpen(false);
              }}
            >
              <span className="w-full truncate font-medium">{option.label}</span>
              {option.detail && <span className="w-full truncate text-[11px] text-muted-foreground">{option.detail}</span>}
            </button>
          )) : (
            <p className="px-2 py-3 text-sm text-muted-foreground">{emptyText}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function TechnicianWorkOrderV11Panels({ workOrderId, workOrder, capabilities, onChanged }: Props) {
  const navigate = useNavigationStore((s) => s.navigate);
  const [busy, setBusy] = useState<string | null>(null);
  const [downtime, setDowntime] = useState<any[]>([]);
  const [downtimeSummary, setDowntimeSummary] = useState<any>({ totalRecords: 0, ongoing: 0, totalMinutes: 0 });
  const [labor, setLabor] = useState<any[]>([]);
  const [laborSummary, setLaborSummary] = useState<any>({ totalEntries: 0, totalHours: 0, personalHours: 0, teamHours: 0 });
  const [personalTools, setPersonalTools] = useState<any[]>([]);
  const [inventoryOptions, setInventoryOptions] = useState<InventoryOption[]>([]);
  const [toolOptions, setToolOptions] = useState<ToolOption[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [stickyHeaderTarget, setStickyHeaderTarget] = useState<HTMLElement | null>(null);

  const [material, setMaterial] = useState({ itemId: '', itemName: '', quantity: '1', unit: '', urgency: 'normal', reason: '' });
  const [toolRequest, setToolRequest] = useState({ toolId: '', toolName: '', toolCode: '', quantity: '1', urgency: 'normal', reason: '' });
  const [editingMaterialRequestId, setEditingMaterialRequestId] = useState<string | null>(null);
  const [editingToolRequestId, setEditingToolRequestId] = useState<string | null>(null);
  const [teamTime, setTeamTime] = useState({ userId: '', startTime: toLocalInput(new Date(Date.now() - 60 * 60_000)), endTime: toLocalInput(), breakMinutes: '0', activityType: 'maintenance', notes: '' });
  const [personalTool, setPersonalTool] = useState({ toolName: '', toolCode: '', condition: 'good', notes: '' });
  const [downtimeForm, setDowntimeForm] = useState({
    reason: '', category: 'unplanned', impactLevel: 'medium', downtimeStart: toLocalInput(), downtimeEnd: '', productionLoss: '', notes: '',
  });

  const loadPanels = useCallback(async () => {
    const teamLogs = capabilities?.isTeamLeader ? '?includeTeamLogs=true' : '';
    const workOrderPlantHeaders = workOrder?.plantId
      ? { headers: { 'X-Plant-ID': String(workOrder.plantId) } }
      : undefined;
    setResourcesLoading(true);
    const [downRes, timeRes, personalToolsRes, inventoryRes, toolsRes] = await Promise.all([
      api.get<any[]>(`/api/work-orders/${workOrderId}/downtime`, workOrderPlantHeaders),
      api.get<any>(`/api/work-orders/${workOrderId}/time-logs${teamLogs}`, workOrderPlantHeaders),
      (capabilities?.canLogOwnTime || capabilities?.canRequestMaterials || capabilities?.canRequestTools)
        ? api.get<any[]>(`/api/work-orders/${workOrderId}/personal-tools`, workOrderPlantHeaders)
        : Promise.resolve({ success: true, data: [] as any[] }),
      capabilities?.canRequestMaterials
        ? api.get<InventoryOption[]>('/api/inventory?mode=lookup&limit=100', workOrderPlantHeaders)
        : Promise.resolve({ success: true, data: [] as InventoryOption[] }),
      capabilities?.canRequestTools
        ? api.get<ToolOption[]>(`/api/work-orders/${workOrderId}/tool-candidates?status=available&limit=100`, workOrderPlantHeaders)
        : Promise.resolve({ success: true, data: [] as ToolOption[] }),
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
    if (inventoryRes.success && Array.isArray(inventoryRes.data)) {
      setInventoryOptions(
        inventoryRes.data
          .filter((item) => Number(item.currentStock ?? 0) > 0)
          .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
      );
    } else {
      setInventoryOptions([]);
    }
    if (toolsRes.success && Array.isArray(toolsRes.data)) {
      setToolOptions(
        toolsRes.data
          .filter((tool) => tool.status === 'available' && Number(tool.quantity ?? 1) > 0)
          .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
      );
    } else {
      setToolOptions([]);
    }
    setResourcesLoading(false);
  }, [
    capabilities?.canLogOwnTime,
    capabilities?.canRequestMaterials,
    capabilities?.canRequestTools,
    capabilities?.isTeamLeader,
    workOrder?.plantId,
    workOrderId,
  ]);

  useEffect(() => { void loadPanels(); }, [loadPanels]);

  useEffect(() => {
    const target = document.querySelector('div.sticky.top-0.z-20');
    if (target instanceof HTMLElement) setStickyHeaderTarget(target);
    return () => setStickyHeaderTarget(null);
  }, []);

  const selectedMaterial = useMemo(
    () => inventoryOptions.find((item) => item.id === material.itemId) || null,
    [inventoryOptions, material.itemId],
  );
  const selectedTool = useMemo(
    () => toolOptions.find((tool) => tool.id === toolRequest.toolId) || null,
    [toolOptions, toolRequest.toolId],
  );
  const materialSearchOptions = useMemo<SearchableResourceOption[]>(
    () => inventoryOptions.map((item) => ({
      id: item.id,
      label: `${item.name}${item.itemCode ? ` [${item.itemCode}]` : ''}`,
      detail: `${Number(item.currentStock ?? 0)} ${item.unitOfMeasure || 'each'} available${item.location ? ` · ${item.location}` : ''}`,
      searchText: `${item.name} ${item.itemCode || ''} ${item.location || ''}`.toLowerCase(),
    })),
    [inventoryOptions],
  );
  const toolSearchOptions = useMemo<SearchableResourceOption[]>(
    () => toolOptions.map((tool) => ({
      id: tool.id,
      label: `${tool.name}${tool.toolCode ? ` [${tool.toolCode}]` : ''}`,
      detail: `${Number(tool.quantity ?? 1)} available${tool.condition ? ` · ${pretty(tool.condition)}` : ''}${tool.location ? ` · ${tool.location}` : ''}`,
      searchText: `${tool.name} ${tool.toolCode || ''} ${tool.condition || ''} ${tool.location || ''}`.toLowerCase(),
    })),
    [toolOptions],
  );

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

  const resetMaterialRequest = () => {
    setEditingMaterialRequestId(null);
    setMaterial({ itemId: '', itemName: '', quantity: '1', unit: '', urgency: 'normal', reason: '' });
  };

  const requestMaterial = async () => {
    if (!material.itemId) {
      toast.error('Select a material / spare part'); return;
    }
    const resolvedReason = material.reason.trim() || materialRequestReason({
      woNumber: workOrder.woNumber,
      title: workOrder.title,
      itemName: selectedMaterial?.name || material.itemName,
    });
    const quantity = Number(material.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) { toast.error('Quantity must be greater than zero'); return; }
    if (selectedMaterial) {
      const availableStock = Number(selectedMaterial.currentStock ?? 0);
      if (quantity > availableStock) {
        toast.error(`Only ${availableStock} ${selectedMaterial.unitOfMeasure || 'unit(s)'} currently available`); return;
      }
    }
    const ok = await run(
      'material',
      () => editingMaterialRequestId
        ? api.put(`/api/repairs/material-requests/${editingMaterialRequestId}`, { quantityRequested: quantity, urgency: material.urgency, reason: resolvedReason })
        : api.post(`/api/work-orders/${workOrderId}/materials`, {
            itemId: selectedMaterial?.id || material.itemId,
            itemName: selectedMaterial?.name || material.itemName,
            quantity,
            unit: selectedMaterial?.unitOfMeasure || material.unit || 'each',
            urgency: material.urgency,
            reason: resolvedReason,
          }),
      editingMaterialRequestId ? 'Material request updated' : 'Material request submitted',
    );
    if (ok) resetMaterialRequest();
  };

  const cancelMaterialRequest = (requestId: string) => run(
    `cancel-material-${requestId}`,
    () => api.delete(`/api/repairs/material-requests/${requestId}`),
    'Material request cancelled',
  );

  const resetToolRequest = () => {
    setEditingToolRequestId(null);
    setToolRequest({ toolId: '', toolName: '', toolCode: '', quantity: '1', urgency: 'normal', reason: '' });
  };

  const requestTool = async () => {
    if (!toolRequest.toolId) {
      toast.error('Select a tool'); return;
    }
    const quantity = Math.max(1, Math.floor(Number(toolRequest.quantity) || 1));
    if (selectedTool) {
      const availableQuantity = Number(selectedTool.quantity ?? 1);
      if (quantity > availableQuantity) {
        toast.error(`Only ${availableQuantity} currently available for ${selectedTool.name}`); return;
      }
    }
    const item = {
      toolId: selectedTool?.id || toolRequest.toolId,
      toolName: selectedTool?.name || toolRequest.toolName,
      toolCode: selectedTool?.toolCode || toolRequest.toolCode || '',
      quantityRequested: quantity,
    };
    const resolvedReason = toolRequest.reason.trim() || toolRequestReason({
      woNumber: workOrder.woNumber,
      title: workOrder.title,
      toolName: item.toolName,
    });
    const ok = await run(
      'tool-request',
      () => editingToolRequestId
        ? api.put(`/api/repairs/tool-requests/${editingToolRequestId}`, { toolName: item.toolName, items: [item], reason: resolvedReason, urgency: toolRequest.urgency })
        : api.post('/api/repairs/tool-requests', { workOrderId, items: [item], reason: resolvedReason, urgency: toolRequest.urgency }),
      editingToolRequestId ? 'Tool request updated' : 'Tool request submitted',
    );
    if (ok) resetToolRequest();
  };

  const cancelToolRequest = (requestId: string) => run(
    `cancel-tool-${requestId}`,
    () => api.delete(`/api/repairs/tool-requests/${requestId}`),
    'Tool request cancelled',
  );

  const submitPlannerRecommendations = () => run(
    'planner-recommendations',
    () => api.put(`/api/work-orders/${workOrderId}/suggested-items`, {
      action: 'submit_recommendations',
    }),
    'Planner recommendations submitted for approval',
  );

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

  const logTeamMemberTime = async () => {
    if (!teamTime.userId) { toast.error('Select a team member'); return; }
    const start = new Date(teamTime.startTime);
    const end = new Date(teamTime.endTime);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      toast.error('Enter a valid start/end time window'); return;
    }
    const breakMinutes = Math.max(0, Number(teamTime.breakMinutes) || 0);
    const ok = await run('team-time', () => api.post(`/api/work-orders/${workOrderId}/time-logs`, {
      action: 'start',
      loggedForUserId: teamTime.userId,
      isTeamLog: true,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      breakMinutes,
      activityType: teamTime.activityType,
      notes: teamTime.notes.trim() || undefined,
    }), 'Team member time recorded', false);
    if (ok) setTeamTime((current) => ({ ...current, startTime: toLocalInput(new Date(Date.now() - 60 * 60_000)), endTime: toLocalInput(), breakMinutes: '0', notes: '' }));
  };

  const recordDowntime = async () => {
    const resolvedReason = downtimeForm.reason.trim() || downtimeReason({
      woNumber: workOrder.woNumber,
      title: workOrder.title,
      category: downtimeForm.category,
      assetName: workOrder.assetName,
    });
    const start = new Date(downtimeForm.downtimeStart);
    const end = downtimeForm.downtimeEnd ? new Date(downtimeForm.downtimeEnd) : null;
    if (!Number.isFinite(start.getTime())) { toast.error('Enter a valid downtime start'); return; }
    if (end && !Number.isFinite(end.getTime())) { toast.error('Enter a valid downtime end'); return; }
    if (end && end < start) { toast.error('Downtime end cannot be before start'); return; }
    const productionLoss = downtimeForm.productionLoss === '' ? undefined : Number(downtimeForm.productionLoss);
    if (productionLoss !== undefined && (!Number.isFinite(productionLoss) || productionLoss < 0)) { toast.error('Production loss must be a non-negative number'); return; }
    const ok = await run('downtime', () => api.post(`/api/work-orders/${workOrderId}/downtime`, {
      reason: resolvedReason,
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
  const canonicalToolRequests = Array.isArray(workOrder.repairToolRequests) ? workOrder.repairToolRequests : [];
  const representedPlannerToolIds = new Set<string>();
  for (const request of canonicalToolRequests) {
    if (request?.toolId) representedPlannerToolIds.add(String(request.toolId));
    for (const item of Array.isArray(request?.items) ? request.items : []) {
      if (item?.toolId) representedPlannerToolIds.add(String(item.toolId));
    }
  }
  const plannerToolSnapshot = (() => {
    if (Array.isArray(workOrder.suggestedTools)) return workOrder.suggestedTools;
    if (typeof workOrder.suggestedTools !== 'string') return [];
    try {
      const parsed = JSON.parse(workOrder.suggestedTools || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  const projectedPlannerToolRequests = plannerToolSnapshot
    .filter((tool: any) => tool?.toolId && !representedPlannerToolIds.has(String(tool.toolId)))
    .map((tool: any) => ({
      id: `planned:tool:snapshot:${tool.toolId}`,
      requestNumber: null,
      toolId: tool.toolId,
      toolName: tool.toolName || 'Planned tool',
      source: 'planner_suggested',
      status: 'planned',
      urgency: 'normal',
      reason: 'Planner-selected tool',
      items: [{
        id: `planned:tool:snapshot:${tool.toolId}:item`,
        toolId: tool.toolId,
        toolName: tool.toolName || 'Planned tool',
        toolCode: tool.toolCode || '',
        quantityRequested: Math.max(1, Math.floor(Number(tool.quantity) || 1)),
      }],
      projectionOnly: true,
    }));
  const toolRequests = [...canonicalToolRequests, ...projectedPlannerToolRequests];

  const isPlannerRecommendation = (request: any) =>
    Boolean(
      request?.projectionOnly
      || (
        request?.source === 'planner_suggested'
        && ['planned', 'pending', 'suggested'].includes(String(request?.status || '').toLowerCase())
      )
    );

  const plannerMaterialRecommendations = materialRequests.filter(isPlannerRecommendation);
  const plannerToolRecommendations = toolRequests.filter(isPlannerRecommendation);
  const materialPipelineRequests = materialRequests.filter((request: any) => !isPlannerRecommendation(request));
  const toolPipelineRequests = toolRequests.filter((request: any) => !isPlannerRecommendation(request));
  const plannerRecommendationCount =
    plannerMaterialRecommendations.length + plannerToolRecommendations.length;
  const canSubmitPlannerRecommendations =
    plannerRecommendationCount > 0
    && Boolean(capabilities?.canRequestMaterials || capabilities?.canRequestTools);

  const canAddPersonalTool = Boolean(capabilities?.canLogOwnTime || capabilities?.canRequestMaterials || capabilities?.canRequestTools);
  const teamTimeCandidates = Array.from(new Map([
    ...(workOrder.assignee?.id ? [[workOrder.assignee.id, workOrder.assignee.fullName || 'Assigned technician']] : []),
    ...(Array.isArray(workOrder.teamMembers) ? workOrder.teamMembers.map((member: any) => [member.userId || member.user?.id, member.user?.fullName || member.fullName || member.user?.username || member.userId]).filter((row: any[]) => row[0]) : []),
  ]).entries()).map(([id, name]) => ({ id, name }));

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
        {plannerRecommendationCount > 0 && (
          <Card className="min-w-0 border-dashed border-primary/30 bg-primary/[0.03]">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    Planner Recommended Resources
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Review these recommendations before requesting them from stores. They are not approval requests until you submit them.
                  </p>
                </div>
                {canSubmitPlannerRecommendations && (
                  <Button
                    size="sm"
                    onClick={submitPlannerRecommendations}
                    disabled={busy !== null}
                  >
                    {busy === 'planner-recommendations' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    Submit recommendations
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {plannerMaterialRecommendations.map((request: any) => (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/70 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{request.item?.name || request.itemName || 'Material'}</p>
                    <p className="text-xs text-muted-foreground">
                      Material · Qty {request.quantityRequested ?? request.quantity ?? 1} {request.unit || ''}
                    </p>
                  </div>
                  <Badge variant="outline">Planner recommendation</Badge>
                </div>
              ))}
              {plannerToolRecommendations.map((request: any) => {
                const items = Array.isArray(request.items) ? request.items : [];
                const item = items[0] || {};
                return (
                  <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/70 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.tool?.name || item.toolName || request.tool?.name || request.toolName || 'Tool'}</p>
                      <p className="text-xs text-muted-foreground">
                        Tool · Qty {item.quantityRequested ?? request.quantityRequested ?? 1}
                        {(item.toolCode || item.tool?.toolCode) ? ` · ${item.toolCode || item.tool?.toolCode}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline">Planner recommendation</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card className="min-w-0">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" />Materials — Request & Status</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {capabilities?.canRequestMaterials && (
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 lg:grid-cols-[minmax(13rem,2.2fr)_minmax(5rem,.6fr)_minmax(6rem,.8fr)_minmax(6.5rem,.8fr)_minmax(11rem,1.7fr)_auto] lg:items-end">
                <div className="col-span-2 min-w-0 lg:col-span-1">
                  <div className="flex min-h-5 items-center justify-between gap-2">
                    <Label>Material / spare part *</Label>
                    {selectedMaterial && (
                      <span className="min-w-0 truncate text-right text-[11px] text-muted-foreground">
                        Stock: {Number(selectedMaterial.currentStock ?? 0)} {selectedMaterial.unitOfMeasure || 'each'}{selectedMaterial.location ? ` · ${selectedMaterial.location}` : ''}
                      </span>
                    )}
                  </div>
                  <SearchableResourceSelect
                    selectedId={material.itemId}
                    options={materialSearchOptions}
                    placeholder={resourcesLoading ? 'Loading available materials...' : inventoryOptions.length ? 'Search materials or item codes...' : 'No in-stock materials available'}
                    emptyText="No matching in-stock materials"
                    disabled={resourcesLoading || inventoryOptions.length === 0}
                    onSelect={(id) => {
                      const item = inventoryOptions.find((option) => option.id === id);
                      setMaterial((v) => ({
                        ...v,
                        itemId: item?.id || '',
                        itemName: item?.name || '',
                        unit: item?.unitOfMeasure || '',
                        quantity: item ? '1' : v.quantity,
                      }));
                    }}
                  />
                </div>
                <div className="min-w-0"><Label>Quantity</Label><Input className="w-full min-w-0" type="number" min="0.01" step="0.01" max={selectedMaterial ? Number(selectedMaterial.currentStock ?? 0) : undefined} value={material.quantity} onChange={(e) => setMaterial((v) => ({ ...v, quantity: e.target.value }))} disabled={!material.itemId} /></div>
                <div className="min-w-0"><Label>Unit</Label><Input className="w-full min-w-0 bg-muted/40" value={material.unit} readOnly placeholder="From inventory" /></div>
                <div className="min-w-0"><Label>Urgency</Label><select className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={material.urgency} onChange={(e) => setMaterial((v) => ({ ...v, urgency: e.target.value }))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
                <div className="col-span-2 min-w-0 lg:col-span-1"><Label>Reason</Label><Input className="w-full min-w-0" value={material.reason} onChange={(e) => setMaterial((v) => ({ ...v, reason: e.target.value }))} placeholder={materialRequestReason({ woNumber: workOrder.woNumber, title: workOrder.title, itemName: selectedMaterial?.name || material.itemName })} /></div>
                <div className="col-span-2 flex gap-2 lg:col-span-1"><Button className="flex-1 whitespace-nowrap" variant="outline" onClick={requestMaterial} disabled={busy !== null || !material.itemId || (!editingMaterialRequestId && resourcesLoading)}><Plus className="h-4 w-4 mr-1" />{editingMaterialRequestId ? 'Update Request' : 'Request Material'}</Button>{editingMaterialRequestId && <Button variant="ghost" className="shrink-0 whitespace-nowrap" onClick={resetMaterialRequest} disabled={busy !== null}>Cancel</Button>}</div>
              </div>
            )}
            <div className="space-y-2">
              {materialPipelineRequests.length === 0 ? <p className="text-sm text-muted-foreground">No submitted material requests yet.</p> : materialPipelineRequests.slice(0, 6).map((request: any) => (
                <div key={request.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{request.item?.name || request.itemName || 'Material'}</span><Badge variant="outline">{pretty(request.status)}</Badge></div>
                  <p className="text-xs text-muted-foreground mt-1">Requested {request.quantityRequested ?? request.quantity ?? '-'} {request.unit || ''} · {pretty(request.urgency)}</p>
                  {request.status === 'pending' && <div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditingMaterialRequestId(request.id); setMaterial({ itemId: request.itemId || request.item?.id || '', itemName: request.item?.name || request.itemName || '', quantity: String(request.quantityRequested ?? request.quantity ?? 1), unit: request.unit || request.item?.unitOfMeasure || '', urgency: request.urgency || 'normal', reason: request.reason || '' }); }}>Edit</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600" onClick={() => cancelMaterialRequest(request.id)} disabled={busy !== null}>Cancel</Button></div>}
                </div>
              ))}
            </div>
            <Button variant="ghost" className="w-full justify-between" onClick={() => navigate('repairs-material-requests', { workOrderId })}>Open full material workflow <ExternalLink className="h-4 w-4" /></Button>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" />Tools — Request, Issue & Personal Tools</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {capabilities?.canRequestTools && (
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 lg:grid-cols-[minmax(14rem,2.2fr)_minmax(5rem,.6fr)_minmax(6.5rem,.8fr)_minmax(12rem,1.8fr)_auto] lg:items-end">
                <div className="col-span-2 min-w-0 lg:col-span-1">
                  <div className="flex min-h-5 items-center justify-between gap-2">
                    <Label>Tool required *</Label>
                    {selectedTool && (
                      <span className="min-w-0 truncate text-right text-[11px] text-muted-foreground">
                        Available: {Number(selectedTool.quantity ?? 1)} · {selectedTool.toolCode || 'No code'} · {pretty(selectedTool.condition)}{selectedTool.location ? ` · ${selectedTool.location}` : ''}
                      </span>
                    )}
                  </div>
                  <SearchableResourceSelect
                    selectedId={toolRequest.toolId}
                    options={toolSearchOptions}
                    placeholder={resourcesLoading ? 'Loading available tools...' : toolOptions.length ? 'Search tools or tool codes...' : 'No tools currently available'}
                    emptyText="No matching available tools"
                    disabled={resourcesLoading || toolOptions.length === 0}
                    onSelect={(id) => {
                      const tool = toolOptions.find((option) => option.id === id);
                      setToolRequest((v) => ({
                        ...v,
                        toolId: tool?.id || '',
                        toolName: tool?.name || '',
                        toolCode: tool?.toolCode || '',
                        quantity: tool ? '1' : v.quantity,
                      }));
                    }}
                  />
                </div>
                <div className="min-w-0"><Label>Quantity</Label><Input className="w-full min-w-0" type="number" min="1" step="1" max={selectedTool ? Number(selectedTool.quantity ?? 1) : undefined} value={toolRequest.quantity} onChange={(e) => setToolRequest((v) => ({ ...v, quantity: e.target.value }))} disabled={!toolRequest.toolId} /></div>
                <div className="min-w-0"><Label>Urgency</Label><select className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={toolRequest.urgency} onChange={(e) => setToolRequest((v) => ({ ...v, urgency: e.target.value }))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
                <div className="col-span-2 min-w-0 lg:col-span-1"><Label>Reason</Label><Input className="w-full min-w-0" value={toolRequest.reason} onChange={(e) => setToolRequest((v) => ({ ...v, reason: e.target.value }))} placeholder={toolRequestReason({ woNumber: workOrder.woNumber, title: workOrder.title, toolName: selectedTool?.name || toolRequest.toolName })} /></div>
                <div className="col-span-2 flex gap-2 lg:col-span-1"><Button className="flex-1 whitespace-nowrap" variant="outline" onClick={requestTool} disabled={busy !== null || !toolRequest.toolId || (!editingToolRequestId && resourcesLoading)}><Plus className="h-4 w-4 mr-1" />{editingToolRequestId ? 'Update Request' : 'Request Tool'}</Button>{editingToolRequestId && <Button variant="ghost" className="shrink-0 whitespace-nowrap" onClick={resetToolRequest} disabled={busy !== null}>Cancel</Button>}</div>
              </div>
            )}
            <div className="space-y-2">
              {toolPipelineRequests.length === 0 ? <p className="text-sm text-muted-foreground">No submitted tool requests yet.</p> : toolPipelineRequests.slice(0, 5).map((request: any) => (
                <div key={request.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{request.requestNumber || request.toolName || 'Tool request'}</span><Badge variant="outline">{pretty(request.status)}</Badge></div>
                  <p className="text-xs text-muted-foreground mt-1">{(request.items || []).map((item: any) => item.tool?.name || item.toolName).filter(Boolean).join(', ') || request.tool?.name || request.toolName || 'Tools'} · {pretty(request.urgency)}</p>
                  {request.status === 'pending' && !request.projectionOnly && <div className="mt-2 flex gap-2">{(request.items || []).length <= 1 && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { const item = (request.items || [])[0] || {}; setEditingToolRequestId(request.id); setToolRequest({ toolId: item.toolId || item.tool?.id || request.toolId || '', toolName: item.tool?.name || item.toolName || request.toolName || '', toolCode: item.tool?.toolCode || item.toolCode || '', quantity: String(item.quantityRequested ?? request.quantityRequested ?? 1), urgency: request.urgency || 'normal', reason: request.reason || '' }); }}>Edit</Button>}<Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600" onClick={() => cancelToolRequest(request.id)} disabled={busy !== null}>Cancel</Button></div>}
                </div>
              ))}
            </div>

            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Personal / technician tools used on this job</p>
              {canAddPersonalTool && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(10rem,1.4fr)_minmax(8rem,1fr)_minmax(7rem,.8fr)_auto] lg:items-end"><Input className="min-w-0" value={personalTool.toolName} onChange={(e) => setPersonalTool((v) => ({ ...v, toolName: e.target.value }))} placeholder="Tool name" /><Input className="min-w-0" value={personalTool.toolCode} onChange={(e) => setPersonalTool((v) => ({ ...v, toolCode: e.target.value }))} placeholder="Tool code (optional)" /><select className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm" value={personalTool.condition} onChange={(e) => setPersonalTool((v) => ({ ...v, condition: e.target.value }))}><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option></select><Button className="w-full whitespace-nowrap sm:col-span-2 lg:col-span-1 lg:w-auto" variant="outline" onClick={addPersonalTool} disabled={busy !== null || personalTool.toolName.trim().length < 2}>Record Tool Used</Button></div>}
              {personalTools.slice(0, 6).map((tool: any) => <div key={tool.id || `${tool.toolName}-${tool.addedAt}`} className="rounded-lg bg-muted/40 p-2 text-xs flex items-center justify-between gap-2"><span className="min-w-0 truncate">{tool.toolName}{tool.toolCode ? ` · ${tool.toolCode}` : ''}</span><Badge variant="outline" className="shrink-0">{pretty(tool.condition)}</Badge></div>)}
            </div>
            <Button variant="ghost" className="w-full justify-between" onClick={() => navigate('repairs-tool-requests', { workOrderId })}>Open full tool workflow <ExternalLink className="h-4 w-4" /></Button>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="min-w-0">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" />Equipment Downtime</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{downtimeSummary.totalRecords || 0}</p><p className="text-[11px] text-muted-foreground">Records</p></div><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{downtimeSummary.ongoing || 0}</p><p className="text-[11px] text-muted-foreground">Ongoing</p></div><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{minutesLabel(downtimeSummary.totalMinutes)}</p><p className="text-[11px] text-muted-foreground">Recorded</p></div></div>
            {capabilities?.canLogDowntime && (
              <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2">
                <div className="min-w-0 sm:col-span-2"><Label>Downtime reason</Label><Input className="w-full min-w-0" value={downtimeForm.reason} onChange={(e) => setDowntimeForm((v) => ({ ...v, reason: e.target.value }))} placeholder={downtimeReason({ woNumber: workOrder.woNumber, title: workOrder.title, category: downtimeForm.category, assetName: workOrder.assetName })} /></div>
                <div className="min-w-0"><Label>Category</Label><select className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={downtimeForm.category} onChange={(e) => setDowntimeForm((v) => ({ ...v, category: e.target.value }))}><option value="unplanned">Unplanned</option><option value="planned">Planned</option><option value="partial">Partial</option></select></div>
                <div className="min-w-0"><Label>Impact</Label><select className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={downtimeForm.impactLevel} onChange={(e) => setDowntimeForm((v) => ({ ...v, impactLevel: e.target.value }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
                <div className="min-w-0"><Label>Started</Label><Input className="w-full min-w-0" type="datetime-local" value={downtimeForm.downtimeStart} onChange={(e) => setDowntimeForm((v) => ({ ...v, downtimeStart: e.target.value }))} /></div>
                <div className="min-w-0"><Label>Ended (optional)</Label><Input className="w-full min-w-0" type="datetime-local" value={downtimeForm.downtimeEnd} onChange={(e) => setDowntimeForm((v) => ({ ...v, downtimeEnd: e.target.value }))} /></div>
                <div className="min-w-0"><Label>Production loss (optional)</Label><Input className="w-full min-w-0" type="number" min="0" step="0.01" value={downtimeForm.productionLoss} onChange={(e) => setDowntimeForm((v) => ({ ...v, productionLoss: e.target.value }))} /></div>
                <div className="min-w-0"><Label>Notes</Label><Input className="w-full min-w-0" value={downtimeForm.notes} onChange={(e) => setDowntimeForm((v) => ({ ...v, notes: e.target.value }))} /></div>
                <Button className="w-full sm:col-span-2 sm:w-fit" variant="outline" onClick={recordDowntime} disabled={busy !== null}><TimerReset className="h-4 w-4 mr-1" />{downtimeForm.downtimeEnd ? 'Record Downtime' : 'Start Downtime'}</Button>
              </div>
            )}
            <div className="space-y-2">{downtime.length === 0 ? <p className="text-sm text-muted-foreground">No downtime recorded for this work order.</p> : downtime.slice(0, 8).map((row: any) => <div key={row.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><p className="font-medium break-words">{row.reason}</p><p className="text-xs text-muted-foreground">{pretty(row.category)} · {pretty(row.impactLevel)} · {fmt(row.downtimeStart)}</p></div>{row.downtimeEnd ? <Badge variant="outline" className="shrink-0">{minutesLabel(row.durationMinutes)}</Badge> : capabilities?.canLogDowntime ? <Button size="sm" variant="outline" className="shrink-0" onClick={() => endDowntime(row.id)} disabled={busy !== null}><XCircle className="h-3.5 w-3.5 mr-1" />End Downtime</Button> : <Badge variant="outline" className="shrink-0">Ongoing</Badge>}</div></div>)}</div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock3 className="h-4 w-4" />Labor & Time History</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center"><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{laborSummary.totalEntries || 0}</p><p className="text-[11px] text-muted-foreground">Entries</p></div><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{Number(laborSummary.totalHours || 0).toFixed(2)}</p><p className="text-[11px] text-muted-foreground">Total h</p></div><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{Number(laborSummary.personalHours || 0).toFixed(2)}</p><p className="text-[11px] text-muted-foreground">Personal h</p></div><div className="rounded-lg bg-muted/40 p-2"><p className="text-lg font-semibold">{Number(laborSummary.teamHours || 0).toFixed(2)}</p><p className="text-[11px] text-muted-foreground">Team h</p></div></div>
            {capabilities?.canLogTeamTime && capabilities?.isTeamLeader && (
              <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2">
                <div><Label>Team member *</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={teamTime.userId} onChange={(e) => setTeamTime((v) => ({ ...v, userId: e.target.value }))}><option value="">Select team member...</option>{teamTimeCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></div>
                <div><Label>Activity</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={teamTime.activityType} onChange={(e) => setTeamTime((v) => ({ ...v, activityType: e.target.value }))}><option value="maintenance">Maintenance</option><option value="inspection">Inspection</option><option value="testing">Testing</option><option value="travel">Travel</option><option value="waiting">Waiting</option></select></div>
                <div><Label>Start</Label><Input type="datetime-local" value={teamTime.startTime} onChange={(e) => setTeamTime((v) => ({ ...v, startTime: e.target.value }))} /></div>
                <div><Label>End</Label><Input type="datetime-local" value={teamTime.endTime} onChange={(e) => setTeamTime((v) => ({ ...v, endTime: e.target.value }))} /></div>
                <div><Label>Break minutes</Label><Input type="number" min="0" max="480" value={teamTime.breakMinutes} onChange={(e) => setTeamTime((v) => ({ ...v, breakMinutes: e.target.value }))} /></div>
                <div><Label>Notes</Label><Input value={teamTime.notes} onChange={(e) => setTeamTime((v) => ({ ...v, notes: e.target.value }))} placeholder="Work performed" /></div>
                <Button className="sm:col-span-2 sm:w-fit" variant="outline" onClick={logTeamMemberTime} disabled={busy !== null || !teamTime.userId}><Clock3 className="h-4 w-4 mr-1" />Record Team Member Time</Button>
              </div>
            )}
            <div className="space-y-2">{labor.length === 0 ? <p className="text-sm text-muted-foreground">No labor entries recorded yet.</p> : labor.slice(-8).reverse().map((log: any) => <div key={log.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words font-medium">{log.user?.fullName || 'Technician'} · {pretty(log.action)}</span>{log.endTime ? <Badge variant="outline" className="shrink-0">{Number(log.duration || 0).toFixed(2)} h</Badge> : <Badge className="shrink-0 bg-emerald-600">Live</Badge>}</div><p className="text-xs text-muted-foreground mt-1 break-words">{fmt(log.startTime || log.timestamp)}{log.endTime ? ` → ${fmt(log.endTime)}` : ''}{log.activityType ? ` · ${pretty(log.activityType)}` : ''}</p>{log.notes && <p className="text-xs mt-1 break-words">{log.notes}</p>}</div>)}</div>
            <Button variant="ghost" className="w-full justify-between" onClick={() => navigate('technician-timesheet', { workOrderId })}>Open full timesheet <ExternalLink className="h-4 w-4" /></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
