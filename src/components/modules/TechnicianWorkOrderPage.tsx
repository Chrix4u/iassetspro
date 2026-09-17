'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft, Play, Pause, CheckCircle2, XCircle, Clock3, Wrench, Package,
  Users, ShieldAlert, ClipboardList, MessageSquare, Loader2, AlertTriangle,
  RotateCcw, Save, ChevronRight, CalendarDays, UserRound, TimerReset,
  Paperclip, Upload, UserPlus, ArrowRightLeft, Camera,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useNavigationStore } from '@/stores/navigationStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { TechnicianWorkOrderV11Panels } from './TechnicianWorkOrderV11Panels';

type ReadinessItem = {
  code: string;
  category: string;
  message: string;
  severity: 'blocker' | 'warning';
};

interface Capabilities {
  canAcceptAssignment: boolean;
  canDeclineAssignment: boolean;
  assignmentResponseStatus: 'pending' | 'accepted' | 'declined';
  assignmentRespondedAt?: string | null;
  assignmentResponseReason?: string | null;
  canStart: boolean;
  startReadiness?: {
    ready: boolean;
    blockers: ReadinessItem[];
    warnings: ReadinessItem[];
  } | null;
  canResume: boolean;
  resumeOpensExecutionSession: boolean;
  canLogOwnTime: boolean;
  canLogTeamTime: boolean;
  canLogDowntime: boolean;
  canRequestTools: boolean;
  canRequestMaterials: boolean;
  canRequestAssistance: boolean;
  canHandover: boolean;
  canSubmitCompletion: boolean;
  canVerify: boolean;
  canClose: boolean;
  hasActiveExecutionSession: boolean;
  isTeamLeader: boolean;
  isTeamMember: boolean;
  isSupervisor: boolean;
  isPlanner: boolean;
  isAdmin: boolean;
}

type Task = {
  id: string;
  taskNumber: number;
  description: string;
  taskType: string;
  status: string;
  findings?: string | null;
  notes?: string | null;
  completedBy?: { fullName?: string } | null;
};

const WAITING_STATUSES = ['waiting_parts', 'waiting_tools', 'waiting_shutdown', 'waiting_permit'];
const TECHNICIAN_HIDDEN_PROFILE_WARNING_CODES = new Set([
  'TECH_ELIG_TRADE_MISMATCH',
  'TECH_ELIG_NO_SKILL_RECORD',
  'TECH_ELIG_NO_CERTIFICATION',
]);

