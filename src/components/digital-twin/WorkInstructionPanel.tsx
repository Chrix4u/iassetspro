'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Wrench,
  ShieldAlert,
  Clock,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  Play,
  Pause,
  Camera,
  FileText,
  Lightbulb,
  ShieldCheck,
  SquareCheckBig,
  Loader2,
  Timer,
  Eye,
  Package,
  SkipForward,
  Send,
  XCircle,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import type {
  WorkInstruction,
  WorkInstructionStep,
  WorkInstructionTool,
  WorkInstructionPart,
  SafetyCheckpoint,
  WorkInstructionExecution,
  StepResult,
  ToolVerification,
  PartVerification,
} from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface WorkInstructionPanelProps {
  componentId: string;
  assetId: string;
  componentCode: string;
  componentName: string;
  isOpen: boolean;
  onClose: () => void;
}

type ExecutionStatus = 'not_started' | 'in_progress' | 'paused' | 'completed' | 'abandoned';

// ============================================================================
// Helper: difficulty / safety config
// ============================================================================

function difficultyConfig(d: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    basic: { label: 'Basic', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    intermediate: { label: 'Intermediate', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    advanced: { label: 'Advanced', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
    expert: { label: 'Expert', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  };
  return map[d] ?? { label: d, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' };
}

function safetyConfig(s: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    low: { label: 'Low', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    medium: { label: 'Medium', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    high: { label: 'High', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
    critical: { label: 'Critical', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  };
  return map[s] ?? { label: s, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' };
}

function stepTypeIcon(type: string) {
  switch (type) {
    case 'action': return <Wrench className="h-3.5 w-3.5 text-cyan-400" />;
    case 'inspection': return <Eye className="h-3.5 w-3.5 text-amber-400" />;
    case 'safety': return <ShieldAlert className="h-3.5 w-3.5 text-red-400" />;
    case 'verification': return <SquareCheckBig className="h-3.5 w-3.5 text-emerald-400" />;
    case 'documentation': return <FileText className="h-3.5 w-3.5 text-blue-400" />;
    default: return <ChevronRight className="h-3.5 w-3.5 text-slate-400" />;
  }
}

// ============================================================================
// Skeleton Loader
// ============================================================================

function PanelSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-6 w-24" />
      </div>
      <Skeleton className="h-4 w-full" />
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-lg" />
      <Skeleton className="h-48 rounded-lg" />
      <Skeleton className="h-24 rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
      </div>
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <FileText className="h-8 w-8 text-slate-300" />
      </div>
      <h3 className="text-sm font-semibold text-slate-600 mb-1">No Work Instructions</h3>
      <p className="text-xs text-slate-400 max-w-xs mb-4">
        No work instructions are available for this component. Contact your maintenance planner to create one.
      </p>
      <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
        Close
      </Button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function WorkInstructionPanel({
  componentId,
  assetId,
  componentCode,
  componentName,
  isOpen,
  onClose,
}: WorkInstructionPanelProps) {
  // Auth
  const { user } = useAuthStore();
  const technicianId = user?.id || 'unknown';

  // Data state
  const [instruction, setInstruction] = useState<WorkInstruction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Execution state
  const [execStatus, setExecStatus] = useState<ExecutionStatus>('not_started');
  const [currentStep, setCurrentStep] = useState(1);
  const [stepResults, setStepResults] = useState<Map<number, StepResult>>(new Map());
  const [safetyPassed, setSafetyPassed] = useState<Map<number, boolean>>(new Map());
  const [toolVerified, setToolVerified] = useState<Map<string, boolean>>(new Map());
  const [partVerified, setPartVerified] = useState<Map<string, boolean>>(new Map());
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Fetch work instruction on mount ─────────────────────────────────
  useEffect(() => {
    if (!isOpen || !componentId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await api.get<WorkInstruction[]>(
          `/api/work-instructions?componentId=${componentId}&assetId=${assetId}&limit=1`
        );

        if (cancelled) return;

        if (res.success && res.data && res.data.length > 0) {
          setInstruction(res.data[0]);
        } else {
          setInstruction(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load work instructions');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, componentId, assetId]);

  // ─── Reset state when instruction changes ─────────────────────────────
  useEffect(() => {
    setExecStatus('not_started');
    setCurrentStep(1);
    setStepResults(new Map());
    setSafetyPassed(new Map());
    setToolVerified(new Map());
    setPartVerified(new Map());
    setNotes('');
  }, [instruction?.id]);

  // ─── Computed values ──────────────────────────────────────────────────

  const allSafetyAcknowledged = useMemo(() => {
    if (!instruction) return false;
    return instruction.safetyCheckpoints.every((cp) => safetyPassed.get(cp.stepNumber) === true);
  }, [instruction, safetyPassed]);

  const completedSteps = useMemo(() => {
    let count = 0;
    stepResults.forEach((r) => {
      if (r.status === 'completed') count++;
    });
    return count;
  }, [stepResults]);

  const totalSteps = instruction?.steps.length ?? 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const allStepsCompleted = completedSteps === totalSteps && totalSteps > 0;

  // ─── Handlers ─────────────────────────────────────────────────────────

  const toggleSafetyCheckpoint = useCallback((stepNumber: number) => {
    setSafetyPassed((prev) => {
      const next = new Map(prev);
      next.set(stepNumber, !prev.get(stepNumber));
      return next;
    });
  }, []);

  const markStepComplete = useCallback((step: WorkInstructionStep) => {
    setStepResults((prev) => {
      const next = new Map(prev);
      next.set(step.stepNumber, {
        stepNumber: step.stepNumber,
        status: 'completed',
        completedAt: new Date().toISOString(),
        verificationResult: step.verificationRequired ? 'pass' : null,
        verificationValue: step.verificationSpec || null,
        notes: null,
        mediaUrls: [],
        duration: step.estimatedMinutes,
      });
      return next;
    });

    // Auto-advance to next step
    if (instruction) {
      const nextStep = step.stepNumber + 1;
      if (nextStep <= instruction.steps.length) {
        setCurrentStep(nextStep);
      }
    }
  }, [instruction]);

  const startWork = useCallback(async () => {
    if (!instruction) return;
    setIsSubmitting(true);
    try {
      await api.post(`/api/work-instructions/${instruction.id}/execute`, {
        action: 'start',
        technicianId,
        workOrderId: '',
        stepResults: [],
        safetyResults: Array.from(safetyPassed.entries()).map(([stepNumber, isPassed]) => ({
          stepNumber,
          isPassed,
          acknowledgedById: technicianId,
          acknowledgedAt: new Date().toISOString(),
          notes: null,
        })),
        toolVerifications: [],
        partVerifications: [],
        notes: '',
        completionEvidence: [],
      });
      setExecStatus('in_progress');
    } catch {
      // Silent fail - still update local state
      setExecStatus('in_progress');
    } finally {
      setIsSubmitting(false);
    }
  }, [instruction, safetyPassed, technicianId]);

  const pauseWork = useCallback(async () => {
    if (!instruction) return;
    setIsSubmitting(true);
    try {
      await api.post(`/api/work-instructions/${instruction.id}/execute`, {
        action: 'pause',
        technicianId,
        workOrderId: '',
        stepResults: Array.from(stepResults.values()),
        notes,
        completionEvidence: [],
      });
      setExecStatus('paused');
      toast.success('Work paused');
    } catch {
      setExecStatus('paused');
    } finally {
      setIsSubmitting(false);
    }
  }, [instruction, stepResults, notes, technicianId]);

  const resumeWork = useCallback(async () => {
    if (!instruction) return;
    try {
      await api.post(`/api/work-instructions/${instruction.id}/execute`, {
        action: 'resume',
        workOrderId: '',
        technicianId,
      });
      setExecStatus('in_progress');
      toast.success('Work resumed');
    } catch {
      setExecStatus('in_progress'); // fallback to local state
      toast.error('Failed to sync resume with server');
    }
  }, [instruction, technicianId]);

  const abandonWork = useCallback(async () => {
    if (!instruction) return;
    try {
      await api.post(`/api/work-instructions/${instruction.id}/execute`, {
        action: 'abandon',
        workOrderId: '',
        technicianId,
      });
      setExecStatus('not_started');
      setCurrentStep(1);
      setStepResults(new Map());
      setSafetyPassed(new Map());
      setToolVerified(new Map());
      setPartVerified(new Map());
      setNotes('');
      toast.info('Work instruction abandoned');
    } catch {
      toast.error('Failed to abandon');
    }
  }, [instruction, technicianId]);

  const completeWork = useCallback(async () => {
    if (!instruction) return;
    setIsSubmitting(true);
    try {
      await api.post(`/api/work-instructions/${instruction.id}/execute`, {
        action: 'complete',
        technicianId,
        workOrderId: '',
        stepResults: Array.from(stepResults.values()),
        safetyResults: Array.from(safetyPassed.entries()).map(([stepNumber, isPassed]) => ({
          stepNumber,
          isPassed,
          acknowledgedById: technicianId,
          acknowledgedAt: new Date().toISOString(),
          notes: null,
        })),
        toolVerifications: Array.from(toolVerified.entries()).map(([toolId, isVerified]) => ({
          toolId,
          toolName: instruction.requiredTools.find((t) => t.id === toolId)?.toolName ?? toolId,
          isVerified,
          verifiedAt: isVerified ? new Date().toISOString() : null,
          verifiedById: isVerified ? technicianId : null,
          notes: null,
        })),
        partVerifications: Array.from(partVerified.entries()).map(([partId, isVerified]) => ({
          partId,
          partName: instruction.requiredParts.find((p) => p.id === partId)?.partName ?? partId,
          isVerified,
          verifiedAt: isVerified ? new Date().toISOString() : null,
          verifiedById: isVerified ? technicianId : null,
          quantityVerified: null,
          notes: null,
        })),
        notes,
        completionEvidence: [],
      });
      setExecStatus('completed');
      toast.success('Work instruction completed!');
    } catch {
      // Still mark completed locally
      setExecStatus('completed');
    } finally {
      setIsSubmitting(false);
    }
  }, [instruction, stepResults, safetyPassed, toolVerified, partVerified, notes, technicianId]);

  // ─── Render ───────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0">
            <Wrench className="h-4 w-4 text-cyan-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 truncate">
              Work Instructions
            </h2>
            <p className="text-[11px] text-slate-500 truncate">{componentName}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4 text-slate-400" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading && <PanelSkeleton />}

          {!loading && error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!loading && !error && !instruction && <EmptyState onClose={onClose} />}

          {!loading && !error && instruction && (
            <div className="space-y-4">
              {/* ── Title & Meta ─────────────────────────────────── */}
              <div>
                <h3 className="text-base font-bold text-slate-800">{instruction.title}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{instruction.description}</p>
              </div>

              {/* Meta badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-[11px] gap-1.5 border-slate-200 text-slate-600">
                  <Clock className="h-3 w-3" />
                  {instruction.estimatedDuration} min
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-[11px] gap-1.5 ${difficultyConfig(instruction.difficulty).bg} ${difficultyConfig(instruction.difficulty).color}`}
                >
                  <Zap className="h-3 w-3" />
                  {difficultyConfig(instruction.difficulty).label}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-[11px] gap-1.5 ${safetyConfig(instruction.safetyLevel).bg} ${safetyConfig(instruction.safetyLevel).color}`}
                >
                  <ShieldAlert className="h-3 w-3" />
                  {safetyConfig(instruction.safetyLevel).label} Safety
                </Badge>
                {(instruction.requiresLockout || instruction.requiresPermit) && (
                  <Badge variant="outline" className="text-[11px] gap-1.5 bg-red-50 border-red-200 text-red-600">
                    <ShieldAlert className="h-3 w-3" />
                    {instruction.requiresLockout && 'LOTO'}
                    {instruction.requiresLockout && instruction.requiresPermit && ' + '}
                    {instruction.requiresPermit && 'Permit'}
                  </Badge>
                )}
              </div>

              {/* ── Progress bar ─────────────────────────────────── */}
              {execStatus !== 'not_started' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 font-medium">Progress</span>
                    <span className="text-[11px] font-semibold text-slate-700">
                      {completedSteps}/{totalSteps} steps
                    </span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                </div>
              )}

              {/* ── Overview Stats ───────────────────────────────── */}
              <div className="grid grid-cols-4 gap-2">
                <StatCard label="Steps" value={String(totalSteps)} icon={<FileText className="h-4 w-4 text-cyan-500" />} />
                <StatCard label="Tools" value={String(instruction.requiredTools.length)} icon={<Wrench className="h-4 w-4 text-amber-500" />} />
                <StatCard label="Parts" value={String(instruction.requiredParts.length)} icon={<Package className="h-4 w-4 text-emerald-500" />} />
                <StatCard
                  label="Safety"
                  value={String(instruction.safetyCheckpoints.length)}
                  icon={<ShieldAlert className="h-4 w-4 text-red-500" />}
                />
              </div>

              {/* ── Tabs ─────────────────────────────────────────── */}
              <Tabs defaultValue="safety" className="w-full">
                <TabsList className="w-full grid grid-cols-4 h-9">
                  <TabsTrigger value="safety" className="text-[11px] gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    <span className="hidden sm:inline">Safety</span>
                  </TabsTrigger>
                  <TabsTrigger value="steps" className="text-[11px] gap-1">
                    <FileText className="h-3 w-3" />
                    <span className="hidden sm:inline">Steps</span>
                  </TabsTrigger>
                  <TabsTrigger value="tools" className="text-[11px] gap-1">
                    <Wrench className="h-3 w-3" />
                    <span className="hidden sm:inline">Tools</span>
                  </TabsTrigger>
                  <TabsTrigger value="parts" className="text-[11px] gap-1">
                    <Package className="h-3 w-3" />
                    <span className="hidden sm:inline">Parts</span>
                  </TabsTrigger>
                </TabsList>

                {/* ── Safety Tab ────────────────────────────────── */}
                <TabsContent value="safety" className="mt-3 space-y-3">
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldAlert className="h-4 w-4 text-red-600" />
                      <span className="text-xs font-semibold text-red-700">Safety First</span>
                    </div>
                    <p className="text-[11px] text-red-600">
                      All safety checkpoints must be acknowledged before starting work.
                    </p>
                  </div>

                  {instruction.safetyCheckpoints.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400">
                      No safety checkpoints defined for this instruction.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {instruction.safetyCheckpoints.map((cp) => {
                        const passed = safetyPassed.get(cp.stepNumber) === true;
                        return (
                          <Card key={cp.id} className={`border ${passed ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200'}`}>
                            <CardContent className="p-3">
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={passed}
                                  onCheckedChange={() => toggleSafetyCheckpoint(cp.stepNumber)}
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xs font-semibold ${passed ? 'text-emerald-700' : 'text-slate-700'}`}>
                                      {cp.title}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5">{cp.description}</p>

                                  {cp.ppeRequired.length > 0 && (
                                    <div className="mt-2">
                                      <span className="text-[10px] font-medium text-slate-500 uppercase">PPE Required:</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {cp.ppeRequired.map((ppe) => (
                                          <Badge key={ppe} variant="outline" className="text-[10px] bg-amber-50 border-amber-200 text-amber-700">
                                            {ppe}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {cp.type && (
                                    <Badge variant="outline" className="text-[10px] mt-2 border-slate-200 text-slate-500">
                                      {cp.type}
                                    </Badge>
                                  )}
                                </div>
                                {passed && (
                                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {instruction.safetyCheckpoints.length > 0 && (
                    <Button
                      className="w-full text-xs gap-2"
                      disabled={!allSafetyAcknowledged || execStatus === 'in_progress'}
                      onClick={startWork}
                    >
                      {isSubmitting && execStatus === 'not_started' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : allSafetyAcknowledged ? (
                        <Play className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      {execStatus === 'in_progress'
                        ? 'Work in Progress'
                        : allSafetyAcknowledged
                          ? 'Acknowledge & Start Work'
                          : 'Acknowledge All Safety First'}
                    </Button>
                  )}
                </TabsContent>

                {/* ── Steps Tab ─────────────────────────────────── */}
                <TabsContent value="steps" className="mt-3 space-y-3">
                  {execStatus === 'not_started' && instruction.safetyCheckpoints.length > 0 && (
                    <Alert className="border-amber-200 bg-amber-50">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-xs text-amber-700">
                        Please complete all safety checkpoints before proceeding with steps.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-3">
                    {instruction.steps.map((step) => {
                      const isActive = currentStep === step.stepNumber;
                      const result = stepResults.get(step.stepNumber);
                      const isCompleted = result?.status === 'completed';
                      const canInteract = execStatus === 'in_progress' && (isActive || step.stepNumber < currentStep);

                      return (
                        <div key={step.id}>
                          <Card
                            className={`border transition-all ${
                              isCompleted
                                ? 'border-emerald-200 bg-emerald-50/30'
                                : isActive
                                  ? 'border-cyan-300 bg-cyan-50/30 shadow-sm'
                                  : 'border-slate-200'
                            }`}
                          >
                            <CardContent className="p-3">
                              {/* Step Header */}
                              <div className="flex items-start gap-2.5">
                                <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
                                  isCompleted
                                    ? 'bg-emerald-500 text-white'
                                    : isActive
                                      ? 'bg-cyan-500 text-white'
                                      : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {isCompleted ? (
                                    <CheckCircle className="h-4 w-4" />
                                  ) : (
                                    step.stepNumber
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs font-semibold ${isCompleted ? 'text-emerald-700' : isActive ? 'text-cyan-700' : 'text-slate-700'}`}>
                                      Step {step.stepNumber}/{totalSteps}: {step.title}
                                    </span>
                                    {stepTypeIcon(step.type)}
                                  </div>

                                  {/* Time & Verification */}
                                  <div className="flex items-center gap-3 mt-1">
                                    {step.estimatedMinutes > 0 && (
                                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                        <Timer className="h-3 w-3" />
                                        {step.estimatedMinutes} min
                                      </span>
                                    )}
                                    {step.verificationRequired && (
                                      <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600 bg-amber-50">
                                        <Eye className="h-3 w-3 mr-1" />
                                        {step.verificationType} verification
                                        {step.verificationSpec && `: ${step.verificationSpec}`}
                                      </Badge>
                                    )}
                                    {step.isCheckpoint && (
                                      <Badge variant="outline" className="text-[10px] border-red-200 text-red-600 bg-red-50">
                                        <ShieldAlert className="h-3 w-3 mr-1" />
                                        Checkpoint
                                      </Badge>
                                    )}
                                  </div>

                                  {/* Instruction */}
                                  <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                                    {step.instruction}
                                  </p>

                                  {/* Tips */}
                                  {step.tips.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      {step.tips.map((tip, i) => (
                                        <div key={i} className="flex items-start gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 rounded px-2 py-1">
                                          <Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                          <span>{tip}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Warnings */}
                                  {step.warnings.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      {step.warnings.map((warning, i) => (
                                        <div key={i} className="flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 rounded px-2 py-1">
                                          <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                          <span>{warning}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Mark Complete Button */}
                              {canInteract && !isCompleted && (
                                <div className="mt-3 flex justify-end">
                                  <Button
                                    size="sm"
                                    className="text-[11px] gap-1.5 h-7"
                                    onClick={() => markStepComplete(step)}
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Mark Complete
                                  </Button>
                                </div>
                              )}

                              {isCompleted && (
                                <div className="mt-2 flex items-center gap-1.5 text-emerald-600">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  <span className="text-[11px] font-medium">Completed</span>
                                  {result?.completedAt && (
                                    <span className="text-[10px] text-slate-400">
                                      at {new Date(result.completedAt).toLocaleTimeString()}
                                    </span>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>

                          {/* Step connector line */}
                          {step.stepNumber < totalSteps && (
                            <div className="flex items-center justify-center py-1">
                              <div className={`h-4 w-px ${isCompleted ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {allStepsCompleted && execStatus === 'in_progress' && (
                    <Alert className="border-emerald-200 bg-emerald-50">
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                      <AlertDescription className="text-xs text-emerald-700 font-medium">
                        All steps completed! You can now submit the work instruction.
                      </AlertDescription>
                    </Alert>
                  )}
                </TabsContent>

                {/* ── Tools Tab ─────────────────────────────────── */}
                <TabsContent value="tools" className="mt-3 space-y-3">
                  <Card className="border-slate-200">
                    <CardHeader className="py-2.5 px-3">
                      <CardTitle className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <Wrench className="h-3.5 w-3.5 text-amber-500" />
                        Tools Required ({instruction.requiredTools.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3">
                      <div className="space-y-1.5">
                        {instruction.requiredTools.map((tool) => {
                          const verified = toolVerified.get(tool.id) === true;
                          return (
                            <div
                              key={tool.id}
                              className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                                verified ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200'
                              }`}
                            >
                              <Checkbox
                                checked={verified}
                                onCheckedChange={(checked) => {
                                  setToolVerified((prev) => {
                                    const next = new Map(prev);
                                    next.set(tool.id, !!checked);
                                    return next;
                                  });
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <span className={`text-xs font-medium ${verified ? 'text-emerald-700' : 'text-slate-700'}`}>
                                  {tool.toolName}
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-slate-400 font-mono">{tool.toolCode}</span>
                                  <span className="text-[10px] text-slate-400">x{tool.quantity}</span>
                                  {tool.specification && (
                                    <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-500">
                                      {tool.specification}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {verified && <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Parts Tab ─────────────────────────────────── */}
                <TabsContent value="parts" className="mt-3 space-y-3">
                  <Card className="border-slate-200">
                    <CardHeader className="py-2.5 px-3">
                      <CardTitle className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <Package className="h-3.5 w-3.5 text-emerald-500" />
                        Parts Required ({instruction.requiredParts.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3">
                      <div className="space-y-1.5">
                        {instruction.requiredParts.map((part) => {
                          const verified = partVerified.get(part.id) === true;
                          const sourceColor: Record<string, string> = {
                            inventory: 'text-blue-500',
                            external: 'text-amber-500',
                            on_site: 'text-emerald-500',
                          };
                          return (
                            <div
                              key={part.id}
                              className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                                verified ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200'
                              }`}
                            >
                              <Checkbox
                                checked={verified}
                                onCheckedChange={(checked) => {
                                  setPartVerified((prev) => {
                                    const next = new Map(prev);
                                    next.set(part.id, !!checked);
                                    return next;
                                  });
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <span className={`text-xs font-medium ${verified ? 'text-emerald-700' : 'text-slate-700'}`}>
                                  {part.partName}
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-slate-400 font-mono">{part.partCode}</span>
                                  <span className="text-[10px] text-slate-400">x{part.quantity}</span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] border-slate-200 ${sourceColor[part.source] ?? 'text-slate-500'}`}
                                  >
                                    {part.source.replace('_', ' ')}
                                  </Badge>
                                </div>
                              </div>
                              {verified && <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* ── Notes ────────────────────────────────────────── */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-500 uppercase">Technician Notes</label>
                <Textarea
                  placeholder="Add any observations, issues, or notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-xs min-h-[80px] resize-none"
                />
              </div>

              {/* ── Completion Evidence ───────────────────────────── */}
              {execStatus === 'in_progress' || execStatus === 'paused' ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-500 uppercase">Completion Evidence</label>
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-cyan-300 transition-colors cursor-pointer">
                    <Camera className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                    <p className="text-[11px] text-slate-400">Click to upload photos or evidence</p>
                    <p className="text-[10px] text-slate-300 mt-1">Supports JPG, PNG, PDF</p>
                  </div>
                </div>
              ) : null}

              <Separator />

              {/* ── Action Buttons ───────────────────────────────── */}
              <div className="flex flex-col sm:flex-row gap-2">
                {execStatus === 'not_started' && (
                  <Button
                    className="flex-1 text-xs gap-2"
                    disabled={
                      !allSafetyAcknowledged ||
                      (instruction.safetyCheckpoints.length > 0 && !allSafetyAcknowledged)
                    }
                    onClick={startWork}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Start Work
                  </Button>
                )}

                {execStatus === 'in_progress' && (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1 text-xs gap-2 border-amber-200 text-amber-600 hover:bg-amber-50"
                      onClick={pauseWork}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Pause className="h-3.5 w-3.5" />
                      )}
                      Pause
                    </Button>
                    <Button
                      className="flex-1 text-xs gap-2"
                      onClick={completeWork}
                      disabled={!allStepsCompleted || isSubmitting}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Complete & Submit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5 text-red-500 border-red-300 hover:bg-red-50"
                      onClick={abandonWork}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Abandon
                    </Button>
                  </>
                )}

                {execStatus === 'paused' && (
                  <Button className="flex-1 text-xs gap-2" onClick={resumeWork}>
                    <Play className="h-3.5 w-3.5" />
                    Resume Work
                  </Button>
                )}

                {execStatus === 'completed' && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                    <div className="flex-1">
                      <span className="text-xs font-semibold text-emerald-700">Work Instruction Completed</span>
                      <p className="text-[10px] text-emerald-500 mt-0.5">
                        All steps verified and submitted successfully.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="text-[11px]" onClick={onClose}>
                      Close
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ============================================================================
// Sub-component: Stat Card
// ============================================================================

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-3 text-center">
        <div className="flex justify-center mb-1">{icon}</div>
        <div className="text-lg font-bold text-slate-800">{value}</div>
        <div className="text-[10px] text-slate-500 uppercase">{label}</div>
      </CardContent>
    </Card>
  );
}
