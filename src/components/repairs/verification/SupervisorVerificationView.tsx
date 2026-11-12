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
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import {
  ArrowLeft, ShieldCheck, RotateCcw, Loader2, Star, FileText, Wrench, Package,
  Clock, Users, AlertTriangle, Camera, CheckCircle2, XCircle, ArrowRightLeft,
  HardHat, ClipboardCheck, Timer, Activity, Eye, Ban,
} from 'lucide-react';
import {
  EmptyState, LoadingSkeleton, formatDate, formatCurrency, formatDuration,
  PriorityBadge,
} from '@/components/shared/helpers';
import { ReadinessDisplay } from '@/components/repairs/shared/ReadinessDisplay';

// ============================================================================
// Types
// ============================================================================

interface SupervisorVerificationViewProps {
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
  teamName?: string;
  assignedTo?: string;
  failureMode?: string;
  failureCause?: string;
  remedy?: string;
  createdAt: string;
  completedAt?: string;
  reworkCount?: number;
  // Readiness
  blockers: Array<{ code: string; category: string; message: string; severity: 'blocker' | 'warning' }>;
  warnings: Array<{ code: string; category: string; message: string; severity: 'blocker' | 'warning' }>;
  // Sections
  teamMembers: TeamMember[];
  downtimeRecords: DowntimeRecord[];
  materials: MaterialItem[];
  tools: ToolItem[];
  measurements: MeasurementItem[];
  attachments: AttachmentItem[];
  handoverRecords: HandoverRecord[];
  safetyRestoration: SafetyRestoration;
  outstandingCustody: OutstandingCustodyItem[];
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
  requestedQty: number;
  issuedQty: number;
  consumedQty: number;
  returnedQty: number;
  unit?: string;
  unitCost?: number;
}

interface ToolItem {
  name: string;
  code?: string;
  issuedQty: number;
  returnedQty: number;
  condition?: string;
}

interface MeasurementItem {
  parameter: string;
  value: string;
  unit?: string;
  withinSpec: boolean;
}

interface AttachmentItem {
  id: string;
  fileName: string;
  type: string;
  uploadedAt: string;
  uploadedBy?: string;
}

interface HandoverRecord {
  fromUser: string;
  toUser: string;
  date: string;
  notes?: string;
}

interface SafetyRestoration {
  lotoRemoved: boolean;
  guardsReplaced: boolean;
  areaCleaned: boolean;
  hazardsAddressed: boolean;
  notes?: string;
}

interface OutstandingCustodyItem {
  type: 'tool' | 'material';
  name: string;
  code?: string;
  qtyOutstanding: number;
  assignedTo: string;
}

// ============================================================================
// Quality Rating Stars
// ============================================================================

function QualityRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          className="focus:outline-none transition-transform hover:scale-110"
          aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
        >
          <Star
            className={`h-6 w-6 transition-colors ${
              star <= (hovered || value)
                ? 'fill-amber-400 text-amber-400'
                : 'text-gray-300'
            }`}
          />
        </button>
      ))}
      <span className="ml-2 text-sm font-medium text-muted-foreground">
        {value > 0 ? `${value}/5` : 'Select rating'}
      </span>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function SupervisorVerificationView({
  workOrderId,
  userId,
  userRoles,
  onBack,
}: SupervisorVerificationViewProps) {
  const abortRef = useAbortRef();
  const [data, setData] = useState<WOData | null>(null);
  const [loading, setLoading] = useState(true);

  // Verify form
  const [qualityRating, setQualityRating] = useState(0);
  const [verifyNotes, setVerifyNotes] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Rework dialog
  const [reworkOpen, setReworkOpen] = useState(false);
  const [reworkReason, setReworkReason] = useState('');
  const [reworkCategory, setReworkCategory] = useState('');
  const [reworkComments, setReworkComments] = useState('');
  const [reworking, setReworking] = useState(false);

  const REWORK_CATEGORIES = [
    { value: 'quality', label: 'Quality Issue' },
    { value: 'incomplete', label: 'Work Incomplete' },
    { value: 'safety', label: 'Safety Concern' },
    { value: 'incorrect', label: 'Incorrect Repair' },
    { value: 'other', label: 'Other' },
  ];

  // Fetch WO data
  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<WOData>(`/api/work-orders/${workOrderId}`, {
        signal: abortRef.current.signal,
      });
      if (res.success && res.data) {
        setData(res.data);
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

  // Verify handler
  const handleVerify = async () => {
    if (qualityRating === 0) {
      toast.error('Please provide a quality rating');
      return;
    }
    setVerifying(true);
    try {
      const res = await api.post(`/api/work-orders/${workOrderId}/verify`, {
        action: 'verify',
        notes: verifyNotes,
        qualityRating,
        checklistPassed: true,
      });
      if (res.success) {
        toast.success('Work order verified successfully');
        onBack?.();
      } else {
        toast.error(res.error || 'Verification failed');
      }
    } catch {
      toast.error('Verification request failed');
    } finally {
      setVerifying(false);
    }
  };

  // Rework handler
  const handleRework = async () => {
    if (!reworkReason.trim()) {
      toast.error('Please provide a reason for rework');
      return;
    }
    if (!reworkCategory) {
      toast.error('Please select a rework category');
      return;
    }
    setReworking(true);
    try {
      const res = await api.post(`/api/work-orders/${workOrderId}/verify`, {
        action: 'rework',
        reason: reworkReason,
        category: reworkCategory,
        comments: reworkComments,
      });
      if (res.success) {
        toast.success('Rework requested successfully');
        setReworkOpen(false);
        onBack?.();
      } else {
        toast.error(res.error || 'Rework request failed');
      }
    } catch {
      toast.error('Rework request failed');
    } finally {
      setReworking(false);
    }
  };

  // Loading state
  if (loading) return <LoadingSkeleton />;
  if (!data) {
    return <EmptyState icon={ShieldCheck} title="Work order not found" description="The requested work order could not be loaded." />;
  }

  const hasBlockers = (data.blockers?.length || 0) > 0;
  const hasOutstanding = (data.outstandingCustody?.length || 0) > 0;

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
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              {data.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </Badge>
            {data.reworkCount && data.reworkCount > 0 && (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                <RotateCcw className="h-3 w-3 mr-1" /> {data.reworkCount} rework{data.reworkCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{data.title}</p>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Wrench className="h-3 w-3" /> {data.assetName}</span>
            {data.teamName && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {data.teamName}</span>}
            {data.completedAt && (
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Completed {formatDate(data.completedAt)}</span>
            )}
          </div>
        </div>
      </div>

      {/* ---- Readiness ---- */}
      {(data.blockers?.length || 0) > 0 || (data.warnings?.length || 0) > 0 ? (
        <ReadinessDisplay blockers={data.blockers || []} warnings={data.warnings || []} />
      ) : null}

      {/* ---- Problem Description ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> Problem Description</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{data.problemDescription || data.description || 'No problem description provided.'}</p>
        </CardContent>
      </Card>

      {/* ---- Work Performed ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-muted-foreground" /> Work Performed</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{data.workPerformed || 'No work performed summary provided.'}</p>
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

      {/* ---- Team Members & Labor ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> Team Members & Labor</CardTitle></CardHeader>
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
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">No team member data available.</p>}
        </CardContent>
      </Card>

      {/* ---- Downtime Records ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Timer className="h-4 w-4 text-muted-foreground" /> Downtime Records</CardTitle></CardHeader>
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

      {/* ---- Materials ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" /> Materials Used</CardTitle></CardHeader>
        <CardContent>
          {data.materials?.length > 0 ? (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Material</TableHead><TableHead className="text-right">Requested</TableHead>
                  <TableHead className="text-right">Issued</TableHead><TableHead className="text-right">Consumed</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.materials.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm"><div className="font-medium">{m.name}</div>{m.code && <div className="text-xs text-muted-foreground">{m.code}</div>}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{m.requestedQty} {m.unit || ''}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{m.issuedQty} {m.unit || ''}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{m.consumedQty} {m.unit || ''}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{m.returnedQty} {m.unit || ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : <p className="text-sm text-muted-foreground">No materials recorded.</p>}
        </CardContent>
      </Card>

      {/* ---- Tools ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Wrench className="h-4 w-4 text-muted-foreground" /> Tools Used</CardTitle></CardHeader>
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
                          {t.returnedQty}
                          {!allReturned && ` / ${t.issuedQty}`}
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

      {/* ---- Measurements / Test Results ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /> Measurements & Test Results</CardTitle></CardHeader>
        <CardContent>
          {data.measurements?.length > 0 ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Parameter</TableHead><TableHead>Value</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.measurements.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{m.parameter}</TableCell>
                    <TableCell className="text-sm font-mono">{m.value} {m.unit || ''}</TableCell>
                    <TableCell>
                      {m.withinSpec ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Within Spec
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
                          <XCircle className="h-3 w-3" /> Out of Spec
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">No measurements recorded.</p>}
        </CardContent>
      </Card>

      {/* ---- Evidence / Attachments ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Camera className="h-4 w-4 text-muted-foreground" /> Evidence & Attachments</CardTitle></CardHeader>
        <CardContent>
          {data.attachments?.length > 0 ? (
            <div className="space-y-2">
              {data.attachments.map((a, i) => (
                <div key={a.id || i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.type} · {a.uploadedBy || 'Unknown'} · {formatDate(a.uploadedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No attachments uploaded.</p>}
        </CardContent>
      </Card>

      {/* ---- Handover Records ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-muted-foreground" /> Handover Records</CardTitle></CardHeader>
        <CardContent>
          {data.handoverRecords?.length > 0 ? (
            <div className="space-y-3">
              {data.handoverRecords.map((h, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{h.fromUser} → {h.toUser}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(h.date)}</p>
                    {h.notes && <p className="text-xs text-muted-foreground mt-0.5">{h.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No handover records.</p>}
        </CardContent>
      </Card>

      {/* ---- Safety Restoration ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><HardHat className="h-4 w-4 text-muted-foreground" /> Safety Restoration Status</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'LOTO Removed', done: data.safetyRestoration?.lotoRemoved },
              { label: 'Guards Replaced', done: data.safetyRestoration?.guardsReplaced },
              { label: 'Area Cleaned', done: data.safetyRestoration?.areaCleaned },
              { label: 'Hazards Addressed', done: data.safetyRestoration?.hazardsAddressed },
            ].map((item) => (
              <div key={item.label} className={`flex items-center gap-2 p-3 rounded-lg border ${item.done ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}
              >
                {item.done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                )}
                <span className={`text-xs font-medium ${item.done ? 'text-emerald-700' : 'text-red-700'}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
          {data.safetyRestoration?.notes && (
            <p className="text-sm text-muted-foreground mt-3">{data.safetyRestoration.notes}</p>
          )}
        </CardContent>
      </Card>

      {/* ---- Outstanding Custody ---- */}
      {hasOutstanding && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-800"><Ban className="h-4 w-4" /> Outstanding Custody</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-amber-700 mb-3">The following tools/materials have not been fully returned:</p>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Type</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Qty Outstanding</TableHead><TableHead>Assigned To</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.outstandingCustody.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell><Badge variant="outline" className="text-xs">{c.type}</Badge></TableCell>
                    <TableCell className="text-sm font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-right font-mono text-red-600 font-semibold">{c.qtyOutstanding}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.assignedTo}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ---- Verification Actions ---- */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Verification Checklist</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {/* Quality Rating */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Quality Rating <span className="text-red-500">*</span></Label>
            <QualityRating value={qualityRating} onChange={setQualityRating} />
          </div>

          {/* Comments / Signature */}
          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="verify-notes">Supervisor Comments / Digital Signature</Label>
            <Textarea
              id="verify-notes"
              value={verifyNotes}
              onChange={(e) => setVerifyNotes(e.target.value)}
              placeholder="Add verification comments, observations, or sign-off notes..."
              rows={3}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button
              variant="destructive"
              className="sm:ml-auto"
              onClick={() => setReworkOpen(true)}
              disabled={verifying}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Request Rework
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleVerify}
              disabled={verifying || qualityRating === 0}
            >
              {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <ShieldCheck className="h-4 w-4 mr-2" />
              Verify Work Order
            </Button>
          </div>
          {qualityRating === 0 && (
            <p className="text-xs text-muted-foreground">Select a quality rating to enable verification.</p>
          )}
        </CardContent>
      </Card>

      {/* ---- Rework Dialog ---- */}
      <ResponsiveDialog
        open={reworkOpen}
        onOpenChange={(v) => { if (!v) { setReworkOpen(false); setReworkReason(''); setReworkCategory(''); setReworkComments(''); } }}
        title="Request Rework"
        description="This will send the work order back to the team for corrections."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setReworkOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRework} disabled={reworking || !reworkReason.trim() || !reworkCategory}>
              {reworking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <RotateCcw className="h-4 w-4 mr-2" />
              Submit Rework Request
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Category */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Category <span className="text-red-500">*</span></Label>
            <Select value={reworkCategory} onValueChange={setReworkCategory}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {REWORK_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="rework-reason">Reason <span className="text-red-500">*</span></Label>
            <Textarea
              id="rework-reason"
              value={reworkReason}
              onChange={(e) => setReworkReason(e.target.value)}
              placeholder="Describe what needs to be reworked..."
              rows={3}
            />
          </div>

          {/* Comments */}
          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="rework-comments">Additional Comments</Label>
            <Textarea
              id="rework-comments"
              value={reworkComments}
              onChange={(e) => setReworkComments(e.target.value)}
              placeholder="Optional additional context or evidence references..."
              rows={2}
            />
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