function pretty(value?: string | null) {
  if (!value) return '-';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function formatTimer(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function currentShift(): 'morning' | 'afternoon' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'morning';
  if (hour >= 14 && hour < 22) return 'afternoon';
  return 'night';
}

function nextShift(shift: 'morning' | 'afternoon' | 'night'): 'morning' | 'afternoon' | 'night' {
  return shift === 'morning' ? 'afternoon' : shift === 'afternoon' ? 'night' : 'morning';
}

function errorText(res: any) {
  const blockers = Array.isArray(res?.blockers) ? res.blockers.map((b: any) => b.message).filter(Boolean) : [];
  return [res?.error, ...blockers].filter(Boolean).join(' — ') || 'Action failed';
}

export function TechnicianWorkOrderPage() {
  const pageParams = useNavigationStore((s) => s.pageParams);
  const navigate = useNavigationStore((s) => s.navigate);
  const goBack = useNavigationStore((s) => s.goBack);
  const user = useAuthStore((s) => s.user);
  const id = pageParams?.id;

  const [wo, setWo] = useState<any>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [declineMode, setDeclineMode] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [pauseReason, setPauseReason] = useState('Break / temporary pause');
  const [waitingTarget, setWaitingTarget] = useState('waiting_parts');
  const [waitingReason, setWaitingReason] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [failureDescription, setFailureDescription] = useState('');
  const [causeDescription, setCauseDescription] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [comment, setComment] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [measurement, setMeasurement] = useState({ componentId: '', parameterKey: '', value: '', unit: '' });
  const [measurementOptions, setMeasurementOptions] = useState<any[]>([]);
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [evidenceInputKey, setEvidenceInputKey] = useState(0);
  const [assistanceTrade, setAssistanceTrade] = useState('');
  const [assistanceReason, setAssistanceReason] = useState('');
  const [assistanceRequests, setAssistanceRequests] = useState<any[]>([]);
  const [availableAssistanceSkills, setAvailableAssistanceSkills] = useState<string[]>([]);
  const [editingAssistanceId, setEditingAssistanceId] = useState<string | null>(null);
  const initialShift = currentShift();
  const [handoverUsers, setHandoverUsers] = useState<any[]>([]);
  const [handoverReceiverId, setHandoverReceiverId] = useState('');
  const [handoverReason, setHandoverReason] = useState('Shift change');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [handoverFromShift, setHandoverFromShift] = useState<'morning' | 'afternoon' | 'night'>(initialShift);
  const [handoverToShift, setHandoverToShift] = useState<'morning' | 'afternoon' | 'night'>(nextShift(initialShift));

  const load = useCallback(async () => {
    if (!id) return;
    const [woRes, capRes, taskRes, measurementRes, attachmentRes, assistanceRes, workerRes] = await Promise.all([
      api.get(`/api/work-orders/${id}`),
      api.get(`/api/work-orders/${id}/capabilities`),
      api.get(`/api/work-orders/${id}/tasks`),
      api.get(`/api/work-orders/${id}/measurements`),
      api.get(`/api/work-orders/${id}/attachments`),
      api.get(`/api/work-orders/${id}/team-member-requests`),
      api.get('/api/workers?role=technician'),
    ]);
    if (!woRes.success || !woRes.data) {
      toast.error(woRes.error || 'Unable to load work order');
      setLoading(false);
      return;
    }
    setWo(woRes.data);
    setFailureDescription(woRes.data.failureDescription || '');
    setCauseDescription(woRes.data.causeDescription || '');
    setActionDescription(woRes.data.actionDescription || '');
    if (capRes.success && capRes.data) setCaps(capRes.data as Capabilities);
    if (taskRes.success && Array.isArray(taskRes.data)) setTasks(taskRes.data as Task[]);
    if (measurementRes.success) {
      if (Array.isArray(measurementRes.data)) setMeasurements(measurementRes.data);
      const options = Array.isArray((measurementRes as any).options)
        ? (measurementRes as any).options.filter((option: any) => option?.parameterKey && option?.unit && option?.selectable !== false)
        : [];
      setMeasurementOptions(options);
      if (options.length === 1) {
        const only = options[0];
        setMeasurement((current) => ({ ...current, componentId: only.componentId, parameterKey: only.parameterKey, unit: only.unit || '' }));
      }
    }
    if (attachmentRes.success && Array.isArray(attachmentRes.data)) setAttachments(attachmentRes.data);
    if (assistanceRes.success && Array.isArray(assistanceRes.data)) setAssistanceRequests(assistanceRes.data);
    if (workerRes.success && Array.isArray(workerRes.data)) {
      const distinct = new Map<string, string>();
      workerRes.data.forEach((worker: any) => {
        const primaryTrade = String(worker.trade || '').trim();
        if (primaryTrade) distinct.set(primaryTrade.toLowerCase(), primaryTrade);
        (worker.skills || []).forEach((skill: any) => {
          const label = String(skill.name || skill.code || '').trim();
          if (label) distinct.set(label.toLowerCase(), label);
        });
      });
      setAvailableAssistanceSkills(Array.from(distinct.values()).sort((a, b) => a.localeCompare(b)));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!caps?.canHandover) { setHandoverUsers([]); return; }
    let active = true;
    api.get<any[]>('/api/users?role=maintenance_technician&status=active').then((res) => {
      if (!active || !res.success || !Array.isArray(res.data)) return;
      const options = res.data.filter((candidate: any) => {
        if (candidate.id === user?.id) return false;
        if (!wo?.plantId) return true;
        return Array.isArray(candidate.plants) && candidate.plants.some((plant: any) => plant.id === wo.plantId);
      });
      setHandoverUsers(options);
    });
    return () => { active = false; };
  }, [caps?.canHandover, user?.id, wo?.plantId]);

  const liveLog = useMemo(() => {
    if (!wo || !user) return null;
    return (wo.timeLogs || []).find((log: any) =>
      log.userId === user.id && ['start', 'resume'].includes(log.action) && !log.endTime,
    ) || null;
  }, [wo, user]);

  useEffect(() => {
    if (!liveLog) { setElapsed(0); return; }
    const start = new Date(liveLog.startTime || liveLog.timestamp).getTime();
    const tick = () => setElapsed((Date.now() - start) / 1000);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [liveLog]);

  const perform = async (key: string, fn: () => Promise<any>, success: string) => {
    setBusy(key);
    try {
      const res = await fn();
      if (!res.success) { toast.error(errorText(res)); return false; }
      toast.success(success);
      await load();
      return true;
    } finally {
      setBusy(null);
    }
  };

  const respondAssignment = async (response: 'accepted' | 'declined') => {
    if (!id) return;
    const ok = await perform(
      `assignment-${response}`,
      () => api.post(`/api/work-orders/${id}/assignment-response`, {
        response,
        ...(response === 'declined' ? { reason: declineReason } : {}),
      }),
      response === 'accepted' ? 'Assignment accepted. Review the job and start when ready.' : 'Assignment declined and returned for reassignment.',
    );
    if (ok) { setDeclineMode(false); setDeclineReason(''); }
  };

  const startWork = () => id && perform('start', () => api.post(`/api/work-orders/${id}/start`, { notes: wo?.actualStart ? 'Technician resumed work' : 'Technician started work' }), wo?.actualStart ? 'Work resumed — timer running' : 'Work started — timer running');

  const pauseWork = () => id && perform('pause', () => api.post(`/api/work-orders/${id}/pause-session`, { reason: pauseReason }), 'Execution timer paused');

  const moveToWaiting = () => {
    if (!id) return;
    if (waitingReason.trim().length < 3) { toast.error('Enter a reason for the waiting state'); return; }
    perform('waiting', () => api.post(`/api/work-orders/${id}/execution-state`, {
      action: 'wait', targetStatus: waitingTarget, reason: waitingReason.trim(),
    }), `Work order moved to ${pretty(waitingTarget)}`);
  };

  const resumeWaiting = () => id && perform(
    'resume-waiting',
    () => api.post(`/api/work-orders/${id}/execution-state`, { action: 'resume', reason: 'Execution state released/resumed' }),
    caps?.resumeOpensExecutionSession
      ? 'Work resumed — timer running'
      : 'Work order released to In Progress — assigned technician must start execution',
  );

  const saveExecution = () => id && perform('save-execution', () => api.patch(`/api/work-orders/${id}/execution-details`, {
    failureDescription, causeDescription, actionDescription,
  }), 'Execution report saved');

  const updateTask = (task: Task, status: string) => id && perform(`task-${task.id}`, () => api.patch(`/api/work-orders/${id}/tasks/${task.id}`, { status }), 'Task updated');

  const addComment = async () => {
    if (!id || !comment.trim()) return;
    const ok = await perform('comment', () => api.post(`/api/work-orders/${id}/comments`, { content: comment.trim() }), 'Note added');
    if (ok) setComment('');
  };

  const addMeasurement = async () => {
    if (!id || !measurement.componentId || !measurement.parameterKey || !measurement.value.trim()) {
      toast.error('Select a configured measurement point and enter a value'); return;
    }
    const value = Number(measurement.value);
    if (!Number.isFinite(value)) { toast.error('Measurement value must be numeric'); return; }
    const ok = await perform('measurement', () => api.post(`/api/work-orders/${id}/measurements`, {
      componentId: measurement.componentId, parameterKey: measurement.parameterKey, value,
    }), 'Measurement recorded');
    if (ok) setMeasurement((current) => ({ ...current, value: '' }));
  };

  const uploadEvidence = async () => {
    if (!id || !evidenceFile) { toast.error('Choose a photo or file first'); return; }
    const maxBytes = 50 * 1024 * 1024;
    if (evidenceFile.size > maxBytes) { toast.error('Evidence file must be 50 MB or smaller'); return; }
    const form = new FormData();
    form.append('file', evidenceFile);
    form.append('category', 'technician_evidence');
    if (evidenceDescription.trim()) form.append('description', evidenceDescription.trim());
    const ok = await perform('evidence', () => api.post(`/api/work-orders/${id}/attachments`, form, { timeout: 60_000 }), 'Evidence uploaded');
    if (ok) {
      setEvidenceFile(null);
      setEvidenceDescription('');
      setEvidenceInputKey((value) => value + 1);
    }
  };

  const openAttachment = async (attachmentId: string) => {
    if (!id) return;
    setBusy(`open-${attachmentId}`);
    try {
      const res = await api.getRaw(`/api/work-orders/${id}/attachments/${attachmentId}`);
      if (!res.ok) { toast.error('Unable to open evidence file'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(null);
    }
  };

  const saveAssistanceRequest = async () => {
    if (!id || assistanceTrade.trim().length < 2) { toast.error('Select the trade or skill required'); return; }
    if (assistanceReason.trim().length < 3) { toast.error('Explain why assistance is needed'); return; }
    const body = { requestedTrade: assistanceTrade.trim(), role: 'assistant', reason: assistanceReason.trim() };
    const ok = await perform(
      'assistance',
      () => editingAssistanceId
        ? api.patch(`/api/work-orders/${id}/team-member-requests/${editingAssistanceId}`, body)
        : api.post(`/api/work-orders/${id}/team-member-requests`, body),
      editingAssistanceId ? 'Assistance request updated' : 'Assistance request sent to planner',
    );
    if (ok) { setAssistanceTrade(''); setAssistanceReason(''); setEditingAssistanceId(null); }
  };

  const cancelAssistanceRequest = (requestId: string) => id && perform(
    `cancel-assistance-${requestId}`,
    () => api.delete(`/api/work-orders/${id}/team-member-requests/${requestId}`),
    'Assistance request cancelled',
  );

  const submitHandover = async () => {
    if (!id || !handoverReceiverId) { toast.error('Select the incoming technician'); return; }
    if (handoverReason.trim().length < 3) { toast.error('Enter a handover reason'); return; }
    const pendingTasks = tasks.filter((task) => task.status !== 'completed').map((task) => ({ task: task.description, status: task.status }));
    const ok = await perform('handover', () => api.post(`/api/work-orders/${id}/handover`, {
      receivedById: handoverReceiverId,
      reason: handoverReason.trim(),
      shiftType: handoverFromShift,
      shiftDate: new Date().toISOString(),
      fromShift: handoverFromShift,
      toShift: handoverToShift,
      tasksSummary: pendingTasks,
      pendingIssues: handoverNotes.trim() || undefined,
      safetyNotes: wo?.safetyNotes || undefined,
      notes: handoverNotes.trim() || handoverReason.trim(),
      idempotencyKey: `handover-${id}-${user?.id || 'user'}-${Date.now()}`,
    }), 'Shift handover submitted and live work timers stopped');
    if (ok) { setHandoverReceiverId(''); setHandoverNotes(''); }
  };

  const submitCompletion = () => {
    if (!id) return;
    if (!completionNotes.trim()) { toast.error('Completion notes are required'); return; }
    perform('complete', () => api.post(`/api/work-orders/${id}/complete`, {
      notes: completionNotes.trim(),
      failureDescription: failureDescription.trim() || undefined,
      causeDescription: causeDescription.trim() || undefined,
      actionDescription: actionDescription.trim() || undefined,
    }), 'Completion submitted for supervisor review');
  };

  const reviewAction = (kind: 'verify' | 'close') => id && perform(kind, () => api.post(`/api/work-orders/${id}/${kind}`, { notes: kind === 'verify' ? 'Supervisor verified completed work' : 'Planner closed verified work' }), kind === 'verify' ? 'Work order verified' : 'Work order closed');

  if (!id) return <div className="p-6"><Card><CardContent className="p-6">No work order selected.</CardContent></Card></div>;
  if (loading) return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading work order workspace...</div>;
  if (!wo) return <div className="p-6">Work order could not be loaded.</div>;

  const assignmentStatus = caps?.assignmentResponseStatus || wo.assignmentResponseStatus || 'pending';
  const inWaitingState = WAITING_STATUSES.includes(wo.status) || wo.status === 'on_hold';
  const taskDone = tasks.filter((t) => t.status === 'completed').length;
  const taskProgress = tasks.length ? Math.round((taskDone / tasks.length) * 100) : 0;
  const startReadiness = caps?.startReadiness || null;
  const startBlockers = startReadiness?.blockers || [];
  const startWarnings = (startReadiness?.warnings || []).filter(
  (item) => !TECHNICIAN_HIDDEN_PROFILE_WARNING_CODES.has(item.code),
);
  const startBlocked = Boolean(caps?.canStart && startReadiness && !startReadiness.ready);

  return (
    <div className="space-y-5 pb-12">
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-b">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <button onClick={goBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"><ArrowLeft className="h-3.5 w-3.5" />Back to work orders</button>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-semibold text-muted-foreground">{wo.woNumber}</span>
              <Badge variant="outline">{pretty(wo.status)}</Badge>
              <Badge variant={wo.priority === 'critical' || wo.priority === 'emergency' ? 'destructive' : 'secondary'}>{pretty(wo.priority)}</Badge>
              {assignmentStatus === 'accepted' && <Badge className="bg-emerald-600">Assignment Accepted</Badge>}
              {assignmentStatus === 'declined' && <Badge variant="destructive">Assignment Declined</Badge>}
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold truncate mt-1">{wo.title}</h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {liveLog && (
              <div className="rounded-xl border bg-emerald-50 px-4 py-2 dark:bg-emerald-950/30">
                <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Live work timer</div>
                <div className="font-mono text-xl font-bold text-emerald-700 dark:text-emerald-300">{formatTimer(elapsed)}</div>
              </div>
            )}
            {caps?.canStart && !liveLog && <Button onClick={startWork} disabled={busy !== null || startBlocked} title={startBlockers[0]?.message} className="bg-emerald-600 hover:bg-emerald-700"><Play className="h-4 w-4 mr-1" />{wo.actualStart ? 'Resume Work' : 'Start Work'}</Button>}
            {liveLog && <Button variant="outline" onClick={pauseWork} disabled={busy !== null}><Pause className="h-4 w-4 mr-1" />Pause Timer</Button>}
            {caps?.canResume && inWaitingState && <Button onClick={resumeWaiting} disabled={busy !== null}><RotateCcw className="h-4 w-4 mr-1" />{caps.resumeOpensExecutionSession ? 'Resume Work' : 'Release to In Progress'}</Button>}
          </div>
        </div>
      </div>

      {caps?.canStart && startReadiness && !liveLog && (
        <div className={`rounded-xl border p-4 text-sm ${startBlocked ? 'border-red-200 bg-red-50 text-red-800 dark:bg-red-950/20 dark:text-red-300' : startWarnings.length ? 'border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300'}`}>
          <div className="flex items-start gap-2">
            {startBlocked || startWarnings.length ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <div className="min-w-0">
              <p className="font-semibold">{startBlocked ? 'Start blocked — resolve readiness items first' : startWarnings.length ? 'Ready to start with warnings' : 'Ready to start'}</p>
              {startBlockers.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{startBlockers.map((item) => <li key={item.code}>{item.message}</li>)}</ul>}
              {startWarnings.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{startWarnings.map((item) => <li key={item.code}>{item.message}</li>)}</ul>}
            </div>
          </div>
        </div>
      )}

      <div id="assignment" className="scroll-mt-28" aria-hidden="true" />

      {wo.status === 'assigned' && assignmentStatus === 'pending' && (caps?.canAcceptAssignment || caps?.canDeclineAssignment) && (
        <Card className="border-sky-200 bg-sky-50/50 dark:bg-sky-950/20">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">New work order assignment</p>
                <p className="text-sm text-muted-foreground mt-1">Review the job, safety requirements, planned resources and schedule before accepting. Accepting does not start labor time.</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {caps.canAcceptAssignment && <Button onClick={() => respondAssignment('accepted')} disabled={busy !== null} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4 mr-1" />Accept Assignment</Button>}
                {caps.canDeclineAssignment && <Button variant="destructive" onClick={() => setDeclineMode(true)} disabled={busy !== null}><XCircle className="h-4 w-4 mr-1" />Decline</Button>}
              </div>
            </div>
            {declineMode && (
              <div className="mt-4 grid gap-2 max-w-2xl">
                <Label>Reason for declining *</Label>
                <Textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Example: incorrect trade assignment, unavailable, safety qualification required..." />
                <div className="flex gap-2"><Button variant="outline" onClick={() => setDeclineMode(false)}>Cancel</Button><Button variant="destructive" disabled={declineReason.trim().length < 5 || busy !== null} onClick={() => respondAssignment('declined')}>Confirm Decline</Button></div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {assignmentStatus === 'declined' && wo.status === 'assigned' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/20 dark:text-red-300">
          <strong>Awaiting reassignment.</strong> {caps?.assignmentResponseReason || wo.assignmentResponseReason || 'This assignment was declined.'}
        </div>
      )}

      <TechnicianWorkOrderV11Panels workOrderId={id} workOrder={wo} capabilities={caps} onChanged={load} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <Card id="preparation" className="scroll-mt-28">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" />Work Order & Problem</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Asset / Machine</p><p className="font-medium">{wo.assetName || wo.maintenanceRequest?.asset?.name || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{wo.maintenanceRequest?.location || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">Type</p><p className="font-medium">{pretty(wo.type)}</p></div>
                <div><p className="text-xs text-muted-foreground">Trade</p><p className="font-medium">{pretty(wo.tradeActivity)}</p></div>
                <div><p className="text-xs text-muted-foreground">Estimated Time</p><p className="font-medium">{wo.estimatedHours ? `${wo.estimatedHours} h` : '-'}</p></div>
              </div>
              <Separator />
              <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Problem / Scope</p><p className="mt-1 whitespace-pre-wrap text-sm">{wo.description || wo.maintenanceRequest?.description || 'No description provided.'}</p></div>
              {wo.notes && <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs font-medium">Planner / Work Order Notes</p><p className="text-sm mt-1 whitespace-pre-wrap">{wo.notes}</p></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" />Task Checklist <Badge variant="outline">{taskDone}/{tasks.length} · {taskProgress}%</Badge></CardTitle></CardHeader>
            <CardContent>
              {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No task checklist has been added to this work order.</p> : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-3 rounded-lg border p-3">
                      <button disabled={busy !== null} onClick={() => updateTask(task, task.status === 'completed' ? 'pending' : 'completed')} className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center ${task.status === 'completed' ? 'bg-emerald-600 border-emerald-600 text-white' : ''}`}>{task.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5" />}</button>
                      <div className="min-w-0 flex-1"><p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>{task.taskNumber}. {task.description}</p><p className="text-xs text-muted-foreground mt-0.5">{pretty(task.taskType)} · {pretty(task.status)}</p>{task.findings && <p className="text-xs mt-1">Finding: {task.findings}</p>}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="execution" className="scroll-mt-28">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Save className="h-4 w-4" />Execution Report</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Findings / Failure Description</Label><Textarea className="mt-1" rows={3} value={failureDescription} onChange={(e) => setFailureDescription(e.target.value)} placeholder="What did you find during inspection and repair?" /></div>
              <div><Label>Root Cause</Label><Textarea className="mt-1" rows={3} value={causeDescription} onChange={(e) => setCauseDescription(e.target.value)} placeholder="What caused the problem?" /></div>
              <div><Label>Corrective Action / Work Performed</Label><Textarea className="mt-1" rows={4} value={actionDescription} onChange={(e) => setActionDescription(e.target.value)} placeholder="Describe repairs, adjustments, replacements and tests performed..." /></div>
              <Button variant="outline" onClick={saveExecution} disabled={busy !== null || assignmentStatus !== 'accepted'}><Save className="h-4 w-4 mr-1" />Save Progress</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TimerReset className="h-4 w-4" />Measurements & Readings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {measurementOptions.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                  No configured measurement points are available for this work order. A planner or supervisor must link the relevant component and configure its measurement inspection points before a technician can record readings.
                </div>
              ) : (
                <div className="grid sm:grid-cols-4 gap-2">
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm sm:col-span-2"
                    value={measurement.componentId && measurement.parameterKey ? `${measurement.componentId}::${measurement.parameterKey}` : ''}
                    onChange={(e) => {
                      const selected = measurementOptions.find((option: any) => `${option.componentId}::${option.parameterKey}` === e.target.value);
                      setMeasurement((current) => ({
                        ...current,
                        componentId: selected?.componentId || '',
                        parameterKey: selected?.parameterKey || '',
                        unit: selected?.unit || '',
                      }));
                    }}
                  >
                    <option value="">Select configured measurement...</option>
                    {measurementOptions.map((option: any) => (
                      <option key={`${option.componentId}-${option.inspectionPointId || option.parameterKey}`} value={`${option.componentId}::${option.parameterKey}`}>
                        {option.componentName || 'Component'} · {option.label || option.parameterKey} ({option.unit})
                      </option>
                    ))}
                  </select>
                  <Input placeholder="Value" value={measurement.value} onChange={(e) => setMeasurement((m) => ({ ...m, value: e.target.value }))} />
                  <div className="flex gap-2"><Input aria-label="Measurement unit" className="bg-muted/40" value={measurement.unit} readOnly placeholder="Unit" /><Button variant="outline" onClick={addMeasurement} disabled={busy !== null || !measurement.componentId || !measurement.parameterKey}>Record</Button></div>
                </div>
              )}
              {measurements.length > 0 && <div className="grid sm:grid-cols-2 gap-2">{measurements.slice(0, 6).map((m: any) => <div key={m.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between gap-2"><span className="font-medium">{m.parameterKey}</span><span className={m.isAlarm ? 'text-red-600 font-semibold' : ''}>{m.value} {m.unit}</span></div><p className="text-xs text-muted-foreground mt-1">{m.component?.name || 'Linked component'} · {formatDate(m.recordedAt)}</p></div>)}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" />Work Notes & Communication</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2"><Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a work note, observation or message..." onKeyDown={(e) => { if (e.key === 'Enter') addComment(); }} /><Button variant="outline" onClick={addComment} disabled={busy !== null || !comment.trim()}>Add Note</Button></div>
              {(wo.comments || []).slice(0, 6).map((c: any) => <div key={c.id} className="rounded-lg bg-muted/40 p-3 text-sm"><div className="flex justify-between gap-3 text-xs text-muted-foreground"><span>{c.user?.fullName || 'User'}</span><span>{formatDate(c.createdAt)}</span></div><p className="mt-1 whitespace-pre-wrap">{c.content}</p></div>)}
            </CardContent>
          </Card>


          <Card id="evidence" className="scroll-mt-28">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Camera className="h-4 w-4" />Photos & Evidence <Badge variant="outline">{attachments.length}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <Input key={evidenceInputKey} type="file" accept="image/*,application/pdf,text/plain,text/csv" onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)} />
                <Input value={evidenceDescription} onChange={(e) => setEvidenceDescription(e.target.value)} placeholder="Evidence description (optional)" />
                <Button variant="outline" className="w-fit" onClick={uploadEvidence} disabled={busy !== null || !evidenceFile}><Upload className="h-4 w-4 mr-1" />Upload Evidence</Button>
              </div>
              {attachments.length === 0 ? <p className="text-xs text-muted-foreground">No photos or evidence have been attached yet.</p> : (
                <div className="space-y-2">
                  {attachments.slice(0, 10).map((attachment: any) => (
                    <button key={attachment.id} onClick={() => openAttachment(attachment.id)} className="w-full rounded-lg border p-3 text-left hover:bg-muted/40 transition-colors" disabled={busy !== null}>
                      <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium truncate"><Paperclip className="h-3.5 w-3.5 inline mr-1" />{attachment.fileName}</span><span className="text-[11px] text-muted-foreground shrink-0">{attachment.fileSize ? `${(attachment.fileSize / 1024 / 1024).toFixed(1)} MB` : ''}</span></div>
                      <p className="text-xs text-muted-foreground mt-1">{attachment.uploadedBy?.fullName || 'User'} · {formatDate(attachment.uploadedAt)}</p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserRound className="h-4 w-4" />Assignment</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Assigned Technician</p><p className="font-medium">{wo.assignee?.fullName || '-'}</p></div>
              <div><p className="text-xs text-muted-foreground">Team Leader</p><p className="font-medium">{wo.teamLeader?.fullName || wo.assignee?.fullName || '-'}</p></div>
              <div><p className="text-xs text-muted-foreground">Supervisor</p><p className="font-medium">{wo.assignedSupervisor?.fullName || '-'}</p></div>
              <div><p className="text-xs text-muted-foreground">Planner</p><p className="font-medium">{wo.planner?.fullName || '-'}</p></div>
              {(wo.teamMembers || []).length > 1 && <><Separator /><div className="space-y-1">{wo.teamMembers.map((m: any) => <div key={m.id} className="flex justify-between gap-2"><span>{m.user?.fullName || m.userId}</span><Badge variant="outline">{pretty(m.role)}</Badge></div>)}</div></>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Safety & Readiness</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Safety / LOTO Notes</p><p className="whitespace-pre-wrap">{wo.safetyNotes || 'No specific safety notes recorded.'}</p></div>
              <div><p className="text-xs text-muted-foreground">Required PPE</p><p>{wo.ppeRequired || 'Use site-standard PPE.'}</p></div>
              {wo.maintenanceRequest?.machineDownStatus && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700"><AlertTriangle className="h-4 w-4 inline mr-1" />Machine / equipment reported down</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" />Schedule & Labor</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Planned Start</span><span>{formatDate(wo.plannedStart)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Planned End</span><span>{formatDate(wo.plannedEnd)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Actual Start</span><span>{formatDate(wo.actualStart)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Recorded Labor</span><span>{Number(wo.actualHours || 0).toFixed(2)} h</span></div>
              <Button variant="ghost" className="w-full justify-between" onClick={() => navigate('technician-timesheet', { workOrderId: id })}>Open Timesheet <ChevronRight className="h-4 w-4" /></Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" />Resources</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-between" onClick={() => navigate('repairs-material-requests', { workOrderId: id })}>Materials <Badge variant="secondary">{wo.repairMaterialRequests?.length || 0}</Badge></Button>
              <Button variant="outline" className="w-full justify-between" onClick={() => navigate('repairs-tool-requests', { workOrderId: id })}>Tools <Badge variant="secondary">{wo.repairToolRequests?.length || 0}</Badge></Button>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium"><UserPlus className="h-4 w-4" />Team / Assistance</div>
                {caps?.canRequestAssistance && (
                  <>
                    <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={assistanceTrade} onChange={(e) => setAssistanceTrade(e.target.value)}>
                      <option value="">Select required trade / skill...</option>
                      {availableAssistanceSkills.map((skill) => <option key={skill} value={skill}>{skill}</option>)}
                    </select>
                    {availableAssistanceSkills.length === 0 && <p className="text-xs text-amber-600">No active technician skills are configured. Add technician trades/skills in HRMS before requesting skill-based assistance.</p>}
                    <Textarea value={assistanceReason} onChange={(e) => setAssistanceReason(e.target.value)} placeholder="Why is assistance required?" rows={2} />
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={saveAssistanceRequest} disabled={busy !== null || assistanceTrade.trim().length < 2 || assistanceReason.trim().length < 3}>{editingAssistanceId ? 'Update Request' : 'Request Assistance'}</Button>
                      {editingAssistanceId && <Button variant="ghost" onClick={() => { setEditingAssistanceId(null); setAssistanceTrade(''); setAssistanceReason(''); }} disabled={busy !== null}>Cancel Edit</Button>}
                    </div>
                  </>
                )}
                {assistanceRequests.slice(0, 5).map((request: any) => {
                  const ownPending = request.status === 'pending' && (request.requestedBy === user?.id || request.requestedByUser?.id === user?.id);
                  return (
                    <div key={request.id} className="rounded-lg bg-muted/40 p-2 text-xs flex items-center justify-between gap-2">
                      <span>{request.requestedTrade || request.requestedUser?.fullName || 'Assistance'}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline">{pretty(request.status)}</Badge>
                        {ownPending && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditingAssistanceId(request.id); setAssistanceTrade(request.requestedTrade || ''); setAssistanceReason(request.reason || ''); }}>Edit</Button>}
                        {ownPending && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600" onClick={() => cancelAssistanceRequest(request.id)} disabled={busy !== null}>Cancel</Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {wo.status === 'in_progress' && liveLog && (
            <Card className="border-amber-200">
              <CardHeader><CardTitle className="text-base">Pause / Waiting State</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Timer Pause Reason</Label><Input className="mt-1" value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} /></div>
                <Button variant="outline" className="w-full" onClick={pauseWork} disabled={busy !== null}><Pause className="h-4 w-4 mr-1" />Pause My Timer</Button>
                <Separator />
                <Label>Work Order Waiting State</Label>
                <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={waitingTarget} onChange={(e) => setWaitingTarget(e.target.value)}>
                  <option value="waiting_parts">Waiting for Parts</option><option value="waiting_tools">Waiting for Tools</option><option value="waiting_shutdown">Waiting for Shutdown</option><option value="waiting_permit">Waiting for Permit</option>
                </select>
                <Textarea value={waitingReason} onChange={(e) => setWaitingReason(e.target.value)} placeholder="Why must execution stop?" />
                <Button variant="secondary" className="w-full" onClick={moveToWaiting} disabled={busy !== null}>Move Work Order to Waiting</Button>
              </CardContent>
            </Card>
          )}

          {caps?.canHandover && (
            <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/10">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" />Shift Handover</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Hand over live work to the incoming technician. This closes active team timers and moves the work order to Pending Handover.</p>
                <div><Label>Incoming Technician *</Label><select className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm" value={handoverReceiverId} onChange={(e) => setHandoverReceiverId(e.target.value)}><option value="">Select technician...</option>{handoverUsers.map((candidate: any) => <option key={candidate.id} value={candidate.id}>{candidate.fullName} ({candidate.username})</option>)}</select></div>
                <div className="grid grid-cols-2 gap-2"><div><Label>From Shift</Label><select className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm" value={handoverFromShift} onChange={(e) => setHandoverFromShift(e.target.value as 'morning' | 'afternoon' | 'night')}><option value="morning">Morning 06:00–14:00</option><option value="afternoon">Afternoon 14:00–22:00</option><option value="night">Night 22:00–06:00</option></select></div><div><Label>To Shift</Label><select className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm" value={handoverToShift} onChange={(e) => setHandoverToShift(e.target.value as 'morning' | 'afternoon' | 'night')}><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option></select></div></div>
                <Input value={handoverReason} onChange={(e) => setHandoverReason(e.target.value)} placeholder="Handover reason" />
                <Textarea value={handoverNotes} onChange={(e) => setHandoverNotes(e.target.value)} placeholder="Pending issues, equipment condition, safety information..." rows={3} />
                <Button variant="outline" className="w-full" onClick={submitHandover} disabled={busy !== null || !handoverReceiverId || handoverReason.trim().length < 3}>Submit Shift Handover</Button>
              </CardContent>
            </Card>
          )}

          <div id="completion" className="scroll-mt-28" aria-hidden="true" />

          {caps?.canSubmitCompletion && (
            <Card className="border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Complete & Submit</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Stop the live timer first. The server will verify open tools, materials, handovers and assistance requests before accepting completion.</p>
                {liveLog && <Button variant="outline" className="w-full" onClick={() => id && perform('stop-before-complete', () => api.post(`/api/work-orders/${id}/pause-session`, { reason: 'Work completed - preparing completion report' }), 'Timer stopped. You can now submit the completion report.')} disabled={busy !== null}><Pause className="h-4 w-4 mr-1" />Stop Timer Before Submit</Button>}
                <Textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} placeholder="Final completion summary *" rows={4} />
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={submitCompletion} disabled={busy !== null || !completionNotes.trim()}>Submit for Supervisor Review</Button>
              </CardContent>
            </Card>
          )}

          {caps?.canVerify && <Button className="w-full" onClick={() => reviewAction('verify')} disabled={busy !== null}>Verify Completed Work</Button>}
          {caps?.canClose && <Button className="w-full" onClick={() => reviewAction('close')} disabled={busy !== null}>Close Work Order</Button>}
        </div>
      </div>
    </div>
  );
}
