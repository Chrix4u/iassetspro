'use client';

import { useState, useCallback, useEffect } from 'react';
import { api, useAbortRef } from '@/lib/api';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WODetail {
  id: string;
  woNumber: string;
  title: string;
  description: string | null;
  type: string | null;
  priority: string;
  status: string;
  plantId: string | null;
  departmentId: string | null;
  assetId: string | null;
  assetName: string | null;
  componentId: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  actualStart: string | null;
  actualEnd: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  holdReason: string | null;
  failureDescription: string | null;
  causeDescription: string | null;
  actionDescription: string | null;
  tradeActivity: string | null;
  technicalDescription: string | null;
  safetyNotes: string | null;
  ppeRequired: string | null;
  notes: string | null;
  assignedTo: string | null;
  teamLeaderId: string | null;
  assignedSupervisorId: string | null;
  plannerId: string | null;
  isLocked: boolean;
  assignee: { id: string; fullName: string; username: string; department: string | null } | null;
  teamLeader: { id: string; fullName: string; username: string } | null;
  assignedSupervisor: { id: string; fullName: string; username: string } | null;
  assigner: { id: string; fullName: string; username: string } | null;
  planner: { id: string; fullName: string; username: string } | null;
  maintenanceRequest: {
    id: string;
    requestNumber: string;
    title: string;
    description: string;
    category: string | null;
    machineDownStatus: string | null;
    createdAt: string;
    requester: { id: string; fullName: string; username: string } | null;
    asset: { id: string; name: string; assetTag: string | null; serialNumber: string | null } | null;
  } | null;
  pmSchedule: { id: string; title: string; frequencyType: string | null; frequencyValue: number | null } | null;
  teamMembers: Array<{
    id: string;
    userId: string;
    role: string;
    accessLevel: string | null;
    assignedAt: string;
    user: { id: string; fullName: string; username: string };
  }>;
  timeLogs: Array<{
    id: string;
    workOrderId: string;
    userId: string;
    action: string;
    duration: number | null;
    notes: string | null;
    timestamp: string;
    startTime: string | null;
    endTime: string | null;
    activityType: string | null;
    breakMinutes: number | null;
    pauseReason: string | null;
    isTeamLog: boolean | null;
    loggedById: string | null;
    loggedBy: { id: string; fullName: string; username: string } | null;
    user: { id: string; fullName: string; username: string; avatar: string | null } | null;
  }>;
  materials: Array<{
    id: string;
    workOrderId: string;
    itemId: string | null;
    itemName: string | null;
    itemCode: string | null;
    quantityRequested: number;
    quantityIssued: number;
    quantityReturned: number;
    consumedQty: number | null;
    wastedQty: number | null;
    unit: string | null;
    unitCost: number | null;
    status: string;
    source: string | null;
    reason: string | null;
    requesterId: string | null;
    approverId: string | null;
    issuerId: string | null;
    createdAt: string;
    requester: { id: string; fullName: string } | null;
    approver: { id: string; fullName: string } | null;
    issuer: { id: string; fullName: string } | null;
    componentRegistry: { id: string; name: string; componentCode: string } | null;
    item: { id: string; name: string; itemCode: string; category: string } | null;
  }>;
  comments: Array<{
    id: string;
    workOrderId: string;
    userId: string;
    content: string;
    createdAt: string;
    user: { id: string; fullName: string; username: string } | null;
  }>;
  repairToolRequests: Array<{
    id: string;
    workOrderId: string;
    toolId: string | null;
    toolName: string | null;
    toolCode: string | null;
    status: string;
    source: string | null;
    reason: string | null;
    urgency: string | null;
    requestedById: string | null;
    supervisorApprovedById: string | null;
    storekeeperApprovedById: string | null;
    issuedById: string | null;
    createdAt: string;
    requestedBy: { id: string; fullName: string } | null;
    supervisorApprovedBy: { id: string; fullName: string } | null;
    storekeeperApprovedBy: { id: string; fullName: string } | null;
    issuedByUser: { id: string; fullName: string } | null;
    tool: { id: string; name: string; toolCode: string; category: string } | null;
    items: Array<{
      id: string;
      toolId: string;
      toolName: string;
      quantity: number;
      pendingReturnQty: number | null;
      condition: string | null;
      tool: { id: string; name: string; toolCode: string; category: string } | null;
    }>;
  }>;
  repairMaterialRequests: Array<{
    id: string;
    workOrderId: string;
    itemId: string | null;
    itemName: string | null;
    itemCode: string | null;
    quantityRequested: number;
    quantityIssued: number;
    quantityReturned: number;
    consumedQty: number | null;
    wastedQty: number | null;
    unit: string | null;
    unitCost: number | null;
    status: string;
    source: string | null;
    reason: string | null;
    requesterId: string | null;
    supervisorApprovedById: string | null;
    storekeeperApprovedById: string | null;
    issuedById: string | null;
    createdAt: string;
    requestedBy: { id: string; fullName: string } | null;
    supervisorApprovedBy: { id: string; fullName: string } | null;
    storekeeperApprovedBy: { id: string; fullName: string } | null;
    issuedByUser: { id: string; fullName: string } | null;
    item: { id: string; name: string; itemCode: string; category: string } | null;
  }>;
  workOrderComponents: Array<{
    id: string;
    componentRegistryId: string;
    componentRegistry: {
      id: string;
      name: string;
      componentCode: string | null;
      componentType: string | null;
      criticality: string | null;
      healthScore: number | null;
      condition: string | null;
    };
  }>;
  teamMemberRequests: Array<{
    id: string;
    workOrderId: string;
    requestedUserId: string | null;
    reason: string | null;
    status: string;
    createdAt: string;
    requestedByUser: { id: string; fullName: string; username: string } | null;
    requestedUser: { id: string; fullName: string; username: string } | null;
    reviewedByUser: { id: string; fullName: string; username: string } | null;
  }>;
}

