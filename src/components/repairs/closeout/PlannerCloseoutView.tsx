'use client';

import { formatUiDateTime } from '@/lib/date-display';
import React, { useEffect, useState, useCallback } from 'react';

import { toast } from 'sonner';
import { api, useAbortRef } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ArrowLeft, FileCheck, Loader2, AlertTriangle, CheckCircle2, RotateCcw,
  FileText, Wrench, Package, Users, Clock, Timer, Activity, TrendingUp,
  ArrowDown, ArrowUp, DollarSign, ClipboardList, Eye, RefreshCw, Ban,
} from 'lucide-react';
import {
  EmptyState, LoadingSkeleton, formatDate, formatCurrency, formatDuration, PriorityBadge,
} from '@/components/shared/helpers';
import { ReadinessDisplay } from '@/components/repairs/shared/ReadinessDisplay';

// ============================================================================
// Types
// ============================================================================

interface PlannerCloseoutViewProps {
  workOrderId: string;
  userId: string;
  userRoles: string[];
  onBack?: () => void;
}

interface WOData {
  id: string;
  woNumber: string;
  title: string;
  status: string;
  priority: string;
  description: string;
  problemDescription: string;
  workPerformed: string;
  assetName: string;
  assetCode?: string;
  componentName?: string;
  teamName?: string;
  assignedTo?: string;
  failureMode?: string;
  failureCause?: string;
  remedy?: string;
  createdAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
  completedAt?: string;
  estimatedHours?: number;
  actualHours?: number;
  reworkHistory: ReworkEntry[];
  reliabilityImpact?: string;
  isRepeatFailure: boolean;
  repeatFailureCount?: number;
  linkedMRNumber?: string;
  linkedMRTitle?: string;
  // Costs
  laborCost: number;
  partsCost: number;
  contractorCost: number;
  totalCost: number;
  estimatedCost?: number;
  // Readiness
  blockers: Array<{ code: string; category: string; message: string; severity: 'blocker' | 'warning' }>;
  warnings: Array<{ code: string; category: string; message: string; severity: 'blocker' | 'warning' }>;
  // Sections
  teamMembers: TeamMember[];
  downtimeRecords: DowntimeRecord[];
  materials: MaterialItem[];
  tools: ToolItem[];
  // PM recommendation from technician
  pmRecommendation?: string;
}

interface ReworkEntry {
  id: string;
  requestedAt: string;
  requestedBy: string;
  reason: string;
  category: string;
  completedAt?: string;
}

interface TeamMember {
  name: string;
  role: string;
  hoursWorked: number;
}

interface DowntimeRecord {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reason?: string;
}

interface MaterialItem {
  name: string;
  code?: string;
  consumedQty: number;
  unit?: string;
  unitCost?: number;
  totalCost?: number;
}

interface ToolItem {
  name: string;
  code?: string;
  issuedQty: number;
  returnedQty: number;
  condition?: string;
}

// ============================================================================
// Cost Breakdown Sub-component
// ============================================================================

