#!/usr/bin/env bash
set -euo pipefail

EXPECTED_MAIN="90e3250e805a8bbaf6201aa0247cefe5a0ecf275"
FEATURE_BRANCH="fix/technician-workflow-v1-1-completion"
WORK="/home/lightworld/releases/iassetspro-technician-workflow-v1-1"
APP_LINK="/home/lightworld/webapps/iassetspro"

ACTIVE="$(readlink -f "$APP_LINK")"
[[ -n "$ACTIVE" && -d "$ACTIVE/.git" ]] || { echo "STOP: active iAssetsPro release is not a Git checkout"; exit 1; }

echo "============================================================"
echo " iAssetsPro — TECHNICIAN WORKFLOW V1.1 COMPLETION"
echo "============================================================"
echo "Expected main: $EXPECTED_MAIN"
echo "Active release: $ACTIVE"
echo "Workspace: $WORK"

git -C "$ACTIVE" fetch origin main
MAIN_SHA="$(git -C "$ACTIVE" rev-parse origin/main)"
echo "origin/main: $MAIN_SHA"
[[ "$MAIN_SHA" == "$EXPECTED_MAIN" ]] || {
  echo "STOP: main moved. Expected $EXPECTED_MAIN but found $MAIN_SHA"
  exit 1
}

rm -rf "$WORK"
git clone --no-hardlinks --no-checkout "$ACTIVE" "$WORK"
git -C "$WORK" remote set-url origin "$(git -C "$ACTIVE" remote get-url origin)"
git -C "$WORK" fetch origin main
git -C "$WORK" checkout -B "$FEATURE_BRANCH" "$EXPECTED_MAIN"
cp -a "$ACTIVE/.env" "$WORK/.env"

# Reuse the already-installed dependency tree without mutating production dependencies.
if [[ -d "$ACTIVE/node_modules" ]]; then
  ln -s "$ACTIVE/node_modules" "$WORK/node_modules"
else
  echo "STOP: active release node_modules is unavailable; refusing a fresh install in this validation workspace."
  exit 1
fi

cd "$WORK"

echo "[1/6] Add scoped downtime API and integrated technician workspace panels"
mkdir -p 'src/app/api/work-orders/[id]/downtime'
cat > 'src/app/api/work-orders/[id]/downtime/route.ts' <<'TS'
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { buildAuditData } from '@/lib/audit-helpers';

const VALID_CATEGORIES = new Set(['planned', 'unplanned', 'partial']);
const VALID_IMPACT_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const IMMUTABLE_STATUSES = new Set(['verified', 'closed', 'cancelled']);

type AccessWorkOrder = {
  id: string;
  plantId: string | null;
  assetId: string | null;
  assetName: string | null;
  assignedTo: string | null;
  teamLeaderId: string | null;
  status: string;
  isLocked: boolean;
  teamMembers: Array<{ userId: string }>;
  maintenanceRequest: { requestedBy: string } | null;
};

function isOwnWorkOrder(wo: AccessWorkOrder, userId: string): boolean {
  return (
    wo.assignedTo === userId ||
    wo.teamLeaderId === userId ||
    wo.teamMembers.some((member) => member.userId === userId) ||
    wo.maintenanceRequest?.requestedBy === userId
  );
}

function isExecutionMember(wo: AccessWorkOrder, userId: string): boolean {
  return (
    wo.assignedTo === userId ||
    wo.teamLeaderId === userId ||
    wo.teamMembers.some((member) => member.userId === userId)
  );
}

async function loadWorkOrder(id: string): Promise<AccessWorkOrder | null> {
  return db.workOrder.findUnique({
    where: { id },
    select: {
      id: true,
      plantId: true,
      assetId: true,
      assetName: true,
      assignedTo: true,
      teamLeaderId: true,
      status: true,
      isLocked: true,
      teamMembers: { select: { userId: true } },
      maintenanceRequest: { select: { requestedBy: true } },
    },
  });
}

