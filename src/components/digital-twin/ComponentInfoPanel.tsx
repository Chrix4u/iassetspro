'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  X,
  Info,
  Wrench,
  Radio,
  Box,
  FileText,
  ExternalLink,
  Download,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  MapPin,
  Tag,
  Cpu,
  Gauge,
  Thermometer,
  Zap,
  Droplets,
  Activity,
  Package,
  ClipboardList,
  User,
  ChevronRight,
  Loader2,
  PlusCircle,
  FileSearch,
  GitBranch,
  Heart,
  ShieldAlert,
  Hammer,
  Eye,
  BarChart3,
  AlertOctagon,
  ChevronDown,
  CircleDot,
  History,
  Brain,
  Sparkles,
  Check,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDigitalTwinStore } from '@/stores/digitalTwinStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { api } from '@/lib/api';

import type { ComponentRegistryItem, FailureRecord, FailureAnalysisData, PredictionAlertData } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface ComponentInfoPanelProps {
  /** Override selected asset data from the store (optional) */
  asset?: Record<string, unknown> | null;
  /** Override work orders from the store (optional) */
  workOrders?: Record<string, unknown>[];
  /** Override IoT devices from the store (optional) */
  iotDevices?: Record<string, unknown>[];
  /** Override PM schedules from the store (optional) */
  pmSchedules?: Record<string, unknown>[];
  /** Override BOM children from the store (optional) */
  bomChildren?: Record<string, unknown>[];
  /** Override attachments from the store (optional) */
  attachments?: Record<string, unknown>[];
  /** Whether the panel is visible */
  isOpen?: boolean;
  /** Callback to close the panel */
  onClose?: () => void;
}

interface MeshComponentMappingRecord {
  meshName: string;
  mappingType: string;
  targetId: string;
  targetName?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

// ============================================================================
// Helper: Safe field accessor
// ============================================================================

function field(record: Record<string, unknown> | null | undefined, key: string, fallback = '—'): string {
  if (!record) return fallback;
  const val = record[key];
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val || fallback;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (val instanceof Date) return val.toLocaleDateString();
  return String(val);
}

// ============================================================================
// Status badge helper
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
    active: { variant: 'default', className: 'bg-emerald-600 text-white' },
    completed: { variant: 'default', className: 'bg-emerald-600 text-white' },
    closed: { variant: 'secondary', className: 'bg-slate-600 text-slate-100' },
    in_progress: { variant: 'default', className: 'bg-blue-600 text-white' },
    'in progress': { variant: 'default', className: 'bg-blue-600 text-white' },
    open: { variant: 'outline', className: 'border-amber-500 text-amber-400' },
    pending: { variant: 'outline', className: 'border-amber-500 text-amber-400' },
    assigned: { variant: 'outline', className: 'border-blue-500 text-blue-400' },
    approved: { variant: 'outline', className: 'border-green-500 text-green-400' },
    on_hold: { variant: 'outline', className: 'border-orange-500 text-orange-400' },
    overdue: { variant: 'destructive', className: 'bg-red-600 text-white' },
    cancelled: { variant: 'secondary', className: 'bg-slate-700 text-slate-300' },
    new: { variant: 'default', className: 'bg-emerald-600 text-white' },
    good: { variant: 'default', className: 'bg-emerald-600 text-white' },
    fair: { variant: 'outline', className: 'border-amber-500 text-amber-400' },
    poor: { variant: 'destructive', className: 'bg-red-600 text-white' },
    critical: { variant: 'destructive', className: 'bg-red-600 text-white' },
    operational: { variant: 'default', className: 'bg-emerald-600 text-white' },
    degraded: { variant: 'outline', className: 'border-amber-500 text-amber-400' },
    offline: { variant: 'secondary', className: 'bg-slate-700 text-slate-300' },
  };

  const cfg = config[s] ?? { variant: 'secondary' as const, className: 'bg-slate-600 text-slate-100' };

  return <Badge variant={cfg.variant} className={`text-[10px] px-1.5 py-0 ${cfg.className}`}>{status}</Badge>;
}

// ============================================================================
// Priority badge helper
// ============================================================================

function PriorityBadge({ priority }: { priority: string }) {
  const p = (priority || '').toLowerCase();
  const colorMap: Record<string, string> = {
    critical: 'text-red-400',
    high: 'text-orange-400',
    medium: 'text-amber-400',
    low: 'text-slate-400',
    emergency: 'text-red-500 font-bold',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase ${colorMap[p] ?? 'text-slate-400'}`}>
      {priority || '—'}
    </span>
  );
}

// ============================================================================
// Severity badge helper
// ============================================================================

function SeverityBadge({ severity }: { severity: string }) {
  const s = (severity || '').toLowerCase();
  const config: Record<string, string> = {
    critical: 'bg-red-600/20 text-red-400 border-red-600/30',
    high: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
    medium: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
    low: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
  };
  return (
    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${config[s] ?? 'bg-slate-600/20 text-slate-400 border-slate-600/30'}`}>
      {severity || '—'}
    </Badge>
  );
}

// ============================================================================
// Criticality badge helper
// ============================================================================