export interface WOTask {
  id: string;
  workOrderId: string;
  templateTaskId: string | null;
  taskNumber: number;
  description: string;
  taskType: string;
  requiredParts: string | null;
  estimatedMinutes: number | null;
  status: string;
  completedById: string | null;
  completedAt: string | null;
  measurementValue: number | null;
  measurementUnit: string | null;
  notes: string | null;
  completedBy: { id: string; fullName: string; username: string } | null;
}

export interface TimeLogSummary {
  timeLogs: WODetail['timeLogs'];
  summary: {
    totalEntries: number;
    totalHours: number;
    totalBreakMinutes: number;
    personalEntries: number;
    personalHours: number;
    teamEntries: number;
    teamHours: number;
    byUser: Record<string, { fullName: string; hours: number; entries: number }>;
  };
}

export interface DowntimeRecord {
  id: string;
  workOrderId: string;
  assetId: string | null;
  assetName: string | null;
  downtimeStart: string;
  downtimeEnd: string | null;
  durationMinutes: number;
  reason: string;
  category: string;
  impactLevel: string;
  productionLoss: number | null;
  notes: string | null;
  createdById: string;
  createdAt: string;
  workOrder: { id: string; woNumber: string; title: string; status: string } | null;
}

export interface ReadinessItem {
  code: string;
  category: string;
  message: string;
  severity: 'blocker' | 'warning';
}

export interface ReadinessResult {
  ready: boolean;
  blockers: ReadinessItem[];
  warnings: ReadinessItem[];
}

type ResumeWorkResponse = {
  status: 'in_progress';
  resumedAt: string | Date;
  executionSessionOpened: boolean;
  technicianExecutionStartRequired: boolean;
};

export function buildUnverifiedCompletionReadiness(message?: string): ReadinessResult {
  return {
    ready: false,
    blockers: [
      {
        code: 'COMPLETION_READINESS_UNVERIFIED',
        category: 'system',
        message: message || 'Completion readiness has not been verified. Retry the readiness check before submitting.',
        severity: 'blocker',
      },
    ],
    warnings: [],
  };
}

