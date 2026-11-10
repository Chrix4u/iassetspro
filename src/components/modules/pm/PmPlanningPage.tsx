'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ClipboardList, Clock, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  groupPmAssignmentAssets,
  groupPmAssignmentTargets,
  pmAssignmentFrequencyType,
  type PmAssignmentTargetGroup,
  type PmAssignmentTargetListRecord,
} from '@/lib/pm-assignment-target-list';
import { useAuthStore } from '@/stores/authStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { PmAssignmentFormDialog } from '@/components/modules/pm/PmAssignmentFormDialog';
import { PmAssignmentTargetDetailDialog } from '@/components/modules/pm/PmAssignmentTargetDetailDialog';
import { PmAssignmentTargetList } from '@/components/modules/pm/PmAssignmentTargetList';
import { PmMachineRollupPanel } from '@/components/modules/pm/PmMachineRollupPanel';
import { PmPortfolioCompliancePanel } from '@/components/modules/pm/PmPortfolioCompliancePanel';
import { PmEnterpriseForwardPlan } from '@/components/modules/pm/PmEnterpriseForwardPlan';
import { PmSchedulingConflictsPanel } from '@/components/modules/pm/PmSchedulingConflictsPanel';
import { PmInspectionWorksheetPanel } from '@/components/modules/pm/PmInspectionWorksheetPanel';

function taskOverdue(row: PmAssignmentTargetListRecord, now: Date) {
  if (pmAssignmentFrequencyType(row) === 'meter') return row.nextDueReading != null && row.assetMeter ? Number(row.assetMeter.currentValue) >= Number(row.nextDueReading) : false;
  if (pmAssignmentFrequencyType(row) !== 'time_day') return false;
  return row.nextDueDate ? new Date(row.nextDueDate).getTime() < now.getTime() : false;
}
function taskDueSoon(row: PmAssignmentTargetListRecord, now: Date) {
  if (pmAssignmentFrequencyType(row) !== 'time_day' || !row.nextDueDate) return false;
  const due = new Date(row.nextDueDate).getTime();
  return due >= now.getTime() && due <= now.getTime() + 7 * 86400000;
}