function CriticalityBadge({ criticality }: { criticality: string }) {
  const c = (criticality || '').toLowerCase();
  const config: Record<string, string> = {
    critical: 'bg-red-600/20 text-red-400 border-red-600/30',
    high: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
    medium: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
    low: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
  };
  return (
    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${config[c] ?? 'bg-slate-600/20 text-slate-400 border-slate-600/30'}`}>
      {criticality || '—'}
    </Badge>
  );
}

// ============================================================================
// Section Card wrapper
// ============================================================================

function SectionCard({ title, icon, children, className = '', action }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="bg-white/[0.03] border-white/[0.06] rounded-lg">
      <CardHeader className="py-2.5 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            {icon}
            {title}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {children}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Info Field
// ============================================================================

function InfoField({ label, value, icon }: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {icon && <span className="text-slate-500 mt-0.5">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
        <div className="text-xs text-slate-200 font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Health Score Gauge (circular SVG)
// ============================================================================

function HealthScoreGauge({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const color = score > 70 ? '#10b981' : score > 40 ? '#f59e0b' : '#ef4444';
  const bgColor = score > 70 ? 'rgba(16,185,129,0.1)' : score > 40 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';
  const label = score > 70 ? 'Good' : score > 40 ? 'Fair' : 'Poor';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="4"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <Badge
        variant="outline"
        className="text-[9px] px-1.5 py-0"
        style={{ color, borderColor: color, backgroundColor: bgColor }}
      >
        {label}
      </Badge>
    </div>
  );
}

// ============================================================================
// Mini Health Bar
// ============================================================================

function MiniHealthBar({ score }: { score: number }) {
  const color = score > 70 ? 'bg-emerald-500' : score > 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[9px] text-slate-400 w-6 text-right">{score}</span>
    </div>
  );
}

// ============================================================================
// Skeleton Loader
// ============================================================================

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 p-2">
      <div className="h-4 w-4 rounded bg-white/5 animate-pulse" />
      <div className="flex-1 space-y-1">
        <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
        <div className="h-2 w-1/2 rounded bg-white/5 animate-pulse" />
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Overview (Enhanced)
// ============================================================================

function OverviewTab({
  asset,
  component,
  onCreateWO,
  onCreateMR,
  onViewDiagram,
}: {
  asset: Record<string, unknown> | null;
  component: Record<string, unknown> | null;
  onCreateWO: () => void;
  onCreateMR: () => void;
  onViewDiagram: () => void;
}) {
  const lastInspection = (asset?.lastInspection as string | null) ?? null;
  const assetId = asset?.id ? String(asset.id) : '';

  const daysSinceInspection = useMemo(() => {
    if (!lastInspection) return null;
    const diff = Date.now() - new Date(lastInspection).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }, [lastInspection]);

  if (!asset) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-500">
        <Info className="h-8 w-8 mb-2 opacity-40" />
        <span className="text-xs">No asset data available</span>
      </div>
    );
  }

  const criticality = String(asset.criticality ?? '').toLowerCase();
  const condition = String(asset.condition ?? 'unknown').toLowerCase();
  const conditionColors: Record<string, string> = {
    new: 'text-emerald-400',
    good: 'text-emerald-400',
    fair: 'text-amber-400',
    poor: 'text-red-400',
    out_of_service: 'text-slate-500',
  };

  const healthScore = typeof asset.healthScore === 'number' ? asset.healthScore :
    (condition === 'good' || condition === 'new' ? 85 :
     condition === 'fair' ? 55 :
     condition === 'poor' ? 25 : 50);

  const operatingHours = typeof asset.operatingHours === 'number' ? asset.operatingHours : 0;
  const expectedLifeHours = typeof asset.expectedLifeHours === 'number' ? asset.expectedLifeHours : null;

  const lifecycleStatus = String(asset.lifecycleStatus ?? field(asset, 'status', 'unknown'));

  return (
    <div className="space-y-3">
      {/* Asset Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white truncate">
            {field(asset, 'name')}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <Tag className="h-3 w-3 text-slate-500" />
            <span className="text-xs text-slate-400 font-mono">{field(asset, 'assetTag')}</span>
          </div>
        </div>
        <StatusBadge status={field(asset, 'status', 'unknown')} />
      </div>

      {/* Health Score + Key Metrics Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 flex flex-col items-center justify-center">
          <HealthScoreGauge score={healthScore} size={52} />
          <div className="text-[9px] text-slate-500 uppercase mt-1">Health</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5">
          <div className="text-[10px] text-slate-500 uppercase">Condition</div>
          <div className={`text-sm font-bold mt-1 ${conditionColors[condition] ?? 'text-slate-400'}`}>
            {field(asset, 'condition', 'Unknown')}
          </div>
          <div className="text-[10px] text-slate-500 uppercase mt-2">Criticality</div>
          <div className="mt-0.5">
            <CriticalityBadge criticality={field(asset, 'criticality', 'Low')} />
          </div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5">
          <div className="text-[10px] text-slate-500 uppercase">Lifecycle</div>
          <div className="mt-0.5 mb-2">
            <StatusBadge status={lifecycleStatus} />
          </div>
          {operatingHours > 0 && (
            <>
              <div className="text-[10px] text-slate-500 uppercase">Op. Hours</div>
              <div className="text-xs font-semibold text-slate-200 mt-0.5">
                {operatingHours.toLocaleString()}
                {expectedLifeHours ? (
                  <span className="text-slate-500"> / {(expectedLifeHours / 1000).toFixed(0)}k</span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Operating Metrics */}
      {(operatingHours > 0 || daysSinceInspection !== null) && (
        <SectionCard title="Operating Metrics" icon={<Activity className="h-3.5 w-3.5 text-slate-400" />}>
          <div className="space-y-2">
            {operatingHours > 0 && expectedLifeHours && (
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-slate-500">Life Usage</span>
                  <span className="text-slate-300">{Math.round((operatingHours / expectedLifeHours) * 100)}%</span>
                </div>
                <Progress value={Math.min((operatingHours / expectedLifeHours) * 100, 100)} className="h-1.5 bg-white/5" />
              </div>
            )}
            {daysSinceInspection !== null && (
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3 w-3 text-slate-500" />
                  <span className="text-[10px] text-slate-500">Days Since Inspection</span>
                </div>
                <span className={`text-xs font-semibold ${daysSinceInspection > 90 ? 'text-red-400' : daysSinceInspection > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {daysSinceInspection}
                </span>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      <Separator className="bg-white/[0.06]" />

      {/* Component Registry Section */}
      <SectionCard title="Component Registry" icon={<Cpu className="h-3.5 w-3.5 text-slate-400" />}>
        {component ? (
          <div className="space-y-0.5">
            <InfoField label="Component" value={field(component, 'name')} icon={<Box className="h-3 w-3" />} />
            <InfoField label="Component Code" value={field(component, 'componentCode')} icon={<Tag className="h-3 w-3" />} />
            <InfoField label="Type" value={field(component, 'componentType')} icon={<GitBranch className="h-3 w-3" />} />
            <InfoField label="Manufacturer" value={field(component, 'manufacturer')} icon={<Building2 className="h-3 w-3" />} />
            <InfoField label="Model Number" value={field(component, 'modelNumber')} icon={<Package className="h-3 w-3" />} />
            <InfoField label="Serial No." value={field(component, 'serialNumber')} icon={<Tag className="h-3 w-3" />} />
            <InfoField label="Criticality" value={field(component, 'criticality')} icon={<ShieldAlert className="h-3 w-3" />} />
            <InfoField label="Lifecycle" value={field(component, 'lifecycleStatus')} icon={<Activity className="h-3 w-3" />} />
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 py-1">
            This 3D mesh is not mapped to a component-registry record yet. Asset-level data remains available.
          </div>
        )}
      </SectionCard>

      {/* Description */}
      {asset.description && String(asset.description).length > 0 && (
        <SectionCard title="Description" icon={<FileText className="h-3.5 w-3.5 text-slate-400" />}>
          <p className="text-xs text-slate-300 leading-relaxed">
            {String(asset.description)}
          </p>
        </SectionCard>
      )}

      {/* Quick Actions */}
      <SectionCard title="Quick Actions" icon={<Zap className="h-3.5 w-3.5 text-slate-400" />}>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!assetId}
            onClick={onCreateWO}

            className="h-8 text-[10px] gap-1 border-white/10 text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-300 hover:border-cyan-500/30"
          >
            <PlusCircle className="h-3 w-3" />
            Create WO
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!assetId}
            onClick={onCreateMR}

            className="h-8 text-[10px] gap-1 border-white/10 text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-300 hover:border-cyan-500/30"
          >
            <PlusCircle className="h-3 w-3" />
            Create MR
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!assetId}
            onClick={onViewDiagram}

            className="h-8 text-[10px] gap-1 border-white/10 text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-300 hover:border-cyan-500/30"
          >
            <FileSearch className="h-3 w-3" />
            View Diagram
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