interface UseWorkOrderExecutionReturn {
  workOrder: WODetail | null;
  tasks: WOTask[];
  timeLogSummary: TimeLogSummary | null;
  downtimes: DowntimeRecord[];
  readiness: ReadinessResult | null;
  isLoading: boolean;
  isActionLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  fetchTasks: () => Promise<void>;
  fetchTimeLogs: () => Promise<void>;
  fetchDowntimes: () => Promise<void>;
  fetchReadiness: () => Promise<void>;
  startWork: (params?: { reason?: string; notes?: string }) => Promise<boolean>;
  /** @deprecated This invokes the WO-wide Hold action; retained for existing workspace callers. */
  pauseWork: (reason: string) => Promise<boolean>;
  resumeWork: (notes?: string) => Promise<boolean>;
  submitCompletion: (params: {
    findings?: string;
    rootCause?: string;
    correctiveAction?: string;
    completionNotes?: string;
  }) => Promise<boolean>;
  addComment: (content: string) => Promise<boolean>;
  logTime: (params: {
    action: 'start' | 'pause' | 'resume' | 'complete';
    activityType?: string;
    notes?: string;
    pauseReason?: string;
  }) => Promise<boolean>;
  createDowntime: (params: {
    reason: string;
    category?: string;
    impactLevel?: string;
    productionLoss?: number;
    downtimeStart?: string;
    downtimeEnd?: string;
    notes?: string;
  }) => Promise<boolean>;
  toggleTask: (taskId: string, completed: boolean) => Promise<boolean>;
}