export function PmPlanningPage() {
  const [assignments, setAssignments] = useState<PmAssignmentTargetListRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PmAssignmentTargetGroup | null>(null);
  const [triggerTarget, setTriggerTarget] = useState<PmAssignmentTargetGroup | null>(null);
  const [viewTarget, setViewTarget] = useState<PmAssignmentTargetGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PmAssignmentTargetGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [automationStatus, setAutomationStatus] = useState<any>(null);
  const { hasPermission, isAdmin } = useAuthStore();
  const canCreate = hasPermission('pm_schedules.create') || hasPermission('work_orders.create') || isAdmin();
  const canEdit = hasPermission('pm_schedules.update') || hasPermission('work_orders.update') || isAdmin();
  const canDelete = hasPermission('pm_schedules.delete') || hasPermission('work_orders.delete') || isAdmin();

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/pm-assignments?isActive=true');
      if (!response.success) throw new Error(response.error || 'Failed to load PM schedules');
      setAssignments(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load PM schedules');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchAssignments(); }, [fetchAssignments]);
  useEffect(() => { api.get('/api/pm-automation/status').then((response) => { if (response.success) setAutomationStatus(response.data); }).catch(() => {}); }, []);

  const groups = useMemo(() => groupPmAssignmentTargets(assignments), [assignments]);
  const machines = useMemo(() => groupPmAssignmentAssets(groups), [groups]);
  const now = new Date();
  const overdueTargets = groups.filter((group) => group.assignments.some((row) => taskOverdue(row, now))).length;
  const dueSoonTargets = groups.filter((group) => group.assignments.some((row) => taskDueSoon(row, now))).length;

  const deleteSchedule = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const query = new URLSearchParams({ assetId: deleteTarget.assetId });
      if (deleteTarget.componentId) query.set('componentId', deleteTarget.componentId);
      const response = await api.delete(`/api/pm-assignments/target?${query.toString()}`);
      if (!response.success) throw new Error(response.error || 'Failed to delete PM schedule');
      toast.success(`PM schedule for ${deleteTarget.targetName} deleted`);
      setDeleteTarget(null);
      await fetchAssignments();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to delete PM schedule'); }
    finally { setDeleting(false); }
  };

  const closeAssignmentDialog = () => {
    setAssignmentOpen(false);
    setEditTarget(null);
    setTriggerTarget(null);
  };

  return <div className="page-content space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Preventive Maintenance</p><h1 className="text-2xl font-bold tracking-tight">PM Schedule Overview</h1><p className="mt-1 text-sm text-muted-foreground">Choose a machine to check what is due, print its inspection sheet and review recorded results. Each task can be assigned to the exact parts that need it.</p>{automationStatus && <div className="mt-2 flex items-center gap-2 text-xs"><span className="text-muted-foreground">PM Automation</span><Badge variant="outline">{automationStatus.health === 'healthy' ? 'Healthy' : automationStatus.health || 'Unknown'}</Badge></div>}</div>
      {canCreate && <Button size="sm" onClick={() => { setEditTarget(null); setTriggerTarget(null); setAssignmentOpen(true); }}><Plus className="mr-1.5 h-4 w-4"/>Add PM Schedule</Button>}
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Machines" value={machines.length} icon={ClipboardList}/><Stat label="Scheduled Part-Tasks" value={assignments.length} icon={Activity}/><Stat label="Machine / Parts Due Soon" value={dueSoonTargets} icon={Clock}/><Stat label="Machine / Parts Overdue" value={overdueTargets} icon={AlertTriangle}/>
    </div>

    <section aria-label="How to use PM schedules" className="rounded-xl border bg-muted/20 p-3 sm:p-4" data-testid="pm-schedule-quick-guide">
      <h2 className="text-base font-semibold">Start here — 3 steps</h2>
      <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
        <div className="rounded-lg border bg-background p-3"><strong>1. Check a machine</strong><p className="mt-1 text-xs text-muted-foreground">Select a machine below to see tasks due now, soon or overdue, including the affected parts.</p></div>
        <div className="rounded-lg border bg-background p-3"><strong>2. Print an inspection sheet</strong><p className="mt-1 text-xs text-muted-foreground">Choose the machine and Running or Standstill. Print every assigned part under its inspection task, with blank boxes for readings.</p></div>
        <div className="rounded-lg border bg-background p-3"><strong>3. Enter results and follow up</strong><p className="mt-1 text-xs text-muted-foreground">Record the actual values from the technician's sheet. Review abnormal findings and linked corrective work orders.</p></div>
      </div>
    </section>
    <PmMachineRollupPanel />
    <PmInspectionWorksheetPanel />
    <PmAssignmentTargetList groups={groups} loading={loading} canEdit={canEdit} canDelete={canDelete} onView={setViewTarget} onEdit={(group) => { setTriggerTarget(null); setEditTarget(group); }} onConfigureTriggers={(group) => { setEditTarget(null); setTriggerTarget(group); }} onDelete={setDeleteTarget}/>
    <details className="rounded-xl border bg-card p-3 sm:p-4" data-testid="pm-more-planning-reports"
      onToggle={(event) => setShowReports(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-semibold">More planning reports (upcoming work, scheduling warnings and maintenance history)</summary>
      <p className="mb-3 mt-2 text-xs text-muted-foreground">These reports help planners look across many machines. Use the sections above for daily machine inspections.</p>
      {showReports && <div className="space-y-4">
        <PmEnterpriseForwardPlan />
        <PmSchedulingConflictsPanel />
        <PmPortfolioCompliancePanel />
      </div>}
    </details>

    <PmAssignmentFormDialog
      open={assignmentOpen || Boolean(editTarget) || Boolean(triggerTarget)}
      editTarget={triggerTarget || editTarget}
      initialStep={triggerTarget ? 'triggers' : 'tasks'}
      onOpenChange={(open) => { if (!open) closeAssignmentDialog(); }}
      onSaved={() => { closeAssignmentDialog(); void fetchAssignments(); }}
    />
    <PmAssignmentTargetDetailDialog open={Boolean(viewTarget)} group={viewTarget} onOpenChange={(open) => { if (!open) setViewTarget(null); }}/>
    <ResponsiveDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }} title="Delete PM Schedule" description="This deactivates every active PM task on the selected part. Historical records remain available for audit." footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button><Button variant="destructive" onClick={() => void deleteSchedule()} disabled={deleting}>{deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <Trash2 className="mr-1.5 h-4 w-4"/>}Delete</Button></div>}>
      {deleteTarget && <p className="text-sm">Delete the PM schedule for <strong>{deleteTarget.targetName}</strong> on <strong>{deleteTarget.asset.name}</strong>? This will deactivate {deleteTarget.taskCount} task{deleteTarget.taskCount === 1 ? '' : 's'}.</p>}
    </ResponsiveDialog>
  </div>;
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }) {
  return <div className="flex items-center gap-3 rounded-xl border bg-card p-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><Icon className="h-4 w-4"/></div><div><p className="text-lg font-bold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div></div>;
}
