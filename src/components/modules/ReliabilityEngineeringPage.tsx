'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/datetime-picker';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AsyncSearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  ShieldAlert, TrendingDown, Activity, BarChart3, Clock, Gauge,
  Search, Plus, RefreshCw, AlertTriangle, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Info, Zap, HeartPulse, Target,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/components/shared/helpers';

// ── API BASE ──────────────────────────────────────────────────────────────

const API_BASE = '/api/reliability';

// ── SHARED FETCH HELPERS ──────────────────────────────────────────────────

const fetchAssetOptions = async () => {
  const res = await api.get<any[]>('/api/assets?limit=500');
  return res.map((a: any) => ({ value: a.id, label: (a.name || a.assetTag) + (a.serialNumber ? ` — ${a.serialNumber}` : '') }));
};

// ── TYPES ───────────────────────────────────────────────────────────────────

interface FailureMode {
  id: string;
  name: string;
  code?: string;
  description?: string;
  category: string;
  severity: string;
  detectionMethod?: string;
  isActive: boolean;
  createdAt: string;
  _count?: { records: number };
  createdBy?: { id: string; fullName: string };
}

interface RcmAnalysis {
  id: string;
  name: string;
  status: string;
  methodology: string;
  analysisDate?: string;
  resultSummary?: string;
  asset: { id: string; name: string; assetTag: string };
  createdBy?: { id: string; fullName: string };
  createdAt: string;
}

interface WeibullAnalysisItem {
  id: string;
  name: string;
  shape?: number;
  scale?: number;
  confidence?: number;
  sampleSize: number;
  failureCount: number;
  resultSummary?: string;
  analyzedAt: string;
  component: { id: string; name: string; componentCode: string };
  analyzedBy?: { id: string; fullName: string };
}

interface DowntimeAnalysis {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalDowntime: number;
  plannedDowntime: number;
  unplannedDowntime: number;
  downtimeCost?: number;
  mtbf?: number;
  mttr?: number;
  availability?: number;
  reliability?: number;
  asset: { id: string; name: string; assetTag: string };
  createdAt: string;
}

interface RulData {
  id: string;
  currentHealth: number;
  degradationRate: number;
  estimatedRul?: number;
  confidenceScore: number;
  lastUpdated: string;
  component: {
    id: string; name: string; componentCode: string;
    healthScore?: number; operatingHours?: number;
    expectedLifeHours?: number; lifecycleStatus?: string;
  };
}

interface CriticalityItem {
  assetId: string;
  assetName: string;
  assetTag: string;
  criticality: string;
  healthScore: number | null;
  status: string;
  totalFailures: number;
  openWorkOrders: number;
  recentFailures: number;
  activeAlerts: number;
  criticalityScore: number;
  criticalityLevel: string;
  hasPredictiveModels: boolean;
}

// ── COLORS & HELPERS ────────────────────────────────────────────────────────

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400',
  low: 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400',
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-950/30 dark:text-gray-400',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400',
};

const healthColor = (h: number) =>
  h >= 80 ? 'text-green-600' : h >= 60 ? 'text-yellow-600' : h >= 40 ? 'text-orange-600' : 'text-red-600';

const criticalityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400',
  low: 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400',
};

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function ReliabilityEngineeringPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-emerald-600" />
            Reliability Engineering
          </h1>
          <p className="text-muted-foreground mt-1">
            Failure mode analysis, RCM, Weibull distributions, and asset criticality assessment
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 gap-1">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="failure-modes" className="text-xs sm:text-sm">
            <AlertTriangle className="h-4 w-4 mr-1 hidden sm:inline" />
            Failure Modes
          </TabsTrigger>
          <TabsTrigger value="rcm" className="text-xs sm:text-sm">
            <Target className="h-4 w-4 mr-1 hidden sm:inline" />
            RCM
          </TabsTrigger>
          <TabsTrigger value="weibull" className="text-xs sm:text-sm">
            <TrendingDown className="h-4 w-4 mr-1 hidden sm:inline" />
            Weibull
          </TabsTrigger>
          <TabsTrigger value="downtime" className="text-xs sm:text-sm">
            <Clock className="h-4 w-4 mr-1 hidden sm:inline" />
            Downtime
          </TabsTrigger>
          <TabsTrigger value="rul" className="text-xs sm:text-sm">
            <HeartPulse className="h-4 w-4 mr-1 hidden sm:inline" />
            RUL
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <ReliabilityOverview onNavigate={setActiveTab} />
        </TabsContent>

        <TabsContent value="failure-modes" className="mt-6">
          <FailureModesTab />
        </TabsContent>

        <TabsContent value="rcm" className="mt-6">
          <RcmAnalysisTab />
        </TabsContent>

        <TabsContent value="weibull" className="mt-6">
          <WeibullTab />
        </TabsContent>

        <TabsContent value="downtime" className="mt-6">
          <DowntimeTab />
        </TabsContent>

        <TabsContent value="rul" className="mt-6">
          <RulTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── OVERVIEW TAB ────────────────────────────────────────────────────────────