function parseDate(value: unknown, fallback?: Date): Date | null {
  if (value == null || value === '') return fallback ?? null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function durationMinutes(start: Date, end: Date | null): number {
  if (!end) return 0;
  return Math.max(0, Math.round(((end.getTime() - start.getTime()) / 60000) * 100) / 100);
}

async function authorizeRead(request: NextRequest, id: string) {
  const session = getSession(request);
  if (!session) return { ok: false as const, response: NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 }) };

  const plantAuth = await authorizeWorkOrderPlant(request, session, id);
  if (!plantAuth.ok) return { ok: false as const, response: plantAuth.response };

  const wo = await loadWorkOrder(id);
  if (!wo) return { ok: false as const, response: NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 }) };

  const canViewAll = isAdmin(session) || hasAnyPermission(session, ['work_orders.view', 'work_orders.view_all']);
  const canViewOwn = hasAnyPermission(session, ['work_orders.view_own']) && isOwnWorkOrder(wo, session.userId);
  if (!canViewAll && !canViewOwn) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 }) };
  }

  return { ok: true as const, session, wo };
}

async function authorizeWrite(request: NextRequest, id: string) {
  const read = await authorizeRead(request, id);
  if (!read.ok) return read;

  const canManage = isAdmin(read.session) || hasAnyPermission(read.session, ['work_orders.update']);
  if (!isExecutionMember(read.wo, read.session.userId) && !canManage) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: 'Only assigned execution staff or authorized maintenance management can record work-order downtime' }, { status: 403 }) };
  }

  if (read.wo.isLocked || IMMUTABLE_STATUSES.has(read.wo.status)) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: `Downtime cannot be changed for work order status: ${read.wo.status}` }, { status: 409 }) };
  }

  return read;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeRead(request, id);
    if (!auth.ok) return auth.response;

    const records = await db.workOrderDowntime.findMany({
      where: { workOrderId: id },
      include: { createdBy: { select: { id: true, fullName: true, username: true } } },
      orderBy: [{ downtimeStart: 'desc' }, { createdAt: 'desc' }],
    });

    const totalMinutes = records.reduce((sum, row) => sum + (row.durationMinutes || 0), 0);
    const ongoing = records.filter((row) => row.downtimeEnd == null).length;
    return NextResponse.json({
      success: true,
      data: records,
      summary: { totalRecords: records.length, ongoing, totalMinutes: Math.round(totalMinutes * 100) / 100 },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work-order downtime';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeWrite(request, id);
    if (!auth.ok) return auth.response;

    const body = await request.json() as Record<string, unknown>;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) {
      return NextResponse.json({ success: false, error: 'Downtime reason must be at least 3 characters' }, { status: 400 });
    }

    const category = typeof body.category === 'string' && VALID_CATEGORIES.has(body.category) ? body.category : 'unplanned';
    const impactLevel = typeof body.impactLevel === 'string' && VALID_IMPACT_LEVELS.has(body.impactLevel) ? body.impactLevel : 'medium';
    const start = parseDate(body.downtimeStart, new Date());
    const end = parseDate(body.downtimeEnd);
    if (!start) return NextResponse.json({ success: false, error: 'Invalid downtime start' }, { status: 400 });
    if (body.downtimeEnd && !end) return NextResponse.json({ success: false, error: 'Invalid downtime end' }, { status: 400 });
    if (end && end < start) return NextResponse.json({ success: false, error: 'Downtime end cannot be before start' }, { status: 400 });

    const rawLoss = body.productionLoss == null || body.productionLoss === '' ? null : Number(body.productionLoss);
    if (rawLoss != null && !Number.isFinite(rawLoss)) {
      return NextResponse.json({ success: false, error: 'productionLoss must be numeric' }, { status: 400 });
    }

    const record = await db.$transaction(async (tx) => {
      const created = await tx.workOrderDowntime.create({
        data: {
          workOrderId: id,
          assetId: auth.wo.assetId,
          assetName: auth.wo.assetName || 'Unspecified asset',
          downtimeStart: start,
          downtimeEnd: end,
          durationMinutes: durationMinutes(start, end),
          reason,
          category,
          impactLevel,
          productionLoss: rawLoss,
          notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
          plantId: auth.wo.plantId,
          createdById: auth.session.userId,
        },
        include: { createdBy: { select: { id: true, fullName: true, username: true } } },
      });

      await tx.auditLog.create({
        data: buildAuditData('create', 'wo_downtime', created.id, auth.session.userId, undefined, {
          workOrderId: id,
          downtimeStart: start.toISOString(),
          downtimeEnd: end?.toISOString() || null,
          durationMinutes: created.durationMinutes,
          reason,
          category,
          impactLevel,
          productionLoss: rawLoss,
        }),
      });
      return created;
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create work-order downtime';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeWrite(request, id);
    if (!auth.ok) return auth.response;

    const body = await request.json() as Record<string, unknown>;
    const recordId = typeof body.recordId === 'string' ? body.recordId : '';
    if (!recordId) return NextResponse.json({ success: false, error: 'recordId is required' }, { status: 400 });

    const existing = await db.workOrderDowntime.findFirst({ where: { id: recordId, workOrderId: id } });
    if (!existing) return NextResponse.json({ success: false, error: 'Downtime record not found' }, { status: 404 });
    if (existing.downtimeEnd) return NextResponse.json({ success: false, error: 'Downtime record is already ended' }, { status: 409 });

    const end = parseDate(body.downtimeEnd, new Date());
    if (!end) return NextResponse.json({ success: false, error: 'Invalid downtime end' }, { status: 400 });
    if (end < existing.downtimeStart) return NextResponse.json({ success: false, error: 'Downtime end cannot be before start' }, { status: 400 });

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.workOrderDowntime.update({
        where: { id: recordId },
        data: {
          downtimeEnd: end,
          durationMinutes: durationMinutes(existing.downtimeStart, end),
          ...(typeof body.notes === 'string' ? { notes: body.notes.trim() || existing.notes } : {}),
        },
        include: { createdBy: { select: { id: true, fullName: true, username: true } } },
      });
      await tx.auditLog.create({
        data: buildAuditData('update', 'wo_downtime', recordId, auth.session.userId,
          { downtimeEnd: null, durationMinutes: existing.durationMinutes },
          { downtimeEnd: end.toISOString(), durationMinutes: row.durationMinutes, workOrderId: id }),
      });
      return row;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to close work-order downtime';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
TS

cat > 'src/components/modules/TechnicianWorkOrderV11Panels.tsx' <<'TSX'
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
    const ok = await run('downtime', () => api.post(`/api/work-orders/${workOrderId}/downtime`, {
      reason: downtimeForm.reason.trim(),
      category: downtimeForm.category,
      impactLevel: downtimeForm.impactLevel,
      downtimeStart: new Date(downtimeForm.downtimeStart).toISOString(),
      downtimeEnd: downtimeForm.downtimeEnd ? new Date(downtimeForm.downtimeEnd).toISOString() : undefined,
      productionLoss: downtimeForm.productionLoss || undefined,
      notes: downtimeForm.notes.trim() || undefined,
    }), downtimeForm.downtimeEnd ? 'Downtime recorded' : 'Ongoing downtime started', false);
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

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2" aria-label="Work order lifecycle">
            {stages.map((stage, index) => (
              <button
                key={stage.anchor}
                type="button"
                onClick={() => document.getElementById(stage.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${index === stageIndex ? 'border-primary bg-primary/10' : index < stageIndex ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20' : 'hover:bg-muted/50'}`}
              >
                <div className="flex items-center gap-2">
                  {index < stageIndex ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : index === stageIndex ? <Activity className="h-4 w-4 text-primary" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-xs font-semibold">{stage.label}</span>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <section id="resources" className="scroll-mt-28 grid grid-cols-1 2xl:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" />Materials — Request & Status</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {capabilities?.canRequestMaterials && (
              <div className="grid sm:grid-cols-2 gap-2 rounded-lg border p-3">
                <div className="sm:col-span-2"><Label>Material / spare part *</Label><Input value={material.itemName} onChange={(e) => setMaterial((v) => ({ ...v, itemName: e.target.value }))} placeholder="Bearing 6205, V-belt, grease..." /></div>
                <div><Label>Quantity</Label><Input type="number" min="0.01" step="0.01" value={material.quantity} onChange={(e) => setMaterial((v) => ({ ...v, quantity: e.target.value }))} /></div>
                <div><Label>Unit</Label><Input value={material.unit} onChange={(e) => setMaterial((v) => ({ ...v, unit: e.target.value }))} /></div>
                <div><Label>Urgency</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={material.urgency} onChange={(e) => setMaterial((v) => ({ ...v, urgency: e.target.value }))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
                <div><Label>Reason *</Label><Input value={material.reason} onChange={(e) => setMaterial((v) => ({ ...v, reason: e.target.value }))} placeholder="Needed to complete repair" /></div>
                <Button className="sm:col-span-2 w-fit" variant="outline" onClick={requestMaterial} disabled={busy !== null}><Plus className="h-4 w-4 mr-1" />Request Material</Button>
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

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" />Tools — Request, Issue & Personal Tools</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {capabilities?.canRequestTools && (
              <div className="grid sm:grid-cols-2 gap-2 rounded-lg border p-3">
                <div className="sm:col-span-2"><Label>Tool required *</Label><Input value={toolRequest.toolName} onChange={(e) => setToolRequest((v) => ({ ...v, toolName: e.target.value }))} placeholder="Torque wrench, multimeter, puller..." /></div>
                <div><Label>Quantity</Label><Input type="number" min="1" step="1" value={toolRequest.quantity} onChange={(e) => setToolRequest((v) => ({ ...v, quantity: e.target.value }))} /></div>
                <div><Label>Urgency</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={toolRequest.urgency} onChange={(e) => setToolRequest((v) => ({ ...v, urgency: e.target.value }))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
                <div className="sm:col-span-2"><Label>Reason *</Label><Input value={toolRequest.reason} onChange={(e) => setToolRequest((v) => ({ ...v, reason: e.target.value }))} placeholder="Required for disassembly / testing..." /></div>
                <Button className="sm:col-span-2 w-fit" variant="outline" onClick={requestTool} disabled={busy !== null}><Plus className="h-4 w-4 mr-1" />Request Tool</Button>
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
              {canAddPersonalTool && <div className="grid sm:grid-cols-2 gap-2"><Input value={personalTool.toolName} onChange={(e) => setPersonalTool((v) => ({ ...v, toolName: e.target.value }))} placeholder="Tool name" /><Input value={personalTool.toolCode} onChange={(e) => setPersonalTool((v) => ({ ...v, toolCode: e.target.value }))} placeholder="Tool code (optional)" /><select className="h-10 rounded-md border bg-background px-3 text-sm" value={personalTool.condition} onChange={(e) => setPersonalTool((v) => ({ ...v, condition: e.target.value }))}><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option></select><Button variant="outline" onClick={addPersonalTool} disabled={busy !== null || personalTool.toolName.trim().length < 2}>Record Tool Used</Button></div>}
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
            <div className="space-y-2">{downtime.length === 0 ? <p className="text-sm text-muted-foreground">No downtime recorded for this work order.</p> : downtime.slice(0, 8).map((row: any) => <div key={row.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-medium">{row.reason}</p><p className="text-xs text-muted-foreground">{pretty(row.category)} · {pretty(row.impactLevel)} · {fmt(row.downtimeStart)}</p></div>{row.downtimeEnd ? <Badge variant="outline">{minutesLabel(row.durationMinutes)}</Badge> : <Button size="sm" variant="outline" onClick={() => endDowntime(row.id)} disabled={busy !== null}><XCircle className="h-3.5 w-3.5 mr-1" />End Downtime</Button>}</div></div>)}</div>
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
TSX

echo "[2/6] Patch capability contract and full-page lifecycle anchors"
python3 - <<'PY'
from pathlib import Path

cap_path = Path('src/app/api/work-orders/[id]/capabilities/route.ts')
cap = cap_path.read_text()
repls = [
    ("import { getSession, isAdmin } from '@/lib/auth';", "import { getSession, isAdmin, hasPermission } from '@/lib/auth';"),
    ("    const hasMultipleTeamMembers = (wo.teamMembers?.length ?? 0) > 1;\n", "    const hasMultipleTeamMembers = (wo.teamMembers?.length ?? 0) > 1;\n    const canCreateToolRequest = isAdminAccount || hasPermission(session, 'repair_tool_requests.create');\n"),
    ("      canRequestTools: (isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status),", "      canRequestTools: (isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status) && canCreateToolRequest,"),
    ("      canRequestMaterials: (isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status),", "      canRequestMaterials: (isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status),\n      canLogDowntime: ((isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status)) || isSupervisor || isPlanner || isExecutionManager,"),
]
for old, new in repls:
    if cap.count(old) != 1:
        raise SystemExit(f'STOP: capability anchor mismatch: {old[:80]!r} count={cap.count(old)}')
    cap = cap.replace(old, new, 1)
cap_path.write_text(cap)

page_path = Path('src/components/modules/TechnicianWorkOrderPage.tsx')
page = page_path.read_text()
repls = [
    ("import { Separator } from '@/components/ui/separator';\n", "import { Separator } from '@/components/ui/separator';\nimport { TechnicianWorkOrderV11Panels } from './TechnicianWorkOrderV11Panels';\n"),
    ("  canResume: boolean;\n  resumeOpensExecutionSession: boolean;\n", "  canResume: boolean;\n  resumeOpensExecutionSession: boolean;\n  canLogOwnTime: boolean;\n  canLogTeamTime: boolean;\n  canLogDowntime: boolean;\n"),
    ('        <Card className="border-sky-200 bg-sky-50/50 dark:bg-sky-950/20">', '        <Card id="assignment" className="scroll-mt-28 border-sky-200 bg-sky-50/50 dark:bg-sky-950/20">'),
    ("      <div className=\"grid grid-cols-1 xl:grid-cols-3 gap-5\">", "      <TechnicianWorkOrderV11Panels workOrderId={id} workOrder={wo} capabilities={caps} onChanged={load} />\n\n      <div className=\"grid grid-cols-1 xl:grid-cols-3 gap-5\">"),
    ("          <Card>\n            <CardHeader><CardTitle className=\"text-base flex items-center gap-2\"><Wrench className=\"h-4 w-4\" />Work Order & Problem</CardTitle></CardHeader>", "          <Card id=\"preparation\" className=\"scroll-mt-28\">\n            <CardHeader><CardTitle className=\"text-base flex items-center gap-2\"><Wrench className=\"h-4 w-4\" />Work Order & Problem</CardTitle></CardHeader>"),
    ("          <Card>\n            <CardHeader><CardTitle className=\"text-base flex items-center gap-2\"><Save className=\"h-4 w-4\" />Execution Report</CardTitle></CardHeader>", "          <Card id=\"execution\" className=\"scroll-mt-28\">\n            <CardHeader><CardTitle className=\"text-base flex items-center gap-2\"><Save className=\"h-4 w-4\" />Execution Report</CardTitle></CardHeader>"),
    ("          <Card>\n            <CardHeader><CardTitle className=\"text-base flex items-center gap-2\"><Camera className=\"h-4 w-4\" />Photos & Evidence", "          <Card id=\"evidence\" className=\"scroll-mt-28\">\n            <CardHeader><CardTitle className=\"text-base flex items-center gap-2\"><Camera className=\"h-4 w-4\" />Photos & Evidence"),
    ("            <Card className=\"border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10\">\n              <CardHeader><CardTitle className=\"text-base flex items-center gap-2\"><CheckCircle2", "            <Card id=\"completion\" className=\"scroll-mt-28 border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10\">\n              <CardHeader><CardTitle className=\"text-base flex items-center gap-2\"><CheckCircle2"),
]
for old, new in repls:
    if page.count(old) != 1:
        raise SystemExit(f'STOP: page anchor mismatch: {old[:100]!r} count={page.count(old)}')
    page = page.replace(old, new, 1)
page_path.write_text(page)
PY

echo "[3/6] Add V1.1 regression contracts"
cat > 'src/__tests__/work-orders/technician-workflow-v11-contract.test.ts' <<'TEST'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('technician workflow V1.1 completion contract', () => {
  it('uses a lifecycle-oriented full-page workspace', () => {
    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(page).toContain('TechnicianWorkOrderV11Panels');
    expect(page).toContain('id="assignment"');
    expect(page).toContain('id="preparation"');
    expect(page).toContain('id="execution"');
    expect(page).toContain('id="evidence"');
    expect(page).toContain('id="completion"');
    for (const label of ['Assignment', 'Preparation', 'Execution', 'Resources', 'Evidence', 'Completion']) {
      expect(panel).toContain(`label: '${label}'`);
    }
    expect(panel).toContain('grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6');
    expect(panel).toContain('grid grid-cols-1 2xl:grid-cols-2');
  });

  it('integrates materials, tools and personal tools in the technician workspace', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(panel).toContain(`/api/work-orders/${workOrderId}/materials`);
    expect(panel).toContain("api.post('/api/repairs/tool-requests'");
    expect(panel).toContain(`/api/work-orders/${workOrderId}/personal-tools`);
    expect(panel).toContain('Materials — Request & Status');
    expect(panel).toContain('Tools — Request, Issue & Personal Tools');
  });

  it('provides work-order-scoped downtime capture with authorization and audit', () => {
    const route = read('src/app/api/work-orders/[id]/downtime/route.ts');
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(route).toContain('authorizeWorkOrderPlant');
    expect(route).toContain('isExecutionMember');
    expect(route).toContain("entityType: 'wo_downtime'");
    expect(route).toContain('workOrderDowntime.create');
    expect(route).toContain('workOrderDowntime.update');
    expect(panel).toContain(`/api/work-orders/${workOrderId}/downtime`);
    expect(panel).toContain('Start Downtime');
    expect(panel).toContain('End Downtime');
  });

  it('embeds labor history without reviving stale live /time-logs writes', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(panel).toContain(`/api/work-orders/${workOrderId}/time-logs`);
    expect(panel).toContain('Labor & Time History');
    expect(panel).not.toContain("api.post(`/api/work-orders/${workOrderId}/time-logs`");
    expect(panel).not.toContain("api.patch(`/api/work-orders/${workOrderId}/time-logs`");
  });

  it('keeps tool request UI aligned with endpoint permission and exposes downtime capability', () => {
    const caps = read('src/app/api/work-orders/[id]/capabilities/route.ts');
    expect(caps).toContain("hasPermission(session, 'repair_tool_requests.create')");
    expect(caps).toContain('canCreateToolRequest');
    expect(caps).toContain('canLogDowntime:');
  });
});
TEST

echo "[4/6] Static validation and focused tests"
git diff --check
bun test \
  src/__tests__/work-orders/technician-workflow-contract.test.ts \
  src/__tests__/work-orders/technician-workflow-v11-contract.test.ts

echo "[5/6] Repairs TypeScript and production build"
bunx tsc -p tsconfig.repairs.json --noEmit
bun run build

echo "[6/6] Commit and push feature branch"
# Remove the dependency symlink from the workspace after validation; it is ignored by Git.
rm -f node_modules

git status --short
git add \
  'src/app/api/work-orders/[id]/downtime/route.ts' \
  'src/app/api/work-orders/[id]/capabilities/route.ts' \
  'src/components/modules/TechnicianWorkOrderPage.tsx' \
  'src/components/modules/TechnicianWorkOrderV11Panels.tsx' \
  'src/__tests__/work-orders/technician-workflow-v11-contract.test.ts'

git commit -m "Complete technician work order workspace V1.1"
git push -u origin "$FEATURE_BRANCH"

FEATURE_SHA="$(git rev-parse HEAD)"
echo "============================================================"
echo " iAssetsPro TECHNICIAN WORKFLOW V1.1 COMPLETED AND PUSHED"
echo "============================================================"
echo "$FEATURE_SHA"
df -h /