export function useWorkOrderExecution(
  workOrderId: string,
): UseWorkOrderExecutionReturn {
  const abortRef = useAbortRef();

  const [workOrder, setWorkOrder] = useState<WODetail | null>(null);
  const [tasks, setTasks] = useState<WOTask[]>([]);
  const [timeLogSummary, setTimeLogSummary] = useState<TimeLogSummary | null>(null);
  const [downtimes, setDowntimes] = useState<DowntimeRecord[]>([]);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!workOrderId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<WODetail>(`/api/work-orders/${workOrderId}`, {
        signal: abortRef.current.signal,
        timeout: 20_000,
      });
      if (res.success && res.data) {
        const data = res.data as WODetail;
        setWorkOrder({
          ...data,
          repairMaterialRequests: (data.repairMaterialRequests || []).map((request) => ({
            ...request,
            quantityReturned: request.quantityReturned ?? 0,
          })),
        });
      } else {
        setError(res.error || 'Failed to load work order');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Failed to load work order');
      }
    } finally {
      setIsLoading(false);
    }
  }, [workOrderId, abortRef]);

  const fetchTasks = useCallback(async () => {
    if (!workOrderId) return;
    try {
      const res = await api.get<WOTask[]>(`/api/work-orders/${workOrderId}/tasks`, {
        signal: abortRef.current.signal,
      });
      if (res.success && res.data) setTasks(res.data as WOTask[]);
    } catch {
      /* silent */
    }
  }, [workOrderId, abortRef]);

  const fetchTimeLogs = useCallback(async () => {
    if (!workOrderId) return;
    try {
      const res = await api.get<TimeLogSummary>(`/api/work-orders/${workOrderId}/time-logs?includeTeamLogs=true`, {
        signal: abortRef.current.signal,
      });
      if (res.success && res.data) setTimeLogSummary(res.data as TimeLogSummary);
    } catch {
      /* silent */
    }
  }, [workOrderId, abortRef]);

  const fetchDowntimes = useCallback(async () => {
    if (!workOrderId) return;
    try {
      const res = await api.get<DowntimeRecord[]>(`/api/repairs/downtime?workOrderId=${workOrderId}&limit=50`, {
        signal: abortRef.current.signal,
      });
      if (res.success && res.data) setDowntimes(Array.isArray(res.data) ? res.data : []);
    } catch {
      /* silent */
    }
  }, [workOrderId, abortRef]);

  const fetchReadiness = useCallback(async () => {
    const checking = buildUnverifiedCompletionReadiness(
      'Checking completion readiness. Submission remains disabled until verification completes.',
    );
    setReadiness(checking);

    if (!workOrderId) {
      setReadiness(buildUnverifiedCompletionReadiness('Completion readiness cannot be verified without a work order.'));
      return;
    }

    try {
      const res = await api.get<ReadinessResult>(`/api/work-orders/${workOrderId}/readiness?phase=complete`, {
        signal: abortRef.current.signal,
        timeout: 10_000,
      });
      if (res.success && res.data) {
        setReadiness(res.data as ReadinessResult);
        return;
      }

      setReadiness(buildUnverifiedCompletionReadiness(
        'Completion readiness could not be verified. Check your connection and retry before submitting.',
      ));
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setReadiness(buildUnverifiedCompletionReadiness(
        'Completion readiness could not be verified. Check your connection and retry before submitting.',
      ));
    }
  }, [workOrderId, abortRef]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (workOrder) {
      fetchTasks();
      fetchTimeLogs();
      fetchDowntimes();
    }
  }, [workOrder, fetchTasks, fetchTimeLogs, fetchDowntimes]);

  const startWork = useCallback(async (params?: { reason?: string; notes?: string }): Promise<boolean> => {
    setIsActionLoading(true);
    try {
      const res = await api.post(`/api/work-orders/${workOrderId}/start`, {
        reason: params?.reason,
        notes: params?.notes,
      });
      if (res.success) {
        toast.success('Work started');
        await refetch();
        await fetchTimeLogs();
        return true;
      }
      toast.error(res.error || 'Failed to start work');
      return false;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start work');
      return false;
    } finally {
      setIsActionLoading(false);
    }
  }, [workOrderId, refetch, fetchTimeLogs]);

  // Compatibility name retained until the monolithic workspace action strip is
  // extracted. This is a WO-wide supervisor/maintenance-control Hold, not a
  // personal technician timer pause.
  const pauseWork = useCallback(async (reason: string): Promise<boolean> => {
    if (!reason.trim()) {
      toast.error('A reason is required to place the work order on hold');
      return false;
    }
    setIsActionLoading(true);
    try {
      const res = await api.post(`/api/work-orders/${workOrderId}/hold`, { reason });
      if (res.success) {
        toast.success('Work order placed on hold');
        await refetch();
        await fetchTimeLogs();
        return true;
      }
      toast.error(res.error || 'Failed to place work order on hold');
      return false;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to place work order on hold');
      return false;
    } finally {
      setIsActionLoading(false);
    }
  }, [workOrderId, refetch, fetchTimeLogs]);

  const resumeWork = useCallback(async (notes?: string): Promise<boolean> => {
    setIsActionLoading(true);
    try {
      const res = await api.post(`/api/work-orders/${workOrderId}/resume`, { notes });
      if (res.success) {
        const data = res.data as ResumeWorkResponse | undefined;
        if (data?.technicianExecutionStartRequired || data?.executionSessionOpened === false) {
          toast.success('Work order released', {
            description: 'No labor timer was started. The assigned technician must explicitly start execution.',
          });
        } else {
          toast.success('Execution resumed');
        }
        await refetch();
        await fetchTimeLogs();
        return true;
      }
      toast.error(res.error || 'Failed to release or resume work');
      return false;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to release or resume work');
      return false;
    } finally {
      setIsActionLoading(false);
    }
  }, [workOrderId, refetch, fetchTimeLogs]);

  const submitCompletion = useCallback(async (params: {
    findings?: string;
    rootCause?: string;
    correctiveAction?: string;
    completionNotes?: string;
  }): Promise<boolean> => {
    setIsActionLoading(true);
    try {
      const res = await api.post(`/api/repairs/completion/${workOrderId}`, {
        action: 'submit',
        findings: params.findings,
        rootCause: params.rootCause,
        correctiveAction: params.correctiveAction,
        completionNotes: params.completionNotes,
      });
      if (res.success) {
        toast.success('Completion submitted');
        await refetch();
        return true;
      }
      const blockers = (res as any).blockers;
      if (blockers && Array.isArray(blockers)) {
        setReadiness({ ready: false, blockers, warnings: (res as any).warnings || [] });
        toast.error('Cannot complete: ' + blockers.map((b: any) => b.message).join('; '));
      } else {
        toast.error(res.error || 'Failed to submit completion');
      }
      return false;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit completion');
      return false;
    } finally {
      setIsActionLoading(false);
    }
  }, [workOrderId, refetch]);

  const addComment = useCallback(async (content: string): Promise<boolean> => {
    if (!content.trim()) return false;
    try {
      const res = await api.post(`/api/work-orders/${workOrderId}/comments`, { content });
      if (res.success) {
        if (res.offlineQueued) {
          toast.success('Comment saved offline — will sync when connected');
          return true;
        }
        toast.success('Comment added');
        await refetch();
        return true;
      }
      toast.error(res.error || 'Failed to add comment');
      return false;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add comment');
      return false;
    }
  }, [workOrderId, refetch]);

  const logTime = useCallback(async (params: {
    action: 'start' | 'pause' | 'resume' | 'complete';
    activityType?: string;
    notes?: string;
    pauseReason?: string;
  }): Promise<boolean> => {
    setIsActionLoading(true);
    try {
      const res = await api.post(`/api/work-orders/${workOrderId}/time-logs`, {
        action: params.action,
        activityType: params.activityType || 'maintenance',
        notes: params.notes,
        pauseReason: params.pauseReason,
      });
      if (res.success) {
        await fetchTimeLogs();
        await refetch();
        return true;
      }
      toast.error(res.error || 'Failed to log time');
      return false;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to log time');
      return false;
    } finally {
      setIsActionLoading(false);
    }
  }, [workOrderId, fetchTimeLogs, refetch]);

  const createDowntime = useCallback(async (params: {
    reason: string;
    category?: string;
    impactLevel?: string;
    productionLoss?: number;
    downtimeStart?: string;
    downtimeEnd?: string;
    notes?: string;
  }): Promise<boolean> => {
    try {
      const res = await api.post('/api/repairs/downtime', {
        workOrderId,
        reason: params.reason,
        category: params.category || 'unplanned',
        impactLevel: params.impactLevel || 'medium',
        productionLoss: params.productionLoss || null,
        downtimeStart: params.downtimeStart || null,
        downtimeEnd: params.downtimeEnd || null,
        notes: params.notes || null,
      });
      if (res.success) {
        toast.success('Downtime recorded');
        await fetchDowntimes();
        return true;
      }
      toast.error(res.error || 'Failed to record downtime');
      return false;
    } catch {
      toast.error('Failed to record downtime');
      return false;
    }
  }, [workOrderId, fetchDowntimes]);

  const toggleTask = useCallback(async (taskId: string, completed: boolean): Promise<boolean> => {
    try {
      const res = await api.patch(`/api/work-orders/${workOrderId}/tasks/${taskId}`, {
        status: completed ? 'completed' : 'pending',
      });
      if (res.success) {
        if (res.offlineQueued) {
          const completedAt = completed ? new Date().toISOString() : null;
          setTasks((previous) => previous.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  status: completed ? 'completed' : 'pending',
                  completedAt,
                  completedById: completed ? task.completedById : null,
                  completedBy: completed ? task.completedBy : null,
                }
              : task,
          ));
          toast.success('Task update saved offline — will sync when connected');
          return true;
        }
        await fetchTasks();
        return true;
      }
      toast.error(res.error || 'Failed to update task');
      return false;
    } catch {
      toast.error('Failed to update task');
      return false;
    }
  }, [workOrderId, fetchTasks]);

  return {
    workOrder,
    tasks,
    timeLogSummary,
    downtimes,
    readiness,
    isLoading,
    isActionLoading,
    error,
    refetch,
    fetchTasks,
    fetchTimeLogs,
    fetchDowntimes,
    fetchReadiness,
    startWork,
    pauseWork,
    resumeWork,
    submitCompletion,
    addComment,
    logTime,
    createDowntime,
    toggleTask,
  };
}

export default useWorkOrderExecution;