// ============================================================================
// Tab: Maintenance (Enhanced)
// ============================================================================

function MaintenanceTab({
  workOrders,
  pmSchedules,
  failureAnalysis,
  failureRecords,
  component,
}: {
  workOrders: Record<string, unknown>[];
  pmSchedules: Record<string, unknown>[];
  failureAnalysis: FailureAnalysisData | null;
  failureRecords: FailureRecord[];
  component: Record<string, unknown> | null;
}) {
  const navigate = useNavigationStore((s) => s.navigate);
  const componentWorkOrders = component
    ? asRecordArray(component.workOrderComponents)
        .map((entry) => asRecord(entry.workOrder))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
    : workOrders;
  const componentPmSchedules = component ? asRecordArray(component.pmSchedules) : pmSchedules;
  const componentSpareParts = component ? asRecordArray(component.sparePartLinks) : [];
  const componentTools = component ? asRecordArray(component.toolRequirements) : [];
  const componentHistory = component ? asRecordArray(component.maintenanceHistory) : [];


  return (
    <div className="space-y-3">
      {/* Failure Analysis Summary */}
      {failureAnalysis && (
        <SectionCard title="Failure Analysis Summary" icon={<BarChart3 className="h-3.5 w-3.5 text-slate-400" />}>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 text-center">
              <div className="text-[10px] text-slate-500 uppercase">MTBF</div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">
                {failureAnalysis.mtbf ? `${(failureAnalysis.mtbf / 24).toFixed(0)}d` : 'N/A'}
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 text-center">
              <div className="text-[10px] text-slate-500 uppercase">MTTR</div>
              <div className="text-sm font-bold text-amber-400 mt-0.5">
                {failureAnalysis.mttr ? `${failureAnalysis.mttr.toFixed(1)}h` : 'N/A'}
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 text-center">
              <div className="text-[10px] text-slate-500 uppercase">Total Failures</div>
              <div className="text-sm font-bold text-red-400 mt-0.5">{failureAnalysis.failureCount}</div>
            </div>
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 text-center">
              <div className="text-[10px] text-slate-500 uppercase">Reliability</div>
              <div className={`text-sm font-bold mt-0.5 ${failureAnalysis.reliabilityScore > 70 ? 'text-emerald-400' : failureAnalysis.reliabilityScore > 40 ? 'text-amber-400' : 'text-red-400'}`}>
                {failureAnalysis.reliabilityScore}%
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Recent Failures */}
      {failureRecords.length > 0 && (
        <SectionCard title={`Recent Failures (${Math.min(failureRecords.length, 5)})`} icon={<AlertOctagon className="h-3.5 w-3.5 text-slate-400" />}>
          <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
            {failureRecords.slice(0, 5).map((fr) => (
              <div
                key={fr.id}
                className="flex items-center gap-2 p-2 rounded-md bg-white/[0.02] border border-white/[0.04]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-200 truncate">
                      {fr.failureMode}
                    </span>
                    <SeverityBadge severity={fr.failureSeverity} />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(fr.detectedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Failure Trend Sparkline */}
      {failureAnalysis && failureAnalysis.byMonth.length > 0 && (
        <SectionCard title="Failure Trend (6mo)" icon={<TrendingUp className="h-3.5 w-3.5 text-slate-400" />}>
          <div className="flex items-end gap-1.5 h-12 px-1">
            {failureAnalysis.byMonth.slice(-6).map((m, i) => {
              const maxFailures = Math.max(...failureAnalysis.byMonth.slice(-6).map((x) => x.failures), 1);
              const h = Math.max((m.failures / maxFailures) * 100, 4);
              const color = m.failures === 0 ? 'bg-emerald-500/60' : m.failures <= 2 ? 'bg-amber-500/60' : 'bg-red-500/60';
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t ${color} transition-all`}
                    style={{ height: `${h}%` }}
                  />
                  <span className="text-[8px] text-slate-600">{m.month.slice(-2)}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Work Orders */}
      <SectionCard title={`Work Orders (${componentWorkOrders.length})`} icon={<ClipboardList className="h-3.5 w-3.5 text-slate-400" />}>
        {componentWorkOrders.length === 0 ? (
          <div className="text-xs text-slate-500 py-2 text-center">
            {component ? 'No work orders linked to this component' : 'No work orders found'}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
            {componentWorkOrders.map((wo, i) => {
              const dueDate = wo.dueDate ?? wo.plannedEnd;
              const isOverdue = dueDate && new Date(String(dueDate)) < new Date() &&
                !['completed', 'closed', 'cancelled'].includes(String(wo.status ?? '').toLowerCase());

              return (
                <button
                  type="button"
                  key={String(wo.id ?? i)}
                  onClick={() => {
                    if (wo.id) navigate('maintenance-work-orders', { id: String(wo.id) });
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-md bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {field(wo, 'woNumber', `WO-${String(wo.id).slice(0, 6)}`)}
                      </span>
                      {isOverdue && <AlertTriangle className="h-3 w-3 text-red-400 flex-shrink-0" />}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      {field(wo, 'title', 'Untitled')}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <StatusBadge status={field(wo, 'status', 'unknown')} />
                    <PriorityBadge priority={field(wo, 'priority', 'low')} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* PM Schedules */}
      <SectionCard title={`PM Schedules (${componentPmSchedules.length})`} icon={<Timer className="h-3.5 w-3.5 text-slate-400" />}>
        {componentPmSchedules.length === 0 ? (
          <div className="text-xs text-slate-500 py-2 text-center">
            {component ? 'No PM schedules assigned to this component' : 'No PM schedules found'}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
            {componentPmSchedules.map((pm, i) => {
              const nextDue = field(pm, 'nextDueDate');
              const isOverdue = nextDue !== '—' && new Date(nextDue) < new Date();

              return (
                <div
                  key={String(pm.id ?? i)}
                  className="flex items-center gap-2 p-2 rounded-md bg-white/[0.02] border border-white/[0.04]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-200 truncate">
                      {field(pm, 'title', field(pm, 'name', 'PM Schedule'))}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-500">
                        Every {field(pm, 'frequencyValue')} {field(pm, 'frequencyType', field(pm, 'frequencyUnit'))}
                      </span>
                      {isOverdue && (
                        <Badge className="bg-red-600 text-white text-[9px] px-1 py-0">OVERDUE</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 flex-shrink-0">
                    {nextDue !== '—' && (
                      <span className={isOverdue ? 'text-red-400' : ''}>
                        Due: {nextDue}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <p className="text-[10px] leading-relaxed text-slate-500">
        Live component-linked resource records only; this panel does not invent stock or availability when no authoritative data is linked.
      </p>

      {/* Spare Parts */}
      <SectionCard title={'Spare Parts (' + componentSpareParts.length + ')'} icon={<Package className="h-3.5 w-3.5 text-slate-400" />}>
        {!component ? (
          <div className="text-xs text-slate-500 py-2 text-center">
            Map this 3D mesh to a component to view linked spare-part stock.
          </div>
        ) : componentSpareParts.length === 0 ? (
          <div className="text-xs text-slate-500 py-2 text-center">No spare parts linked to this component</div>
        ) : (
          <div className="space-y-1.5">
            {componentSpareParts.map((part, i) => {
              const inventory = asRecord(part.inventoryItem);
              const stock = Number(inventory?.currentStock ?? 0);
              const minStock = Number(inventory?.minStockLevel ?? 0);
              const required = Number(part.quantityRequired ?? 1);
              const targetStock = Math.max(required, minStock);
              const inStock = stock >= targetStock;
              const lowStock = stock > 0 && !inStock;
              const unit = field(inventory, 'unitOfMeasure', 'ea');
              return (
                <div key={String(part.id ?? i)} className="flex items-center justify-between gap-2 p-2 rounded-md bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={'h-2 w-2 rounded-full flex-shrink-0 ' + (!inventory ? 'bg-slate-500' : inStock ? 'bg-emerald-500' : lowStock ? 'bg-amber-500' : 'bg-red-500')} />
                    <div className="min-w-0">
                      <div className="text-xs text-slate-300 truncate">
                        {field(inventory, 'name', field(part, 'sparePartName', 'Spare part'))}
                      </div>
                      <div className="text-[9px] text-slate-600 truncate">
                        {field(inventory, 'itemCode', field(part, 'sparePartCode'))} · Required {required} {unit}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={'text-[10px] font-semibold ' + (!inventory ? 'text-slate-400' : inStock ? 'text-emerald-400' : lowStock ? 'text-amber-400' : 'text-red-400')}>
                      {inventory ? stock : '—'}
                    </span>
                    <span className="text-[9px] text-slate-600">{inventory ? unit : 'unlinked'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Tool Requirements */}
      <SectionCard title={'Tool Requirements (' + componentTools.length + ')'} icon={<Hammer className="h-3.5 w-3.5 text-slate-400" />}>
        {!component ? (
          <div className="text-xs text-slate-500 py-2 text-center">
            Map this 3D mesh to a component to view required tools.
          </div>
        ) : componentTools.length === 0 ? (
          <div className="text-xs text-slate-500 py-2 text-center">No tools linked to this component</div>
        ) : (
          <div className="space-y-1.5">
            {componentTools.map((item, i) => {
              const tool = asRecord(item.tool);
              const status = field(tool, 'status', 'required').toLowerCase();
              const available = status === 'available' || status === 'in_store';
              return (
                <div key={String(item.id ?? i)} className="flex items-center justify-between gap-2 p-2 rounded-md bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wrench className="h-3 w-3 text-slate-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-slate-300 truncate">
                        {field(tool, 'name', field(item, 'toolName', 'Required tool'))}
                      </div>
                      <div className="text-[9px] text-slate-600 truncate">
                        {field(tool, 'toolCode', field(item, 'toolCode'))} · Qty {field(item, 'quantityRequired', '1')} · {field(item, 'taskType', 'general')}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={'text-[9px] px-1.5 py-0 flex-shrink-0 ' + (
                      available
                        ? 'border-emerald-500/30 text-emerald-400'
                        : tool
                          ? 'border-amber-500/30 text-amber-400'
                          : 'border-slate-500/30 text-slate-400'
                    )}
                  >
                    {tool ? field(tool, 'status', 'Required') : 'Unlinked'}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}

      </SectionCard>

      {/* Component Maintenance History */}
      {component && (
        <SectionCard title={'Maintenance History (' + componentHistory.length + ')'} icon={<History className="h-3.5 w-3.5 text-slate-400" />}>
          {componentHistory.length === 0 ? (
            <div className="text-xs text-slate-500 py-2 text-center">No component maintenance history recorded</div>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar">
              {componentHistory.map((entry, i) => {
                const wo = asRecord(entry.workOrder);
                const performedBy = asRecord(entry.performedBy);
                const completedAt = entry.completedAt ? new Date(String(entry.completedAt)).toLocaleDateString() : 'Open';
                return (
                  <div key={String(entry.id ?? i)} className="p-2 rounded-md bg-white/[0.02] border border-white/[0.04]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-300 truncate">
                        {field(entry, 'maintenanceType', 'Maintenance')}
                      </span>
                      <span className="text-[9px] text-slate-500 flex-shrink-0">{completedAt}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {field(entry, 'description', field(wo, 'title', 'No description'))}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-600">
                      {wo && <span>{field(wo, 'woNumber')}</span>}
                      {performedBy && <span>· {field(performedBy, 'fullName', field(performedBy, 'username'))}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}

// ============================================================================
// Tab: IoT / Sensors (Enhanced)
// ============================================================================

function IoTSensorsTab({
  iotDevices,
  predictionAlerts,
}: {
  iotDevices: Record<string, unknown>[];
  predictionAlerts: PredictionAlertData[];
}) {
  // Sensor icon by type
  const sensorIcon = (device: Record<string, unknown>) => {
    const type = String(device.type ?? device.deviceType ?? '').toLowerCase();
    if (type.includes('temp')) return <Thermometer className="h-3.5 w-3.5 text-red-400" />;
    if (type.includes('vibr')) return <Activity className="h-3.5 w-3.5 text-blue-400" />;
    if (type.includes('press')) return <Gauge className="h-3.5 w-3.5 text-amber-400" />;
    if (type.includes('current') || type.includes('electr')) return <Zap className="h-3.5 w-3.5 text-yellow-400" />;
    if (type.includes('flow') || type.includes('liquid')) return <Droplets className="h-3.5 w-3.5 text-cyan-400" />;
    return <Cpu className="h-3.5 w-3.5 text-slate-400" />;
  };

  // Trend indicator
  const trendIndicator = (value: number, threshold: number) => {
    const ratio = value / threshold;
    if (ratio > 0.9) return <TrendingUp className="h-3 w-3 text-red-400" />;
    if (ratio > 0.7) return <TrendingUp className="h-3 w-3 text-amber-400" />;
    return <Minus className="h-3 w-3 text-emerald-400" />;
  };

  // Alert summary counts
  const alertSummary = useMemo(() => {
    const summary = { critical: 0, warning: 0, info: 0 };
    predictionAlerts.filter((a) => !a.isAcknowledged).forEach((a) => {
      const s = a.severity.toLowerCase();
      if (s === 'critical') summary.critical++;
      else if (s === 'high' || s === 'medium') summary.warning++;
      else summary.info++;
    });
    return summary;
  }, [predictionAlerts]);

  return (
    <div className="space-y-3">
      {/* Alert Summary */}
      {(alertSummary.critical > 0 || alertSummary.warning > 0) && (
        <SectionCard title="Alert Summary" icon={<AlertTriangle className="h-3.5 w-3.5 text-slate-400" />}>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-red-600/10 border border-red-600/20 p-2 text-center">
              <div className="text-base font-bold text-red-400">{alertSummary.critical}</div>
              <div className="text-[9px] text-red-400/70 uppercase">Critical</div>
            </div>
            <div className="rounded-lg bg-amber-600/10 border border-amber-600/20 p-2 text-center">
              <div className="text-base font-bold text-amber-400">{alertSummary.warning}</div>
              <div className="text-[9px] text-amber-400/70 uppercase">Warning</div>
            </div>
            <div className="rounded-lg bg-slate-600/10 border border-slate-600/20 p-2 text-center">
              <div className="text-base font-bold text-slate-400">{alertSummary.info}</div>
              <div className="text-[9px] text-slate-400/70 uppercase">Info</div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Real-time Dashboard - Gauge Cards */}
      {iotDevices.length > 0 && (
        <SectionCard title="Real-time Dashboard" icon={<Gauge className="h-3.5 w-3.5 text-slate-400" />}>
          <div className="grid grid-cols-2 gap-2">
            {iotDevices.slice(0, 4).map((device, i) => {
              const lastReading = device.lastReading as number | null;
              const threshold = device.threshold as number | null;
              const pct = lastReading && threshold ? Math.min((lastReading / threshold) * 100, 100) : 0;
              const color = pct > 90 ? 'text-red-400' : pct > 70 ? 'text-amber-400' : 'text-emerald-400';

              return (
                <div key={String(device.id ?? i)} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 text-center">
                  {sensorIcon(device)}
                  <div className={`text-lg font-bold mt-1 ${color}`}>
                    {lastReading !== null ? lastReading.toFixed(1) : '—'}
                  </div>
                  <div className="text-[9px] text-slate-500">{field(device, 'name', 'Sensor')}</div>
                  {lastReading !== null && threshold && (
                    <Progress value={pct} className="h-1 bg-white/5 mt-1.5" />
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Predictive Alerts */}
      {predictionAlerts.filter((a) => !a.isAcknowledged).length > 0 && (
        <SectionCard
          title={`Predictive Alerts (${predictionAlerts.filter((a) => !a.isAcknowledged).length})`}
          icon={<Brain className="h-3.5 w-3.5 text-slate-400" />}
        >
          <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
            {predictionAlerts.filter((a) => !a.isAcknowledged).slice(0, 5).map((alert) => (
              <div key={alert.id} className="p-2 rounded-md bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center gap-1.5 mb-1">
                  <SeverityBadge severity={alert.severity} />
                  {alert.confidence !== null && (
                    <span className="text-[9px] text-slate-500">
                      {alert.confidence}%
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-300 leading-relaxed">{alert.message}</div>
                {alert.predictiveModel && (
                  <div className="text-[9px] text-slate-600 mt-1">
                    Model: {alert.predictiveModel.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* IoT Device List */}
      <SectionCard title={`IoT Devices (${iotDevices.length})`} icon={<Radio className="h-3.5 w-3.5 text-slate-400" />}>
        {iotDevices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-slate-500">
            <Cpu className="h-8 w-8 mb-2 opacity-40" />
            <span className="text-xs">No IoT devices configured</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            {iotDevices.map((device, i) => {
              const lastReading = device.lastReading as number | null;
              const threshold = device.threshold as number | null;

              return (
                <div
                  key={String(device.id ?? i)}
                  className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {sensorIcon(device)}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">
                        {field(device, 'name', 'Sensor')}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {field(device, 'deviceCode')}
                      </div>
                    </div>
                    <StatusBadge status={field(device, 'status', 'unknown')} />
                  </div>

                  <div className="flex items-end justify-between">
                    <div>
                      <span className="text-lg font-bold text-slate-100">
                        {lastReading !== null ? lastReading.toFixed(1) : '—'}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">
                        {field(device, 'unit')}
                      </span>
                    </div>
                    {lastReading !== null && threshold ? (
                      <div className="flex items-center gap-1">
                        {trendIndicator(lastReading, threshold)}
                        <span className="text-[10px] text-slate-500">
                          / {threshold} {field(device, 'unit')}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {lastReading !== null && threshold ? (
                    <div className="mt-2">
                      <Progress
                        value={Math.min((lastReading / threshold) * 100, 100)}
                        className="h-1.5 bg-white/5"
                      />
                    </div>
                  ) : null}

                  {device.lastReadingAt && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Clock className="h-2.5 w-2.5 text-slate-600" />
                      <span className="text-[9px] text-slate-500">
                        Last reading: {new Date(String(device.lastReadingAt)).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Historical Trend link */}
      <SectionCard title="Historical Trends" icon={<History className="h-3.5 w-3.5 text-slate-400" />}>
        <div className="flex flex-col items-center py-3 text-slate-500">
          <BarChart3 className="h-6 w-6 mb-2 opacity-40" />
          <span className="text-[10px] text-center mb-2">
            Historical trend charts are available in the IoT module.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px] gap-1 border-white/10 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30"
          >
            <ExternalLink className="h-3 w-3" />
            Open IoT Module
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

// ============================================================================
// Tab: BOM / Parts (Enhanced with tree view)
// ============================================================================

function BomTreeNode({ item, depth = 0, onSelect }: {
  item: Record<string, unknown>;
  depth?: number;
  onSelect?: (item: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;

  const healthScore = typeof item.healthScore === 'number' ? item.healthScore : null;
  const criticality = String(item.criticality ?? '').toLowerCase();
  const componentType = String(item.componentType ?? String(item.type ?? ''));

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 p-1.5 rounded-md hover:bg-white/[0.04] transition-colors cursor-pointer ${depth > 0 ? 'ml-4' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
        onClick={() => onSelect?.(item)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex-shrink-0 p-0"
          >
            <ChevronDown className={`h-3 w-3 text-slate-500 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          </button>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}

        <Box className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-200 truncate">
            {field(item, 'name', field(item, 'childAssetName', 'Component'))}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {componentType && (
              <Badge className="text-[8px] px-1 py-0 bg-white/5 text-slate-500 border-white/10">
                {componentType}
              </Badge>
            )}
            {criticality && (
              <CriticalityBadge criticality={criticality} />
            )}
          </div>
        </div>

        {healthScore !== null && (
          <div className="w-16 flex-shrink-0">
            <MiniHealthBar score={healthScore} />
          </div>
        )}

        <ChevronRight className="h-3 w-3 text-slate-600 flex-shrink-0" />
      </div>

      {expanded && hasChildren && (
        <div>
          {(item.children as Record<string, unknown>[]).map((child, i) => (
            <BomTreeNode key={String(child.id ?? i)} item={child} depth={depth + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function BomPartsTab({
  bomChildren,
  componentTree,
}: {
  bomChildren: Record<string, unknown>[];
  componentTree: ComponentRegistryItem[];
}) {
  // Subscribe to store action directly instead of using getState()
  const selectMesh = useDigitalTwinStore((s) => s.selectMesh);

  const onSelectChild = useCallback((item: Record<string, unknown>) => {
    // Use the subscribed action instead of getState() to prevent Error #185
    if (item.assetId) {
      selectMesh(String(item.name), String(item.assetId));
    }
  }, [selectMesh]);

  // Use component tree if available, otherwise fallback to bomChildren
  const treeItems = componentTree.length > 0
    ? (componentTree as unknown as Record<string, unknown>[])
    : bomChildren;

  return (
    <div className="space-y-3">
      <SectionCard title={`Bill of Materials (${treeItems.length})`} icon={<Box className="h-3.5 w-3.5 text-slate-400" />}>
        {treeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-slate-500">
            <Package className="h-8 w-8 mb-2 opacity-40" />
            <span className="text-xs">No BOM data available</span>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            <div className="space-y-0.5">
              {treeItems.map((item, i) => (
                <BomTreeNode key={String(item.id ?? i)} item={item} onSelect={onSelectChild} />
              ))}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ============================================================================
// Tab: Documents (Unchanged)
// ============================================================================

function DocumentsTab({ attachments }: { attachments: Record<string, unknown>[] }) {
  const fileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    if (['pdf'].includes(ext)) return '📄';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
    if (['doc', 'docx'].includes(ext)) return '📝';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
    if (['zip', 'rar', '7z'].includes(ext)) return '📦';
    if (['dwg', 'dxf'].includes(ext)) return '📐';
    return '📎';
  };

  return (
    <div className="space-y-3">
      <SectionCard title={`Documents (${attachments.length})`} icon={<FileText className="h-3.5 w-3.5 text-slate-400" />}>
        {attachments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-slate-500">
            <FileText className="h-8 w-8 mb-2 opacity-40" />
            <span className="text-xs">No attachments found</span>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
            {attachments.map((att, i) => {
              const fileName = field(att, 'fileName', field(att, 'name', 'File'));
              const fileSize = field(att, 'fileSize', '');
              const category = field(att, 'category', 'general');

              return (
                <div
                  key={String(att.id ?? i)}
                  className="flex items-center gap-2 p-2 rounded-md bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="text-base flex-shrink-0">{fileIcon(fileName)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-200 truncate group-hover:text-cyan-300 transition-colors">
                      {fileName}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className="text-[8px] px-1 py-0 bg-white/5 text-slate-500 border-white/10">
                        {category}
                      </Badge>
                      {fileSize && fileSize !== '—' && (
                        <span className="text-[10px] text-slate-600">{fileSize}</span>
                      )}
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-slate-500 hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="bg-slate-900 border-slate-700 text-slate-200 text-xs">
                      Download
                    </TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ============================================================================
// Main ComponentInfoPanel
// ============================================================================

export function ComponentInfoPanel({
  asset: externalAsset,
  workOrders: externalWO,
  iotDevices: externalIoT,
  pmSchedules: externalPM,
  bomChildren: externalBom,
  attachments: externalAttachments,
  isOpen = true,
  onClose,
}: ComponentInfoPanelProps) {
  const storeAsset = useDigitalTwinStore((s) => s.selectedAsset);
  const storeWorkOrders = useDigitalTwinStore((s) => s.assetWorkOrders);
  const storeIoTDevices = useDigitalTwinStore((s) => s.assetIoTDevices);
  const storePmSchedules = useDigitalTwinStore((s) => s.assetPmSchedules);
  const storeBomChildren = useDigitalTwinStore((s) => s.assetBomChildren);
  const storeAttachments = useDigitalTwinStore((s) => s.assetAttachments);
  const isLoadingAssetData = useDigitalTwinStore((s) => s.isLoadingAssetData);
  const setInfoPanelOpen = useDigitalTwinStore((s) => s.setInfoPanelOpen);
  const selectedAssetId = useDigitalTwinStore((s) => s.selectedAssetId);
  const selectedMeshName = useDigitalTwinStore((s) => s.selectedMeshName);
  const sceneModelId = useDigitalTwinStore((s) => s.currentScene?.modelId ?? null);
  const navigate = useNavigationStore((s) => s.navigate);
  const [mappedComponent, setMappedComponent] = useState<Record<string, unknown> | null>(null);
  const [isLoadingMappedComponent, setIsLoadingMappedComponent] = useState(false);

  // New store data
  const componentTree = useDigitalTwinStore((s) => s.componentTree);
  const failureAnalysis = useDigitalTwinStore((s) => s.failureAnalysis);
  const failureRecords = useDigitalTwinStore((s) => s.failureRecords);
  const predictionAlerts = useDigitalTwinStore((s) => s.predictionAlerts);
  const loadFailureAnalysis = useDigitalTwinStore((s) => s.loadFailureAnalysis);
  const loadPredictionAlerts = useDigitalTwinStore((s) => s.loadPredictionAlerts);

  const asset = externalAsset ?? storeAsset;
  const workOrders = externalWO ?? storeWorkOrders;
  const iotDevices = externalIoT ?? storeIoTDevices;
  const pmSchedules = externalPM ?? storePmSchedules;
  const bomChildren = externalBom ?? storeBomChildren;
  const attachments = externalAttachments ?? storeAttachments;

  useEffect(() => {
    let active = true;
    setMappedComponent(null);

    if (!selectedMeshName || !sceneModelId) {
      setIsLoadingMappedComponent(false);
      return () => { active = false; };
    }

    const resolveMappedComponent = async () => {
      setIsLoadingMappedComponent(true);
      try {
        const params = new URLSearchParams({
          modelId: sceneModelId,
          mappingType: 'component',
          limit: '100',
        });
        const mappingRes = await api.get<{ data?: MeshComponentMappingRecord[] }>(
          '/api/mesh-mappings?' + params.toString(),
        );
        const mappings = mappingRes.success && Array.isArray(mappingRes.data?.data)
          ? mappingRes.data.data
          : [];
        const mapping = mappings.find((item) => item.meshName === selectedMeshName);
        if (!mapping) {
          if (active) setMappedComponent(null);
          return;
        }

        const componentRes = await api.get<Record<string, unknown>>(
          '/api/component-registry/' + encodeURIComponent(mapping.targetId),
        );
        if (active) {
          setMappedComponent(componentRes.success && componentRes.data ? componentRes.data : null);
        }
      } catch {
        if (active) setMappedComponent(null);
      } finally {
        if (active) setIsLoadingMappedComponent(false);
      }
    };

    void resolveMappedComponent();
    return () => { active = false; };
  }, [selectedMeshName, sceneModelId]);

  // Load failure analysis & prediction alerts when asset is selected.
  // CRITICAL: React.startTransition does NOT prevent Error #185 for Zustand
  // set() calls — it only affects React's own setState. Both loadFailureAnalysis
  // and loadPredictionAlerts call set({ isLoading...: true }) synchronously.
  // Using setTimeout(0) defers to the next macrotask, ensuring these fire
  // after React has finished committing all effects from the current render.
  useEffect(() => {
    if (selectedAssetId) {
      const id = selectedAssetId;
      const timer = setTimeout(() => {
        loadFailureAnalysis({ assetId: id });
        loadPredictionAlerts({ assetId: id });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [selectedAssetId, loadFailureAnalysis, loadPredictionAlerts]);

  const mappedComponentId = typeof mappedComponent?.id === 'string' ? mappedComponent.id : '';
  const mappedComponentName = mappedComponent
    ? field(mappedComponent, 'name', field(mappedComponent, 'componentCode', 'Component'))
    : '';

  const handleCreateWO = useCallback(() => {
    const params: Record<string, string> = { create: 'true' };
    if (selectedAssetId) params.assetId = selectedAssetId;
    if (mappedComponentId) params.componentId = mappedComponentId;
    if (mappedComponentName) params.componentName = mappedComponentName;
    setInfoPanelOpen(false);
    navigate('maintenance-work-orders', params);
  }, [selectedAssetId, mappedComponentId, mappedComponentName, setInfoPanelOpen, navigate]);

  const handleCreateMR = useCallback(() => {
    const params: Record<string, string> = { create: 'true' };
    if (selectedAssetId) params.assetId = selectedAssetId;
    if (mappedComponentId) params.componentId = mappedComponentId;
    if (mappedComponentName) params.componentName = mappedComponentName;
    setInfoPanelOpen(false);
    navigate('maintenance-requests', params);
  }, [selectedAssetId, mappedComponentId, mappedComponentName, setInfoPanelOpen, navigate]);

  const handleViewDiagram = useCallback(() => {
    setInfoPanelOpen(false);

    if (mappedComponentId) {
      const params: Record<string, string> = { componentId: mappedComponentId };
      if (selectedAssetId) params.assetId = selectedAssetId;
      navigate('system-diagrams', params);
      return;
    }

    if (selectedAssetId) {
      navigate('asset-detail', { id: selectedAssetId, tab: 'diagrams' });
    }
  }, [selectedAssetId, mappedComponentId, setInfoPanelOpen, navigate]);

  const handleClose = useCallback(() => {
    setInfoPanelOpen(false);
    onClose?.();
  }, [setInfoPanelOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="absolute top-0 right-0 z-20 h-full flex flex-col animate-in slide-in-from-right duration-300"
      style={{
        width: '400px',
        background: 'rgba(10,10,18,0.95)',
        borderLeft: '1px solid rgba(148,163,184,0.1)',
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-cyan-500/20 flex items-center justify-center">
            <Box className="h-3 w-3 text-cyan-400" />
          </div>
          <span className="text-xs font-semibold text-slate-200 tracking-wide uppercase">
            Component Details
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="h-6 w-6 text-slate-400 hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Loading state */}
      {isLoadingAssetData || isLoadingMappedComponent ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">
              {isLoadingMappedComponent ? 'Resolving component mapping...' : 'Loading asset data...'}
            </span>
          </div>
        </div>
      ) : (
        /* Tabs */
        <ScrollArea className="flex-1">
          <div className="p-3">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full bg-white/[0.04] h-8 p-0.5 mb-3">
                <TabsTrigger
                  value="overview"
                  className="flex-1 h-7 text-[10px] gap-1 data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300"
                >
                  <Info className="h-3 w-3" />
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="maintenance"
                  className="flex-1 h-7 text-[10px] gap-1 data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300"
                >
                  <Wrench className="h-3 w-3" />
                  Maint.
                </TabsTrigger>
                <TabsTrigger
                  value="iot"
                  className="flex-1 h-7 text-[10px] gap-1 data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300"
                >
                  <Radio className="h-3 w-3" />
                  IoT
                </TabsTrigger>
                <TabsTrigger
                  value="bom"
                  className="flex-1 h-7 text-[10px] gap-1 data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300"
                >
                  <Box className="h-3 w-3" />
                  BOM
                </TabsTrigger>
                <TabsTrigger
                  value="docs"
                  className="flex-1 h-7 text-[10px] gap-1 data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300"
                >
                  <FileText className="h-3 w-3" />
                  Docs
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <OverviewTab
                  asset={asset}
                  component={mappedComponent}
                  onCreateWO={handleCreateWO}
                  onCreateMR={handleCreateMR}
                  onViewDiagram={handleViewDiagram}
                />
              </TabsContent>

              <TabsContent value="maintenance">
                <MaintenanceTab
                  workOrders={workOrders}
                  pmSchedules={pmSchedules}
                  failureAnalysis={failureAnalysis}
                  failureRecords={failureRecords}
                  component={mappedComponent}
                />
              </TabsContent>

              <TabsContent value="iot">
                <IoTSensorsTab
                  iotDevices={iotDevices}
                  predictionAlerts={predictionAlerts}
                />
              </TabsContent>

              <TabsContent value="bom">
                <BomPartsTab bomChildren={bomChildren} componentTree={componentTree} />
              </TabsContent>

              <TabsContent value="docs">
                <DocumentsTab attachments={attachments} />
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export default ComponentInfoPanel;