function ReliabilityOverview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [rankings, setRankings] = useState<CriticalityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    loadCriticality();
  }, []);

  const loadCriticality = async () => {
    try {
      setLoading(true);
      const data = await api.get<{ rankings: CriticalityItem[]; summary: Record<string, unknown> }>(
        `${API_BASE}/criticality/route`
      );
      setRankings(data.rankings || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load criticality ranking');
    } finally {
      setLoading(false);
    }
  };

  const topCritical = rankings.filter((r) => r.criticalityLevel === 'critical').slice(0, 5);
  const topHigh = rankings.filter((r) => r.criticalityLevel === 'high').slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{(summary.byCriticality as Record<string, number>)?.critical || 0}</p>
                  <p className="text-xs text-muted-foreground">Critical Assets</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{(summary.byCriticality as Record<string, number>)?.high || 0}</p>
                  <p className="text-xs text-muted-foreground">High Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center">
                  <Gauge className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{(summary.total as number) || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Assets</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.avgScore || 0}</p>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { tab: 'failure-modes', title: 'Failure Modes', desc: 'Manage standardized failure mode catalog', icon: AlertTriangle, color: 'text-orange-600 bg-orange-100 dark:bg-orange-950/30' },
          { tab: 'rcm', title: 'RCM Analysis', desc: 'Reliability-centered maintenance studies', icon: Target, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/30' },
          { tab: 'weibull', title: 'Weibull Analysis', desc: 'Life data analysis & parameter estimation', icon: TrendingDown, color: 'text-blue-600 bg-blue-100 dark:bg-blue-950/30' },
          { tab: 'rul', title: 'Remaining Life', desc: 'Predictive remaining useful life estimates', icon: HeartPulse, color: 'text-rose-600 bg-rose-100 dark:bg-rose-950/30' },
        ].map((item) => (
          <Card
            key={item.tab}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onNavigate(item.tab)}
          >
            <CardContent className="p-4">
              <div className={`h-10 w-10 rounded-lg ${item.color} flex items-center justify-center mb-3`}>
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-sm">{item.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Criticality Ranking */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Asset Criticality Ranking</CardTitle>
              <CardDescription className="text-xs">
                Assets ranked by composite risk score (health, failures, work orders, alerts)
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadCriticality} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="px-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rankings.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground">
              <ShieldAlert className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No assets found. Ensure assets are set up with failure records.</p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead className="hidden md:table-cell">Tag</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Failures</TableHead>
                    <TableHead className="hidden sm:table-cell">Open WOs</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankings.slice(0, 25).map((item, idx) => (
                    <TableRow key={item.assetId}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-sm">{item.assetName}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{item.assetTag}</TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${healthColor(item.healthScore ?? 50)}`}>
                          {item.healthScore ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{item.totalFailures}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{item.openWorkOrders}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{item.criticalityScore}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={criticalityColors[item.criticalityLevel]}>
                          {item.criticalityLevel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── FAILURE MODES TAB ───────────────────────────────────────────────────────

function FailureModesTab() {
  const [modes, setModes] = useState<FailureMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<FailureMode | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', description: '', category: 'mechanical', severity: 'medium', detectionMethod: '' });

  const loadModes = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      const data = await api.get<{ items: FailureMode[] }>(`${API_BASE}/failure-modes/route?${params}`);
      setModes(data.items || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load failure modes');
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, severityFilter]);

  useEffect(() => { loadModes(); }, [loadModes]);

  const handleCreate = async () => {
    try {
      await api.post(`${API_BASE}/failure-modes/route`, form);
      toast.success('Failure mode created');
      setDialogOpen(false);
      setForm({ name: '', code: '', description: '', category: 'mechanical', severity: 'medium', detectionMethod: '' });
      loadModes();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const viewDetail = async (id: string) => {
    try {
      const data = await api.get<FailureMode>(`${API_BASE}/failure-modes/${id}/route`);
      setSelectedMode(data);
      setDetailOpen(true);
    } catch (err) {
      toast.error('Failed to load failure mode details');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.del(`${API_BASE}/failure-modes/${id}/route`);
      toast.success('Failure mode deleted');
      setDetailOpen(false);
      loadModes();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search failure modes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {['mechanical', 'electrical', 'hydraulic', 'pneumatic', 'software', 'human_error', 'environmental'].map((c) => (
                  <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                {['low', 'medium', 'high', 'critical'].map((s) => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Failure Mode</DialogTitle>
                  <DialogDescription>Add a standardized failure mode to the catalog</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div><Label>Code (optional)</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="FM-PMP-001" /></div>
                  <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Category</Label>
                      <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['mechanical', 'electrical', 'hydraulic', 'pneumatic', 'software', 'human_error', 'environmental'].map((c) => (
                            <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Severity</Label>
                      <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['low', 'medium', 'high', 'critical'].map((s) => (
                            <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Detection Method</Label><Input value={form.detectionMethod} onChange={(e) => setForm({ ...form, detectionMethod: e.target.value })} placeholder="visual, vibration, temperature..." /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={!form.name || !form.category}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : modes.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No failure modes found</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead className="hidden sm:table-cell">Records</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modes.map((fm) => (
                    <TableRow key={fm.id} className="cursor-pointer hover:bg-muted/50" onClick={() => viewDetail(fm.id)}>
                      <TableCell className="font-mono text-xs">{fm.code || '—'}</TableCell>
                      <TableCell className="font-medium text-sm">{fm.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs capitalize">{fm.category.replace('_', ' ')}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={severityColors[fm.severity]}>
                          {fm.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{fm._count?.records || 0}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); viewDetail(fm.id); }}>
                          <Info className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader className={!selectedMode ? 'sr-only' : undefined}>
            <DialogTitle className={cn("flex items-center gap-2", !selectedMode && "sr-only")}>{selectedMode ? (
              <>
                {selectedMode.code && <span className="font-mono text-sm text-muted-foreground">[{selectedMode.code}]</span>}
                {selectedMode.name}
              </>
            ) : 'Failure Mode Details'}</DialogTitle>
            <DialogDescription className={!selectedMode ? 'sr-only' : undefined}>{selectedMode ? (
              <>
                <Badge variant="secondary" className={severityColors[selectedMode.severity]}>{selectedMode.severity}</Badge>
                <span className="ml-2 capitalize text-xs">{selectedMode.category.replace('_', ' ')}</span>
              </>
            ) : 'Details'}</DialogDescription>
          </DialogHeader>
          {selectedMode && (
            <>
              <div className="space-y-3 text-sm">
                {selectedMode.description && (
                  <div><p className="font-medium mb-1">Description</p><p className="text-muted-foreground">{selectedMode.description}</p></div>
                )}
                {selectedMode.detectionMethod && (
                  <div><p className="font-medium mb-1">Detection Method</p><p className="text-muted-foreground">{selectedMode.detectionMethod}</p></div>
                )}
                <Separator />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Records: {selectedMode._count?.records || 0}</span>
                  <span>Created: {new Date(selectedMode.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(selectedMode.id)}>Delete</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── RCM ANALYSIS TAB ────────────────────────────────────────────────────────

function RcmAnalysisTab() {
  const [analyses, setAnalyses] = useState<RcmAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetId, setAssetId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ assetId: '', name: '', description: '', methodology: 'full' });
  const [running, setRunning] = useState(false);

  const loadAnalyses = useCallback(async () => {
    if (!assetId) { setLoading(false); return; }
    try {
      setLoading(true);
      const data = await api.get<{ items: RcmAnalysis[] }>(`${API_BASE}/rcm/route?assetId=${assetId}`);
      setAnalyses(data.items || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load RCM analyses');
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { loadAnalyses(); }, [loadAnalyses]);

  const handleCreate = async () => {
    try {
      setRunning(true);
      await api.post(`${API_BASE}/rcm/route`, form);
      toast.success('RCM analysis created');
      setDialogOpen(false);
      setForm({ assetId: '', name: '', description: '', methodology: 'full' });
      loadAnalyses();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Asset ID</Label>
              <Input
                placeholder="Enter asset ID..."
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={loadAnalyses} disabled={loading}>
                <Search className="h-4 w-4 mr-1" /> Search
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-1" /> New RCM</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>New RCM Analysis</DialogTitle>
                    <DialogDescription>Create a reliability-centered maintenance analysis</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div><Label>Asset ID</Label><AsyncSearchableSelect value={form.assetId} onValueChange={(v) => setForm({ ...form, assetId: v })} fetchOptions={fetchAssetOptions} placeholder="Search asset..." /></div>
                    <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                    <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
                    <div>
                      <Label>Methodology</Label>
                      <Select value={form.methodology} onValueChange={(v) => setForm({ ...form, methodology: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full">Full RCM</SelectItem>
                          <SelectItem value="streamlined">Streamlined</SelectItem>
                          <SelectItem value="focused">Focused</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreate} disabled={running || !form.assetId || !form.name}>
                      {running ? 'Creating...' : 'Create'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {!assetId ? (
            <div className="py-12 text-center text-muted-foreground">
              <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Enter an asset ID to view RCM analyses</p>
            </div>
          ) : loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : analyses.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-sm">No RCM analyses found for this asset</p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Methodology</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead className="text-right">Asset</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyses.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium text-sm">{a.name}</TableCell>
                      <TableCell className="text-xs capitalize">{a.methodology}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusColors[a.status]}>
                          {a.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {a.analysisDate ? new Date(a.analysisDate).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{a.asset.assetTag}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── WEIBULL TAB ─────────────────────────────────────────────────────────────

function WeibullTab() {
  const [analyses, setAnalyses] = useState<WeibullAnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [componentId, setComponentId] = useState('');
  const [running, setRunning] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<WeibullAnalysisItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadAnalyses = useCallback(async () => {
    if (!componentId) { setLoading(false); return; }
    try {
      setLoading(true);
      const data = await api.get<WeibullAnalysisItem[]>(`${API_BASE}/weibull-engineering/route?componentId=${componentId}`);
      setAnalyses(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load Weibull analyses');
    } finally {
      setLoading(false);
    }
  }, [componentId]);

  useEffect(() => { loadAnalyses(); }, [loadAnalyses]);

  const handleRunAnalysis = async () => {
    try {
      setRunning(true);
      const result = await api.post<WeibullAnalysisItem>(`${API_BASE}/weibull-engineering/route`, { componentId });
      toast.success('Weibull analysis completed');
      loadAnalyses();
      // Show result
      setSelectedAnalysis(result);
      setDetailOpen(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const parseResultSummary = (summary?: string): Record<string, unknown> | null => {
    if (!summary) return null;
    try { return JSON.parse(summary); } catch { return null; }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Component ID</Label>
              <Input
                placeholder="Enter component ID..."
                value={componentId}
                onChange={(e) => setComponentId(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={loadAnalyses} disabled={loading}>
                <Search className="h-4 w-4 mr-1" /> Load
              </Button>
              <Button onClick={handleRunAnalysis} disabled={running || !componentId}>
                {running ? <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Analyzing...</> : <><TrendingDown className="h-4 w-4 mr-1" /> Run Analysis</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {analyses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {analyses.slice(0, 4).map((a) => {
            const result = parseResultSummary(a.resultSummary);
            return (
              <Card key={a.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelectedAnalysis(a); setDetailOpen(true); }}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm truncate">{a.name}</CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {a.shape ? `β=${a.shape.toFixed(2)}` : 'N/A'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Shape (β)</p>
                      <p className="font-mono font-semibold">{a.shape?.toFixed(3) ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Scale (η)</p>
                      <p className="font-mono font-semibold">{a.scale?.toFixed(1) ?? '—'} hrs</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Failures</p>
                      <p className="font-mono font-semibold">{a.failureCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Confidence</p>
                      <p className="font-mono font-semibold">{a.confidence ? `${(a.confidence * 100).toFixed(0)}%` : '—'}</p>
                    </div>
                  </div>
                  {result?.interpretation && (
                    <p className="text-xs text-muted-foreground italic">{result.interpretation as string}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* History Table */}
      <Card>
        <CardContent className="p-0">
          {!componentId ? (
            <div className="py-12 text-center text-muted-foreground">
              <TrendingDown className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Enter a component ID to run or view Weibull analyses</p>
            </div>
          ) : analyses.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <p className="text-sm">No analyses yet. Run an analysis to see results.</p>
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>β (Shape)</TableHead>
                    <TableHead>η (Scale)</TableHead>
                    <TableHead>Failures</TableHead>
                    <TableHead className="hidden sm:table-cell">Confidence</TableHead>
                    <TableHead className="text-right">Analyzed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyses.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => { setSelectedAnalysis(a); setDetailOpen(true); }}>
                      <TableCell className="text-sm font-medium">{a.component.componentCode}</TableCell>
                      <TableCell className="font-mono text-sm">{a.shape?.toFixed(3) ?? '—'}</TableCell>
                      <TableCell className="font-mono text-sm">{a.scale?.toFixed(1) ?? '—'}</TableCell>
                      <TableCell className="text-sm">{a.failureCount}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{a.confidence ? `${(a.confidence * 100).toFixed(0)}%` : '—'}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{new Date(a.analyzedAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader className={!selectedAnalysis ? 'sr-only' : undefined}>
            <DialogTitle className={cn("text-sm", !selectedAnalysis && "sr-only")}>{selectedAnalysis ? selectedAnalysis.name : 'RCM Analysis Details'}</DialogTitle>
            <DialogDescription className={!selectedAnalysis ? 'sr-only' : undefined}>{selectedAnalysis ? `${selectedAnalysis.component.name} (${selectedAnalysis.component.componentCode})` : 'Details'}</DialogDescription>
          </DialogHeader>
          {selectedAnalysis && (
            <>
              {(() => {
                const result = parseResultSummary(selectedAnalysis.resultSummary);
                return result ? (
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Shape (β)', value: (result.shape as number)?.toFixed(3) },
                        { label: 'Scale (η)', value: `${(result.scale as number)?.toFixed(1)} hrs` },
                        { label: 'B10 Life', value: `${(result.b10Life as number)?.toFixed(1)} hrs` },
                        { label: 'MTBF', value: `${(result.mtbf as number)?.toFixed(1)} hrs` },
                        { label: 'Mean Life', value: `${(result.meanLife as number)?.toFixed(1)} hrs` },
                        { label: 'Data Points', value: String(result.dataPoints || selectedAnalysis.sampleSize) },
                      ].map((item) => (
                        <div key={item.label} className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          <p className="font-mono font-semibold">{item.value}</p>
                        </div>
                      ))}
                    </div>
                    {result.interpretation && (
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Interpretation</p>
                        <p className="font-medium">{result.interpretation as string}</p>
                      </div>
                    )}
                    {result.reliabilityAtIntervals && Array.isArray(result.reliabilityAtIntervals) && (
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-2">Reliability at Time Intervals</p>
                        <div className="space-y-1">
                          {(result.reliabilityAtIntervals as Array<{ hours: number; reliability: number }>).map((r) => (
                            <div key={r.hours} className="flex justify-between text-xs">
                              <span>{r.hours.toLocaleString()} hrs</span>
                              <span className={`font-mono font-semibold ${r.reliability >= 90 ? 'text-green-600' : r.reliability >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {r.reliability.toFixed(1)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <p className="text-sm">{selectedAnalysis.description || 'No result summary available'}</p>
                  </div>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── DOWNTIME TAB ────────────────────────────────────────────────────────────

function DowntimeTab() {
  const [analyses, setAnalyses] = useState<DowntimeAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetId, setAssetId] = useState('');
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState({ assetId: '', periodStart: '', periodEnd: '' });

  const loadAnalyses = useCallback(async () => {
    if (!assetId) { setLoading(false); return; }
    try {
      setLoading(true);
      const data = await api.get<DowntimeAnalysis[]>(`${API_BASE}/downtime/route?assetId=${assetId}`);
      setAnalyses(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load downtime analyses');
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { loadAnalyses(); }, [loadAnalyses]);

  const handleCompute = async () => {
    try {
      setRunning(true);
      const result = await api.post<DowntimeAnalysis>(`${API_BASE}/downtime/route`, {
        assetId: form.assetId,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
      });
      toast.success('Downtime analysis computed');
      setAssetId(form.assetId);
      setAnalyses((prev) => [result, ...prev]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Asset ID</Label>
              <Input
                placeholder="Enter asset ID..."
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={loadAnalyses} disabled={loading}>
              <Search className="h-4 w-4 mr-1" /> Load
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Compute New */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Compute New Analysis</CardTitle>
          <CardDescription className="text-xs">Calculate MTBF, MTTR, and availability for a time period</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Asset ID</Label>
              <AsyncSearchableSelect value={form.assetId} onValueChange={(v) => setForm({ ...form, assetId: v })} fetchOptions={fetchAssetOptions} placeholder="Search asset..." />
            </div>
            <div>
              <DatePicker label="Period Start" value={form.periodStart || undefined} onChange={v => setForm({ ...form, periodStart: v || '' })} />
            </div>
            <div>
              <DatePicker label="Period End" value={form.periodEnd || undefined} onChange={v => setForm({ ...form, periodEnd: v || '' })} />
            </div>
          </div>
          <Button className="mt-3" onClick={handleCompute} disabled={running || !form.assetId || !form.periodStart || !form.periodEnd}>
            {running ? <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Computing...</> : <><Clock className="h-4 w-4 mr-1" /> Compute Analysis</>}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {analyses.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {analyses.slice(0, 1).map((a) => (
            <>
              <Card><CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">MTBF</p>
                <p className="text-xl font-bold font-mono">{a.mtbf?.toFixed(1) ?? '—'}<span className="text-xs text-muted-foreground ml-1">hrs</span></p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">MTTR</p>
                <p className="text-xl font-bold font-mono">{a.mttr?.toFixed(1) ?? '—'}<span className="text-xs text-muted-foreground ml-1">hrs</span></p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Availability</p>
                <p className="text-xl font-bold font-mono">{a.availability?.toFixed(1) ?? '—'}<span className="text-xs text-muted-foreground ml-1">%</span></p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Total Downtime</p>
                <p className="text-xl font-bold font-mono">{a.totalDowntime.toFixed(1)}<span className="text-xs text-muted-foreground ml-1">hrs</span></p>
              </CardContent></Card>
            </>
          ))}
        </div>
      )}

      {/* History Table */}
      <Card>
        <CardContent className="p-0">
          {!assetId ? (
            <div className="py-12 text-center text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Enter an asset ID to view downtime analyses</p>
            </div>
          ) : analyses.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <p className="text-sm">No downtime analyses yet</p>
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Planned</TableHead>
                    <TableHead>Unplanned</TableHead>
                    <TableHead>MTBF</TableHead>
                    <TableHead>MTTR</TableHead>
                    <TableHead>Avail.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyses.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs">
                        {new Date(a.periodStart).toLocaleDateString()} — {new Date(a.periodEnd).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{formatDuration(a.totalDowntime)}</TableCell>
                      <TableCell className="font-mono text-sm text-green-600">{formatDuration(a.plannedDowntime)}</TableCell>
                      <TableCell className="font-mono text-sm text-red-600">{formatDuration(a.unplannedDowntime)}</TableCell>
                      <TableCell className="font-mono text-sm">{formatDuration(a.mtbf ?? 0)}</TableCell>
                      <TableCell className="font-mono text-sm">{formatDuration(a.mttr ?? 0)}</TableCell>
                      <TableCell className="font-mono text-sm font-semibold">{a.availability?.toFixed(1) ?? '—'}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── RUL TAB ─────────────────────────────────────────────────────────────────

function RulTab() {
  const [rulData, setRulData] = useState<RulData | null>(null);
  const [loading, setLoading] = useState(true);
  const [componentId, setComponentId] = useState('');
  const [running, setRunning] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const loadRul = useCallback(async () => {
    if (!componentId) { setLoading(false); return; }
    try {
      setLoading(true);
      setNotFound(false);
      const data = await api.get<RulData | null>(`${API_BASE}/rul/route?componentId=${componentId}`);
      setRulData(data);
      setNotFound(!data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [componentId]);

  useEffect(() => { loadRul(); }, [loadRul]);

  const handleCompute = async () => {
    try {
      setRunning(true);
      const result = await api.post<RulData>(`${API_BASE}/rul/route`, { componentId });
      toast.success('RUL estimate computed');
      setRulData(result);
      setNotFound(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const rulDays = rulData?.estimatedRul;
  const rulLabel = rulDays
    ? rulDays >= 365 ? `${(rulDays / 365).toFixed(1)} years`
      : rulDays >= 30 ? `${(rulDays / 30).toFixed(1)} months`
        : `${Math.round(rulDays)} days`
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Component ID</Label>
              <Input
                placeholder="Enter component ID..."
                value={componentId}
                onChange={(e) => setComponentId(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={loadRul} disabled={loading}>
                <Search className="h-4 w-4 mr-1" /> Load
              </Button>
              <Button onClick={handleCompute} disabled={running || !componentId}>
                {running ? <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Computing...</> : <><HeartPulse className="h-4 w-4 mr-1" /> Estimate RUL</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!componentId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <HeartPulse className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Enter a component ID to estimate remaining useful life</p>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card><CardContent className="p-6"><div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-20 w-full" /></div></CardContent></Card>
      ) : notFound || !rulData ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Info className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No RUL estimate found. Click &quot;Estimate RUL&quot; to compute one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Health & RUL Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">Current Health</p>
                <p className={`text-3xl font-bold ${healthColor(rulData.currentHealth)}`}>
                  {rulData.currentHealth.toFixed(0)}
                </p>
                <Progress value={rulData.currentHealth} className="mt-2 h-2" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">Estimated RUL</p>
                <p className={`text-3xl font-bold ${rulDays && rulDays < 30 ? 'text-red-600' : rulDays && rulDays < 90 ? 'text-orange-600' : 'text-emerald-600'}`}>
                  {rulLabel ?? '—'}
                </p>
                {rulDays && (
                  <p className="text-xs text-muted-foreground mt-1">{Math.round(rulDays)} days</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">Confidence</p>
                <p className="text-3xl font-bold">{(rulData.confidenceScore * 100).toFixed(0)}%</p>
                <Progress value={rulData.confidenceScore * 100} className="mt-2 h-2" />
              </CardContent>
            </Card>
          </div>

          {/* Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">RUL Estimation Details</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Component</p>
                  <p className="font-medium">{rulData.component.name}</p>
                  <p className="text-xs text-muted-foreground">{rulData.component.componentCode}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Health Score</p>
                  <p className="font-mono">{rulData.component.healthScore ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Operating Hours</p>
                  <p className="font-mono">{rulData.component.operatingHours?.toLocaleString() ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expected Life</p>
                  <p className="font-mono">{rulData.component.expectedLifeHours?.toLocaleString() ?? '—'} hrs</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Degradation Rate</p>
                  <p className="font-mono">{rulData.degradationRate.toFixed(4)} pts/day</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lifecycle Status</p>
                  <Badge variant="secondary" className="capitalize">{rulData.component.lifecycleStatus?.replace('_', ' ')}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Updated</p>
                  <p className="text-xs">{new Date(rulData.lastUpdated).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
