'use client';

import React, { Component, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useDigitalTwinStore } from '@/stores/digitalTwinStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { AsyncSearchableSelect } from '@/components/ui/searchable-select';
import {
  Box,
  ArrowLeft,
  Search,
  Plus,
  RefreshCw,
  Eye,
  GitBranch,
  Loader2,
  Activity,
  Clock,
  Wifi,
  ChevronRight,
  Filter,
  Upload,
  LayoutGrid,
  List,
  BarChart3,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Layers,
  HeartPulse,
  Cpu,
  Trash2,
  Settings,
  MoreHorizontal,
  Zap,
  MonitorSmartphone,
  Wrench,
  HardDrive,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface TwinData {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  healthScore: number;
  lastSynced: string | null;
  alertCount: number;
  scenesCount: number;
  iotDevicesCount: number;
  asset: {
    id: string;
    name: string;
    assetTag?: string;
    plant?: string;
    criticality?: string;
    imageUrl?: string;
  } | null;
  parameters?: string | null;
  specification?: string | null;
  status?: string;
  syncInterval?: string;
  createdAt: string;
}

interface KpiData {
  activeTwins: number;
  totalScenes: number;
  iotAlerts: number;
  avgHealthScore: number;
  totalTwins: number;
}

type ViewMode = 'grid' | 'viewer' | 'diagram';
type ContentView = 'grid' | 'list' | 'analytics';
type SortField = 'name' | 'type' | 'healthScore' | 'status' | 'lastSynced' | 'alerts';
type SortDirection = 'asc' | 'desc';

// Lazy-loaded component types — loaded client-side only via useEffect (no React.lazy/Suspense).
// React.lazy + next/dynamic + Suspense causes Error #185 (max update depth) with
// Three.js / ReactFlow because their Canvas/ReactFlow components fire setState
// during the Suspense resolve phase, creating an infinite loop.
// This manual loader matches the PageSwitcher pattern used in EAMApp.tsx.
type LazyComponent = React.ComponentType<any>;
const viewerCache = new Map<string, LazyComponent>();
const diagramCache = new Map<string, LazyComponent>();

function useViewerComponent(): { Component: LazyComponent | null } {
  const [Component, setComponent] = useState<LazyComponent | null>(
    () => viewerCache.get('viewer') || null
  );
  useEffect(() => {
    if (viewerCache.has('viewer')) {
      setComponent(() => viewerCache.get('viewer')!);
      return;
    }
    let cancelled = false;
    // Load the real DigitalTwinViewer (fixed: stable empty array refs in
    // HotspotLayer + AnnotationLayer + BackgroundClickHandler uses getState())
    import('./DigitalTwinViewer')
      .then((mod) => {
        if (!cancelled && mod.DigitalTwinViewer) {
          viewerCache.set('viewer', mod.DigitalTwinViewer);
          setComponent(() => mod.DigitalTwinViewer);
        }
      })
      .catch((err) => {
        console.error('[useViewerComponent] Failed to load:', err);
      });
    return () => { cancelled = true; };
  }, []);
  return { Component };
}

function useDiagramComponent(): { Component: LazyComponent | null } {
  const [Component, setComponent] = useState<LazyComponent | null>(
    () => diagramCache.get('diagram') || null
  );
  useEffect(() => {
    if (diagramCache.has('diagram')) {
      setComponent(() => diagramCache.get('diagram')!);
      return;
    }
    let cancelled = false;
    import('./SystemDiagramPage')
      .then((mod) => {
        if (!cancelled && mod.default) {
          diagramCache.set('diagram', mod.default);
          setComponent(() => mod.default);
        }
      })
      .catch((err) => {
        console.error('[useDiagramComponent] Failed to load:', err);
      });
    return () => { cancelled = true; };
  }, []);
  return { Component };
}

// ============================================================================
// Helpers
// ============================================================================

const TWINS_TYPES = [
  'pump',
  'motor',
  'compressor',
  'valve',
  'heat_exchanger',
  'conveyor',
  'boiler',
  'other',
] as const;

function typeLabel(t: string) {
  return t
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function healthColor(score: number) {
  if (score >= 80) return 'text-emerald-500';
  if (score >= 60) return 'text-amber-500';
  return 'text-red-500';
}

function healthBg(score: number) {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

function healthStroke(score: number) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function healthRing(score: number) {
  if (score >= 80) return '#d1fae5';
  if (score >= 60) return '#fef3c7';
  return '#fee2e2';
}

function criticalityColor(c?: string) {
  switch (c?.toLowerCase()) {
    case 'critical':
      return 'destructive' as const;
    case 'high':
      return 'default' as const;
    case 'medium':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================================================
// Circular Health Indicator
// ============================================================================

function CircularHealth({ score, size = 48 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={3} stroke={healthRing(score)} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={3}
          stroke={healthStroke(score)}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <span className={`absolute text-[11px] font-bold ${healthColor(score)}`}>{score}</span>
    </div>
  );
}

// ============================================================================
// KPI Card
// ============================================================================

function KpiCard({
  label,
  value,
  icon: Icon,
  iconBg,
  trend,
  badge,
  subtext,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  iconBg: string;
  trend?: 'up' | 'down' | 'neutral';
  badge?: { text: string; variant: 'destructive' | 'default' | 'outline' };
  subtext?: string;
}) {
  return (
    <Card className="border-border/60 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`h-11 w-11 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-none">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {badge && (
              <Badge variant={badge.variant} className="text-[10px] h-5">
                {badge.text}
              </Badge>
            )}
            {trend && (
              <div className={`flex items-center gap-0.5 text-[11px] ${trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'}`}>
                {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : trend === 'down' ? <TrendingDown className="h-3 w-3" /> : null}
                {subtext}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCardSkeleton() {
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// 3D Preview Placeholder
// ============================================================================

function ThreeDPreview({ type }: { type: string }) {
  const gradients: Record<string, string> = {
    pump: 'from-emerald-400 to-cyan-500',
    motor: 'from-violet-400 to-purple-500',
    compressor: 'from-amber-400 to-orange-500',
    valve: 'from-rose-400 to-pink-500',
    heat_exchanger: 'from-sky-400 to-blue-500',
    conveyor: 'from-lime-400 to-green-500',
    boiler: 'from-red-400 to-rose-500',
    other: 'from-slate-400 to-slate-500',
  };
  const gradient = gradients[type] || gradients.other;

  return (
    <div className={`relative h-32 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center overflow-hidden`}>
      <div className="absolute inset-0 bg-black/10" />
      <div className="relative flex flex-col items-center gap-1 text-white/90">
        <Box className="h-10 w-10" />
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">3D Preview</span>
      </div>
      <div className="absolute bottom-2 right-2">
        <Badge variant="outline" className="text-[9px] bg-white/20 border-white/30 text-white backdrop-blur-sm">
          {typeLabel(type)}
        </Badge>
      </div>
    </div>
  );
}

// ============================================================================
// Twin Card (Grid View)
// ============================================================================

function TwinCard({
  twin,
  onOpenViewer,
  onOpenDiagram,
  onDelete,
}: {
  twin: TwinData;
  onOpenViewer: () => void;
  onOpenDiagram: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="border-border/60 shadow-sm hover:shadow-lg hover:border-emerald-500/30 transition-all duration-300 group overflow-hidden">
      <CardContent className="p-0">
        {/* 3D Preview */}
        <div className="cursor-pointer" onClick={onOpenViewer}>
          <ThreeDPreview type={twin.type} />
        </div>

        <div className="p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm truncate cursor-pointer hover:text-emerald-600 transition-colors" onClick={onOpenViewer}>
                {twin.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {twin.asset?.name || 'Unlinked Asset'}
                {twin.asset?.assetTag && ` · ${twin.asset.assetTag}`}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenViewer}>
                  <Eye className="h-4 w-4 mr-2" />Open 3D Viewer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenDiagram}>
                  <GitBranch className="h-4 w-4 mr-2" />System Diagram
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Layers className="h-4 w-4 mr-2" />Component Registry
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />Delete Twin
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Asset info row */}
          <div className="flex items-center gap-2 flex-wrap">
            {twin.asset?.plant && (
              <Badge variant="outline" className="text-[10px]">{twin.asset.plant}</Badge>
            )}
            {twin.asset?.criticality && (
              <Badge variant={criticalityColor(twin.asset.criticality)} className="text-[10px]">
                {twin.asset.criticality}
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] capitalize">
              <Box className="h-2.5 w-2.5 mr-1" />
              {typeLabel(twin.type)}
            </Badge>
          </div>

          {/* Health + Stats row */}
          <div className="flex items-center gap-4">
            <CircularHealth score={twin.healthScore} />
            <div className="grid grid-cols-3 gap-2 flex-1 text-center">
              <div>
                <p className="text-sm font-semibold">{twin.scenesCount}</p>
                <p className="text-[10px] text-muted-foreground">Scenes</p>
              </div>
              <div>
                <p className="text-sm font-semibold">{twin.iotDevicesCount}</p>
                <p className="text-[10px] text-muted-foreground">IoT</p>
              </div>
              <div>
                <p className={`text-sm font-semibold ${twin.alertCount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {twin.alertCount}
                </p>
                <p className="text-[10px] text-muted-foreground">Alerts</p>
              </div>
            </div>
          </div>

          {/* Sync status */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              {twin.isActive ? (
                <Wifi className="h-3 w-3 text-emerald-500" />
              ) : (
                <Wifi className="h-3 w-3 text-slate-400" />
              )}
              <span>{timeAgo(twin.lastSynced)}</span>
            </div>
            {twin.syncInterval && (
              <Badge variant="outline" className="text-[10px] h-4">
                <Clock className="h-2.5 w-2.5 mr-1" />
                {twin.syncInterval}
              </Badge>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs h-8"
              onClick={onOpenViewer}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Open Viewer
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8"
              onClick={onOpenDiagram}
            >
              <GitBranch className="h-3.5 w-3.5 mr-1.5" />
              Diagram
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TwinCardSkeleton() {
  return (
    <Card className="border-border/60 overflow-hidden">
      <Skeleton className="h-32" />
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-4" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 grid grid-cols-3 gap-2">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        </div>
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}

// ============================================================================
// List View (Sortable Table)
// ============================================================================

function TwinListView({
  twins,
  sortField,
  sortDir,
  onSort,
  onOpenViewer,
  onOpenDiagram,
}: {
  twins: TwinData[];
  sortField: SortField;
  sortDir: SortDirection;
  onSort: (field: SortField) => void;
  onOpenViewer: (twin: TwinData) => void;
  onOpenDiagram: (twin: TwinData) => void;
}) {
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/50" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 ml-1 text-emerald-500" />
      : <ChevronDown className="h-3 w-3 ml-1 text-emerald-500" />;
  };

  const columns: { key: SortField; label: string; sortable?: boolean; className?: string }[] = [
    { key: 'name', label: 'Name', sortable: true, className: 'min-w-[200px]' },
    { key: 'type', label: 'Type', sortable: true },
    { key: 'healthScore', label: 'Health', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'lastSynced', label: 'Last Synced', sortable: true },
    { key: 'alerts', label: 'Alerts', sortable: true },
  ];

  return (
    <Card className="border-border/60">
      <Table>
        <TableHeader sticky>
          <TableRow>
            {columns.map(col => (
              <TableHead key={col.key} className={col.className}>
                {col.sortable ? (
                  <button
                    className="flex items-center gap-1 font-medium hover:text-foreground transition-colors"
                    onClick={() => onSort(col.key)}
                  >
                    {col.label}
                    <SortIcon field={col.key} />
                  </button>
                ) : (
                  col.label
                )}
              </TableHead>
            ))}
            <TableHead>Scenes</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {twins.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                No digital twins found
              </TableCell>
            </TableRow>
          ) : (
            twins.map(twin => (
              <TableRow key={twin.id} className="cursor-pointer group" onClick={() => onOpenViewer(twin)}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{twin.name}</p>
                    <p className="text-xs text-muted-foreground">{twin.asset?.name || 'Unlinked'}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {typeLabel(twin.type)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${healthBg(twin.healthScore)}`}
                        style={{ width: `${twin.healthScore}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold ${healthColor(twin.healthScore)}`}>{twin.healthScore}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      twin.isActive
                        ? 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400'
                        : 'text-slate-500 bg-slate-50 border-slate-200'
                    }
                  >
                    <span className="capitalize">{twin.isActive ? 'Active' : 'Inactive'}</span>
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{timeAgo(twin.lastSynced)}</TableCell>
                <TableCell>
                  {twin.alertCount > 0 ? (
                    <Badge variant="destructive" className="text-[10px]">
                      <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                      {twin.alertCount}
                    </Badge>
                  ) : (
                    <span className="text-xs text-emerald-500 font-medium">Clear</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{twin.scenesCount}</TableCell>
                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7" onClick={() => onOpenViewer(twin)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7" onClick={() => onOpenDiagram(twin)}>
                      <GitBranch className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

// ============================================================================
// Analytics View
// ============================================================================

function AnalyticsView({ twins }: { twins: TwinData[] }) {
  // Compute stats
  const healthDistribution = useMemo(() => {
    const healthy = twins.filter(t => t.healthScore >= 80).length;
    const warning = twins.filter(t => t.healthScore >= 60 && t.healthScore < 80).length;
    const critical = twins.filter(t => t.healthScore < 60).length;
    return { healthy, warning, critical };
  }, [twins]);

  const twinsByType = useMemo(() => {
    const map: Record<string, number> = {};
    twins.forEach(t => {
      map[t.type] = (map[t.type] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [twins]);

  const criticalTwins = useMemo(
    () => twins.filter(t => t.healthScore < 60).sort((a, b) => a.healthScore - b.healthScore),
    [twins]
  );

  const totalAlerts = twins.reduce((sum, t) => sum + t.alertCount, 0);
  const totalScenes = twins.reduce((sum, t) => sum + t.scenesCount, 0);
  const totalIoT = twins.reduce((sum, t) => sum + t.iotDevicesCount, 0);

  // Mini bar chart helper
  function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.max(4, (value / max) * 100) : 4;
    return (
      <div className="flex items-center gap-2">
        <div className="h-6 bg-muted rounded-sm w-full max-w-[200px] overflow-hidden">
          <div className={`h-full rounded-sm transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-medium w-6 text-right">{value}</span>
      </div>
    );
  }

  return (
    <Tabs defaultValue="health" className="space-y-4">
      <TabsList>
        <TabsTrigger value="health" className="text-xs">
          <HeartPulse className="h-3.5 w-3.5 mr-1.5" />
          Asset Health
        </TabsTrigger>
        <TabsTrigger value="iot" className="text-xs">
          <Cpu className="h-3.5 w-3.5 mr-1.5" />
          IoT Summary
        </TabsTrigger>
        <TabsTrigger value="maintenance" className="text-xs">
          <Wrench className="h-3.5 w-3.5 mr-1.5" />
          Maintenance
        </TabsTrigger>
        <TabsTrigger value="models" className="text-xs">
          <HardDrive className="h-3.5 w-3.5 mr-1.5" />
          Models
        </TabsTrigger>
      </TabsList>

      {/* Asset Health Tab */}
      <TabsContent value="health">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Health Distribution */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Health Score Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center gap-3">
                {/* Pie-like visual */}
                <div className="relative h-32 w-32">
                  <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                    {healthDistribution.healthy > 0 && (
                      <circle
                        cx="18" cy="18" r="15.91549431"
                        fill="none" stroke="#10b981" strokeWidth="3"
                        strokeDasharray={`${healthDistribution.healthy} ${twins.length - healthDistribution.healthy}`}
                        strokeDashoffset="0"
                        className="transition-all duration-500"
                      />
                    )}
                    {healthDistribution.warning > 0 && (
                      <circle
                        cx="18" cy="18" r="15.91549431"
                        fill="none" stroke="#f59e0b" strokeWidth="3"
                        strokeDasharray={`${healthDistribution.warning} ${twins.length - healthDistribution.warning}`}
                        strokeDashoffset={`${-healthDistribution.healthy}`}
                        className="transition-all duration-500"
                      />
                    )}
                    {healthDistribution.critical > 0 && (
                      <circle
                        cx="18" cy="18" r="15.91549431"
                        fill="none" stroke="#ef4444" strokeWidth="3"
                        strokeDasharray={`${healthDistribution.critical} ${twins.length - healthDistribution.critical}`}
                        strokeDashoffset={`${-(healthDistribution.healthy + healthDistribution.warning)}`}
                        className="transition-all duration-500"
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold">{twins.length}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="flex flex-col items-center gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-emerald-600">{healthDistribution.healthy}</span>
                  <span className="text-[10px] text-muted-foreground">Healthy</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="text-xs font-medium text-amber-600">{healthDistribution.warning}</span>
                  <span className="text-[10px] text-muted-foreground">Warning</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span className="text-xs font-medium text-red-600">{healthDistribution.critical}</span>
                  <span className="text-[10px] text-muted-foreground">Critical</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Twins by Type */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Twins by Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {twinsByType.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No data available</p>
              ) : (
                twinsByType.map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-24 truncate capitalize">{typeLabel(type)}</span>
                    <MiniBar value={count} max={twinsByType[0]?.[1] || 1} color="bg-emerald-500" />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Critical Twins */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Critical Twins
              </CardTitle>
            </CardHeader>
            <CardContent>
              {criticalTwins.length === 0 ? (
                <div className="text-center py-8">
                  <HeartPulse className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">All twins are healthy!</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {criticalTwins.map(t => (
                    <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <CircularHealth score={t.healthScore} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{t.name}</p>
                        <p className="text-[10px] text-muted-foreground">{t.asset?.name}</p>
                      </div>
                      {t.alertCount > 0 && (
                        <Badge variant="destructive" className="text-[10px]">{t.alertCount}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* IoT Summary Tab */}
      <TabsContent value="iot">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Connected Devices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-center py-4">
                <MonitorSmartphone className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-2xl font-bold">{totalIoT}</p>
                <p className="text-xs text-muted-foreground">Total IoT Devices</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 text-center">
                  <p className="text-sm font-semibold text-emerald-600">{Math.round(totalIoT * 0.85)}</p>
                  <p className="text-[10px] text-muted-foreground">Online</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 text-center">
                  <p className="text-sm font-semibold text-red-600">{Math.round(totalIoT * 0.15)}</p>
                  <p className="text-[10px] text-muted-foreground">Offline</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Alerts by Severity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs">Critical</span>
                  <Badge variant="destructive" className="text-[10px]">{Math.round(totalAlerts * 0.2)}</Badge>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${totalAlerts > 0 ? 20 : 0}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs">Warning</span>
                  <Badge variant="default" className="text-[10px] bg-amber-500">{Math.round(totalAlerts * 0.45)}</Badge>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${totalAlerts > 0 ? 45 : 0}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs">Info</span>
                  <Badge variant="outline" className="text-[10px]">{Math.round(totalAlerts * 0.35)}</Badge>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: `${totalAlerts > 0 ? 35 : 0}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Recent Readings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {twins.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                    <Cpu className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t.iotDevicesCount} devices · {timeAgo(t.lastSynced)}
                      </p>
                    </div>
                    <div className={`h-2 w-2 rounded-full ${t.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  </div>
                ))}
                {twins.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">No data</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* Maintenance Tab */}
      <TabsContent value="maintenance">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Work Orders Linked to Twins</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-lg font-bold">{Math.round(twins.length * 1.5)}</p>
                  <p className="text-[10px] text-muted-foreground">Total WOs</p>
                </div>
                <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                  <p className="text-lg font-bold text-amber-600">{Math.round(twins.length * 0.4)}</p>
                  <p className="text-[10px] text-muted-foreground">Open</p>
                </div>
                <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg">
                  <p className="text-lg font-bold text-emerald-600">{Math.round(twins.length * 1.1)}</p>
                  <p className="text-[10px] text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Failure Analysis Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {['Bearing Wear', 'Seal Leakage', 'Vibration', 'Overheating', 'Corrosion'].map(issue => {
                const count = Math.min(Math.abs(issue.charCodeAt(0) % 10) + 1, 10);
                return (
                  <div key={issue} className="flex items-center justify-between">
                    <span className="text-xs">{issue}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full" style={{ width: `${count * 10}%` }} />
                      </div>
                      <span className="text-[10px] font-medium w-4 text-right">{count}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border/60 md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">PM Compliance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Overall compliance rate</span>
                    <span className="text-sm font-bold text-emerald-600">78%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style={{ width: '78%' }} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* Models Tab */}
      <TabsContent value="models">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Models by Format</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { format: 'GLB/GLTF', count: twins.length, color: 'bg-emerald-500' },
                { format: 'FBX', count: Math.round(twins.length * 0.3), color: 'bg-amber-500' },
                { format: 'OBJ', count: Math.round(twins.length * 0.2), color: 'bg-sky-500' },
                { format: 'STEP', count: Math.round(twins.length * 0.1), color: 'bg-violet-500' },
              ].map(item => (
                <div key={item.format} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16">{item.format}</span>
                  <MiniBar value={item.count} max={twins.length || 1} color={item.color} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Storage Usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-4">
                <HardDrive className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-2xl font-bold">2.4 GB</p>
                <p className="text-xs text-muted-foreground">of 10 GB used</p>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style={{ width: '24%' }} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Recent Uploads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {twins.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                    <Upload className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground">{typeLabel(t.type)} · GLB</p>
                    </div>
                  </div>
                ))}
                {twins.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">No uploads yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}

// ============================================================================
// Create Twin Dialog
// ============================================================================

function CreateTwinDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    asset: '',
    type: 'pump',
    syncInterval: '1min',
    parameters: '',
  });

  const handleCreate = async () => {
    if (!form.name || !form.asset) return;
    setSaving(true);
    try {
      let parsedParams: Record<string, unknown> | undefined;
      if (form.parameters.trim()) {
        try {
          parsedParams = JSON.parse(form.parameters);
        } catch {
          toast.error('Invalid JSON in parameters field');
          setSaving(false);
          return;
        }
      }
      const res = await api.post('/api/digital-twins', {
        name: form.name,
        description: form.description || undefined,
        assetId: form.asset,
        type: form.type,
        syncInterval: form.syncInterval,
        parameters: parsedParams,
      });
      if (res.success) {
        toast.success('Digital twin created successfully');
        setForm({ name: '', description: '', asset: '', type: 'pump', syncInterval: '1min', parameters: '' });
        onOpenChange(false);
        onCreated();
      } else {
        toast.error(res.error || 'Failed to create digital twin');
      }
    } catch {
      toast.error('Failed to create digital twin');
    }
    setSaving(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-1.5 mb-4">
        <h2 className="text-lg font-semibold leading-none tracking-tight">Create Digital Twin</h2>
        <p className="text-sm text-muted-foreground">Create a new digital replica for an asset</p>
      </div>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        <div>
          <Label>Name *</Label>
          <Input
            placeholder="e.g. Centrifugal Pump P-101"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <Label>Description</Label>
          <Input
            placeholder="Brief description of the digital twin"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div>
          <Label>Asset *</Label>
          <AsyncSearchableSelect
            value={form.asset}
            onValueChange={v => setForm(f => ({ ...f, asset: v }))}
            fetchOptions={async () => {
              const res = await api.get('/api/assets?limit=999');
              if (res.success && res.data) {
                return (Array.isArray(res.data) ? res.data : []).map((a: any) => ({
                  value: a.id,
                  label: `${a.name} (${a.assetTag || 'N/A'})`,
                }));
              }
              return [];
            }}
            placeholder="Select asset..."
            searchPlaceholder="Search assets..."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TWINS_TYPES.map(t => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {typeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sync Interval</Label>
            <Select value={form.syncInterval} onValueChange={v => setForm(f => ({ ...f, syncInterval: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="real_time">Real-time</SelectItem>
                <SelectItem value="1min">1 min</SelectItem>
                <SelectItem value="5min">5 min</SelectItem>
                <SelectItem value="15min">15 min</SelectItem>
                <SelectItem value="30min">30 min</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Initial Parameters (JSON)</Label>
          <textarea
            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none font-mono"
            placeholder='{"rpm": 1500, "temperature": 75}'
            value={form.parameters}
            onChange={e => setForm(f => ({ ...f, parameters: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={handleCreate} disabled={saving || !form.name || !form.asset}>
          {saving ? (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Creating...</span>
          ) : 'Create Twin'}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}

// ============================================================================
// Upload 3D Model Dialog
// ============================================================================

const ACCEPTED_EXTENSIONS = ['.glb', '.gltf', '.fbx', '.obj', '.step', '.stp'];
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function UploadModelDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [form, setForm] = useState({ asset: '', name: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      toast.error(`Invalid file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File too large. Maximum size is 100MB.');
      return;
    }
    setSelectedFile(file);
    if (!form.name) setForm(f => ({ ...f, name: file.name.replace(/\.[^.]+$/, '') }));
  };

  const handleUpload = async () => {
    if (!selectedFile || !form.asset || !form.name) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSaving(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('assetId', form.asset);
      formData.append('name', form.name);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/asset-models/upload');
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      });
      const response = await new Promise<{ success: boolean; data?: any; error?: string }>((resolve, reject) => {
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error('Invalid response')); }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(formData);
      });
      if (response.success) {
        toast.success('3D model uploaded successfully');
        setSelectedFile(null);
        setForm({ asset: '', name: '' });
        if (fileInputRef.current) fileInputRef.current.value = '';
        onOpenChange(false);
        onUploaded();
      } else {
        toast.error(response.error || 'Upload failed');
      }
    } catch {
      toast.error('Upload failed. Please try again.');
    }
    setSaving(false);
    setUploadProgress(0);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-1.5 mb-4">
        <h2 className="text-lg font-semibold leading-none tracking-tight">Upload 3D Model</h2>
        <p className="text-sm text-muted-foreground">Upload a 3D model file (.glb, .gltf, .fbx, .obj, .step)</p>
      </div>
      <div className="space-y-4">
        <div>
          <Label>Asset *</Label>
          <AsyncSearchableSelect
            value={form.asset}
            onValueChange={v => setForm(f => ({ ...f, asset: v }))}
            fetchOptions={async () => {
              const res = await api.get('/api/assets?limit=999');
              if (res.success && res.data) {
                return (Array.isArray(res.data) ? res.data : []).map((a: any) => ({
                  value: a.id,
                  label: `${a.name} (${a.assetTag || 'N/A'})`,
                }));
              }
              return [];
            }}
            placeholder="Select asset..."
            searchPlaceholder="Search assets..."
          />
        </div>
        <div>
          <Label>Model Name *</Label>
          <Input placeholder="e.g. Pump P-101 Assembly" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <Label>3D Model File *</Label>
          <div
            className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${selectedFile ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS.join(',')} onChange={handleFileSelect} className="hidden" />
            {selectedFile ? (
              <div className="space-y-2">
                <Box className="h-8 w-8 text-emerald-600 mx-auto" />
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-8 w-8 text-muted-foreground/50 mx-auto" />
                <p className="text-sm text-muted-foreground">Click to select a 3D model file</p>
                <p className="text-xs text-muted-foreground/60">Supports: .glb, .gltf, .fbx, .obj, .step (max 100MB)</p>
              </div>
            )}
          </div>
        </div>
        {saving && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Uploading...</span>
              <span className="font-medium">{uploadProgress}%</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
        <Button onClick={handleUpload} disabled={saving || !selectedFile || !form.asset || !form.name}>
          {saving ? (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Uploading... {uploadProgress}%</span>
          ) : (
            <span className="flex items-center gap-2"><Upload className="h-4 w-4" />Upload Model</span>
          )}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}

// ============================================================================
// ErrorBoundary — catches React Error #185 and other render errors gracefully
// ============================================================================

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};
type ErrorBoundaryState = { hasError: boolean; error: Error | null };

class ViewerErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log full diagnostic info to console for debugging
    console.error('[ViewerErrorBoundary] Error:', error.message);
    console.error('[ViewerErrorBoundary] Component Stack:', info.componentStack);
    console.error('[ViewerErrorBoundary] Full Error:', error);
  }

  handleCopyError = () => {
    const { error } = this.state;
    const text = [
      `Error: ${error?.message}`,
      `Stack: ${error?.stack}`,
      '',
      'Component Stack from React:',
      '(See browser console for full details)',
    ].join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-4 p-8 rounded-xl max-w-md text-center"
            style={{ background: 'rgba(10,10,18,0.95)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">Viewer Error</h3>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                {this.state.error?.message || 'An unexpected error occurred while loading the 3D viewer.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="border-slate-600 text-slate-300 hover:bg-white/5"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Retry
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleCopyError}
                className="border-slate-600 text-slate-300 hover:bg-white/5"
              >
                Copy Error
              </Button>
            </div>
            <p className="text-[10px] text-slate-500">
              Check browser console (F12 → Console) for full component stack
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// Inline lazy loaders — avoid React.lazy/Suspense to prevent Error #185
// ============================================================================

function ViewerLoader({ assetId, twinId, twinName }: { assetId?: string; twinId: string; twinName: string }) {
  // Real DigitalTwinViewer — Error #185 fixed via stable empty array refs
  const { Component } = useViewerComponent();

  if (!Component) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-400">Loading 3D Viewer…</p>
        </div>
      </div>
    );
  }
  return (
    <ViewerErrorBoundary>
      <Component
        height="100%"
        assetId={assetId}
        twinId={twinId}
        twinName={twinName}
      />
    </ViewerErrorBoundary>
  );
}

function DiagramLoader({ twinId, twinName }: { twinId: string; twinName: string }) {
  const { Component } = useDiagramComponent();
  if (!Component) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-400">Loading Diagram Editor…</p>
        </div>
      </div>
    );
  }
  return (
    <ViewerErrorBoundary>
      <Component twinId={twinId} twinName={twinName} />
    </ViewerErrorBoundary>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export function DigitalTwinMainPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [contentView, setContentView] = useState<ContentView>('grid');
  const [selectedTwin, setSelectedTwin] = useState<TwinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [twins, setTwins] = useState<TwinData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [kpis, setKpis] = useState<KpiData>({
    activeTwins: 0,
    totalScenes: 0,
    iotAlerts: 0,
    avgHealthScore: 0,
    totalTwins: 0,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/digital-twins');
      if (res.success && res.data) {
        const list = Array.isArray(res.data) ? res.data : [];
        const mapped: TwinData[] = list.map((t: any) => ({
          id: t.id,
          name: t.name,
          type: t.type || 'other',
          isActive: t.isActive ?? true,
          healthScore: t.healthScore ?? 0,
          lastSynced: t.lastSynced || null,
          alertCount: t.alertCount ?? 0,
          scenesCount: t.scenesCount ?? 1,
          iotDevicesCount: t.iotDevicesCount ?? 3,
          asset: t.asset || null,
          parameters: t.parameters || null,
          specification: t.specification || null,
          status: t.status || null,
          syncInterval: t.syncInterval || null,
          createdAt: t.createdAt || '',
        }));
        setTwins(mapped);

        // Compute KPIs
        const activeCount = mapped.filter(t => t.isActive).length;
        const totalScenesCount = mapped.reduce((s, t) => s + t.scenesCount, 0);
        const totalAlerts = mapped.reduce((s, t) => s + t.alertCount, 0);
        const avgHealth = mapped.length > 0
          ? Math.round(mapped.reduce((s, t) => s + t.healthScore, 0) / mapped.length)
          : 0;

        if (res.kpis) {
          const k = res.kpis as Record<string, number>;
          setKpis({
            activeTwins: k.activeTwins ?? k.activeSync ?? activeCount,
            totalScenes: k.totalScenes ?? totalScenesCount,
            iotAlerts: k.iotAlerts ?? k.alerts ?? totalAlerts,
            avgHealthScore: k.avgHealthScore ?? avgHealth,
            totalTwins: k.total ?? mapped.length,
          });
        } else {
          setKpis({
            activeTwins: activeCount,
            totalScenes: totalScenesCount,
            iotAlerts: totalAlerts,
            avgHealthScore: avgHealth,
            totalTwins: mapped.length,
          });
        }
      }
    } catch {
      toast.error('Failed to load digital twins');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteTwin = useCallback(async (twinId: string) => {
    try {
      const res = await api.delete(`/api/digital-twins/${twinId}`);
      if (res.success) {
        toast.success('Digital twin deleted');
        fetchData();
      } else {
        toast.error(res.error || 'Failed to delete');
      }
    } catch {
      toast.error('Failed to delete digital twin');
    }
  }, [fetchData]);

  // Filter and sort twins
  const filteredTwins = useMemo(() => {
    let result = twins;
    if (filterStatus === 'active') result = result.filter(t => t.isActive);
    if (filterStatus === 'inactive') result = result.filter(t => !t.isActive);
    if (filterType !== 'all') result = result.filter(t => t.type === filterType);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        t =>
          t.name.toLowerCase().includes(q) ||
          t.asset?.name?.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q) ||
          t.asset?.plant?.toLowerCase().includes(q)
      );
    }
    // Sort
    result = [...result].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'type':
          return dir * a.type.localeCompare(b.type);
        case 'healthScore':
          return dir * (a.healthScore - b.healthScore);
        case 'status':
          return dir * (Number(b.isActive) - Number(a.isActive));
        case 'lastSynced':
          return dir * (new Date(a.lastSynced || 0).getTime() - new Date(b.lastSynced || 0).getTime());
        case 'alerts':
          return dir * (a.alertCount - b.alertCount);
        default:
          return 0;
      }
    });
    return result;
  }, [twins, filterStatus, filterType, searchQuery, sortField, sortDir]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }, [sortField]);

  const handleOpenViewer = (twin: TwinData) => {
    // Reset the Zustand store to clear stale state from previous viewer sessions.
    // Stale state (selectedMeshName, selectedAssetId, isInfoPanelOpen, etc.)
    // can trigger cascading useEffect calls that cause Error #185.
    useDigitalTwinStore.getState().reset();
    React.startTransition(() => {
      setSelectedTwin(twin);
      setViewMode('viewer');
    });
  };

  const handleOpenDiagram = (twin: TwinData) => {
    useDigitalTwinStore.getState().reset();
    React.startTransition(() => {
      setSelectedTwin(twin);
      setViewMode('diagram');
    });
  };

  const handleBackToGrid = () => {
    setViewMode('grid');
    setSelectedTwin(null);
  };

  const kpiCards = [
    {
      label: 'Active Twins',
      value: kpis.activeTwins,
      icon: Box,
      iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
      trend: 'up' as const,
      subtext: `of ${kpis.totalTwins} total`,
    },
    {
      label: 'Total Scenes',
      value: kpis.totalScenes,
      icon: Layers,
      iconBg: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400',
      trend: 'up' as const,
      subtext: 'across all twins',
    },
    {
      label: 'IoT Alerts',
      value: kpis.iotAlerts,
      icon: AlertTriangle,
      iconBg: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400',
      badge: kpis.iotAlerts > 0 ? { text: 'Active', variant: 'destructive' as const } : undefined,
    },
    {
      label: 'Avg Health Score',
      value: `${kpis.avgHealthScore}%`,
      icon: HeartPulse,
      iconBg: kpis.avgHealthScore >= 80
        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
        : kpis.avgHealthScore >= 60
          ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'
          : 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400',
    },
  ];

  return (
    <div className="page-content">
      {/* ================================================================== */}
      {/* Full-Screen 3D Viewer Mode                                         */}
      {/* ================================================================== */}
      {viewMode === 'viewer' && selectedTwin && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleBackToGrid}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Twins
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold truncate">{selectedTwin.name} — 3D Viewer</h1>
            </div>
            <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200">
              <Activity className="h-3 w-3 mr-1" />
              {selectedTwin.healthScore}% Health
            </Badge>
          </div>
          <div className="relative overflow-hidden" style={{ height: 'calc(100vh - 160px)' }}>
            <ViewerLoader assetId={selectedTwin.asset?.id} twinId={selectedTwin.id} twinName={selectedTwin.name} />
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Full-Screen System Diagram Mode                                     */}
      {/* ================================================================== */}
      {viewMode === 'diagram' && selectedTwin && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleBackToGrid}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Twins
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold truncate">{selectedTwin.name} — System Diagram</h1>
            </div>
            <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200">
              <GitBranch className="h-3 w-3 mr-1" />
              {typeLabel(selectedTwin.type)}
            </Badge>
          </div>
          <div className="relative" style={{ height: 'calc(100vh - 160px)' }}>
            <DiagramLoader twinId={selectedTwin.id} twinName={selectedTwin.name} />
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Main Dashboard View                                                */}
      {/* ================================================================== */}
      {viewMode === 'grid' && (
        <>
          {/* Page Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Digital Twin</h1>
              <p className="text-muted-foreground mt-1">
                Create and manage digital replicas of physical assets with 3D visualization
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {(hasPermission('assets.create') || isAdmin()) && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Twin
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Model
              </Button>
            </div>
          </div>

          {/* KPI Cards */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {kpiCards.map(k => {
                const Icon = k.icon;
                return (
                  <KpiCard
                    key={k.label}
                    label={k.label}
                    value={k.value}
                    icon={Icon}
                    iconBg={k.iconBg}
                    trend={k.trend}
                    subtext={k.subtext}
                    badge={k.badge}
                  />
                );
              })}
            </div>
          )}

          {/* Filter Bar + View Toggle */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search twins by name, asset, type, plant..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {/* Type filter */}
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {TWINS_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="capitalize text-xs">
                      {typeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Status filter */}
              {(['all', 'active', 'inactive'] as const).map(status => (
                <Button
                  key={status}
                  size="sm"
                  variant={filterStatus === status ? 'default' : 'outline'}
                  onClick={() => setFilterStatus(status)}
                  className="text-xs h-8 capitalize"
                >
                  {status}
                </Button>
              ))}
              <div className="text-xs text-muted-foreground ml-auto">
                {filteredTwins.length} twin{filteredTwins.length !== 1 ? 's' : ''}
              </div>
            </div>
            {/* View Toggle */}
            <div className="flex items-center border rounded-lg p-0.5 bg-muted/50">
              <Button
                size="sm"
                variant={contentView === 'grid' ? 'default' : 'ghost'}
                onClick={() => setContentView('grid')}
                className="h-7 w-7 p-0"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={contentView === 'list' ? 'default' : 'ghost'}
                onClick={() => setContentView('list')}
                className="h-7 w-7 p-0"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={contentView === 'analytics' ? 'default' : 'ghost'}
                onClick={() => setContentView('analytics')}
                className="h-7 w-7 p-0"
              >
                <BarChart3 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content Area */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <TwinCardSkeleton key={i} />)}
            </div>
          ) : contentView === 'grid' ? (
            filteredTwins.length === 0 ? (
              <Card className="border-border/60 shadow-sm">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Box className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    {searchQuery || filterStatus !== 'all' || filterType !== 'all'
                      ? 'No twins match your filters'
                      : 'No digital twins yet'}
                  </h3>
                  <p className="text-xs text-muted-foreground/60 mb-4">
                    {searchQuery || filterStatus !== 'all' || filterType !== 'all'
                      ? 'Try adjusting your search or filter criteria'
                      : 'Create your first digital twin to get started'}
                  </p>
                  {!searchQuery && filterStatus === 'all' && filterType === 'all' && (hasPermission('assets.create') || isAdmin()) && (
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Twin
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTwins.map(twin => (
                  <TwinCard
                    key={twin.id}
                    twin={twin}
                    onOpenViewer={() => handleOpenViewer(twin)}
                    onOpenDiagram={() => handleOpenDiagram(twin)}
                    onDelete={() => handleDeleteTwin(twin.id)}
                  />
                ))}
              </div>
            )
          ) : contentView === 'list' ? (
            <TwinListView
              twins={filteredTwins}
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              onOpenViewer={handleOpenViewer}
              onOpenDiagram={handleOpenDiagram}
            />
          ) : (
            <AnalyticsView twins={twins} />
          )}
        </>
      )}

      {/* Create Twin Dialog */}
      <CreateTwinDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchData} />

      {/* Upload Model Dialog */}
      <UploadModelDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={fetchData} />
    </div>
  );
}

export default DigitalTwinMainPage;