function CostBreakdown({
  laborCost,
  partsCost,
  contractorCost,
  totalCost,
  estimatedCost,
}: {
  laborCost: number;
  partsCost: number;
  contractorCost: number;
  totalCost: number;
  estimatedCost?: number;
}) {
  const variance = estimatedCost ? estimatedCost - totalCost : null;
  const variancePct = estimatedCost && estimatedCost > 0 ? ((variance || 0) / estimatedCost) * 100 : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" /> Cost Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Labor</p>
            <p className="text-base font-semibold mt-0.5">{formatCurrency(laborCost)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Parts</p>
            <p className="text-base font-semibold mt-0.5">{formatCurrency(partsCost)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Contractor</p>
            <p className="text-base font-semibold mt-0.5">{formatCurrency(contractorCost)}</p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <p className="text-xs text-emerald-600">Total Actual</p>
            <p className="text-base font-bold text-emerald-700 mt-0.5">{formatCurrency(totalCost)}</p>
          </div>
        </div>
        {estimatedCost != null && estimatedCost > 0 && variance !== null && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            variance >= 0
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {variance >= 0 ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            <div className="text-sm">
              <span className="font-medium">Variance from estimate: {formatCurrency(Math.abs(variance))}</span>
              {variancePct !== null && (
                <span className="ml-2 text-xs">({variance >= 0 ? '−' : '+'}{Math.abs(variancePct).toFixed(1)}%)</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Component
// ============================================================================

export function PlannerCloseoutView({
  workOrderId,
  userId,
  userRoles,
  onBack,
}: PlannerCloseoutViewProps) {
  const abortRef = useAbortRef();
  const [data, setData] = useState<WOData | null>(null);
  const [loading, setLoading] = useState(true);

  // Close form
  const [closeNotes, setCloseNotes] = useState('');
  const [failureMode, setFailureMode] = useState('');
  const [failureCause, setFailureCause] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [pmRecommendation, setPmRecommendation] = useState('');
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [closing, setClosing] = useState(false);

  // Fetch WO data
  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<WOData>(`/api/work-orders/${workOrderId}`, {
        signal: abortRef.current.signal,
      });
      if (res.success && res.data) {
        const d = res.data;
        setData(d);
        // Pre-fill from existing WO data
        if (d.failureMode) setFailureMode(d.failureMode);
        if (d.failureCause) setFailureCause(d.failureCause);
        if (d.remedy) setCorrectiveAction(d.remedy);
        if (d.pmRecommendation) setPmRecommendation(d.pmRecommendation);
      } else {
        toast.error(res.error || 'Failed to load work order');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error('Failed to load work order');
      }
    } finally {
      setLoading(false);
    }
  }, [workOrderId, abortRef]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Close handler
  const handleClose = async () => {
    setClosing(true);
    try {
      const payload: Record<string, any> = {
        notes: closeNotes,
        failureMode,
        failureCause,
        correctiveAction,
        pmRecommendation,
        followUpRequired,
        followUpNotes: followUpRequired ? followUpNotes : undefined,
      };
      const res = await api.post(`/api/work-orders/${workOrderId}/close`, payload);
      if (res.success) {
        toast.success('Work order closed successfully');
        onBack?.();
      } else {
        toast.error(res.error || 'Close failed');
      }
    } catch {
      toast.error('Close request failed');
    } finally {
      setClosing(false);
    }
  };

  // Loading state
  if (loading) return <LoadingSkeleton />;
  if (!data) {
    return <EmptyState icon={FileCheck} title="Work order not found" description="The requested work order could not be loaded." />;
  }

  const hasBlockers = (data.blockers?.length || 0) > 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ---- Back + Header ---- */}
      <div className="flex items-start gap-3">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="mt-0.5 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{data.woNumber}</h1>
            <PriorityBadge priority={data.priority} />
            <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">
              {data.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{data.title}</p>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><Wrench className="h-3 w-3" /> {data.assetName}</span>
            {data.componentName && <span>→ {data.componentName}</span>}
            {data.teamName && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {data.teamName}</span>}
            {data.verifiedAt && (
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Verified {formatDate(data.verifiedAt)}</span>
            )}
          </div>
        </div>
      </div>

      {/* ---- Blockers & Warnings (prominent at top) ---- */}
      {(data.blockers?.length || 0) > 0 || (data.warnings?.length || 0) > 0 ? (
        <ReadinessDisplay blockers={data.blockers || []} warnings={data.warnings || []} />
      ) : null}

      {/* ---- Linked Maintenance Request ---- */}
      {data.linkedMRNumber && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4 text-muted-foreground" /> Linked Maintenance Request</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="font-mono">{data.linkedMRNumber}</Badge>
              <span className="text-sm text-muted-foreground">{data.linkedMRTitle || 'No title'}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- Problem Description ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> Problem Description</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{data.problemDescription || data.description || 'No description provided.'}</p>
        </CardContent>
      </Card>

      {/* ---- Failure / Cause / Remedy ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /> Failure Analysis</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><p className="text-xs font-medium text-muted-foreground mb-1">Failure Mode</p><p className="text-sm">{data.failureMode || '—'}</p></div>
            <div><p className="text-xs font-medium text-muted-foreground mb-1">Cause</p><p className="text-sm">{data.failureCause || '—'}</p></div>
            <div><p className="text-xs font-medium text-muted-foreground mb-1">Remedy</p><p className="text-sm">{data.remedy || '—'}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Team & Labor ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> Team & Labor Summary</CardTitle></CardHeader>
        <CardContent>
          {data.teamMembers?.length > 0 ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead className="text-right">Hours</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.teamMembers.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{m.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.role}</TableCell>
                    <TableCell className="text-sm text-right font-mono">{formatDuration(m.hoursWorked)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell colSpan={2} className="text-sm">Total</TableCell>
                  <TableCell className="text-sm text-right font-mono">
                    {formatDuration(data.teamMembers.reduce((s, m) => s + (m.hoursWorked || 0), 0))}
                    {data.estimatedHours && (
                      <span className="text-xs text-muted-foreground ml-2">
                        (est. {formatDuration(data.estimatedHours)})
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">No team member data.</p>}
        </CardContent>
      </Card>

      {/* ---- Downtime ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Timer className="h-4 w-4 text-muted-foreground" /> Downtime</CardTitle></CardHeader>
        <CardContent>
          {data.downtimeRecords?.length > 0 ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Start</TableHead><TableHead>End</TableHead><TableHead className="text-right">Duration</TableHead><TableHead>Reason</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.downtimeRecords.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-mono">{d.startTime ? formatUiDateTime(d.startTime) : '—'}</TableCell>
                    <TableCell className="text-xs font-mono">{d.endTime ? formatUiDateTime(d.endTime) : '—'}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{formatDuration((d.durationMinutes || 0) / 60)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.reason || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">No downtime records.</p>}
        </CardContent>
      </Card>

      {/* ---- Materials Summary ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" /> Materials Summary</CardTitle></CardHeader>
        <CardContent>
          {data.materials?.length > 0 ? (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Material</TableHead><TableHead className="text-right">Consumed</TableHead><TableHead className="text-right">Cost</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.materials.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm"><div className="font-medium">{m.name}</div>{m.code && <div className="text-xs text-muted-foreground">{m.code}</div>}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{m.consumedQty} {m.unit || ''}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{formatCurrency(m.totalCost || (m.consumedQty * (m.unitCost || 0)))}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell colSpan={2} className="text-sm">Total</TableCell>
                    <TableCell className="text-sm text-right font-mono">
                      {formatCurrency(data.materials.reduce((s, m) => s + (m.totalCost || (m.consumedQty * (m.unitCost || 0))), 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : <p className="text-sm text-muted-foreground">No materials recorded.</p>}
        </CardContent>
      </Card>

      {/* ---- Tools Summary ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Wrench className="h-4 w-4 text-muted-foreground" /> Tools Summary</CardTitle></CardHeader>
        <CardContent>
          {data.tools?.length > 0 ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tool</TableHead><TableHead className="text-right">Issued</TableHead>
                <TableHead className="text-right">Returned</TableHead><TableHead>Condition</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.tools.map((t, i) => {
                  const allReturned = t.returnedQty >= t.issuedQty;
                  const condColor: Record<string, string> = {
                    new: 'bg-emerald-100 text-emerald-800', good: 'bg-teal-100 text-teal-800',
                    fair: 'bg-amber-100 text-amber-800', poor: 'bg-orange-100 text-orange-800',
                    damaged: 'bg-red-100 text-red-800',
                  };
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-sm"><div className="font-medium">{t.name}</div>{t.code && <div className="text-xs text-muted-foreground">{t.code}</div>}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{t.issuedQty}</TableCell>
                      <TableCell className="text-sm text-right font-mono">
                        <span className={allReturned ? '' : 'text-red-600 font-semibold'}>
                          {t.returnedQty}{!allReturned && ` / ${t.issuedQty}`}
                        </span>
                      </TableCell>
                      <TableCell>
                        {t.condition ? (
                          <Badge variant="outline" className={condColor[t.condition] || 'bg-gray-100'}>
                            {t.condition.charAt(0).toUpperCase() + t.condition.slice(1)}
                          </Badge>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">No tools recorded.</p>}
        </CardContent>
      </Card>

      {/* ---- Cost Breakdown ---- */}
      <CostBreakdown
        laborCost={data.laborCost || 0}
        partsCost={data.partsCost || 0}
        contractorCost={data.contractorCost || 0}
        totalCost={data.totalCost || 0}
        estimatedCost={data.estimatedCost}
      />

      {/* ---- Rework History ---- */}
      {data.reworkHistory?.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-800">
              <RotateCcw className="h-4 w-4" /> Rework History ({data.reworkHistory.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.reworkHistory.map((r, i) => (
                <div key={r.id || i} className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 border border-orange-100">
                  <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                    <RotateCcw className="h-3.5 w-3.5 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-200">{r.category}</Badge>
                      <span className="text-xs text-muted-foreground">by {r.requestedBy} · {formatDate(r.requestedAt)}</span>
                    </div>
                    <p className="text-sm mt-1">{r.reason}</p>
                    {r.completedAt && (
                      <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Rework completed {formatDate(r.completedAt)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- Reliability Impact ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-muted-foreground" /> Reliability Impact</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Repeat Failure</p>
              {data.isRepeatFailure ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium text-red-700">Yes</span>
                  {data.repeatFailureCount && data.repeatFailureCount > 1 && (
                    <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-xs ml-1">
                      {data.repeatFailureCount} occurrences
                    </Badge>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm text-emerald-700">No</span>
                </div>
              )}
            </div>
            {data.reliabilityImpact && (
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Assessment</p>
                <p className="text-sm mt-1">{data.reliabilityImpact}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---- PM Recommendation (from technician) ---- */}
      {data.pmRecommendation && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><RefreshCw className="h-4 w-4 text-muted-foreground" /> Technician PM Recommendation</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">{data.pmRecommendation}</p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ---- Close Form ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-teal-600" /> Close Work Order
          </CardTitle>
          {hasBlockers && (
            <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
              <Ban className="h-3 w-3" /> Resolve all blockers before closing.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Failure Mode */}
          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="close-failure-mode">Failure Mode</Label>
            <Textarea
              id="close-failure-mode"
              value={failureMode}
              onChange={(e) => setFailureMode(e.target.value)}
              placeholder="e.g. Bearing seizure, Seal failure, Electrical short..."
              rows={2}
            />
          </div>

          {/* Failure Cause */}
          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="close-failure-cause">Failure Cause</Label>
            <Textarea
              id="close-failure-cause"
              value={failureCause}
              onChange={(e) => setFailureCause(e.target.value)}
              placeholder="Root cause analysis..."
              rows={2}
            />
          </div>

          {/* Corrective Action */}
          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="close-corrective">Corrective Action</Label>
            <Textarea
              id="close-corrective"
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              placeholder="What was done to correct the issue..."
              rows={2}
            />
          </div>

          {/* PM Recommendation */}
          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="close-pm-rec">PM Recommendation</Label>
            <Textarea
              id="close-pm-rec"
              value={pmRecommendation}
              onChange={(e) => setPmRecommendation(e.target.value)}
              placeholder="Preventive maintenance recommendations for the future..."
              rows={2}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="close-notes">Close Notes / Comments</Label>
            <Textarea
              id="close-notes"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="Any additional notes for the closeout record..."
              rows={2}
            />
          </div>

          {/* Follow-up */}
          <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2">
              <Checkbox
                id="follow-up-check"
                checked={followUpRequired}
                onCheckedChange={(v) => setFollowUpRequired(v === true)}
              />
              <Label htmlFor="follow-up-check" className="text-sm font-medium cursor-pointer">
                Follow-up required
              </Label>
            </div>
            {followUpRequired && (
              <div className="space-y-2 ml-6">
                <Label className="text-xs text-muted-foreground" htmlFor="follow-up-notes">Follow-up Notes</Label>
                <Textarea
                  id="follow-up-notes"
                  value={followUpNotes}
                  onChange={(e) => setFollowUpNotes(e.target.value)}
                  placeholder="Describe follow-up actions needed..."
                  rows={2}
                />
              </div>
            )}
          </div>

          {/* Close Button */}
          <div className="flex justify-end pt-2">
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={handleClose}
              disabled={closing || hasBlockers}
            >
              {closing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <FileCheck className="h-4 w-4 mr-2" />
              Close Work Order
            </Button>
          </div>
          {hasBlockers && (
            <p className="text-xs text-red-600 text-right">
              <Ban className="h-3 w-3 inline mr-1" />
              Resolve {data.blockers.length} blocker{data.blockers.length > 1 ? 's' : ''} before closing.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
