'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { api } from '@/lib/api';
import type { MaintenanceRequest, WorkOrder, WOTeamMember, PersonalTool, User, PageName } from '@/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect, AsyncSearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ClipboardList, Wrench, Plus, Search, ArrowLeft, CheckCircle2, XCircle,
  Clock, AlertTriangle, RefreshCw, Play, Pause, Check, Lock, Eye, Pencil,
  Trash2, MessageSquare, Users, MoreHorizontal, BarChart3, Target,
  TrendingUp, TrendingDown, Calendar, AlertCircle, Crosshair, TriangleAlert, Ruler,
  Wrench as WrenchIcon, Settings, Zap, Activity, Send, CircleDot, X,
  Loader2,
  Building2,
  ArrowRightLeft, ArrowRight, FileText, CheckSquare, Filter, ArrowUpDown, BookOpen, ShieldAlert,
  PieChart as PieChartIcon, Gauge, ListChecks, Shield, ShieldCheck, HardHat, MapPin,
  Crown, Timer, Hourglass, UserPlus, Workflow, ChevronRight, ExternalLink, Hammer,
  Package, PackageSearch, ClipboardCheck, ChevronDown, GripVertical, Droplets, RotateCcw,
  FlaskConical, Warehouse, PackageOpen, PackageCheck, Lightbulb,
  ArrowUpRight, ArrowDownRight, CalendarClock, LayoutDashboard, Bell, DollarSign,
  UserMinus, UserCheck, UserX, Undo2, StopCircle, Printer,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
  PieChart, Pie, Cell, AreaChart, Area, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { EmptyState, StatusBadge, PriorityBadge, getInitials, formatDate, formatDateTime, formatDateLocal, timeAgo, LoadingSkeleton, formatCurrency, formatDuration } from '@/components/shared/helpers';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { MobileStepperSheet } from '@/components/shared/MobileStepperSheet';
import { DatePicker, TimePicker, DateTimePicker, DateRangePicker } from '@/components/ui/datetime-picker';
import { useIsMobile } from '@/components/shared/ResponsiveDialog';
import { useModuleEnabled, MODULE_CODES } from '@/hooks/useModuleEnabled';
import { FileUpload } from '@/components/shared/FileUpload';
import { WorkerAssignmentSelector } from '@/components/shared/WorkerAssignmentSelector';
// WorkerAssignmentPicker still used by WO Detail page
import { WorkerAssignmentPicker, type SelectedWorker } from '@/components/shared/WorkerAssignmentPicker';
// Local UrgencyBadge for WO detail page (same as RepairsPages)
const URGENCY_CFG: Record<string, { label: string; color: string; dotColor: string }> = {
  low: { label: 'Low', color: 'bg-slate-100 text-slate-700 border-slate-300', dotColor: 'bg-slate-400' },
  normal: { label: 'Normal', color: 'bg-amber-50 text-amber-700 border-amber-300', dotColor: 'bg-amber-500' },
  medium: { label: 'Medium', color: 'bg-amber-50 text-amber-700 border-amber-300', dotColor: 'bg-amber-500' },
  high: { label: 'High', color: 'bg-orange-50 text-orange-700 border-orange-300', dotColor: 'bg-orange-500' },
  critical: { label: 'Critical', color: 'bg-red-50 text-red-700 border-red-300', dotColor: 'bg-red-500' },
};

function UrgencyBadge({ urgency }: { urgency: string }) {
  const cfg = URGENCY_CFG[urgency];
  if (!cfg) return null;
  return (
    <Badge variant="outline" className={`${cfg.color} gap-1.5 text-xs font-medium`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
      {cfg.label}
    </Badge>
  );
}


type WorkOrderDefaults = {
  safetyNotes: string;
  ppeRequired: string;
  notes: string;
};

const EMPTY_WORK_ORDER_DEFAULTS: WorkOrderDefaults = {
  safetyNotes: '',
  ppeRequired: '',
  notes: '',
};

async function loadWorkOrderDefaults(): Promise<WorkOrderDefaults> {
  try {
    const res = await api.get<WorkOrderDefaults>('/api/settings/work-order-defaults');
    if (res.success && res.data) {
      return {
        safetyNotes: String(res.data.safetyNotes || ''),
        ppeRequired: String(res.data.ppeRequired || ''),
        notes: String(res.data.notes || ''),
      };
    }
  } catch {
    // Defaults are optional; an unavailable settings endpoint must not block WO creation.
  }
  return EMPTY_WORK_ORDER_DEFAULTS;
}

function ResponsibleSupervisorSelect({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Responsible Supervisor *</Label>
      <AsyncSearchableSelect
        value={value}
        onValueChange={onValueChange}
        fetchOptions={async (query) => {
          const params = new URLSearchParams({ role: 'supervisor' });
          if (query.trim()) params.set('search', query.trim());
          const res = await api.get(`/api/workers?${params.toString()}`);
          if (!res.success || !Array.isArray(res.data)) return [];
          return res.data.map((worker: any) => ({
            value: worker.id,
            label: worker.staffId
              ? `${worker.fullName} [${worker.staffId}]`
              : worker.fullName,
            badge: worker.primaryRole || 'Supervisor',
          }));
        }}
        placeholder="Select responsible supervisor..."
        searchPlaceholder="Search supervisors..."
        emptyMessage="No eligible supervisors found."
      />
      <p className="text-[11px] text-muted-foreground">
        This supervisor owns completion verification for a directly assigned technician/team.
      </p>
    </div>
  );
}

export function MaintenanceRequestsPage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [autoConvertId, setAutoConvertId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { hasPermission, user, isAdmin } = useAuthStore();
  const { pageParams } = useNavigationStore();

  // Track autoOpen to avoid race condition between filter effect and fetch effect
  const autoOpenRef = useRef<string | null>(null);
  const hasAutoOpenedRef = useRef(false);

  // Auto-apply filter and open detail from navigation params (e.g. from bell/dashboard)
  useEffect(() => {
    if (pageParams?.status) {
      setFilterStatus(pageParams.status);
    }
    if (pageParams?.id) {
      setDetailId(pageParams.id);
    }
    if (pageParams?.autoOpen === 'first') {
      autoOpenRef.current = 'first';
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRequests = useMemo(() => {
    if (!searchText.trim()) return requests;
    const q = searchText.toLowerCase();
    return requests.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.requestNumber.toLowerCase().includes(q) ||
      (r.assetName || (r as any).asset?.name || '').toLowerCase().includes(q) ||
      (r.requester?.fullName || '').toLowerCase().includes(q)
    );
  }, [requests, searchText]);

  const statusCounts = useMemo(() => ({
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    converted: requests.filter(r => r.status === 'converted').length,
  }), [requests]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (filterStatus !== 'all') params.set('status', filterStatus);
    if (filterPriority !== 'all') params.set('priority', filterPriority);
    api.get<MaintenanceRequest[]>(`/api/maintenance-requests?${params}`).then(res => {
      if (active) {
        if (res.success && res.data) setRequests(res.data);
        setLoading(false);
        // Auto-open first request if navigated from bell/dashboard with autoOpen param
        // Only trigger once and only when no detail is already open
        if (autoOpenRef.current === 'first' && !hasAutoOpenedRef.current && (res.data?.length ?? 0) > 0 && !detailId) {
          hasAutoOpenedRef.current = true;
          autoOpenRef.current = null;
          setDetailId((res.data as MaintenanceRequest[])[0].id);
        }
      }
    });
    return () => { active = false; };
  }, [filterStatus, filterPriority, refreshKey]);

  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleDeleteFromList = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    const res = await api.delete(`/api/maintenance-requests/${deleteId}`);
    if (res.success) {
      toast.success('Request deleted');
      setDeleteId(null);
      handleRefresh();
    } else {
      toast.error(res.error || 'Failed to delete request');
    }
    setDeleteLoading(false);
  };

  // Helper: check if user can convert a specific MR to WO
  const canConvertMR = useCallback((mr: MaintenanceRequest) => {
    return mr.status === 'approved'
      && !mr.workOrderId
      && hasPermission('maintenance_requests.convert_to_wo')
      && (mr.assignedPlannerId === user?.id || isAdmin() || !mr.assignedPlannerId);
  }, [hasPermission, user, isAdmin]);

  // Render action buttons for a request row
  const renderRowActions = useCallback((mr: MaintenanceRequest) => {
    const isRequester = mr.requestedBy === user?.id;
    const canEditRow = mr.status === 'pending' && (isRequester || isAdmin());
    const canDeleteRow = mr.status === 'pending' && (isRequester || isAdmin());
    const convertable = canConvertMR(mr);
    if (!canEditRow && !canDeleteRow && !convertable) return null;
    return (
      <div className="flex items-center gap-0.5">
        {canEditRow && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-blue-600 focus:text-blue-600 focus:bg-blue-50" onClick={(e) => { e.stopPropagation(); setDetailId(mr.id); }}>
                <Pencil className="h-4 w-4 mr-2" />View / Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50" onClick={(e) => { e.stopPropagation(); setDeleteId(mr.id); }}>
                <Trash2 className="h-4 w-4 mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!canEditRow && convertable && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
            onClick={(e) => {
              e.stopPropagation();
              setAutoConvertId(mr.id);
              setDetailId(mr.id);
            }}
            title="Convert to Work Order"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            <span className="hidden sm:inline">Convert</span>
          </Button>
        )}
      </div>
    );
  }, [canConvertMR, user, isAdmin]);

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Maintenance Requests</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage and track all maintenance requests</p>
        </div>
        {hasPermission('maintenance_requests.create') && (
          <>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New Request</Button>
          <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen} title="Create Maintenance Request" footer={<Button type="submit" form="create-mr-form" className="bg-emerald-600 hover:bg-emerald-700 text-white">Submit Request</Button>}>
            <CreateMRForm onSuccess={() => { setCreateOpen(false); handleRefresh(); }} />
          </ResponsiveDialog>
          </>
        )}
      </div>

      {/* Stats Bar - Pill style */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: 'Total', value: statusCounts.total, className: 'bg-slate-100 text-slate-700 border-slate-200' },
          { label: 'Pending', value: statusCounts.pending, className: 'bg-amber-50 text-amber-700 border-amber-200' },
          { label: 'Approved', value: statusCounts.approved, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          { label: 'Rejected', value: statusCounts.rejected, className: 'bg-red-50 text-red-700 border-red-200' },
          { label: 'Converted', value: statusCounts.converted, className: 'bg-teal-50 text-teal-700 border-teal-200' },
        ].map(s => (
          <div key={s.label} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${s.className} transition-colors`}>
            {s.value} {s.label}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-row flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search requests..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingSkeleton /> : (
        <Card className="border-0 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request #</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Requested By</TableHead>
                <TableHead className="hidden xl:table-cell">Asset</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-48">
                  <EmptyState icon={ClipboardList} title="No maintenance requests found" description="Try adjusting your filters or create a new request." />
                </TableCell></TableRow>
              ) : filteredRequests.map(mr => (
                <TableRow key={mr.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDetailId(mr.id)}>
                  <TableCell className="font-mono text-xs">{mr.requestNumber}</TableCell>
                  <TableCell className="font-medium max-w-[250px] truncate">{mr.title}</TableCell>
                  <TableCell className="hidden md:table-cell"><PriorityBadge priority={mr.priority} /></TableCell>
                  <TableCell><StatusBadge status={mr.status} /></TableCell>
                  <TableCell className="text-sm hidden lg:table-cell">{mr.requester?.fullName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate hidden xl:table-cell">{(mr as any).asset?.name || mr.assetName || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{formatDate(mr.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      {mr.machineDownStatus && <Badge variant="destructive" className="text-[10px]">DOWN</Badge>}
                      {renderRowActions(mr)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Detail Side Sheet */}
      <Sheet open={!!detailId} onOpenChange={(open) => { if (!open) { setDetailId(null); setAutoConvertId(null); } }}>
        <SheetContent side="right" className="overflow-y-auto overflow-x-hidden p-6 pt-0 min-w-0">
          {detailId && <MRDetailPage id={detailId} onUpdate={handleRefresh} autoOpenConvert={autoConvertId === detailId} onDelete={() => { setDetailId(null); }} />}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog (from list) */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete Maintenance Request"
        description="Are you sure you want to delete this maintenance request? This action cannot be undone."
        confirmLabel="Yes, Delete"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDeleteFromList}
      />
    </div>
  );
}

// ============================================================================
// CREATE MR FORM
// ============================================================================

export function CreateMRForm({ onSuccess }: { onSuccess: () => void }) {
  const { user, isAdmin } = useAuthStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assetMode, setAssetMode] = useState<'registered' | 'manual'>('registered');
  const [assetId, setAssetId] = useState('');
  const [manualAssetName, setManualAssetName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departmentLabel, setDepartmentLabel] = useState('');
  const [category, setCategory] = useState('');
  const [machineDown, setMachineDown] = useState(false);
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);

  const assetMetaRef = useRef(new Map<string, { location: string }>());
  const lastAutoLocationRef = useRef('');

  const fetchAssetOptions = useCallback(async (query: string) => {
    const params = new URLSearchParams({ limit: '100' });
    const q = query.trim();
    if (q) params.set('search', q);

    const res = await api.get(`/api/assets?${params.toString()}`);
    if (!res.success || !res.data) return [];

    let assets = Array.isArray(res.data) ? [...res.data] : [];

    // AsyncSearchableSelect clears its search query after selection. Keep the
    // selected asset in the option set even when it is outside the first page.
    if (!q && assetId && !assets.some((a: any) => a.id === assetId)) {
      const selected = await api.get(`/api/assets/${encodeURIComponent(assetId)}`);
      if (selected.success && selected.data) assets.unshift(selected.data);
    }

    assetMetaRef.current.clear();

    return assets.map((a: any) => {
      assetMetaRef.current.set(a.id, { location: (a.location || '').trim() });
      const tag = a.assetTag ? ` [${a.assetTag}]` : '';
      const serial = a.serialNumber ? ` — ${a.serialNumber}` : '';
      return {
        value: a.id,
        label: `${a.name || 'Unnamed Asset'}${tag}${serial}`,
        badge: a.status,
      };
    });
  }, [assetId]);

  const handleRegisteredAssetChange = useCallback((value: string) => {
    setAssetId(value);
    if (!value) return;

    const suggestedLocation = assetMetaRef.current.get(value)?.location || '';
    setLocation((current) => {
      const currentTrimmed = current.trim();
      if (!currentTrimmed || currentTrimmed === lastAutoLocationRef.current) {
        return suggestedLocation;
      }
      return current;
    });
    lastAutoLocationRef.current = suggestedLocation;
  }, []);

  useEffect(() => {
    if (!user?.department) return;
    setDepartmentLabel(user.department);
    api.get('/api/departments?limit=100').then((res) => {
      if (!res.success || !Array.isArray(res.data)) return;
      const dept = res.data.find((d: any) =>
        d.id === user.department || d.code === user.department || d.name === user.department
      );
      if (dept) setDepartmentId(dept.id);
    });
  }, [user?.department]);

  const isDepartmentLocked = !isAdmin() && !!user?.department;

  const switchToRegistered = () => {
    setAssetMode('registered');
    setManualAssetName('');
  };

  const switchToManual = () => {
    setAssetMode('manual');
    setAssetId('');
    lastAutoLocationRef.current = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanManualAssetName = manualAssetName.trim();

    if (!cleanTitle) {
      toast.error('Please enter a request title');
      return;
    }
    if (assetMode === 'registered' && !assetId) {
      toast.error('Please select a registered asset');
      return;
    }
    if (assetMode === 'manual' && !cleanManualAssetName) {
      toast.error('Please enter the asset or item name');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        title: cleanTitle,
        description: description.trim(),
        priority,
        departmentId,
        category,
        machineDownStatus: machineDown,
        location: location.trim(),
      };
      if (assetMode === 'registered') payload.assetId = assetId;
      else payload.assetName = cleanManualAssetName;

      const res = await api.post('/api/maintenance-requests', payload);
      if (res.success) {
        toast.success('Maintenance request created');
        onSuccess();
      } else {
        toast.error(res.error || 'Failed to create request');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id="create-mr-form" onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief description of the issue" required />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the fault, symptoms, observations, and any immediate action taken" rows={3} />
      </div>

      <div className="space-y-2">
        <Label>Asset Source *</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={switchToRegistered}
            aria-pressed={assetMode === 'registered'}
            className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 text-sm font-medium transition-all ${assetMode === 'registered' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-border bg-background text-muted-foreground hover:border-emerald-300'}`}
          >
            <Building2 className="h-4 w-4" />
            <span>Registered Asset</span>
          </button>
          <button
            type="button"
            onClick={switchToManual}
            aria-pressed={assetMode === 'manual'}
            className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 text-sm font-medium transition-all ${assetMode === 'manual' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-border bg-background text-muted-foreground hover:border-emerald-300'}`}
          >
            <Pencil className="h-4 w-4" />
            <span>Manual Entry</span>
          </button>
        </div>
      </div>

      {assetMode === 'registered' ? (
        <div className="space-y-2">
          <Label>Registered Asset *</Label>
          <AsyncSearchableSelect
            value={assetId}
            onValueChange={handleRegisteredAssetChange}
            fetchOptions={fetchAssetOptions}
            placeholder="Select registered asset..."
            searchPlaceholder="Search by name, tag, serial, manufacturer, or model..."
            emptyMessage="No registered assets found."
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Asset / Item Name *</Label>
          <Input
            value={manualAssetName}
            onChange={e => setManualAssetName(e.target.value)}
            placeholder="Enter asset, machine, component, facility, or item name"
            required
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Location</Label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Building, floor, line or area"
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Department {isDepartmentLocked && <span className="text-xs text-muted-foreground font-normal ml-1">(auto-filled)</span>}</Label>
          {isDepartmentLocked ? (
            <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">{departmentLabel || departmentId}</div>
          ) : (
            <AsyncSearchableSelect
              value={departmentId}
              onValueChange={setDepartmentId}
              fetchOptions={async (query) => {
                const params = new URLSearchParams({ limit: '100' });
                if (query.trim()) params.set('search', query.trim());
                const res = await api.get(`/api/departments?${params.toString()}`);
                if (!res.success || !res.data) return [];
                return (Array.isArray(res.data) ? res.data : []).map((d: any) => ({
                  value: d.id,
                  label: d.code ? `${d.name} (${d.code})` : d.name,
                }));
              }}
              placeholder="Select department..."
              searchPlaceholder="Search departments..."
            />
          )}
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mechanical">Mechanical</SelectItem>
              <SelectItem value="electrical">Electrical</SelectItem>
              <SelectItem value="hydraulic">Hydraulic</SelectItem>
              <SelectItem value="pneumatic">Pneumatic</SelectItem>
              <SelectItem value="instrumentation">Instrumentation</SelectItem>
              <SelectItem value="structural">Structural</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Machine / Equipment Down?</Label>
          <Select value={machineDown ? 'yes' : 'no'} onValueChange={v => setMachineDown(v === 'yes')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">No — Operating / Available</SelectItem>
              <SelectItem value="yes">Yes — Down / Unavailable</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Submitting maintenance request...
        </div>
      )}
    </form>
  );
}

// ============================================================================
// MR DETAIL PAGE — Enhanced with Workflow Timeline, SLA Timer, Assign Planner, Convert to WO
// ============================================================================

// --- SLA Timer Sub-component ---
function SLATimerDisplay({ slaHours, slaStartedAt, status }: { slaHours?: number; slaStartedAt?: string; status: string }) {
  const [remaining, setRemaining] = useState<{ hours: number; minutes: number; seconds: number; breached: boolean } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!slaHours || !slaStartedAt || status === 'converted' || status === 'rejected') {
      setRemaining(null);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const calc = () => {
      const deadline = new Date(slaStartedAt).getTime() + slaHours * 3600 * 1000;
      const now = Date.now();
      const diff = deadline - now;
      if (diff <= 0) {
        setRemaining({ hours: 0, minutes: 0, seconds: 0, breached: true });
      } else {
        setRemaining({ hours: Math.floor(diff / 3600000), minutes: Math.floor((diff % 3600000) / 60000), seconds: Math.floor((diff % 60000) / 1000), breached: false });
      }
    };
    calc();
    timerRef.current = setInterval(calc, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slaHours, slaStartedAt, status]);

  if (!remaining) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <Card className={`border-0 shadow-sm ${remaining.breached ? 'border-l-4 border-l-red-500 bg-red-50/50' : 'border-l-4 border-l-amber-500 bg-amber-50/50'}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${remaining.breached ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
          <Hourglass className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SLA Timer</p>
          <p className={`text-lg font-bold font-mono ${remaining.breached ? 'text-red-600' : 'text-amber-700'}`}>
            {remaining.breached ? 'BREACHED' : `${pad(remaining.hours)}:${pad(remaining.minutes)}:${pad(remaining.seconds)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{remaining.breached ? 'Time exceeded' : 'Time remaining'}</p>
          <p className="text-xs text-muted-foreground">{slaHours}h SLA window</p>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Workflow Timeline Sub-component ---
function MRWorkflowTimeline({ mr }: { mr: MaintenanceRequest }) {
  const steps = [
    { key: 'submitted', label: 'Submitted', icon: <Send className="h-4 w-4" />, info: mr.requester?.fullName, time: mr.createdAt, isComplete: true },
    { key: 'supervisor_review', label: 'Supervisor Review', icon: <ClipboardCheck className="h-4 w-4" />, info: mr.supervisor?.fullName, isComplete: ['supervisor_review', 'approved', 'assigned_to_planner', 'work_order_created'].includes(mr.workflowStatus) || mr.status === 'converted', isCurrent: mr.status === 'pending' && !mr.workflowStatus },
    { key: 'approved', label: 'Approved', icon: <CheckCircle2 className="h-4 w-4" />, info: mr.approver?.fullName || mr.supervisor?.fullName, time: mr.approvedAt, isComplete: ['approved', 'assigned_to_planner', 'work_order_created'].includes(mr.workflowStatus) || mr.status === 'converted', isCurrent: mr.status === 'approved' && !mr.assignedPlannerId },
    { key: 'assigned_to_planner', label: 'Assigned to Planner', icon: <UserPlus className="h-4 w-4" />, info: mr.assignedPlanner?.fullName, isComplete: ['assigned_to_planner', 'work_order_created'].includes(mr.workflowStatus) || mr.status === 'converted', isCurrent: mr.status === 'approved' && !!mr.assignedPlannerId },
    { key: 'work_order_created', label: 'Work Order Created', icon: <ClipboardList className="h-4 w-4" />, info: mr.workOrder?.woNumber, isComplete: mr.status === 'converted', isCurrent: false },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Workflow className="h-4 w-4 text-emerald-600" />Workflow Progress</CardTitle></CardHeader>
      <CardContent>
        <div className="relative">
          {steps.map((step, i) => {
            const dotColor = step.isComplete ? 'bg-emerald-500 text-emerald-500 ring-emerald-100' : step.isCurrent ? 'bg-amber-500 text-amber-500 ring-amber-100' : 'bg-slate-300 text-slate-300 ring-slate-100';
            const lineColor = step.isComplete ? 'bg-emerald-300' : 'bg-slate-200';
            return (
              <div key={step.key} className="flex items-start gap-4 relative">
                {/* Connector Line */}
                {i < steps.length - 1 && (
                  <div className="absolute left-[19px] top-[40px] w-0.5 h-[calc(100%-8px)] z-0" style={{ backgroundColor: lineColor.replace('bg-', '#') === lineColor ? undefined : undefined }}>
                    <div className={`w-0.5 h-full ${lineColor}`} />
                  </div>
                )}
                {/* Dot */}
                <div className={`relative z-10 h-10 w-10 rounded-full flex items-center justify-center shrink-0 ring-4 ${dotColor} ${step.isCurrent ? 'animate-pulse' : ''}`}>
                  <div className={step.isComplete ? 'text-white' : step.isCurrent ? 'text-white' : 'text-slate-400'}>
                    {step.isComplete ? <Check className="h-4 w-4 text-white" /> : step.icon}
                  </div>
                </div>
                {/* Content */}
                <div className="flex-1 pb-6 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-semibold ${step.isComplete ? 'text-emerald-700' : step.isCurrent ? 'text-amber-700' : 'text-slate-400'}`}>{step.label}</p>
                    {step.isCurrent && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 animate-pulse">Current</Badge>}
                    {step.isComplete && !step.isCurrent && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Done</Badge>}
                  </div>
                  {step.info && <p className="text-xs text-muted-foreground mt-0.5">{step.info}</p>}
                  {step.time && <p className="text-[10px] text-muted-foreground">{formatDateTime(step.time)}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function MRDetailPage({ id, onUpdate, autoOpenConvert, onDelete }: { id: string; onUpdate: () => void; autoOpenConvert?: boolean; onDelete?: () => void }) {
  const [mr, setMr] = useState<MaintenanceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const { hasPermission, user, isAdmin } = useAuthStore();
  const isMobile = useIsMobile();
  const inventoryEnabled = useModuleEnabled(MODULE_CODES.INVENTORY);
  const toolsEnabled = useModuleEnabled(MODULE_CODES.TOOLS);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '', description: '', priority: 'medium', category: '',
    assetId: '', departmentId: '', machineDownStatus: false,
  });

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Assign to Planner dialog
  const [assignPlannerOpen, setAssignPlannerOpen] = useState(false);
  const [plannerId, setPlannerId] = useState('');
  const [plannerType, setPlannerType] = useState('engineering');
  const [plannerNotes, setPlannerNotes] = useState('');
  const [plannerLoading, setPlannerLoading] = useState(false);

  // Enhanced Convert to WO dialog
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({
    // Section 2: WO Details
    workOrderType: 'corrective' as string,
    priority: 'medium' as string,
    tradeActivity: 'mechanical' as string,
    technicalDescription: '',
    scheduledDate: '',
    deliveryDate: '',
    estimatedHours: '',
    estimatedHoursDisplay: '',
    // Section 3: Resource Assignment
    departmentIds: [] as string[],
    assignType: 'technician' as 'technician' | 'supervisor',
    selectedWorkerIds: [] as string[],
    teamLeaderId: '',
    responsibleSupervisorId: '',
    requiredParts: [] as Array<{ itemId: string; quantity: number }>,
    requiredTools: [] as Array<{ toolId: string; quantity: number }>,
    // Section 4: Safety
    safetyNotes: '',
    ppeRequired: '',
    notes: '',
  });
  const [convertLoading, setConvertLoading] = useState(false);
  // Data for dropdowns
  const [departments, setDepartments] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [toolsData, setToolsData] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    api.get<MaintenanceRequest>(`/api/maintenance-requests/${id}`).then(res => {
      if (active) {
        if (res.success && res.data) setMr(res.data);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [id]);

  const handleRefresh = useCallback(() => {
    api.get<MaintenanceRequest>(`/api/maintenance-requests/${id}`).then(res => {
      if (res.success && res.data) setMr(res.data);
    });
  }, [id]);

  const handleAction = async (action: string, notes?: string) => {
    setActionLoading(true);
    let res;
    if (action === 'approve') {
      res = await api.post(`/api/maintenance-requests/${id}/approve`, { notes: notes || '' });
    } else if (action === 'reject') {
      res = await api.post(`/api/maintenance-requests/${id}/reject`, { reason: notes || '' });
    } else {
      res = await api.put(`/api/maintenance-requests/${id}`, { action, notes: notes });
    }
    if (res.success) {
      toast.success(`Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
      handleRefresh();
      onUpdate();
      setRejectDialogOpen(false);
      setApproveDialogOpen(false);
      setRejectNotes('');
    } else {
      toast.error(res.error || 'Action failed');
    }
    setActionLoading(false);
  };

  const handleAssignPlanner = async () => {
    if (!plannerId) { toast.error('Please select a planner'); return; }
    setPlannerLoading(true);
    const res = await api.post(`/api/maintenance-requests/${id}/assign-planner`, { plannerId, plannerType, notes: plannerNotes });
    if (res.success) {
      toast.success('Planner assigned successfully');
      setAssignPlannerOpen(false);
      setPlannerId('');
      setPlannerNotes('');
      handleRefresh();
    } else {
      toast.error(res.error || 'Failed to assign planner');
    }
    setPlannerLoading(false);
  };

  const openConvertDialog = async () => {
    if (!mr) return;
    const defaults = await loadWorkOrderDefaults();
    const nowIso = new Date().toISOString();
    setConvertForm({
      workOrderType: 'corrective',
      priority: mr.priority === 'urgent' ? 'high' : mr.priority,
      tradeActivity: 'mechanical',
      technicalDescription: mr.title,
      scheduledDate: nowIso,
      deliveryDate: nowIso,
      estimatedHours: '',
      estimatedHoursDisplay: '',
      departmentIds: mr.departmentId ? [mr.departmentId] : [],
      assignType: 'technician',
      selectedWorkerIds: [],
      teamLeaderId: '',
    responsibleSupervisorId: '',
      requiredParts: [],
      requiredTools: [],
      safetyNotes: defaults.safetyNotes,
      ppeRequired: defaults.ppeRequired,
      notes: defaults.notes,
    });
    // Load dropdown data
    try {
      const requestPlantId = (mr as any).plantId ? String((mr as any).plantId) : '';
      const inventoryRequest = inventoryEnabled && requestPlantId
        ? api.get(`/api/inventory?mode=lookup&limit=100&plantId=${encodeURIComponent(requestPlantId)}`)
        : Promise.resolve({ success: true, data: [] as any[] });
      const toolsRequest = toolsEnabled
        ? api.get('/api/tools?mode=lookup&limit=100')
        : Promise.resolve({ success: true, data: [] as any[] });
      const [deptsRes, invRes, toolsRes, usersRes] = await Promise.all([
        api.get('/api/departments?limit=100'),
        inventoryRequest,
        toolsRequest,
        api.get('/api/workers?role=all'),
      ]);
      if (deptsRes.success && deptsRes.data) setDepartments(Array.isArray(deptsRes.data) ? deptsRes.data : []);
      if (invRes.success && invRes.data) {
        const items = Array.isArray(invRes.data) ? invRes.data : [];
        setInventoryItems(requestPlantId ? items.filter((item: any) => String(item.plantId) === requestPlantId) : []);
      }
      if (toolsRes.success && toolsRes.data) setToolsData(Array.isArray(toolsRes.data) ? toolsRes.data : []);
      if (usersRes.success && usersRes.data) {
        const users = Array.isArray(usersRes.data) ? usersRes.data : [];
        const map: Record<string, string> = {};
        users.forEach((u: any) => { map[u.id] = `${u.fullName} (${u.username})`; });
        setUsersMap(map);
      }
    } catch (_e) {
      // Silently handle - dropdowns will just be empty
    }
    setConvertOpen(true);
  };

  // Auto-open convert dialog when triggered from the list view
  const autoConvertTriggered = useRef(false);
  useEffect(() => {
    if (autoOpenConvert && mr && !loading && !autoConvertTriggered.current && mr.status === 'approved' && !mr.workOrderId) {
      autoConvertTriggered.current = true;
      openConvertDialog();
    }
  }, [autoOpenConvert, mr, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConvert = async () => {
    if (!mr) return;
    if (convertForm.assignType === 'technician' && convertForm.selectedWorkerIds.length > 0 && !convertForm.responsibleSupervisorId) {
      toast.error('Select the responsible supervisor who will verify this work order');
      return;
    }
    if (convertForm.assignType === 'supervisor' && !convertForm.teamLeaderId) {
      toast.error('Select the supervisor who will receive this work order');
      return;
    }
    setConvertLoading(true);
    const payload: any = {
      title: mr.title,
      priority: convertForm.priority,
      workOrderType: convertForm.workOrderType,
      tradeActivity: convertForm.tradeActivity,
      technicalDescription: convertForm.technicalDescription || undefined,
      assignmentType: convertForm.assignType === 'technician' ? 'direct' : 'via_supervisor',
      estimatedHours: convertForm.estimatedHours ? parseFloat(convertForm.estimatedHours) : undefined,
      plannedStart: convertForm.scheduledDate || undefined,
      deliveryDateRequired: convertForm.deliveryDate || undefined,
      safetyNotes: convertForm.safetyNotes || undefined,
      ppeRequired: convertForm.ppeRequired || undefined,
      notes: convertForm.notes || undefined,
      requiredParts: inventoryEnabled && convertForm.requiredParts.length > 0 ? convertForm.requiredParts : undefined,
      requiredTools: toolsEnabled && convertForm.requiredTools.length > 0 ? convertForm.requiredTools : undefined,
    };
    if (convertForm.assignType === 'technician') {
      if (convertForm.selectedWorkerIds.length > 0) {
        const teamMembers = convertForm.selectedWorkerIds.map(workerId => ({
          userId: workerId,
          role: workerId === convertForm.teamLeaderId ? 'team_leader' : 'assistant',
        }));
        payload.teamMembers = teamMembers;
        payload.assignedTo = convertForm.selectedWorkerIds[0];
        payload.teamLeaderId = convertForm.teamLeaderId || null;
      }
      payload.assignedSupervisorId = convertForm.responsibleSupervisorId || undefined;
    } else {
      payload.assignedSupervisorId = convertForm.teamLeaderId;
    }
    const res = await api.post(`/api/maintenance-requests/${id}/convert`, payload);
    if (res.success) {
      toast.success('Converted to Work Order');
      setConvertOpen(false);
      handleRefresh();
      onUpdate();
    } else {
      toast.error(res.error || 'Conversion failed');
    }
    setConvertLoading(false);
  };

  // Helper: handle estimated hours format conversion ("2:30" → "2.5", "2.5" → "2.5")
  const handleEstHoursChange = (val: string) => {
    let displayVal = val;
    let decimalVal = val;
    if (val.includes(':')) {
      const [h, m] = val.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        decimalVal = String(h + m / 60);
      }
    }
    setConvertForm(f => ({ ...f, estimatedHours: decimalVal, estimatedHoursDisplay: displayVal }));
  };

  // Helper: add/remove items from multi-select arrays
  const addToArray = (field: 'departmentIds' | 'requiredParts' | 'requiredTools', id: string) => {
    if (field === 'departmentIds') {
      setConvertForm(f => {
        const arr = [...f[field]] as string[];
        if (!arr.includes(id)) arr.push(id);
        return { ...f, [field]: arr };
      });
    } else if (field === 'requiredParts') {
      setConvertForm(f => {
        const arr = [...f[field]] as Array<{ itemId: string; quantity: number }>;
        if (!arr.some(p => p.itemId === id)) arr.push({ itemId: id, quantity: 1 });
        return { ...f, [field]: arr };
      });
    } else {
      setConvertForm(f => {
        const arr = [...f[field]] as Array<{ toolId: string; quantity: number }>;
        if (!arr.some(t => t.toolId === id)) arr.push({ toolId: id, quantity: 1 });
        return { ...f, [field]: arr };
      });
    }
  };

  const removeFromArray = (field: 'departmentIds' | 'requiredParts' | 'requiredTools', id: string) => {
    if (field === 'departmentIds') {
      setConvertForm(f => ({
        ...f,
        [field]: (f[field] as string[]).filter(x => x !== id),
      }));
    } else if (field === 'requiredParts') {
      setConvertForm(f => ({
        ...f,
        [field]: (f[field] as Array<{ itemId: string; quantity: number }>).filter(x => x.itemId !== id),
      }));
    } else {
      setConvertForm(f => ({
        ...f,
        [field]: (f[field] as Array<{ toolId: string; quantity: number }>).filter(x => x.toolId !== id),
      }));
    }
  };

  const updateConvertItemQuantity = (field: 'requiredParts' | 'requiredTools', id: string, qty: number) => {
    if (field === 'requiredParts') {
      setConvertForm(f => ({
        ...f,
        [field]: (f[field] as Array<{ itemId: string; quantity: number }>).map(p => p.itemId === id ? { ...p, quantity: qty } : p),
      }));
    } else {
      setConvertForm(f => ({
        ...f,
        [field]: (f[field] as Array<{ toolId: string; quantity: number }>).map(t => t.toolId === id ? { ...t, quantity: qty } : t),
      }));
    }
  };

  const handleComment = async () => {
    if (!comment.trim()) return;
    const res = await api.post(`/api/maintenance-requests/${id}/comments`, { content: comment });
    if (res.success) {
      toast.success('Comment added');
      setComment('');
      handleRefresh();
    }
  };

  // --- Edit handlers ---
  const openEditDialog = () => {
    if (!mr) return;
    setEditForm({
      title: mr.title,
      description: mr.description || '',
      priority: mr.priority,
      category: mr.category || '',
      assetId: mr.assetId || '',
      departmentId: mr.departmentId || '',
      machineDownStatus: mr.machineDownStatus || false,
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editForm.title.trim()) { toast.error('Title is required'); return; }
    setEditLoading(true);
    const res = await api.put(`/api/maintenance-requests/${id}`, {
      title: editForm.title,
      description: editForm.description,
      priority: editForm.priority,
      category: editForm.category,
      assetId: editForm.assetId || null,
      departmentId: editForm.departmentId || null,
      machineDownStatus: editForm.machineDownStatus,
    });
    if (res.success) {
      toast.success('Request updated');
      setEditOpen(false);
      handleRefresh();
      onUpdate();
    } else {
      toast.error(res.error || 'Failed to update request');
    }
    setEditLoading(false);
  };

  // --- Delete handler ---
  const handleDelete = async () => {
    setDeleteLoading(true);
    const res = await api.delete(`/api/maintenance-requests/${id}`);
    if (res.success) {
      toast.success('Request deleted');
      setDeleteOpen(false);
      onUpdate(); // refresh list
      onDelete?.(); // close detail sheet
    } else {
      toast.error(res.error || 'Failed to delete request');
    }
    setDeleteLoading(false);
  };

  if (loading) return <LoadingSkeleton />;
  if (!mr) return <div className="p-6">Request not found</div>;

  // Use the same authoritative department-supervisor identity as the API.
  const isAdminUser = isAdmin();
  const isMaintenanceSupervisor = user?.roles?.some((r: any) => r.slug === 'maintenance_supervisor' || r.slug === 'admin') ?? false;
  const accountableSupervisorId = mr.departmentId
    ? mr.department?.supervisorId
    : mr.supervisorId;
  const isDeptSupervisor = isMaintenanceSupervisor
    && Boolean(accountableSupervisorId)
    && accountableSupervisorId === user?.id;

  const canApprove = mr.status === 'pending'
    && hasPermission('maintenance_requests.approve')
    && (isAdminUser || isDeptSupervisor);
  const canReject = mr.status === 'pending'
    && hasPermission('maintenance_requests.reject')
    && (isAdminUser || isDeptSupervisor);
  const canAssignPlanner = mr.status === 'approved'
    && hasPermission('maintenance_requests.assign_planner')
    && (isAdminUser || isDeptSupervisor)
    && !mr.assignedPlannerId;
  const canConvert = mr.status === 'approved' && !mr.workOrderId && hasPermission('maintenance_requests.convert_to_wo') && (mr.assignedPlannerId === user?.id || isAdminUser || !mr.assignedPlannerId);
  // Requester can edit/delete their own pending requests
  const isRequester = mr.requestedBy === user?.id;
  const canEdit = mr.status === 'pending' && (isRequester || isAdminUser);
  const canDelete = mr.status === 'pending' && (isRequester || isAdminUser);

  return (
    <>
      {/* Sheet Header */}
      <SheetHeader className="pt-4 pb-0 shrink-0">
        <div className="flex items-center gap-2 flex-wrap pr-8">
          <SheetTitle className="text-lg">{mr.requestNumber}</SheetTitle>
          <StatusBadge status={mr.status} />
          <PriorityBadge priority={mr.priority} />
          {mr.machineDownStatus && <Badge variant="destructive" className="text-[10px]">MACHINE DOWN</Badge>}
        </div>
        <SheetDescription className="text-sm font-medium text-foreground mt-0.5 line-clamp-2">{mr.title}</SheetDescription>
        {/* Action buttons in header */}
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {canEdit && (
            <Button size="sm" variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50" onClick={openEditDialog}>
              <Pencil className="h-4 w-4 mr-1" />Edit
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" />Delete
            </Button>
          )}
          {canReject && (
            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setRejectDialogOpen(true)}>
              <XCircle className="h-4 w-4 mr-1" />Reject
            </Button>
          )}
          {canApprove && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={actionLoading} onClick={() => setApproveDialogOpen(true)}>
              <CheckCircle2 className="h-4 w-4 mr-1" />Approve
            </Button>
          )}
          {canAssignPlanner && (
            <Button size="sm" variant="outline" className="border-violet-200 text-violet-700 hover:bg-violet-50" onClick={() => setAssignPlannerOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" />Assign to Planner
            </Button>
          )}
          {canConvert && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={actionLoading} onClick={openConvertDialog}>
              <RefreshCw className="h-4 w-4 mr-1" />Convert to WO
            </Button>
          )}
        </div>
      </SheetHeader>

      {/* Reject Dialog */}
      <ResponsiveDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen} title="Reject Request" description="Please provide a reason for rejection." footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button><Button variant="destructive" disabled={actionLoading} onClick={() => handleAction('reject', rejectNotes)}>{actionLoading ? 'Rejecting...' : 'Reject Request'}</Button></div>}>
        <Textarea value={rejectNotes} onChange={e => setRejectNotes(e.target.value)} placeholder="Reason for rejection..." rows={3} />
      </ResponsiveDialog>

      {/* Approve Confirmation Dialog */}
      <ConfirmDialog
        open={approveDialogOpen}
        onOpenChange={setApproveDialogOpen}
        title="Approve Maintenance Request"
        description="Are you sure you want to approve this maintenance request? This will allow it to be assigned to a planner for work order creation."
        confirmLabel="Yes, Approve"
        loading={actionLoading}
        onConfirm={() => handleAction('approve', '')}
      />

      {/* Edit Request Dialog */}
      <ResponsiveDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Maintenance Request"
        description="Update the details of your pending request."
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled={editLoading} onClick={handleEdit}>
              {editLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving...</> : <><Pencil className="h-4 w-4 mr-1" />Save Changes</>}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Brief description of the issue" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Detailed description..." rows={3} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={editForm.priority} onValueChange={v => setEditForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={editForm.category} onValueChange={v => setEditForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mechanical">Mechanical</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="hydraulic">Hydraulic</SelectItem>
                  <SelectItem value="pneumatic">Pneumatic</SelectItem>
                  <SelectItem value="instrumentation">Instrumentation</SelectItem>
                  <SelectItem value="structural">Structural</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Machine / Asset</Label>
              <AsyncSearchableSelect
                value={editForm.assetId}
                onValueChange={v => setEditForm(f => ({ ...f, assetId: v }))}
                fetchOptions={async () => {
                  const res = await api.get('/api/assets');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).map((a: any) => ({
                      value: a.id,
                      label: `${a.name} [${a.assetTag}]`,
                    }));
                  }
                  return [];
                }}
                placeholder="Select machine..."
                searchPlaceholder="Search machines..."
              />
            </div>
            <div className="space-y-2">
              <Label>Machine Down?</Label>
              <Select value={editForm.machineDownStatus ? 'Yes' : 'No'} onValueChange={v => setEditForm(f => ({ ...f, machineDownStatus: v === 'Yes' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="No">No — Machine Running</SelectItem>
                  <SelectItem value="Yes">Yes — Machine Down</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </ResponsiveDialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Maintenance Request"
        description={`Are you sure you want to delete "${mr?.title}"? This action cannot be undone. All comments and attachments will be permanently removed.`}
        confirmLabel="Yes, Delete"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDelete}
      />

      {/* Assign to Planner Dialog */}
      <ResponsiveDialog open={assignPlannerOpen} onOpenChange={setAssignPlannerOpen} title="Assign to Planner" description="Select a planner type and planner to handle this maintenance request." footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setAssignPlannerOpen(false)}>Cancel</Button><Button className="bg-violet-600 hover:bg-violet-700 text-white" disabled={plannerLoading || !plannerId} onClick={handleAssignPlanner}>{plannerLoading ? 'Assigning...' : 'Assign Planner'}</Button></div>}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Planner Type *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPlannerType('engineering')}
                  className={`px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                    plannerType === 'engineering'
                      ? 'border-violet-600 bg-violet-50 text-violet-800'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                  }`}
                >
                  <Settings className="h-4 w-4 inline mr-1.5" />
                  Engineering Planner
                </button>
                <button
                  type="button"
                  onClick={() => setPlannerType('production')}
                  className={`px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                    plannerType === 'production'
                      ? 'border-violet-600 bg-violet-50 text-violet-800'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                  }`}
                >
                  <Target className="h-4 w-4 inline mr-1.5" />
                  Production Planner
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Select Planner *</Label>
              <AsyncSearchableSelect
                value={plannerId}
                onValueChange={setPlannerId}
                fetchOptions={async () => {
                  const params = new URLSearchParams();
                  params.set('role', 'maintenance_planner');
                  const res = await api.get(`/api/users?${params.toString()}`);
                  if (res.success && res.data) {
                    const users = Array.isArray(res.data) ? res.data : [];
                    return users.map((u: any) => ({
                      value: u.id,
                      label: `${u.fullName} (${u.username})`,
                    }));
                  }
                  return [];
                }}
                placeholder="Search for a planner..."
                searchPlaceholder="Search planners by name..."
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={plannerNotes} onChange={e => setPlannerNotes(e.target.value)} placeholder="Any notes for the planner..." rows={2} />
            </div>
          </div>
      </ResponsiveDialog>

      {/* Enhanced Convert to WO Dialog — Mobile Stepper / Desktop 4-Section Layout */}
      {!isMobile ? (
      <ResponsiveDialog open={convertOpen} onOpenChange={setConvertOpen} large desktopMaxWidth="sm:max-w-4xl" title={<span className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-emerald-600" />Convert to Work Order</span>} description="Create a comprehensive work order from this maintenance request." footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={convertLoading} onClick={handleConvert}>{convertLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Converting...</> : <><RefreshCw className="h-4 w-4 mr-1" />Create Work Order</>}</Button></div>}>
          <div className="grid gap-5 py-2">

            {/* ============================================================ */}
            {/* SECTION 1: Request Information (Read-only, blue background) */}
            {/* ============================================================ */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-blue-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                <FileText className="h-4 w-4" />Request Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-[11px] text-blue-600 font-medium uppercase">Request Number</p>
                  <p className="text-sm font-semibold">{mr.requestNumber}</p>
                </div>
                <div>
                  <p className="text-[11px] text-blue-600 font-medium uppercase">Machine / Asset</p>
                  <p className="text-sm font-semibold">{mr.asset?.name || mr.assetName || '-'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-blue-600 font-medium uppercase">Department</p>
                  <p className="text-sm font-semibold">{(mr as any).department?.name || mr.requester?.department || '-'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-blue-600 font-medium uppercase">Asset Location</p>
                  <p className="text-sm font-semibold">{(mr as any).asset?.location || '-'}</p>
                </div>
                {mr.location && (
                  <div>
                    <p className="text-[11px] text-blue-600 font-medium uppercase">{(mr as any).asset?.location ? 'Reported Location' : 'Location'}</p>
                    <p className="text-sm font-semibold">{mr.location}</p>
                  </div>
                )}
                <div>
                  <p className="text-[11px] text-blue-600 font-medium uppercase">Breakdown</p>
                  <Badge variant={mr.machineDownStatus ? 'destructive' : 'secondary'} className="text-xs">
                    {mr.machineDownStatus ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <p className="text-[11px] text-blue-600 font-medium uppercase">Problem Description</p>
                  <p className="text-sm text-blue-900 mt-0.5 whitespace-pre-wrap bg-white/60 rounded-lg p-3 border border-blue-100 max-h-28 overflow-y-auto">{mr.description || 'No description provided.'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-blue-600 font-medium uppercase">Requested By</p>
                  <p className="text-sm font-semibold">{mr.requester?.fullName || '-'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-blue-600 font-medium uppercase">Date Sent</p>
                  <p className="text-sm font-semibold">{formatDateTime(mr.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* ============================================================ */}
            {/* SECTION 2: Work Order Details (purple background) */}
            {/* ============================================================ */}
            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-purple-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                <ClipboardCheck className="h-4 w-4" />Work Order Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Work Order Type</Label>
                  <Select value={convertForm.workOrderType} onValueChange={v => setConvertForm(f => ({ ...f, workOrderType: v }))}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breakdown">Breakdown</SelectItem>
                      <SelectItem value="preventive">Preventive</SelectItem>
                      <SelectItem value="corrective">Corrective</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Priority</Label>
                  <Select value={convertForm.priority} onValueChange={v => setConvertForm(f => ({ ...f, priority: v }))}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Trade Activity</Label>
                  <Select value={convertForm.tradeActivity} onValueChange={v => setConvertForm(f => ({ ...f, tradeActivity: v }))}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mechanical">Mechanical</SelectItem>
                      <SelectItem value="electrical">Electrical</SelectItem>
                      <SelectItem value="civil">Civil</SelectItem>
                      <SelectItem value="facility">Facility</SelectItem>
                      <SelectItem value="workshop">Workshop</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Est. Hours</Label>
                  <Input
                    className="min-h-[44px]"
                    value={convertForm.estimatedHoursDisplay || convertForm.estimatedHours}
                    onChange={e => handleEstHoursChange(e.target.value)}
                    placeholder="2.5 or 2:30"
                  />
                  <p className="text-[10px] text-muted-foreground">Supports 2.5 or 2:30 format</p>
                </div>
                <div className="sm:col-span-2 lg:col-span-4 space-y-1.5">
                  <Label className="text-xs">Technical Description</Label>
                  <Textarea
                    value={convertForm.technicalDescription}
                    onChange={e => setConvertForm(f => ({ ...f, technicalDescription: e.target.value }))}
                    placeholder="Detailed technical description of the work to be performed..."
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Scheduled Date</Label>
                  <DateTimePicker value={convertForm.scheduledDate || undefined} onChange={v => setConvertForm(f => ({ ...f, scheduledDate: v || '' }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Delivery Date</Label>
                  <DatePicker value={convertForm.deliveryDate || undefined} onChange={v => setConvertForm(f => ({ ...f, deliveryDate: v || '' }))} />
                </div>
              </div>
            </div>

            {/* ============================================================ */}
            {/* SECTION 3: Resource Assignment (green background) */}
            {/* ============================================================ */}
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 sm:p-6">
              <div className="grid gap-4">
                <WorkerAssignmentSelector
                  selectedWorkerIds={convertForm.selectedWorkerIds}
                  teamLeaderId={convertForm.teamLeaderId}
                  onSelectedWorkersChange={(ids) => setConvertForm(f => ({ ...f, selectedWorkerIds: ids }))}
                  onTeamLeaderChange={(id) => setConvertForm(f => ({ ...f, teamLeaderId: id }))}
                  assignType={convertForm.assignType}
                  onAssignTypeChange={(type) => setConvertForm(f => ({ ...f, assignType: type }))}
                  label="Resource Assignment"
                />
                {convertForm.assignType === 'technician' && (
                  <ResponsibleSupervisorSelect
                    value={convertForm.responsibleSupervisorId}
                    onValueChange={(value) => setConvertForm(f => ({ ...f, responsibleSupervisorId: value }))}
                  />
                )}

                {/* Required Spare Parts */}
                {inventoryEnabled && <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1"><PackageSearch className="h-3.5 w-3.5" />Required Spare Parts</Label>
                  <div className="flex flex-wrap items-center gap-1.5 min-h-[44px] p-2 border rounded-md bg-white">
                    {convertForm.requiredParts.length === 0 && <span className="text-sm text-muted-foreground">Select spare parts from inventory...</span>}
                    {convertForm.requiredParts.map(part => {
                      const item = inventoryItems.find(i => i.id === part.itemId);
                      return item ? (
                        <div key={part.itemId} className="flex items-center gap-1">
                          <Badge variant="secondary" className="gap-1">
                            {item.itemName || item.name} <span className="font-semibold">x{part.quantity}</span>
                            <button onClick={() => removeFromArray('requiredParts', part.itemId)} className="ml-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-red-600"><X className="h-3 w-3" /></button>
                          </Badge>
                          <Input type="number" min={1} value={part.quantity} onChange={e => updateConvertItemQuantity('requiredParts', part.itemId, Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-7 w-14 text-center text-xs px-1" />
                        </div>
                      ) : null;
                    })}
                  </div>
                  <Select onValueChange={v => addToArray('requiredParts', v)}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Add spare part..." /></SelectTrigger>
                    <SelectContent>
                      {inventoryItems.filter(i => !convertForm.requiredParts.some(p => p.itemId === i.id)).slice(0, 50).map(i => (
                        <SelectItem key={i.id} value={i.id}>{i.itemName || i.name}{i.itemCode ? ` [${i.itemCode}]` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>}

                {/* Required Tools */}
                {toolsEnabled && <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1"><Hammer className="h-3.5 w-3.5" />Required Tools</Label>
                  <div className="flex flex-wrap items-center gap-1.5 min-h-[44px] p-2 border rounded-md bg-white">
                    {convertForm.requiredTools.length === 0 && <span className="text-sm text-muted-foreground">Select tools...</span>}
                    {convertForm.requiredTools.map(tool => {
                      const toolItem = toolsData.find(t => t.id === tool.toolId);
                      return toolItem ? (
                        <div key={tool.toolId} className="flex items-center gap-1">
                          <Badge variant="secondary" className="gap-1">
                            {toolItem.toolName || toolItem.name} <span className="font-semibold">x{tool.quantity}</span>
                            <button onClick={() => removeFromArray('requiredTools', tool.toolId)} className="ml-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-red-600"><X className="h-3 w-3" /></button>
                          </Badge>
                          <Input type="number" min={1} value={tool.quantity} onChange={e => updateConvertItemQuantity('requiredTools', tool.toolId, Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-7 w-14 text-center text-xs px-1" />
                        </div>
                      ) : null;
                    })}
                  </div>
                  <Select onValueChange={v => addToArray('requiredTools', v)}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Add tool..." /></SelectTrigger>
                    <SelectContent>
                      {toolsData.filter(t => !convertForm.requiredTools.some(to => to.toolId === t.id)).slice(0, 50).map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.toolName || t.name}{t.toolCode ? ` [${t.toolCode}]` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>}
              </div>
            </div>

            {/* ============================================================ */}
            {/* SECTION 4: Safety Notes (amber background) */}
            {/* ============================================================ */}
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                <ShieldAlert className="h-4 w-4" />Safety Notes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">Safety Notes</Label>
                  <Textarea
                    value={convertForm.safetyNotes}
                    onChange={e => setConvertForm(f => ({ ...f, safetyNotes: e.target.value }))}
                    placeholder="Any safety hazards, precautions, or lockout/tagout requirements..."
                    rows={3}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><HardHat className="h-3.5 w-3.5" />PPE Required</Label>
                  <Input
                    className="min-h-[44px]"
                    value={convertForm.ppeRequired}
                    onChange={e => setConvertForm(f => ({ ...f, ppeRequired: e.target.value }))}
                    placeholder="e.g. Safety glasses, gloves, helmet, hearing protection"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">General Notes</Label>
                  <Textarea
                    value={convertForm.notes}
                    onChange={e => setConvertForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any additional notes or special instructions..."
                    rows={2}
                  />
                </div>
              </div>
            </div>

          </div>
      </ResponsiveDialog>
      ) : (
      /* ==================== MOBILE: Stepper bottom sheet ==================== */
      <MobileStepperSheet
        open={convertOpen}
        onOpenChange={setConvertOpen}
        title="Convert to Work Order"
        description="Create a work order from this maintenance request."
        steps={[
          { key: 'info', label: 'Request', icon: FileText },
          { key: 'details', label: 'Details', icon: ClipboardCheck },
          { key: 'resources', label: 'Resources', icon: Users },
          { key: 'safety', label: 'Safety', icon: ShieldAlert },
        ]}
        actionLabel="Create Work Order"
        actionLoading={convertLoading}
        onAction={handleConvert}
      >
        {(stepKey) => stepKey === 'info' ? (
          /* === MOBILE STEP 1: Request Info — compact card layout === */
          <div className="space-y-3">
            <div className="bg-blue-50 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider">Request #</p>
                  <p className="text-sm font-bold text-blue-900 mt-0.5">{mr.requestNumber}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider">Machine</p>
                  <p className="text-sm font-bold text-blue-900 mt-0.5 truncate">{mr.asset?.name || mr.assetName || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider">Department</p>
                  <p className="text-sm font-bold text-blue-900 mt-0.5">{(mr as any).department?.name || mr.requester?.department || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider">Asset Location</p>
                  <p className="text-sm font-bold text-blue-900 mt-0.5">{(mr as any).asset?.location || '-'}</p>
                </div>
                {mr.location && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider">{(mr as any).asset?.location ? 'Reported Location' : 'Location'}</p>
                    <p className="text-sm font-bold text-blue-900 mt-0.5">{mr.location}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider">Breakdown</p>
                  <Badge variant={mr.machineDownStatus ? 'destructive' : 'secondary'} className="text-xs">
                    {mr.machineDownStatus ? 'Yes' : 'No'}
                  </Badge>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider mb-1.5">Problem Description</p>
              <div className="bg-muted/50 rounded-xl p-3 text-sm text-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                {mr.description || 'No description provided.'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Requested By</p>
                <p className="text-sm font-medium mt-0.5">{mr.requester?.fullName || '-'}</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Date Sent</p>
                <p className="text-sm font-medium mt-0.5">{formatDateTime(mr.createdAt)}</p>
              </div>
            </div>
          </div>
        ) : stepKey === 'details' ? (
          /* === MOBILE STEP 2: WO Details — full-width stacked form === */
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Work Order Type</Label>
              <Select value={convertForm.workOrderType} onValueChange={v => setConvertForm(f => ({ ...f, workOrderType: v }))}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakdown">Breakdown</SelectItem>
                  <SelectItem value="preventive">Preventive</SelectItem>
                  <SelectItem value="corrective">Corrective</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Priority</Label>
                <Select value={convertForm.priority} onValueChange={v => setConvertForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Trade</Label>
                <Select value={convertForm.tradeActivity} onValueChange={v => setConvertForm(f => ({ ...f, tradeActivity: v }))}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mechanical">Mechanical</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="civil">Civil</SelectItem>
                    <SelectItem value="facility">Facility</SelectItem>
                    <SelectItem value="workshop">Workshop</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Est. Hours</Label>
                <Input
                  className="h-12 rounded-xl"
                  value={convertForm.estimatedHoursDisplay || convertForm.estimatedHours}
                  onChange={e => handleEstHoursChange(e.target.value)}
                  placeholder="2.5 or 2:30"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Scheduled</Label>
                <DateTimePicker value={convertForm.scheduledDate || undefined} onChange={v => setConvertForm(f => ({ ...f, scheduledDate: v || '' }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Delivery Date</Label>
              <DatePicker value={convertForm.deliveryDate || undefined} onChange={v => setConvertForm(f => ({ ...f, deliveryDate: v || '' }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Technical Description</Label>
              <Textarea
                className="rounded-xl min-h-[100px]"
                value={convertForm.technicalDescription}
                onChange={e => setConvertForm(f => ({ ...f, technicalDescription: e.target.value }))}
                placeholder="Detailed technical description..."
                rows={4}
              />
            </div>
          </div>
        ) : stepKey === 'resources' ? (
          /* === MOBILE STEP 3: Resource Assignment === */
          <div className="space-y-4">
            {/* Worker Assignment Selector — mobile (includes its own Assign Type toggle) */}
            <WorkerAssignmentSelector
              selectedWorkerIds={convertForm.selectedWorkerIds}
              teamLeaderId={convertForm.teamLeaderId}
              onSelectedWorkersChange={(ids) => setConvertForm(f => ({ ...f, selectedWorkerIds: ids }))}
              onTeamLeaderChange={(id) => setConvertForm(f => ({ ...f, teamLeaderId: id }))}
              assignType={convertForm.assignType}
              onAssignTypeChange={(type) => setConvertForm(f => ({ ...f, assignType: type }))}
              label="Resource Assignment"
            />
            {convertForm.assignType === 'technician' && (
              <ResponsibleSupervisorSelect
                value={convertForm.responsibleSupervisorId}
                onValueChange={(value) => setConvertForm(f => ({ ...f, responsibleSupervisorId: value }))}
              />
            )}

            {/* Parts & Tools in collapsible sections */}
            {(inventoryEnabled || toolsEnabled) && <Accordion type="multiple" className="space-y-2">
              {inventoryEnabled && <AccordionItem value="parts" className="border rounded-xl px-1">
                <AccordionTrigger className="text-xs font-medium py-3 px-2">
                  <span className="flex items-center gap-1.5"><PackageSearch className="h-3.5 w-3.5" />Spare Parts {convertForm.requiredParts.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5">{convertForm.requiredParts.length}</Badge>}</span>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-3 space-y-2">
                  {convertForm.requiredParts.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {convertForm.requiredParts.map(part => {
                        const item = inventoryItems.find(i => i.id === part.itemId);
                        return item ? (
                          <div key={part.itemId} className="flex items-center gap-1">
                            <Badge variant="secondary" className="gap-1">
                              {item.itemName || item.name} <span className="font-semibold">x{part.quantity}</span>
                              <button onClick={() => removeFromArray('requiredParts', part.itemId)} className="ml-0.5 h-5 w-5 flex items-center justify-center rounded-full hover:bg-red-100 hover:text-red-600"><X className="h-3 w-3" /></button>
                            </Badge>
                            <Input type="number" min={1} value={part.quantity} onChange={e => updateConvertItemQuantity('requiredParts', part.itemId, Math.max(1, parseInt(e.target.value) || 1))}
                              className="h-7 w-14 text-center text-xs px-1" />
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                  <Select onValueChange={v => addToArray('requiredParts', v)}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="+ Add spare part..." /></SelectTrigger>
                    <SelectContent>
                      {inventoryItems.filter(i => !convertForm.requiredParts.some(p => p.itemId === i.id)).slice(0, 50).map(i => (
                        <SelectItem key={i.id} value={i.id}>{i.itemName || i.name}{i.itemCode ? ` [${i.itemCode}]` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AccordionContent>
              </AccordionItem>}
              {toolsEnabled && <AccordionItem value="tools" className="border rounded-xl px-1">
                <AccordionTrigger className="text-xs font-medium py-3 px-2">
                  <span className="flex items-center gap-1.5"><Hammer className="h-3.5 w-3.5" />Tools {convertForm.requiredTools.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5">{convertForm.requiredTools.length}</Badge>}</span>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-3 space-y-2">
                  {convertForm.requiredTools.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {convertForm.requiredTools.map(tool => {
                        const toolItem = toolsData.find(t => t.id === tool.toolId);
                        return toolItem ? (
                          <div key={tool.toolId} className="flex items-center gap-1">
                            <Badge variant="secondary" className="gap-1">
                              {toolItem.toolName || toolItem.name} <span className="font-semibold">x{tool.quantity}</span>
                              <button onClick={() => removeFromArray('requiredTools', tool.toolId)} className="ml-0.5 h-5 w-5 flex items-center justify-center rounded-full hover:bg-red-100 hover:text-red-600"><X className="h-3 w-3" /></button>
                            </Badge>
                            <Input type="number" min={1} value={tool.quantity} onChange={e => updateConvertItemQuantity('requiredTools', tool.toolId, Math.max(1, parseInt(e.target.value) || 1))}
                              className="h-7 w-14 text-center text-xs px-1" />
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                  <Select onValueChange={v => addToArray('requiredTools', v)}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="+ Add tool..." /></SelectTrigger>
                    <SelectContent>
                      {toolsData.filter(t => !convertForm.requiredTools.some(to => to.toolId === t.id)).slice(0, 50).map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.toolName || t.name}{t.toolCode ? ` [${t.toolCode}]` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AccordionContent>
              </AccordionItem>}
            </Accordion>}
          </div>
        ) : stepKey === 'safety' ? (
          /* === MOBILE STEP 4: Safety Notes === */
          <div className="space-y-4">
            <div className="bg-amber-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-3">
                <ShieldAlert className="h-4 w-4" />Safety Information
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Safety Notes</Label>
                  <Textarea
                    className="rounded-xl min-h-[100px]"
                    value={convertForm.safetyNotes}
                    onChange={e => setConvertForm(f => ({ ...f, safetyNotes: e.target.value }))}
                    placeholder="Hazards, precautions, lockout/tagout..."
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1"><HardHat className="h-3.5 w-3.5" />PPE Required</Label>
                  <Input
                    className="h-12 rounded-xl"
                    value={convertForm.ppeRequired}
                    onChange={e => setConvertForm(f => ({ ...f, ppeRequired: e.target.value }))}
                    placeholder="Safety glasses, gloves, helmet..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">General Notes</Label>
                  <Textarea
                    className="rounded-xl min-h-[80px]"
                    value={convertForm.notes}
                    onChange={e => setConvertForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Additional notes or instructions..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </MobileStepperSheet>
      )}

      {/* SLA Timer */}
      <SLATimerDisplay slaHours={(mr as any).slaHours} slaStartedAt={(mr as any).slaStartedAt} status={mr.status} />

      {/* Scrollable Body - stacked vertically for narrow sheet */}
      <ScrollArea className="flex-1 pb-4">
        <div className="space-y-4">
          {/* Workflow Timeline */}
          <MRWorkflowTimeline mr={mr} />

          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{mr.description || 'No description provided.'}</p>
            </CardContent>
          </Card>

          {/* Comments */}
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">Comments ({mr.comments?.length || 0})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment..." onKeyDown={e => e.key === 'Enter' && handleComment()} />
                <Button size="icon" className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0" onClick={handleComment}><MessageSquare className="h-4 w-4" /></Button>
              </div>
              <ScrollArea className="max-h-64">
                {mr.comments?.map(c => (
                  <div key={c.id} className="flex gap-3 py-2 border-b last:border-0">
                    <Avatar className="h-7 w-7 shrink-0"><AvatarFallback className="text-[10px]">{getInitials(c.user?.fullName || 'U')}</AvatarFallback></Avatar>
                    <div>
                      <p className="text-xs"><span className="font-medium">{c.user?.fullName || 'Unknown'}</span> <span className="text-muted-foreground">{timeAgo(c.createdAt)}</span></p>
                      <p className="text-sm mt-0.5">{c.content}</p>
                    </div>
                  </div>
                ))}
              </ScrollArea>
              {(!mr.comments || mr.comments.length === 0) && <p className="text-sm text-muted-foreground text-center py-4">No comments yet</p>}
            </CardContent>
          </Card>

          {/* Attachments */}
          <FileUpload entityType="maintenance_request" entityId={id} />

          {/* Status History */}
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">Status History</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mr.statusHistory?.map((h, i) => (
                  <div key={h.id} className="flex items-center gap-3 text-sm">
                    <div className="relative flex flex-col items-center">
                      <div className={`h-3 w-3 rounded-full ${i === 0 ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-emerald-300'}`} />
                      {i < (mr.statusHistory?.length || 0) - 1 && <div className="w-0.5 h-6 bg-emerald-200" />}
                    </div>
                    <div className="flex-1 flex items-center justify-between">
                      <div>
                        <span className="font-medium">{h.toStatus.replace(/_/g, ' ')}</span>
                        <span className="text-muted-foreground"> — by {h.changedBy?.fullName || 'System'}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">{formatDateTime(h.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="font-medium capitalize">{mr.category || '-'}</span></div>
              <Separator />
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Department</span><span className="font-medium text-right">{(mr as any).department?.name || mr.requester?.department || '-'}</span></div>
              <Separator />
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">{(mr as any).asset?.location ? 'Asset Location' : 'Location'}</span><span className="font-medium text-right">{(mr as any).asset?.location || mr.location || '-'}</span></div>
              {(mr as any).asset?.location && mr.location && (
                <>
                  <Separator />
                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">Reported Location</span><span className="font-medium text-right">{mr.location}</span></div>
                </>
              )}
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Asset</span><span className="font-medium">{mr.asset?.name || mr.assetName || '-'}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Requested By</span><span className="font-medium">{mr.requester?.fullName}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="font-medium">{formatDateTime(mr.createdAt)}</span></div>
              {mr.approvedAt && (
                <>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Approved</span><span className="font-medium">{formatDateTime(mr.approvedAt)}</span></div>
                </>
              )}
              {mr.assignedPlannerId && (
                <>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Planner</span><span className="font-medium">{mr.assignedPlanner?.fullName || 'Assigned'}</span></div>
                </>
              )}
              {mr.notes && (
                <>
                  <Separator />
                  <div><span className="text-muted-foreground">Review Notes</span><p className="mt-1 text-xs">{mr.notes}</p></div>
                </>
              )}
            </CardContent>
          </Card>

          {mr.workOrder && (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider mb-1">Linked Work Order</p>
                <p className="font-semibold">{mr.workOrder.woNumber}</p>
                <p className="text-sm text-muted-foreground">{mr.workOrder.title}</p>
                <StatusBadge status={mr.workOrder.status} />
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </>
  );
}

// ============================================================================
// WORK ORDERS - LIST
// ============================================================================

export function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const { hasPermission, isAdmin, user } = useAuthStore();
  const { navigate, pageParams } = useNavigationStore();

  // WO IDs that have pending team member requests (for planner/admin indicator badges)
  const [woIdsWithPendingTeamReqs, setWoIdsWithPendingTeamReqs] = useState<Set<string>>(new Set());
  const isPlannerOrAdmin = isAdmin() || hasPermission('work_orders.assign_supervisor');

  // WO KPI state
  const [woKpi, setWoKpi] = useState<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
    overdue: number;
    completionMetrics: { avgHours: number; completedCount: number };
    trend: { thisMonth: number; lastMonth: number; changePercent: number };
    openByAge: Record<string, number>;
  } | null>(null);

  // Apply initial filters from navigation params (e.g. dashboard deep links)
  useEffect(() => {
    if (!pageParams) return;
    if (pageParams.status) {
      setFilterStatus(pageParams.status);
    }
    if (pageParams.overdue === 'true') {
      setOverdueOnly(true);
    }
    if (pageParams.id) {
      setDetailId(pageParams.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredWOs = useMemo(() => {
    if (!searchText.trim()) return workOrders;
    const q = searchText.toLowerCase();
    return workOrders.filter(wo =>
      wo.title.toLowerCase().includes(q) ||
      wo.woNumber.toLowerCase().includes(q) ||
      (wo.assetName || '').toLowerCase().includes(q) ||
      (wo.assignee?.fullName || '').toLowerCase().includes(q)
    );
  }, [workOrders, searchText]);

  const statusCounts = useMemo(() => ({
    total: workOrders.length,
    inProgress: workOrders.filter(w => w.status === 'in_progress').length,
    completed: workOrders.filter(w => w.status === 'completed').length,
    assigned: workOrders.filter(w => w.status === 'assigned' || w.status === 'draft').length,
    overdue: workOrders.filter(w => w.slaBreached).length,
  }), [workOrders]);

  // Fetch WO KPI data
  useEffect(() => {
    let active = true;
    api.get('/api/work-orders/kpi').then(res => {
      if (active && res.success && res.data) setWoKpi(res.data as typeof woKpi);
    });
    return () => { active = false; };
  }, [refreshKey]);

  // Fetch WO IDs that have pending team member requests (planner/admin only)
  useEffect(() => {
    if (!isPlannerOrAdmin) return;
    let active = true;
    api.get('/api/work-orders/pending-team-request-wo-ids').then(res => {
      if (active && res.success && Array.isArray(res.data)) {
        setWoIdsWithPendingTeamReqs(new Set(res.data as string[]));
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [refreshKey, isPlannerOrAdmin]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (filterStatus !== 'all') params.set('status', filterStatus);
    if (filterPriority !== 'all') params.set('priority', filterPriority);
    if (overdueOnly) params.set('overdue', 'true');
    api.get<WorkOrder[]>(`/api/work-orders?${params}`).then(res => {
      if (active) {
        if (res.success && res.data) setWorkOrders(res.data);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [filterStatus, filterPriority, overdueOnly, refreshKey]);

  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // Derived KPI values
  const openWOs = useMemo(() => {
    if (!woKpi) return 0;
    const closedStatuses = ['completed', 'verified', 'closed', 'cancelled'];
    return Object.entries(woKpi.byStatus).reduce((sum, [status, count]) => {
      return closedStatuses.includes(status) ? sum : sum + count;
    }, 0);
  }, [woKpi]);

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Work Orders</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage and execute all maintenance work orders</p>
        </div>
        {hasPermission('work_orders.create') && (
          <>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New Work Order</Button>
          <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen} large desktopMaxWidth="sm:max-w-4xl" title="Create Work Order" footer={<Button type="submit" form="create-wo-form" className="bg-emerald-600 hover:bg-emerald-700 text-white">Create WO</Button>}>
            <CreateWOForm onSuccess={() => { setCreateOpen(false); handleRefresh(); }} />
          </ResponsiveDialog>
          </>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total WOs</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{woKpi?.total ?? '-'}</div>
            {woKpi && woKpi.trend.changePercent !== 0 && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {woKpi.trend.changePercent > 0 ? (
                  <><TrendingUp className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">+{woKpi.trend.changePercent}%</span></>
                ) : (
                  <><TrendingDown className="h-3 w-3 text-red-500" /><span className="text-red-600">{woKpi.trend.changePercent}%</span></>
                )}
                <span>vs last month</span>
              </p>
            )}
            {!woKpi && <p className="text-xs text-muted-foreground mt-1">vs last month</p>}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open WOs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{woKpi ? openWOs : '-'}</div>
            <p className="text-xs text-muted-foreground mt-1">active work orders</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${woKpi && woKpi.overdue > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${woKpi && woKpi.overdue > 0 ? 'text-red-600' : ''}`}>{woKpi?.overdue ?? '-'}</div>
            <p className="text-xs text-muted-foreground mt-1">past due date</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Completion Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{woKpi?.completionMetrics.avgHours != null ? formatDuration(woKpi.completionMetrics.avgHours) : '-'}</div>
            <p className="text-xs text-muted-foreground mt-1">{woKpi ? `${woKpi.completionMetrics.completedCount} completed` : 'per work order'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Stats Bar - Pill style */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: 'Total', value: statusCounts.total, className: 'bg-slate-100 text-slate-700 border-slate-200', status: 'all' },
          { label: 'In Progress', value: statusCounts.inProgress, className: 'bg-amber-50 text-amber-700 border-amber-200', status: 'in_progress' },
          { label: 'Completed', value: statusCounts.completed, className: 'bg-emerald-50 text-emerald-700 border-emerald-200', status: 'completed' },
          { label: 'Pending', value: statusCounts.assigned, className: 'bg-sky-50 text-sky-700 border-sky-200', status: 'assigned' },
          { label: 'Overdue', value: statusCounts.overdue, className: 'bg-red-50 text-red-700 border-red-200', overdue: true },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => {
              if (s.overdue) { setOverdueOnly(!overdueOnly); setFilterStatus('all'); }
              else { setFilterStatus(s.status); setOverdueOnly(false); }
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${s.className} transition-colors cursor-pointer hover:opacity-80 ${(s.overdue ? overdueOnly : filterStatus === s.status) ? 'ring-2 ring-offset-1 ring-primary/30' : ''}`}
          >
            {s.value} {s.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-row flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search work orders..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="emergency">Emergency</SelectItem>
          </SelectContent>
        </Select>
        {overdueOnly && (
          <Badge variant="destructive" className="gap-1.5 cursor-pointer" onClick={() => { setOverdueOnly(false); }}>
            <AlertTriangle className="h-3 w-3" />
            Overdue Filter Active
            <X className="h-3 w-3" />
          </Badge>
        )}
      </div>

      {loading ? <LoadingSkeleton /> : (
        <Card className="border-0 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>WO #</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden sm:table-cell">Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Assigned To</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWOs.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-48">
                  <EmptyState icon={Wrench} title="No work orders found" description="Try adjusting your filters or create a new work order." />
                </TableCell></TableRow>
              ) : filteredWOs.map(wo => (
                <TableRow key={wo.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate('wo-detail', { id: wo.id })}>
                  <TableCell className="font-mono text-xs">
                    <span className="flex items-center gap-1.5">
                      {wo.woNumber}
                      {isPlannerOrAdmin && woIdsWithPendingTeamReqs.has(wo.id) && (
                        <span
                          className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-violet-100 dark:bg-violet-900/50 text-[9px] font-bold text-violet-600 dark:text-violet-400 animate-pulse"
                          title="Pending team member request"
                          onClick={(e) => { e.stopPropagation(); navigate('wo-detail', { id: wo.id }); }}
                        >
                          <UserPlus className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium max-w-[250px] truncate">{wo.title}</TableCell>
                  <TableCell className="text-xs capitalize hidden md:table-cell">{wo.type.replace('_', ' ')}</TableCell>
                  <TableCell className="hidden sm:table-cell"><PriorityBadge priority={wo.priority} /></TableCell>
                  <TableCell><StatusBadge status={wo.status} /></TableCell>
                  <TableCell className="text-sm hidden lg:table-cell">{wo.assignee?.fullName || (wo.teamMembers?.length > 0 ? <span className="text-muted-foreground">Team ({wo.teamMembers.length})</span> : <span className="text-muted-foreground">Unassigned</span>)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{formatDate(wo.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate('wo-detail', { id: wo.id }); }}>Open Work Order</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* WO Detail Side Sheet */}
      <Sheet open={!!detailId} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <SheetContent className="overflow-y-auto overflow-x-hidden p-6 pt-0 min-w-0">
          {detailId && <WODetailPage id={detailId} onUpdate={handleRefresh} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ============================================================================
// CREATE WO FORM
// ============================================================================

export function CreateWOForm({ onSuccess }: { onSuccess: () => void }) {
  const { user, isAdmin } = useAuthStore();
  const isMobile = useIsMobile();
  const assetsEnabled = useModuleEnabled(MODULE_CODES.ASSETS);
  const inventoryEnabled = useModuleEnabled(MODULE_CODES.INVENTORY);
  const toolsEnabled = useModuleEnabled(MODULE_CODES.TOOLS);

  // ── Form State (mirrors convert form minus request info) ──
  const [form, setForm] = useState({
    // Basic
    title: '',
    description: '',
    assetId: '',
    // Section: WO Details
    type: 'corrective' as string,
    priority: 'medium' as string,
    tradeActivity: 'mechanical' as string,
    technicalDescription: '',
    estimatedHours: '',
    estimatedHoursDisplay: '',
    scheduledDate: '',
    deliveryDate: '',
    // Section: Resource Assignment
    departmentId: '',
    assignType: 'technician' as 'technician' | 'supervisor',
    selectedWorkerIds: [] as string[],
    teamLeaderId: '',
    responsibleSupervisorId: '',
    requiredParts: [] as Array<{ itemId: string; quantity: number }>,
    requiredTools: [] as Array<{ toolId: string; quantity: number }>,
    // Section: Safety
    safetyNotes: '',
    ppeRequired: '',
    notes: '',
    componentIds: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [departmentLabel, setDepartmentLabel] = useState('');

  // Component selection state
  const [availableComponents, setAvailableComponents] = useState<Array<{id: string; name: string; componentCode?: string; componentType?: string; criticality?: string}>>([]);
  const [componentsLoading, setComponentsLoading] = useState(false);

  // Dropdown data
  const [departments, setDepartments] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [toolsData, setToolsData] = useState<any[]>([]);

  // Auto-populate department from user's profile (read-only for non-admins)
  useEffect(() => {
    if (!user) return;
    if (user.department) {
      setDepartmentLabel(user.department);
      api.get('/api/departments?limit=100').then(res => {
        if (res.success && Array.isArray(res.data)) {
          const dept = res.data.find((d: any) => d.name === user.department);
          if (dept) {
            setForm(f => ({ ...f, departmentId: dept.id }));
            setDepartments(res.data);
          }
        }
      });
    }
  }, [user?.department]);

  const isDepartmentLocked = !isAdmin() && !!user?.department;

  // Load components when asset changes
  useEffect(() => {
    if (assetsEnabled && form.assetId) {
      setComponentsLoading(true);
      api.get(`/api/component-registry?assetId=${form.assetId}`)
        .then((res: any) => {
          if (res.success && Array.isArray(res.data)) {
            setAvailableComponents(res.data.map((c: any) => ({
              id: c.id,
              name: c.name || c.componentName,
              componentCode: c.componentCode,
              componentType: c.componentType,
              criticality: c.criticality,
            })));
          } else {
            setAvailableComponents([]);
          }
        })
        .catch(() => setAvailableComponents([]))
        .finally(() => setComponentsLoading(false));
      // Reset selection when asset changes
      setForm(f => ({ ...f, componentIds: [] }));
    } else {
      setAvailableComponents([]);
    }
  }, [assetsEnabled, form.assetId]);

  // Load dropdown data when form opens
  useEffect(() => {
    if (departments.length === 0) {
      Promise.all([
        api.get('/api/departments?limit=100'),
        inventoryEnabled
          ? api.get('/api/inventory?mode=lookup&limit=100')
          : Promise.resolve({ success: true, data: [] as any[] }),
        toolsEnabled
          ? api.get('/api/tools?mode=lookup&limit=100')
          : Promise.resolve({ success: true, data: [] as any[] }),
      ]).then(([deptsRes, invRes, toolsRes]) => {
        if (deptsRes.success && Array.isArray(deptsRes.data)) setDepartments(deptsRes.data);
        if (invRes.success && Array.isArray(invRes.data)) setInventoryItems(invRes.data);
        if (toolsRes.success && Array.isArray(toolsRes.data)) setToolsData(toolsRes.data);
      }).catch(() => {/* dropdowns will be empty */});
    }
  }, [inventoryEnabled, toolsEnabled]);

  useEffect(() => {
    let active = true;
    loadWorkOrderDefaults().then((defaults) => {
      if (!active) return;
      setForm((current) => ({
        ...current,
        safetyNotes: current.safetyNotes || defaults.safetyNotes,
        ppeRequired: current.ppeRequired || defaults.ppeRequired,
        notes: current.notes || defaults.notes,
      }));
    });
    return () => { active = false; };
  }, []);

  // ── Helpers ──
  const updateField = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const handleEstHoursChange = (val: string) => {
    let displayVal = val;
    let decimalVal = val;
    if (val.includes(':')) {
      const [h, m] = val.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        decimalVal = String(h + m / 60);
      }
    }
    setForm(f => ({ ...f, estimatedHours: decimalVal, estimatedHoursDisplay: displayVal }));
  };

  const addToArray = (field: 'requiredParts' | 'requiredTools', id: string) => {
    setForm(f => {
      const arr = [...f[field]];
      if (field === 'requiredParts') {
        if (!(arr as Array<{ itemId: string; quantity: number }>).some(p => p.itemId === id)) {
          (arr as Array<{ itemId: string; quantity: number }>).push({ itemId: id, quantity: 1 });
        }
      } else {
        if (!(arr as Array<{ toolId: string; quantity: number }>).some(t => t.toolId === id)) {
          (arr as Array<{ toolId: string; quantity: number }>).push({ toolId: id, quantity: 1 });
        }
      }
      return { ...f, [field]: arr };
    });
  };

  const removeFromArray = (field: 'requiredParts' | 'requiredTools', id: string) => {
    setForm(f => ({
      ...f,
      [field]: field === 'requiredParts'
        ? (f[field] as Array<{ itemId: string; quantity: number }>).filter(x => x.itemId !== id)
        : (f[field] as Array<{ toolId: string; quantity: number }>).filter(x => x.toolId !== id),
    }));
  };

  const updateItemQuantity = (field: 'requiredParts' | 'requiredTools', id: string, qty: number) => {
    setForm(f => ({
      ...f,
      [field]: field === 'requiredParts'
        ? (f[field] as Array<{ itemId: string; quantity: number }>).map(p => p.itemId === id ? { ...p, quantity: qty } : p)
        : (f[field] as Array<{ toolId: string; quantity: number }>).map(t => t.toolId === id ? { ...t, quantity: qty } : t),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.assignType === 'technician' && form.selectedWorkerIds.length > 0 && !form.responsibleSupervisorId) {
      toast.error('Select the responsible supervisor who will verify this work order');
      return;
    }
    if (form.assignType === 'supervisor' && !form.teamLeaderId) {
      toast.error('Select the supervisor who will receive this work order');
      return;
    }
    setLoading(true);
    const payload: any = {
      title: form.title,
      description: form.description || undefined,
      type: form.type,
      priority: form.priority,
      assetId: assetsEnabled ? (form.assetId || undefined) : undefined,
      departmentId: form.departmentId || undefined,
      tradeActivity: form.tradeActivity,
      technicalDescription: form.technicalDescription || undefined,
      assignmentType: form.assignType === 'technician' ? 'direct' : 'via_supervisor',
      estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : undefined,
      plannedStart: form.scheduledDate || undefined,
      deliveryDateRequired: form.deliveryDate || undefined,
      safetyNotes: form.safetyNotes || undefined,
      ppeRequired: form.ppeRequired || undefined,
      notes: form.notes || undefined,
      requiredParts: inventoryEnabled && form.requiredParts.length > 0 ? form.requiredParts : undefined,
      requiredTools: toolsEnabled && form.requiredTools.length > 0 ? form.requiredTools : undefined,
      componentIds: assetsEnabled && form.componentIds.length > 0 ? form.componentIds : undefined,
    };
    if (form.assignType === 'technician') {
      if (form.selectedWorkerIds.length > 0) {
        const teamMembers = form.selectedWorkerIds.map(workerId => ({
          userId: workerId,
          role: workerId === form.teamLeaderId ? 'team_leader' : 'assistant',
        }));
        payload.teamMembers = teamMembers;
        payload.assignedTo = form.selectedWorkerIds[0];
        payload.teamLeaderId = form.teamLeaderId || null;
      }
      payload.assignedSupervisorId = form.responsibleSupervisorId || undefined;
    } else {
      payload.assignedSupervisorId = form.teamLeaderId;
    }
    const res = await api.post('/api/work-orders', payload);
    if (res.success) {
      toast.success('Work order created');
      onSuccess();
    } else {
      toast.error(res.error || 'Failed');
    }
    setLoading(false);
  };

  // ── Render ──
  if (isMobile) {
    return (
      <MobileStepperSheet
        open={true}
        onOpenChange={() => onSuccess()}
        title="Create Work Order"
        description="Fill in all details for the new work order."
        steps={[
          { key: 'details', label: 'Details', icon: ClipboardCheck },
          { key: 'resources', label: 'Resources', icon: Users },
          { key: 'safety', label: 'Safety', icon: ShieldAlert },
        ]}
        actionLabel="Create Work Order"
        actionLoading={loading}
        onAction={handleSubmit}
      >
        {(stepKey) => stepKey === 'details' ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Title *</Label>
              <Input className="min-h-[44px]" value={form.title} onChange={e => updateField('title', e.target.value)} placeholder="Work order title" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => updateField('description', e.target.value)} placeholder="Problem description..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Type</Label>
                <Select value={form.type} onValueChange={v => updateField('type', v)}>
                  <SelectTrigger className="min-h-[44px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakdown">Breakdown</SelectItem>
                    <SelectItem value="corrective">Corrective</SelectItem>
                    <SelectItem value="preventive">Preventive</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Priority</Label>
                <Select value={form.priority} onValueChange={v => updateField('priority', v)}>
                  <SelectTrigger className="min-h-[44px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {assetsEnabled && <div className="space-y-1">
              <Label className="text-[10px]">Asset / Machine</Label>
              <AsyncSearchableSelect value={form.assetId} onValueChange={v => updateField('assetId', v)}
                fetchOptions={async () => { const r = await api.get('/api/assets'); if (r.success && r.data) return (Array.isArray(r.data) ? r.data : []).map((a: any) => ({ value: a.id, label: `${a.name} [${a.assetTag}]`, badge: a.status })); return []; }}
                placeholder="Select asset..." searchPlaceholder="Search assets..." />
            </div>}
            {/* Mobile: Component selector */}
            {assetsEnabled && form.assetId && (
              <div className="space-y-1">
                <Label className="text-[10px]">Components / Parts</Label>
                {componentsLoading ? (
                  <p className="text-xs text-muted-foreground py-1">Loading...</p>
                ) : availableComponents.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">No components registered</p>
                ) : (
                  <div className="max-h-28 overflow-y-auto rounded-md border p-1.5 space-y-1">
                    {availableComponents.map((comp) => (
                      <label key={comp.id} className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-muted/50 cursor-pointer text-xs">
                        <Checkbox
                          checked={form.componentIds.includes(comp.id)}
                          onCheckedChange={(checked) => {
                            if (checked) updateField('componentIds', [...form.componentIds, comp.id]);
                            else updateField('componentIds', form.componentIds.filter((id: string) => id !== comp.id));
                          }}
                          className="h-3.5 w-3.5"
                        />
                        <span className="truncate">{comp.componentCode ? `${comp.componentCode} · ` : ''}{comp.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : stepKey === 'resources' ? (
          <div className="space-y-3">
            <WorkerAssignmentSelector
              selectedWorkerIds={form.selectedWorkerIds}
              teamLeaderId={form.teamLeaderId}
              onSelectedWorkersChange={(ids) => updateField('selectedWorkerIds', ids)}
              onTeamLeaderChange={(id) => updateField('teamLeaderId', id)}
              assignType={form.assignType}
              onAssignTypeChange={(type) => updateField('assignType', type)}
              label="Resource Assignment"
            />
            {form.assignType === 'technician' && (
              <ResponsibleSupervisorSelect
                value={form.responsibleSupervisorId}
                onValueChange={(value) => updateField('responsibleSupervisorId', value)}
              />
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Safety Notes</Label>
              <Textarea value={form.safetyNotes} onChange={e => updateField('safetyNotes', e.target.value)} placeholder="Safety hazards, LOTO requirements..." rows={2} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">PPE Required</Label>
              <Input className="min-h-[44px]" value={form.ppeRequired} onChange={e => updateField('ppeRequired', e.target.value)} placeholder="Safety glasses, gloves, helmet..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={e => updateField('notes', e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>
          </div>
        )}
      </MobileStepperSheet>
    );
  }

  // Desktop layout — matches convert form structure (4 sections minus request info)
  return (
    <form id="create-wo-form" onSubmit={handleSubmit} className="space-y-5">
      {/* ── Basic Info ── */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Title *</Label>
          <Input value={form.title} onChange={e => updateField('title', e.target.value)} placeholder="Work order title" required />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={form.description} onChange={e => updateField('description', e.target.value)} placeholder="Problem description..." rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {assetsEnabled && <div className="space-y-2">
            <Label>Asset / Machine</Label>
            <AsyncSearchableSelect
              value={form.assetId}
              onValueChange={v => updateField('assetId', v)}
              fetchOptions={async () => {
                const res = await api.get('/api/assets');
                if (res.success && res.data) {
                  return (Array.isArray(res.data) ? res.data : []).map((a: any) => ({
                    value: a.id,
                    label: `${a.name} [${a.assetTag}]`,
                    badge: a.status,
                  }));
                }
                return [];
              }}
              placeholder="Select asset..."
              searchPlaceholder="Search assets by name or tag..."
            />
          </div>}
          <div className="space-y-2">
            <Label>Department {isDepartmentLocked && <span className="text-xs text-muted-foreground">(auto-filled)</span>}</Label>
            {isDepartmentLocked ? (
              <div className="flex h-[42px] w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                {departmentLabel || form.departmentId}
              </div>
            ) : (
              <AsyncSearchableSelect
                value={form.departmentId}
                onValueChange={v => updateField('departmentId', v)}
                fetchOptions={async () => {
                  const res = await api.get('/api/departments?limit=100');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).map((d: any) => ({
                      value: d.id,
                      label: d.name,
                    }));
                  }
                  return [];
                }}
                placeholder="Select department..."
                searchPlaceholder="Search departments..."
              />
            )}
          </div>
        </div>

        {/* Component/Part Selection */}
        {assetsEnabled && form.assetId && (
          <div className="space-y-2 mt-2">
            <Label className="text-xs">Components / Parts (optional)</Label>
            {componentsLoading ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                Loading components...
              </div>
            ) : availableComponents.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No components registered for this asset</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto rounded-md border p-2">
                {availableComponents.map((comp) => (
                  <label
                    key={comp.id}
                    className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={form.componentIds.includes(comp.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          updateField('componentIds', [...form.componentIds, comp.id]);
                        } else {
                          updateField('componentIds', form.componentIds.filter((id: string) => id !== comp.id));
                        }
                      }}
                    />
                    <span className="truncate">
                      {comp.componentCode ? `${comp.componentCode} · ` : ''}{comp.name}
                    </span>
                    {comp.criticality && comp.criticality !== 'low' && (
                      <Badge variant={comp.criticality === 'critical' ? 'destructive' : comp.criticality === 'high' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 shrink-0">
                        {comp.criticality}
                      </Badge>
                    )}
                  </label>
                ))}
              </div>
            )}
            {form.componentIds.length > 0 && (
              <p className="text-xs text-muted-foreground">{form.componentIds.length} component(s) selected</p>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 2: Work Order Details (purple background) ── */}
      <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-purple-800 uppercase tracking-wider flex items-center gap-2 mb-4">
          <ClipboardCheck className="h-4 w-4" />Work Order Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Work Order Type</Label>
            <Select value={form.type} onValueChange={v => updateField('type', v)}>
              <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="breakdown">Breakdown</SelectItem>
                <SelectItem value="corrective">Corrective</SelectItem>
                <SelectItem value="preventive">Preventive</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
                <SelectItem value="inspection">Inspection</SelectItem>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="predictive">Predictive</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Priority</Label>
            <Select value={form.priority} onValueChange={v => updateField('priority', v)}>
              <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Trade Activity</Label>
            <Select value={form.tradeActivity} onValueChange={v => updateField('tradeActivity', v)}>
              <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mechanical">Mechanical</SelectItem>
                <SelectItem value="electrical">Electrical</SelectItem>
                <SelectItem value="civil">Civil</SelectItem>
                <SelectItem value="facility">Facility</SelectItem>
                <SelectItem value="workshop">Workshop</SelectItem>
                <SelectItem value="instrumentation">Instrumentation</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Est. Hours</Label>
            <Input
              className="min-h-[44px]"
              value={form.estimatedHoursDisplay || form.estimatedHours}
              onChange={e => handleEstHoursChange(e.target.value)}
              placeholder="2.5 or 2:30"
            />
            <p className="text-[10px] text-muted-foreground">Supports 2.5 or 2:30 format</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-4 space-y-1.5">
            <Label className="text-xs">Technical Description</Label>
            <Textarea
              value={form.technicalDescription}
              onChange={e => updateField('technicalDescription', e.target.value)}
              placeholder="Detailed technical description of the work to be performed..."
              rows={3}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Scheduled Date</Label>
            <DateTimePicker value={form.scheduledDate || undefined} onChange={v => updateField('scheduledDate', v || '')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Delivery Date</Label>
            <DatePicker value={form.deliveryDate || undefined} onChange={v => updateField('deliveryDate', v || '')} />
          </div>
        </div>
      </div>

      {/* ── SECTION 3: Resource Assignment (green background) ── */}
      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 sm:p-6">
        <div className="grid gap-4">
          <WorkerAssignmentSelector
            selectedWorkerIds={form.selectedWorkerIds}
            teamLeaderId={form.teamLeaderId}
            onSelectedWorkersChange={(ids) => updateField('selectedWorkerIds', ids)}
            onTeamLeaderChange={(id) => updateField('teamLeaderId', id)}
            assignType={form.assignType}
            onAssignTypeChange={(type) => updateField('assignType', type)}
            label="Resource Assignment"
          />
          {form.assignType === 'technician' && (
            <ResponsibleSupervisorSelect
              value={form.responsibleSupervisorId}
              onValueChange={(value) => updateField('responsibleSupervisorId', value)}
            />
          )}

          {/* Required Spare Parts */}
          {inventoryEnabled && <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1"><PackageSearch className="h-3.5 w-3.5" />Required Spare Parts</Label>
            <div className="flex flex-wrap items-center gap-1.5 min-h-[44px] p-2 border rounded-md bg-white">
              {form.requiredParts.length === 0 && <span className="text-sm text-muted-foreground">Select spare parts from inventory...</span>}
              {form.requiredParts.map(part => {
                const item = inventoryItems.find(i => i.id === part.itemId);
                return item ? (
                  <div key={part.itemId} className="flex items-center gap-1">
                    <Badge variant="secondary" className="gap-1">
                      {item.itemName || item.name} <span className="font-semibold">x{part.quantity}</span>
                      <button onClick={() => removeFromArray('requiredParts', part.itemId)} className="ml-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-red-600"><X className="h-3 w-3" /></button>
                    </Badge>
                    <Input type="number" min={1} value={part.quantity} onChange={e => updateItemQuantity('requiredParts', part.itemId, Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-7 w-14 text-center text-xs px-1" />
                  </div>
                ) : null;
              })}
            </div>
            <Select onValueChange={v => addToArray('requiredParts', v)}>
              <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Add spare part..." /></SelectTrigger>
              <SelectContent>
                {inventoryItems.filter(i => !form.requiredParts.some(p => p.itemId === i.id)).slice(0, 50).map(i => (
                  <SelectItem key={i.id} value={i.id}>{i.itemName || i.name}{i.itemCode ? ` [${i.itemCode}]` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>}

          {/* Required Tools */}
          {toolsEnabled && <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1"><Hammer className="h-3.5 w-3.5" />Required Tools</Label>
            <div className="flex flex-wrap items-center gap-1.5 min-h-[44px] p-2 border rounded-md bg-white">
              {form.requiredTools.length === 0 && <span className="text-sm text-muted-foreground">Select tools...</span>}
              {form.requiredTools.map(tool => {
                const toolItem = toolsData.find(t => t.id === tool.toolId);
                return toolItem ? (
                  <div key={tool.toolId} className="flex items-center gap-1">
                    <Badge variant="secondary" className="gap-1">
                      {toolItem.toolName || toolItem.name} <span className="font-semibold">x{tool.quantity}</span>
                      <button onClick={() => removeFromArray('requiredTools', tool.toolId)} className="ml-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-red-600"><X className="h-3 w-3" /></button>
                    </Badge>
                    <Input type="number" min={1} value={tool.quantity} onChange={e => updateItemQuantity('requiredTools', tool.toolId, Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-7 w-14 text-center text-xs px-1" />
                  </div>
                ) : null;
              })}
            </div>
            <Select onValueChange={v => addToArray('requiredTools', v)}>
              <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Add tool..." /></SelectTrigger>
              <SelectContent>
                {toolsData.filter(t => !form.requiredTools.some(to => to.toolId === t.id)).slice(0, 50).map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.toolName || t.name}{t.toolCode ? ` [${t.toolCode}]` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>}
        </div>
      </div>

      {/* ── SECTION 4: Safety Notes (amber background) ── */}
      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-2 mb-4">
          <ShieldAlert className="h-4 w-4" />Safety Notes
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">Safety Notes</Label>
            <Textarea
              value={form.safetyNotes}
              onChange={e => updateField('safetyNotes', e.target.value)}
              placeholder="Any safety hazards, precautions, or lockout/tagout requirements..."
              rows={3}
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><HardHat className="h-3.5 w-3.5" />PPE Required</Label>
            <Input
              className="min-h-[44px]"
              value={form.ppeRequired}
              onChange={e => updateField('ppeRequired', e.target.value)}
              placeholder="e.g. Safety glasses, gloves, helmet, hearing protection"
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">General Notes</Label>
            <Textarea
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder="Any additional notes or special instructions..."
              rows={2}
            />
          </div>
        </div>
      </div>
    </form>
  );
}

// ============================================================================
// WORK ORDER DETAIL PAGE — Enhanced with Team Management, Personal Tools, Role-Based UI
// ============================================================================

export function WODetailPage({ id, onUpdate }: { id: string; onUpdate: () => void }) {
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [actionDialog, setActionDialog] = useState<string | null>(null);
  const [woConfirmAction, setWoConfirmAction] = useState<{ action: string; label: string; variant?: 'default' | 'destructive'; description: string } | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const { hasPermission, user, isAdmin, isAuthenticated } = useAuthStore();
  const { navigate } = useNavigationStore();
  const isMobile = useIsMobile();
  const assetsEnabled = useModuleEnabled(MODULE_CODES.ASSETS);
  const requestsEnabled = useModuleEnabled(MODULE_CODES.MAINTENANCE_REQUESTS);
  const repairsEnabled = useModuleEnabled(MODULE_CODES.REPAIRS);
  const inventoryEnabled = useModuleEnabled(MODULE_CODES.INVENTORY);
  const toolsEnabled = useModuleEnabled(MODULE_CODES.TOOLS);
  const downtimeEnabled = useModuleEnabled(MODULE_CODES.DOWNTIME);
  const materialResourcesEnabled = repairsEnabled && inventoryEnabled;
  const toolResourcesEnabled = repairsEnabled && toolsEnabled;
  const canApproveMaterials = user?.roles?.some((r: any) => ['admin', 'store_keeper', 'inventory_manager', 'tools_shop_attendant'].includes(r.slug)) ?? false;
  // Edit WO
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  // Edit form dropdown data
  const [editDepartments, setEditDepartments] = useState<any[]>([]);
  const [editInventoryItems, setEditInventoryItems] = useState<any[]>([]);
  const [editToolsData, setEditToolsData] = useState<any[]>([]);
  // Time log — enterprise fields
  const [timeLogOpen, setTimeLogOpen] = useState(false);
  const [tlAction, setTlAction] = useState('start');
  const [tlStartTime, setTlStartTime] = useState('');
  const [tlEndTime, setTlEndTime] = useState('');
  const [tlActivityType, setTlActivityType] = useState('maintenance');
  const [tlBreakMinutes, setTlBreakMinutes] = useState('');
  const [tlNotes, setTlNotes] = useState('');
  const [tlLoading, setTlLoading] = useState(false);
  const [optimisticPausedOnThisWO, setOptimisticPausedOnThisWO] = useState(false);
  const [tlLoggedForUserId, setTlLoggedForUserId] = useState('');
  const [tlError, setTlError] = useState('');

  // Compute minimum date/time constraints from WO schedule
  const tlConstraints = useMemo(() => {
    // Priority: actualStart > plannedStart > createdAt
    const refDate = wo?.actualStart || wo?.plannedStart || wo?.createdAt;
    if (!refDate) return { minDate: undefined as string | undefined, minTime: undefined as string | undefined };
    const d = new Date(refDate);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      minDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      minTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  }, [wo?.actualStart, wo?.plannedStart, wo?.createdAt]);
  const [deleteTlId, setDeleteTlId] = useState<string | null>(null);
  // Enterprise time session — active session tracking across all WOs
  const [globalActiveSession, setGlobalActiveSession] = useState<{
    workOrderId: string;
    workOrderNumber: string;
    workOrderTitle: string;
    workOrderStatus: string;
    action: string;
    startedAt: string;
    elapsedSeconds: number;
    logId: string;
    activityType: string;
  } | null>(null);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [pauseNotes, setPauseNotes] = useState('');
  const [pauseLoading, setPauseLoading] = useState(false);
  // Material
  const [materialOpen, setMaterialOpen] = useState(false);
  const [matItemId, setMatItemId] = useState('');
  const [matItemName, setMatItemName] = useState('');
  const [matQty, setMatQty] = useState('');
  const [matUnit, setMatUnit] = useState('each');
  const [matReason, setMatReason] = useState('');
  const [matUrgency, setMatUrgency] = useState('normal');
  const [matLoading, setMatLoading] = useState(false);
  // Available transitions from state machine
  const [availableTransitions, setAvailableTransitions] = useState<Array<{
    toStatus: string; requiresReason: boolean;
  }>>([]);
  // Status history
  const [statusHistory, setStatusHistory] = useState<Array<{
    fromStatus: string | null; toStatus: string;
    performedBy: { fullName: string } | null;
    notes: string | null; createdAt: string;
  }>>([]);
  // Personal tools
  const [personalTools, setPersonalTools] = useState<PersonalTool[]>([]);
  const [ptOpen, setPtOpen] = useState(false);
  const [ptLoading, setPtLoading] = useState(false);
  const [ptForm, setPtForm] = useState({ toolName: '', toolCode: '', condition: 'good' as PersonalTool['condition'], notes: '' });
  // ── Repair Resource Modals ──
  // Tool Request modal (multi-tool)
  const [toolReqOpen, setToolReqOpen] = useState(false);
  const [toolReqSubmitting, setToolReqSubmitting] = useState(false);
  const [toolReqReason, setToolReqReason] = useState('');
  const [toolReqUrgency, setToolReqUrgency] = useState('normal');
  const [toolReqItems, setToolReqItems] = useState<Array<{ toolId: string; toolName: string; toolCode: string; quantityRequested: number }>>([]);
  // Tool Transfer modal
  const [toolXferOpen, setToolXferOpen] = useState(false);
  const [toolXferSubmitting, setToolXferSubmitting] = useState(false);
  const [toolXferToolId, setToolXferToolId] = useState('');
  const [toolXferToolName, setToolXferToolName] = useState('');
  const [toolXferToUserId, setToolXferToUserId] = useState('');
  const [toolXferToUserName, setToolXferToUserName] = useState('');
  const [toolXferReason, setToolXferReason] = useState('');
  // Tools cache for quick lookup
  const toolsLookupCache = useRef<Array<{ id: string; name: string; toolCode: string }>>([]);
  const woToolOptions = useRef<Array<{ value: string; label: string; id: string; name: string }>>([]);
  // Downtime modal
  const [downtimeOpen, setDowntimeOpen] = useState(false);
  const [downtimeSubmitting, setDowntimeSubmitting] = useState(false);
  const [dtReason, setDtReason] = useState('');
  const [dtCategory, setDtCategory] = useState('unplanned');
  const [dtImpactLevel, setDtImpactLevel] = useState('medium');
  const [dtProductionLoss, setDtProductionLoss] = useState('');
  const [dtDurationMinutes, setDtDurationMinutes] = useState('');
  // View All Tools modal
  const [viewAllToolsOpen, setViewAllToolsOpen] = useState(false);
  const [toolDetailSheet, setToolDetailSheet] = useState<any>(null);
  // Spare Part Return — linked to material request
  const [spareReturnLinkedMR, setSpareReturnLinkedMR] = useState<any>(null);
  // Spare Part Return modal
  const [spareReturnOpen, setSpareReturnOpen] = useState(false);
  const [spareReturnSubmitting, setSpareReturnSubmitting] = useState(false);
  const [spareReturnItemName, setSpareReturnItemName] = useState('');
  // Material return from WO (lists issued materials)
  const [matReturnOpen, setMatReturnOpen] = useState(false);
  const [matReturnSubmitting, setMatReturnSubmitting] = useState(false);
  const [matReturnItems, setMatReturnItems] = useState<Array<{ id: string; itemName: string; itemId: string; qtyIssued: number; qtyReturned: number; qtyReturn: number; isReusable: boolean; condition: string }>>([]);
  const [spareReturnQty, setSpareReturnQty] = useState('1');
  const [spareReturnCondition, setSpareReturnCondition] = useState('used');
  const [spareReturnDamageDesc, setSpareReturnDamageDesc] = useState('');
  const [spareReturnNeedsRefurb, setSpareReturnNeedsRefurb] = useState(true);
  const [spareReturnIsReusable, setSpareReturnIsReusable] = useState(true);
  const [spareReturnItemId, setSpareReturnItemId] = useState('');
  const [spareReturnMRId, setSpareReturnMRId] = useState('');
  // Add team member dialog
  const [addTeamMemberOpen, setAddTeamMemberOpen] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('assistant');
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  // Request team member dialog (for technicians)
  const [requestMemberOpen, setRequestMemberOpen] = useState(false);
  const [reqMemberTrade, setReqMemberTrade] = useState('');
  const [reqMemberRole, setReqMemberRole] = useState('assistant');
  const [reqMemberReason, setReqMemberReason] = useState('');
  const [reqMemberLoading, setReqMemberLoading] = useState(false);
  // Team member requests
  const [teamRequests, setTeamRequests] = useState<any[]>([]);
  const [reqActionLoading, setReqActionLoading] = useState<string | null>(null);
  // Approve trade-based request: planner picks a technician
  const [approveReqId, setApproveReqId] = useState<string | null>(null);
  const [approveAssignUserId, setApproveAssignUserId] = useState('');
  // Enhanced complete dialog fields
  const [completeRootCause, setCompleteRootCause] = useState('');
  const [completeFindings, setCompleteFindings] = useState('');
  const [completeCorrectiveAction, setCompleteCorrectiveAction] = useState('');
  // Live session timer
  const [sessionDuration, setSessionDuration] = useState<number | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Task Checklist
  const [taskChecklist, setTaskChecklist] = useState<Array<{
    id: string; workOrderId: string; templateTaskId: string | null;
    taskNumber: number; description: string; taskType: string;
    requiredParts: string | null; estimatedMinutes: number | null;
    status: string; completedById: string | null; completedAt: string | null;
    notes: string | null; findings: string | null; photos: string | null;
    completedBy: { id: string; fullName: string; username: string } | null;
  }>>([]);
  const [taskChecklistMeta, setTaskChecklistMeta] = useState<{ source: string; templateTitle?: string; autoGenerated?: boolean } | null>(null);
  const [taskChecklistLoading, setTaskChecklistLoading] = useState(true);
  const [taskActionLoading, setTaskActionLoading] = useState<string | null>(null);
  // Task dialog states
  const [completeTaskDialog, setCompleteTaskDialog] = useState<string | null>(null);
  const [skipTaskDialog, setSkipTaskDialog] = useState<string | null>(null);
  const [addTaskDialog, setAddTaskDialog] = useState(false);
  const [addTaskDesc, setAddTaskDesc] = useState('');
  const [addTaskType, setAddTaskType] = useState('check');
  const [addTaskMinutes, setAddTaskMinutes] = useState('');
  const [addTaskLoading, setAddTaskLoading] = useState(false);
  const [taskNotes, setTaskNotes] = useState('');
  const [taskFindings, setTaskFindings] = useState('');
  const [bulkCompleteLoading, setBulkCompleteLoading] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  // Suggested Materials & Tools
  const [suggestedParts, setSuggestedParts] = useState<any[]>([]);
  const [suggestedTools, setSuggestedTools] = useState<any[]>([]);
  const [suggestedPartDialogOpen, setSuggestedPartDialogOpen] = useState(false);
  const [suggestedToolDialogOpen, setSuggestedToolDialogOpen] = useState(false);

  const hydrateSuggestedResourcesFromWO = useCallback((workOrder: any) => {
    const parseSnapshot = (value: unknown): any[] => {
      if (Array.isArray(value)) return value;
      if (typeof value !== 'string') return [];
      try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    if (materialResourcesEnabled) {
      const partMap = new Map<string, any>();

      for (const part of parseSnapshot(workOrder?.suggestedParts)) {
        if (!part?.itemId) continue;
        partMap.set(String(part.itemId), { ...part });
      }

      for (const material of Array.isArray(workOrder?.materials) ? workOrder.materials : []) {
        if (!material?.itemId || material.status !== 'planned') continue;
        const key = String(material.itemId);
        const current = partMap.get(key) || {};
        partMap.set(key, {
          ...current,
          id: current.id || material.id,
          itemId: key,
          itemName: current.itemName || material.itemName || 'Planned material',
          itemCode: current.itemCode || '',
          quantity: current.quantity || material.quantity || 1,
          unit: current.unit || 'each',
          notes: current.notes || '',
          pipelineStatus: current.pipelineStatus || 'suggested',
        });
      }

      for (const request of Array.isArray(workOrder?.repairMaterialRequests) ? workOrder.repairMaterialRequests : []) {
        if (!request?.itemId || request.source !== 'planner_suggested' || request.status === 'rejected') continue;
        const key = String(request.itemId);
        const current = partMap.get(key) || {};
        partMap.set(key, {
          ...current,
          id: current.id || request.id,
          itemId: key,
          itemName: current.itemName || request.itemName || request.item?.name || 'Planned material',
          itemCode: current.itemCode || request.item?.itemCode || '',
          quantity: current.quantity || request.quantityRequested || 1,
          unit: current.unit || request.unit || 'each',
          notes: current.notes || request.notes || '',
          pipelineId: request.id,
          pipelineStatus: request.status || 'pending',
          quantityApproved: request.quantityApproved || 0,
          quantityIssued: request.quantityIssued || 0,
        });
      }

      setSuggestedParts([...partMap.values()]);
    } else {
      setSuggestedParts([]);
    }

    if (toolResourcesEnabled) {
      const toolMap = new Map<string, any>();

      for (const tool of parseSnapshot(workOrder?.suggestedTools)) {
        if (!tool?.toolId) continue;
        toolMap.set(String(tool.toolId), { ...tool });
      }

      for (const request of Array.isArray(workOrder?.repairToolRequests) ? workOrder.repairToolRequests : []) {
        if (request?.source !== 'planner_suggested' || request.status === 'rejected') continue;
        const requestItems = Array.isArray(request.items) && request.items.length > 0
          ? request.items
          : request.toolId
            ? [{
                toolId: request.toolId,
                toolName: request.toolName,
                toolCode: request.tool?.toolCode || '',
                quantityRequested: 1,
              }]
            : [];

        for (const item of requestItems) {
          if (!item?.toolId) continue;
          const key = String(item.toolId);
          const current = toolMap.get(key) || {};
          toolMap.set(key, {
            ...current,
            id: current.id || `${request.id}:${key}`,
            toolId: key,
            toolName: current.toolName || item.toolName || request.toolName || 'Planned tool',
            toolCode: current.toolCode || item.toolCode || request.tool?.toolCode || '',
            quantity: current.quantity || item.quantityRequested || 1,
            notes: current.notes || request.notes || '',
            pipelineId: request.id,
            pipelineStatus: request.status || 'pending',
          });
        }
      }

      setSuggestedTools([...toolMap.values()]);
    } else {
      setSuggestedTools([]);
    }
  }, [materialResourcesEnabled, toolResourcesEnabled]);

  const mergeSuggestedResourceRows = useCallback((
    currentRows: any[],
    incomingRows: any[],
    keyName: 'itemId' | 'toolId',
  ) => {
    if (incomingRows.length === 0) return currentRows;

    const merged = new Map<string, any>();
    for (const row of currentRows) {
      const key = row?.[keyName];
      if (key) merged.set(String(key), row);
    }
    for (const row of incomingRows) {
      const key = row?.[keyName];
      if (!key) continue;
      const current = merged.get(String(key)) || {};
      merged.set(String(key), { ...current, ...row });
    }
    return [...merged.values()];
  }, []);

  // A live license/enablement change must remove stale cross-module UI
  // immediately, even when a resource dialog was already open.
  useEffect(() => {
    if (!materialResourcesEnabled) {
      setMaterialOpen(false);
      setMatReturnOpen(false);
      setSpareReturnOpen(false);
      setSuggestedPartDialogOpen(false);
      setSuggestedParts([]);
      setEditInventoryItems([]);
    }
    if (!toolResourcesEnabled) {
      setToolReqOpen(false);
      setToolXferOpen(false);
      setViewAllToolsOpen(false);
      setPtOpen(false);
      setSuggestedToolDialogOpen(false);
      setSuggestedTools([]);
      setPersonalTools([]);
      setEditToolsData([]);
    }
    if (!repairsEnabled || !downtimeEnabled) {
      setDowntimeOpen(false);
    }
  }, [
    materialResourcesEnabled,
    toolResourcesEnabled,
    repairsEnabled,
    downtimeEnabled,
  ]);

  const fetchWO = useCallback(async () => {
    const res = await api.get<WorkOrder>(`/api/work-orders/${id}`);
    if (res.success && res.data) {
      setWo(res.data);
      hydrateSuggestedResourcesFromWO(res.data);
      // Reset optimistic paused state only if server timeLogs confirm the state
      // (hasPausedSession memo will re-evaluate from wo.timeLogs)
      if (res.data.timeLogs && res.data.timeLogs.length > 0) {
        const sorted = [...res.data.timeLogs].sort((a: any, b: any) => new Date(a.timestamp || a.createdAt).getTime() - new Date(b.timestamp || b.createdAt).getTime());
        const lastAction = sorted[sorted.length - 1] as any;
        setOptimisticPausedOnThisWO(lastAction?.action === 'pause');
      } else {
        setOptimisticPausedOnThisWO(false);
      }
      // Team member requests are now included in the WO response
      if ((res.data as any).teamMemberRequests) {
        setTeamRequests((res.data as any).teamMemberRequests);
      }
    }
    setLoading(false);
  }, [id, hydrateSuggestedResourcesFromWO]);

  // Fetch team member requests (separate call for permission-filtered results)
  const fetchTeamRequests = useCallback(async () => {
    const res = await api.get(`/api/work-orders/${id}/team-member-requests`);
    if (res.success && res.data) setTeamRequests(res.data);
  }, [id]);

  const fetchPersonalTools = useCallback(async () => {
    if (!isAuthenticated || !user?.id || !toolResourcesEnabled) {
      setPersonalTools([]);
      return;
    }
    const res = await api.get<PersonalTool[]>(`/api/work-orders/${id}/personal-tools`);
    if (res.success && res.data) setPersonalTools(res.data);
  }, [id, isAuthenticated, toolResourcesEnabled, user?.id]);

  // Fetch suggested materials & tools
  const fetchSuggestedItems = useCallback(async () => {
    if (!materialResourcesEnabled && !toolResourcesEnabled) {
      setSuggestedParts([]);
      setSuggestedTools([]);
      return;
    }
    try {
      const res = await api.get(`/api/work-orders/${id}/suggested-items`);
      if (res.success && res.data) {
        const incomingParts = Array.isArray(res.data.suggestedParts) ? res.data.suggestedParts : [];
        const incomingTools = Array.isArray(res.data.suggestedTools) ? res.data.suggestedTools : [];

        // The main WO response is the durable baseline. This auxiliary endpoint
        // may enrich that state, but must never erase a planner-selected
        // material/tool when it returns an empty or partial projection.
        if (materialResourcesEnabled && incomingParts.length > 0) {
          setSuggestedParts((current) =>
            mergeSuggestedResourceRows(current, incomingParts, 'itemId')
          );
        } else if (!materialResourcesEnabled) {
          setSuggestedParts([]);
        }

        if (toolResourcesEnabled && incomingTools.length > 0) {
          setSuggestedTools((current) =>
            mergeSuggestedResourceRows(current, incomingTools, 'toolId')
          );
        } else if (!toolResourcesEnabled) {
          setSuggestedTools([]);
        }
      }
    } catch (err) {
      // Suggested items are optional; don't block the UI
      console.error('Failed to fetch suggested items:', err);
    }
  }, [id, materialResourcesEnabled, toolResourcesEnabled, mergeSuggestedResourceRows]);

  const handleRejectSuggestedItem = async (itemType: 'part' | 'tool', itemId: string) => {
    if (!confirm(`Remove this suggested ${itemType}?`)) return;
    try {
      const res = await api.put(`/api/work-orders/${id}/suggested-items`, { action: 'reject_item', itemType, itemId });
      if (res.success) {
        fetchSuggestedItems();
        fetchWO();
      }
    } catch (err) { console.error(err); }
  };

  const handleSendToStore = async () => {
    try {
      const res = await api.put(`/api/work-orders/${id}/suggested-items`, { action: 'send_to_store' });
      if (res.success) {
        toast.success(res.data?.message || 'Items sent to store');
        fetchSuggestedItems();
        fetchWO();
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    let active = true;
    api.get<WorkOrder>(`/api/work-orders/${id}`).then(res => {
      if (active) {
        if (res.success && res.data) {
          setWo(res.data);
          hydrateSuggestedResourcesFromWO(res.data);
          // Team member requests from WO response
          if ((res.data as any).teamMemberRequests) {
            setTeamRequests((res.data as any).teamMemberRequests);
          }
        }
        setLoading(false);
      }
    });
    // Fetch available transitions from state machine
    api.get(`/api/work-orders/${id}/transitions`).then(res => {
      if (active && res.success && res.data) setAvailableTransitions(res.data);
    });
    // Fetch status history
    api.get(`/api/work-orders/${id}/status-history`).then(res => {
      if (active && res.success && res.data) setStatusHistory(res.data);
    });
    // Fetch personal tools only when the Repairs + Tools domains are operational.
    if (toolResourcesEnabled) {
      fetchPersonalTools();
    } else {
      setPersonalTools([]);
    }
    // Fetch task checklist
    api.get(`/api/work-orders/${id}/tasks`).then(res => {
      if (active) {
        if (res.success && res.data) {
          setTaskChecklist(res.data);
        }
        if (res.success && (res as any).meta) {
          setTaskChecklistMeta((res as any).meta);
        }
        setTaskChecklistLoading(false);
      }
    });
    // Fetch team member requests (permission-filtered)
    api.get(`/api/work-orders/${id}/team-member-requests`).then(res => {
      if (active && res.success && res.data) setTeamRequests(res.data);
    });
    // Fetch suggested items
    fetchSuggestedItems();
    return () => { active = false; };
  }, [id, fetchPersonalTools, fetchSuggestedItems, toolResourcesEnabled, hydrateSuggestedResourcesFromWO]);

  // Role-based access check
  const fullAccess = useMemo(() => {
    if (!wo || !user) return false;
    if (isAdmin()) return true;
    if (wo.teamLeaderId === user.id) return true;
    return false;
  }, [wo, user]);

  // Permission: direct team changes must match the API: effective assignment
  // capability AND accountable authority over this specific work order.
  const canManageTeamDirectly = useMemo(() => {
    if (!wo || !user) return false;
    const admin = isAdmin();
    const hasAssignmentPermission = admin
      || hasPermission('work_orders.assign_supervisor')
      || hasPermission('work_orders.assign_technician');
    if (!hasAssignmentPermission) return false;

    const roleSlugs = (user.roles || []).map((role: any) => role.slug).filter(Boolean);
    const hasManagementOverride = roleSlugs.some((slug: string) =>
      ['maintenance_manager', 'plant_manager'].includes(slug)
    );
    const hasAccountableAuthority = admin
      || hasManagementOverride
      || wo.assignedSupervisorId === user.id
      || wo.plannerId === user.id
      || wo.assignedById === user.id;

    return hasAccountableAuthority;
  }, [wo, user, isAdmin, hasPermission]);

  // Permission: can request team members (technician or team member, but not admin/planner — they add directly)
  const canRequestTeamMember = useMemo(() => {
    if (!wo || !user) return false;
    if (canManageTeamDirectly) return false; // managers add directly, don't need to request
    const isTeamMember = wo.teamMembers?.some(tm => tm.userId === user.id);
    const isAssignee = wo.assignedToId === user.id;
    return isTeamMember || isAssignee;
  }, [wo, user, canManageTeamDirectly]);

  // Team-request review uses the exact same direct-assignment authority.
  const canReviewTeamRequests = useMemo(
    () => canManageTeamDirectly,
    [canManageTeamDirectly],
  );

  // Permission: can log time for other team members (only team leader or admin)
  const canLogForOthers = useMemo(() => {
    if (!wo || !user) return false;
    if (isAdmin()) return true;
    return wo.teamLeaderId === user.id;
  }, [wo, user, isAdmin]);

  const isReadOnly = useMemo(() => {
    if (!wo || !user) return false;
    if (fullAccess) return false;
    if (canManageTeamDirectly) return false;

    // The primary assignee owns execution on this work order. A stale or
    // duplicate team-member row must never downgrade that accountable actor to
    // read-only and disable time/material/tool execution controls.
    if (wo.assignedToId === user.id) return false;

    return wo.teamMembers?.some(
      tm => tm.userId === user.id && tm.accessLevel === 'read_only'
    ) || false;
  }, [wo, user, fullAccess, canManageTeamDirectly]);

  // Permission: can take modification actions on this WO (not just view it)
  // Used for: status transitions, edit, approve/reject etc. — includes planner via permissions
  const canTakeActions = useMemo(() => {
    if (!wo || !user) return false;
    if (isAdmin()) return true;
    if (hasPermission('work_orders.update')) return true;
    if (hasPermission('work_orders.start')) return true;
    if (hasPermission('work_orders.complete')) return true;
    // Team members and assignees can take actions (log time, request materials, etc.)
    const isTeamMember = wo.teamMembers?.some(tm => tm.userId === user.id) || false;
    const isAssignee = wo.assignedToId === user.id;
    return isTeamMember || isAssignee;
  }, [wo, user, isAdmin, hasPermission]);

  // Permission: can perform WORK actions on this WO (time log, start work, personal tools, material/tool requests)
  // Restricted to admin, the assigned technician, and team members — NOT planner
  const isWorkerOnThisWO = useMemo(() => {
    if (!wo || !user) return false;
    if (isAdmin()) return true;
    const isAssignee = wo.assignedToId === user.id;
    const isTeamMember = wo.teamMembers?.some(tm => tm.userId === user.id) || false;
    return isAssignee || isTeamMember;
  }, [wo, user, isAdmin]);

  // Fetch global active session and set up live timer
  const fetchActiveSession = useCallback(async () => {
    try {
      const res = await api.get('/api/work-orders/active-session');
      if (res.success) {
        setGlobalActiveSession(res.data.session);
      }
    } catch { /* ignore */ }
  }, []);

  // Live session timer: find unmatched start/resume without pause
  useEffect(() => {
    if (!wo?.timeLogs || wo.timeLogs.length === 0) {
      setSessionDuration(null);
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      return;
    }
    const sorted = [...wo.timeLogs].sort((a, b) => new Date(a.timestamp || a.createdAt).getTime() - new Date(b.timestamp || b.createdAt).getTime());
    const lastStart = [...sorted].reverse().find(t => t.action === 'start' || t.action === 'resume');
    if (!lastStart?.timestamp) { setSessionDuration(null); return; }
    const startTime = new Date(lastStart.timestamp).getTime();
    const calc = () => setSessionDuration((Date.now() - startTime) / 1000);
    calc();
    sessionTimerRef.current = setInterval(calc, 1000);
    return () => { if (sessionTimerRef.current) clearInterval(sessionTimerRef.current); };
  }, [wo?.timeLogs]);

  // Check global active session on mount and after actions
  useEffect(() => {
    fetchActiveSession();
  }, [fetchActiveSession]);

  // Derived session state for THIS work order
  const isActiveOnThisWO = useMemo(() => {
    return globalActiveSession && globalActiveSession.workOrderId === id;
  }, [globalActiveSession, id]);

  const isActiveOnOtherWO = useMemo(() => {
    return globalActiveSession && globalActiveSession.workOrderId !== id;
  }, [globalActiveSession, id]);

  // Is there a paused session on THIS WO that can be resumed?
  const hasPausedSession = useMemo(() => {
    // Optimistic: if we just paused, show immediately
    if (optimisticPausedOnThisWO) return true;
    if (!wo?.timeLogs || wo.timeLogs.length === 0) return false;
    if (isActiveOnThisWO) return false; // currently running, not paused
    const sorted = [...wo.timeLogs].sort((a, b) => new Date(a.timestamp || a.createdAt).getTime() - new Date(b.timestamp || b.createdAt).getTime());
    const lastAction = sorted[sorted.length - 1];
    return lastAction?.action === 'pause';
  }, [wo?.timeLogs, isActiveOnThisWO, optimisticPausedOnThisWO]);

  // Quick live-execution controls use canonical lifecycle/session endpoints.
  const handleQuickTimeAction = async (action: string, reason?: string) => {
    setTlLoading(true);
    let res;
    if (action === 'start' || action === 'resume') {
      res = await api.post(`/api/work-orders/${id}/start`, { notes: pauseNotes || undefined });
    } else {
      res = await api.post(`/api/work-orders/${id}/pause-session`, {
        reason: reason || (action === 'complete' ? 'Technician ended current execution session' : 'Technician paused work'),
        notes: pauseNotes || undefined,
      });
    }

    if (res.success) {
      toast.success(action === 'start' ? 'Work started — timer is running' : action === 'resume' ? 'Work resumed — timer is running' : 'Execution timer stopped');
      setPauseDialogOpen(false);
      setPauseReason('');
      setPauseNotes('');
      await fetchActiveSession();
      await fetchWO();
    } else {
      toast.error(res.error || `Failed to ${action}`);
    }
    setTlLoading(false);
  };

  const handleAction = async (action: string, extra?: Record<string, unknown>) => {
    setActionLoading(true);
    let res;
    switch (action) {
      case 'assign':
        res = await api.post(`/api/work-orders/${id}/assign`, { assignedTo: extra?.assignedToId, ...extra });
        break;
      case 'start':
        res = await api.post(`/api/work-orders/${id}/start`, { notes: extra?.notes });
        break;
      case 'complete':
        res = await api.post(`/api/work-orders/${id}/complete`, { notes: extra?.completionNotes, ...extra });
        break;
      case 'verify':
        res = await api.post(`/api/work-orders/${id}/verify`, { notes: extra?.notes });
        break;
      case 'close':
        res = await api.post(`/api/work-orders/${id}/close`, { notes: extra?.notes });
        break;
      case 'approve':
        res = await api.post(`/api/work-orders/${id}/approve`, { notes: extra?.notes, ...extra });
        break;
      case 'plan':
        res = await api.post(`/api/work-orders/${id}/plan`, { notes: extra?.notes, ...extra });
        break;
      case 'hold':
        res = await api.post(`/api/work-orders/${id}/hold`, { notes: extra?.notes, ...extra });
        break;
      case 'resume':
        res = await api.post(`/api/work-orders/${id}/resume`, { notes: extra?.notes, ...extra });
        break;
      case 'cancel':
        res = await api.post(`/api/work-orders/${id}/cancel`, { notes: extra?.notes, ...extra });
        break;
      case 'request':
        res = await api.post(`/api/work-orders/${id}/request`, { notes: extra?.notes, ...extra });
        break;
      case 'wait-parts':
        res = await api.post(`/api/work-orders/${id}/execution-state`, { action: 'wait', targetStatus: 'waiting_parts', reason: extra?.notes || 'Waiting for parts' });
        break;
      case 'waiting_tools':
      case 'waiting_shutdown':
      case 'waiting_permit':
        res = await api.post(`/api/work-orders/${id}/execution-state`, { action: 'wait', targetStatus: action, reason: extra?.notes || action.replaceAll('_', ' ') });
        break;
      default:
        res = await api.put(`/api/work-orders/${id}`, { ...extra });
    }
    if (res.success) {
      toast.success(`Work order ${action}d`);
      fetchWO();
      onUpdate();
      setActionDialog(null);
      // Re-fetch available transitions for the new status
      api.get(`/api/work-orders/${id}/transitions`).then(tres => {
        if (tres.success && tres.data) setAvailableTransitions(tres.data);
      });
    } else {
      toast.error(res.error || 'Action failed');
    }
    setActionLoading(false);
  };

  const handleComment = async () => {
    if (!comment.trim()) return;
    const res = await api.post(`/api/work-orders/${id}/comments`, { content: comment });
    if (res.success) { toast.success('Comment added'); setComment(''); fetchWO(); }
  };

  // ── Edit form helpers ──
  const editUpdateField = (field: string, value: any) => setEditForm(f => ({ ...f, [field]: value }));

  // Convert ISO datetime string to local "YYYY-MM-DDTHH:MM" for datetime picker.
  // Prisma serializes DateTime as UTC (appends Z), but MariaDB stores without timezone.
  // We strip the Z to treat the value as local time and avoid timezone double-conversion.
  function toLocalDatetime(iso: string): string {
    // Strip trailing Z and timezone offset to treat as local time
    const cleaned = iso.replace(/[Zz]$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Convert ISO datetime string to local "YYYY-MM-DD" for date picker
  function toLocalDate(iso: string): string {
    const cleaned = iso.replace(/[Zz]$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function editFormatHoursDisplay(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${h}`;
  }

  const editHandleEstHoursChange = (val: string) => {
    let displayVal = val;
    let decimalVal = val;
    if (val.includes(':')) {
      const [h, m] = val.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        decimalVal = String(h + m / 60);
      }
    }
    setEditForm(f => ({ ...f, estimatedHours: decimalVal, estimatedHoursDisplay: displayVal }));
  };

  const editAddToArray = (field: 'requiredParts' | 'requiredTools', id: string) => {
    setEditForm(f => {
      const arr = [...f[field]] as string[];
      if (!arr.includes(id)) arr.push(id);
      return { ...f, [field]: arr };
    });
  };

  const editRemoveFromArray = (field: 'requiredParts' | 'requiredTools', id: string) => {
    setEditForm(f => ({ ...f, [field]: f[field].filter((x: string) => x !== id) }));
  };

  // Load dropdown data when edit dialog opens
  useEffect(() => {
    if (editOpen) {
      Promise.all([
        api.get('/api/departments?limit=100'),
        inventoryEnabled
          ? api.get('/api/inventory?mode=lookup&limit=100')
          : Promise.resolve({ success: true, data: [] as any[] }),
        toolsEnabled
          ? api.get('/api/tools?mode=lookup&limit=100')
          : Promise.resolve({ success: true, data: [] as any[] }),
      ]).then(([deptsRes, invRes, toolsRes]) => {
        if (deptsRes.success && Array.isArray(deptsRes.data)) setEditDepartments(deptsRes.data);
        if (invRes.success && Array.isArray(invRes.data)) setEditInventoryItems(invRes.data);
        if (toolsRes.success && Array.isArray(toolsRes.data)) {
          setEditToolsData(toolsRes.data);
          // Populate requiredTools by matching WO material names to tool IDs
          const toolMaterials = wo?.materials?.filter((m: any) => !m.itemId) || [];
          if (toolMaterials.length > 0) {
            const toolIds = toolMaterials
              .map((m: any) => {
                const match = toolsRes.data.find((t: any) => (t.toolName || t.name) === m.itemName);
                return match?.id;
              })
              .filter(Boolean);
            if (toolIds.length > 0) {
              setEditForm(prev => ({ ...prev, requiredTools: toolIds }));
            }
          }
        }
      }).catch(() => {/* dropdowns will be empty */});
    }
  }, [editOpen, inventoryEnabled, toolsEnabled]);

  const openEditWO = () => {
    if (!wo) return;
    setEditForm({
      title: wo.title || '',
      description: wo.description || '',
      assetId: wo.assetId || '',
      departmentId: wo.departmentId || '',
      // Section 2: WO Details
      type: wo.type || 'corrective',
      priority: wo.priority || 'medium',
      tradeActivity: (wo as any).tradeActivity || 'mechanical',
      technicalDescription: (wo as any).technicalDescription || '',
      estimatedHours: wo.estimatedHours?.toString() || '',
      estimatedHoursDisplay: wo.estimatedHours ? editFormatHoursDisplay(wo.estimatedHours) : '',
      scheduledDate: wo.plannedStart ? toLocalDatetime(wo.plannedStart) : '',
      deliveryDate: wo.plannedEnd ? toLocalDate(wo.plannedEnd) : '',
      // Section 3: Resource Assignment
      assignType: ((wo as any).assignmentType === 'via_supervisor' ? 'supervisor' : 'technician') as 'technician' | 'supervisor',
      selectedWorkerIds: (wo as any).assignmentType === 'via_supervisor'
        ? (wo.assignedSupervisorId ? [wo.assignedSupervisorId] : [])
        : (wo.teamMembers?.map((m: any) => m.userId).filter(Boolean) || []),
      teamLeaderId: (wo as any).assignmentType === 'via_supervisor'
        ? (wo.assignedSupervisorId || '')
        : (wo.teamLeaderId || ''),
      responsibleSupervisorId: (wo as any).assignmentType === 'via_supervisor' ? '' : (wo.assignedSupervisorId || ''),
      requiredParts: wo.materials?.map((m: any) => m.itemId).filter(Boolean) || [],
      requiredTools: [], // populated after editToolsData loads (see useEffect below)
      // Section 4: Safety
      safetyNotes: (wo as any).safetyNotes || '',
      ppeRequired: (wo as any).ppeRequired || '',
      notes: (wo as any).notes || '',
    });
    setEditOpen(true);
  };

  const handleEditWO = async () => {
    if (!editForm.title) { toast.error('Title is required'); return; }

    if (editForm.assignType === 'technician' && editForm.selectedWorkerIds.length > 0 && !editForm.responsibleSupervisorId) {
      toast.error('Select the responsible supervisor who will verify this work order');
      return;
    }
    if (editForm.assignType === 'supervisor' && !editForm.teamLeaderId) {
      toast.error('Select the supervisor who will receive this work order');
      return;
    }
    if (
      editForm.assignType === 'technician' &&
      editForm.selectedWorkerIds.length === 0 &&
      (wo?.assignedTo || (wo?.teamMembers?.length ?? 0) > 0)
    ) {
      toast.error('Select at least one technician, or switch assignment mode to Supervisor');
      return;
    }

    setActionLoading(true);
    const payload: any = {
      title: editForm.title,
      description: editForm.description || undefined,
      type: editForm.type,
      priority: editForm.priority,
      assetId: assetsEnabled ? (editForm.assetId || undefined) : undefined,
      departmentId: editForm.departmentId || undefined,
      tradeActivity: editForm.tradeActivity,
      technicalDescription: editForm.technicalDescription || undefined,
      estimatedHours: editForm.estimatedHours ? parseFloat(editForm.estimatedHours) : undefined,
      plannedStart: editForm.scheduledDate || undefined,
      deliveryDateRequired: editForm.deliveryDate || undefined,
      safetyNotes: editForm.safetyNotes || undefined,
      ppeRequired: editForm.ppeRequired || undefined,
      notes: editForm.notes || undefined,
      requiredParts: inventoryEnabled && editForm.requiredParts.length > 0 ? editForm.requiredParts : undefined,
      requiredTools: toolsEnabled && editForm.requiredTools.length > 0 ? editForm.requiredTools : undefined,
    };

    const desiredAssignmentType = editForm.assignType === 'technician' ? 'direct' : 'via_supervisor';
    const desiredMemberIds = editForm.assignType === 'technician'
      ? [...editForm.selectedWorkerIds].sort()
      : [];
    const currentMemberIds = (wo?.teamMembers || []).map((member: any) => member.userId).filter(Boolean).sort();
    const desiredAssignedTo = editForm.assignType === 'technician'
      ? (editForm.selectedWorkerIds[0] || null)
      : null;
    const desiredTeamLeaderId = editForm.assignType === 'technician'
      ? (editForm.teamLeaderId || null)
      : null;
    const desiredSupervisorId = editForm.assignType === 'technician'
      ? (editForm.responsibleSupervisorId || null)
      : (editForm.teamLeaderId || null);
    const currentAssignmentType = (wo as any)?.assignmentType || (wo?.assignedTo ? 'direct' : null);

    const assignmentChanged = Boolean(wo) && (
      currentAssignmentType !== desiredAssignmentType ||
      (wo?.assignedTo || null) !== desiredAssignedTo ||
      (wo?.teamLeaderId || null) !== desiredTeamLeaderId ||
      (wo?.assignedSupervisorId || null) !== desiredSupervisorId ||
      JSON.stringify(currentMemberIds) !== JSON.stringify(desiredMemberIds)
    );

    const res = await api.put(`/api/work-orders/${id}`, payload);
    if (!res.success) {
      toast.error(res.error || 'Update failed');
      setActionLoading(false);
      return;
    }

    if (assignmentChanged) {
      const assignmentPayload: any = {
        assignmentType: desiredAssignmentType,
        assignedSupervisorId: desiredSupervisorId || undefined,
      };
      if (desiredAssignmentType === 'direct') {
        assignmentPayload.assignedTo = desiredAssignedTo || undefined;
        assignmentPayload.teamLeaderId = desiredTeamLeaderId || undefined;
        assignmentPayload.teamMembers = editForm.selectedWorkerIds.map((workerId: string) => ({
          userId: workerId,
          role: workerId === editForm.teamLeaderId ? 'team_leader' : 'assistant',
        }));
      }

      const assignmentRes = await api.post(`/api/work-orders/${id}/assign`, assignmentPayload);
      if (!assignmentRes.success) {
        toast.error(`Work order details saved, but assignment update failed: ${assignmentRes.error || 'Unknown error'}`);
        fetchWO();
        onUpdate();
        setActionLoading(false);
        return;
      }
    }

    toast.success('Work order updated');
    setEditOpen(false);
    fetchWO();
    onUpdate();
    setActionLoading(false);
  };

  const handleTimeLog = async () => {
    setTlError('');

    // Validation: end time must be after start time
    if (tlStartTime && tlEndTime) {
      const startMs = new Date(tlStartTime).getTime();
      const endMs = new Date(tlEndTime).getTime();
      if (endMs <= startMs) {
        setTlError('End time must be after start time.');
        return;
      }
    }

    // Validation: start time must be on or after WO schedule date
    if (tlStartTime && tlConstraints.minDate) {
      const startDate = tlStartTime.slice(0, 10);
      if (startDate < tlConstraints.minDate) {
        setTlError(`Start date cannot be before the work order schedule date (${tlConstraints.minDate}).`);
        return;
      }
      // Same date: check time
      if (startDate === tlConstraints.minDate && tlConstraints.minTime) {
        const startTime = tlStartTime.slice(11, 16);
        if (startTime && startTime < tlConstraints.minTime) {
          setTlError(`Start time cannot be before ${tlConstraints.minTime} on the schedule date.`);
          return;
        }
      }
    }

    setTlLoading(true);
    const body: any = { action: tlAction };
    if (tlNotes) body.notes = tlNotes;
    if (tlStartTime) body.startTime = tlStartTime;
    if (tlEndTime) body.endTime = tlEndTime;
    body.activityType = tlActivityType;
    if (tlBreakMinutes) body.breakMinutes = parseInt(tlBreakMinutes, 10) || 0;
    if (tlLoggedForUserId) {
      body.loggedForUserId = tlLoggedForUserId;
      body.isTeamLog = true;
    }
    const res = await api.post(`/api/work-orders/${id}/time-logs`, body);
    if (res.success) {
      toast.success('Time log recorded');
      setTimeLogOpen(false);
      setTlStartTime('');
      setTlEndTime('');
      setTlActivityType('maintenance');
      setTlBreakMinutes('');
      setTlNotes('');
      setTlLoggedForUserId('');
      setTlError('');
      fetchActiveSession();
      fetchWO();
    } else {
      if (res.conflict) {
        toast.error(`${res.error} Go to WO #${res.conflict.workOrderNumber} and pause it first.`);
      } else {
        toast.error(res.error || 'Failed to log time');
      }
    }
    setTlLoading(false);
  };

  const handleDeleteTimeLog = async (logId: string) => {
    const res = await api.delete(`/api/work-orders/${id}/time-logs?logId=${logId}`);
    if (res.success) { toast.success('Time log deleted'); setDeleteTlId(null); fetchActiveSession(); fetchWO(); }
    else { toast.error(res.error || 'Failed to delete time log'); }
  };

  const handleAddMaterial = async () => {
    if (!matItemId) { toast.error('Please select an item'); return; }
    setMatLoading(true);
    const body: any = { itemId: matItemId };
    if (matQty) body.quantity = parseFloat(matQty);
    if (matUnit) body.unit = matUnit;
    if (matReason) body.reason = matReason;
    if (matUrgency) body.urgency = matUrgency;
    const res = await api.post(`/api/work-orders/${id}/materials`, body);
    if (res.success) {
      toast.success('Material requested — sent for supervisor approval');
      setMaterialOpen(false); setMatItemId(''); setMatItemName(''); setMatQty('');
      setMatReason(''); setMatUrgency('normal');
      fetchWO();
      if (res.data?.repairMaterialRequest) {
        toast.info('Material request is pending supervisor approval');
      }
    } else { toast.error(res.error || 'Failed to add material'); }
    setMatLoading(false);
  };

  // ── Repair Resource Modal Handlers ──
  const resetToolReqForm = () => { setToolReqItems([{ toolId: '', toolName: '', toolCode: '', quantityRequested: 1 }]); setToolReqReason(''); setToolReqUrgency('normal'); };
  const addToolReqItem = () => setToolReqItems(prev => [...prev, { toolId: '', toolName: '', toolCode: '', quantityRequested: 1 }]);
  const removeToolReqItem = (idx: number) => { if (toolReqItems.length > 1) setToolReqItems(prev => prev.filter((_, i) => i !== idx)); };
  const updateToolReqItem = (idx: number, updates: Partial<{ toolId: string; toolName: string; toolCode: string; quantityRequested: number }>) => {
    setToolReqItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item));
  };
  const handleToolRequest = async () => {
    const validItems = toolReqItems.filter(i => i.toolId && i.toolName.trim());
    if (validItems.length === 0) { toast.error('Please select at least one tool'); return; }
    if (toolReqReason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return; }
    setToolReqSubmitting(true);
    const res = await api.post('/api/repairs/tool-requests', {
      workOrderId: id,
      reason: toolReqReason,
      urgency: toolReqUrgency,
      items: validItems,
    });
    if (res.success) { toast.success(`${validItems.length} tool(s) requested — sent for approval`); setToolReqOpen(false); resetToolReqForm(); fetchWO(); }
    else toast.error(res.error || 'Failed to submit tool request');
    setToolReqSubmitting(false);
  };

  const resetToolXferForm = () => { setToolXferToolId(''); setToolXferToolName(''); setToolXferToUserId(''); setToolXferToUserName(''); setToolXferReason(''); };
  const handleToolTransfer = async () => {
    if (!toolXferToolId) { toast.error('Please select a tool'); return; }
    if (!toolXferToUserId) { toast.error('Please select a technician to transfer to'); return; }
    if (toolXferReason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return; }
    setToolXferSubmitting(true);
    const res = await api.post('/api/repairs/tool-transfers', {
      toolId: toolXferToolId,
      toUserId: toolXferToUserId,
      reason: toolXferReason,
    });
    if (res.success) { toast.success('Tool transfer request submitted for store keeper approval'); setToolXferOpen(false); resetToolXferForm(); }
    else toast.error(res.error || 'Failed to submit transfer request');
    setToolXferSubmitting(false);
  };

  const resetDowntimeForm = () => { setDtReason(''); setDtCategory('unplanned'); setDtImpactLevel('medium'); setDtProductionLoss(''); setDtDurationMinutes(''); };
  const handleDowntime = async () => {
    if (!dtReason.trim()) { toast.error('Please provide a reason'); return; }
    if (!dtDurationMinutes || parseFloat(dtDurationMinutes) <= 0) { toast.error('Please enter the downtime duration'); return; }
    setDowntimeSubmitting(true);
    const res = await api.post('/api/repairs/downtime', {
      workOrderId: id,
      reason: dtReason,
      category: dtCategory,
      impactLevel: dtImpactLevel,
      productionLoss: dtProductionLoss ? parseFloat(dtProductionLoss) : undefined,
      durationMinutes: parseFloat(dtDurationMinutes),
      assetId: wo?.assetId || undefined,
      assetName: wo?.assetName || wo?.asset?.name || undefined,
    });
    if (res.success) { toast.success('Downtime logged successfully'); setDowntimeOpen(false); resetDowntimeForm(); fetchWO(); }
    else toast.error(res.error || 'Failed to log downtime');
    setDowntimeSubmitting(false);
  };

  const resetSpareReturnForm = () => { setSpareReturnItemName(''); setSpareReturnQty('1'); setSpareReturnCondition('used'); setSpareReturnDamageDesc(''); setSpareReturnNeedsRefurb(true); setSpareReturnIsReusable(true); setSpareReturnItemId(''); setSpareReturnMRId(''); setSpareReturnLinkedMR(null); };

  const openSpareReturnFromMR = (mr: any) => {
    setSpareReturnLinkedMR(mr);
    setSpareReturnItemName(mr.itemName || '');
    setSpareReturnQty(String(mr.quantityIssued || mr.quantityRequested || 1));
    setSpareReturnItemId(mr.itemId || '');
    setSpareReturnMRId(mr.id || '');
    setSpareReturnCondition('used');
    setSpareReturnDamageDesc('');
    setSpareReturnNeedsRefurb(true);
    setSpareReturnIsReusable(true);
    setSpareReturnOpen(true);
  };

  // Open material return modal listing issued materials for this WO
  const openMatReturn = () => {
    const items: typeof matReturnItems = [];
    if (wo?.repairMaterialRequests) {
      for (const mr of wo.repairMaterialRequests as any[]) {
        if (!['issued', 'partially_returned'].includes(mr.status)) continue;
        const issued = mr.quantityIssued || 0;
        const returned = mr.quantityReturned || 0;
        const outstanding = issued - returned;
        if (outstanding > 0) {
          items.push({
            id: mr.id,
            itemName: mr.itemName || 'Unknown Material',
            itemId: mr.itemId || '',
            qtyIssued: issued,
            qtyReturned: returned,
            qtyReturn: outstanding,
            isReusable: true,
            condition: 'used',
          });
        }
      }
    }
    setMatReturnItems(items);
    setMatReturnOpen(true);
  };

  const updateMatReturnItem = (idx: number, patch: Partial<typeof matReturnItems[0]>) => {
    setMatReturnItems(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  };

  const removeMatReturnItem = (idx: number) => {
    setMatReturnItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleMatReturnSubmit = async () => {
    const activeItems = matReturnItems.filter(i => i.qtyReturn > 0);
    if (activeItems.length === 0) { toast.error('No items to return'); return; }
    setMatReturnSubmitting(true);
    let errors: string[] = [];
    for (const item of activeItems) {
      try {
        const res = await api.post('/api/repairs/spare-part-returns', {
          workOrderId: id,
          itemName: item.itemName,
          quantity: item.qtyReturn,
          conditionOnReturn: item.condition,
          refurbishmentNeeded: item.isReusable,
          isConsumed: !item.isReusable,
          itemId: item.itemId || undefined,
          materialRequestId: item.id,
          plantId: wo?.plantId || undefined,
        });
        if (!res.success) errors.push(res.error || `Failed: ${item.itemName}`);
        else toast.success(item.isReusable
          ? `${item.itemName}: ${item.qtyReturn} submitted for return/refurbishment`
          : `${item.itemName}: ${item.qtyReturn} recorded as consumed`);
      } catch (e: any) { errors.push(`${item.itemName}: ${e.message}`); }
    }
    if (errors.length > 0) errors.forEach(e => toast.error(e));
    setMatReturnSubmitting(false);
    setMatReturnOpen(false);
    fetchWO();
  };

  const handleSpareReturn = async () => {
    if (!spareReturnItemName.trim()) { toast.error('Please enter the item name'); return; }
    setSpareReturnSubmitting(true);
    const res = await api.post('/api/repairs/spare-part-returns', {
      workOrderId: id,
      itemName: spareReturnItemName,
      quantity: parseFloat(spareReturnQty) || 1,
      conditionOnReturn: spareReturnCondition,
      damageDescription: spareReturnDamageDesc || undefined,
      refurbishmentNeeded: spareReturnNeedsRefurb,
      isConsumed: !spareReturnIsReusable,
      itemId: spareReturnItemId || undefined,
      materialRequestId: spareReturnMRId || undefined,
      plantId: wo?.plantId || undefined,
    });
    if (res.success) {
      toast.success(spareReturnIsReusable
        ? 'Material return submitted — pending inspection & refurbishment'
        : 'Material recorded as consumed (not returnable)');
      setSpareReturnOpen(false); resetSpareReturnForm(); fetchWO();
    }
    else toast.error(res.error || 'Failed to submit return');
    setSpareReturnSubmitting(false);
  };

  // Repair Material Request action handlers (approval workflow from WO detail)
  const handleMatRequestAction = async (mrId: string, action: string, extra?: Record<string, any>) => {
    const res = await api.post(`/api/repairs/material-requests/${mrId}`, { action, ...extra });
    if (res.success) {
      const actionLabels: Record<string, string> = {
        supervisor_approve: 'Supervisor approved',
        supervisor_reject: 'Supervisor rejected',
        storekeeper_approve: 'Store approved',
        storekeeper_reject: 'Store rejected',
        record_return: 'Return recorded',
      };
      toast.success(actionLabels[action] || 'Action completed');
      fetchWO();
    } else toast.error(res.error || 'Failed');
  };

  const handleMatRequestPick = async (mrId: string) => {
    const res = await api.post('/api/repairs/material-requests/pick', { id: mrId });
    if (res.success) { toast.success('Items being picked'); fetchWO(); }
    else toast.error(res.error || 'Failed to pick');
  };

  const isSupervisorOrAdminLocal = () => {
    const slugs = (user?.roles || []).map((r: any) => r.slug);
    return slugs.includes('admin') || slugs.includes('maintenance_supervisor') || slugs.includes('maintenance_manager') || slugs.includes('plant_manager');
  };

  const isStoreOrAdminLocal = () => {
    const slugs = (user?.roles || []).map((r: any) => r.slug);
    return slugs.includes('admin') || slugs.includes('store_keeper') || slugs.includes('inventory_manager') || slugs.includes('tools_shop_attendant');
  };

  // Personal tools handlers
  const handleAddPersonalTool = async () => {
    if (!ptForm.toolName) { toast.error('Tool name is required'); return; }
    setPtLoading(true);
    const res = await api.post(`/api/work-orders/${id}/personal-tools`, ptForm);
    if (res.success) { toast.success('Tool added'); setPtOpen(false); setPtForm({ toolName: '', toolCode: '', condition: 'good', notes: '' }); fetchPersonalTools(); }
    else { toast.error(res.error || 'Failed to add tool'); }
    setPtLoading(false);
  };

  const handleRemovePersonalTool = async (idx: number) => {
    const tool = personalTools[idx];
    if (!tool?.id) return;
    setPtLoading(true);
    const res = await api.delete(`/api/work-orders/${id}/personal-tools/${tool.id}`);
    if (res.success) { toast.success('Tool removed'); fetchPersonalTools(); }
    else { toast.error(res.error || 'Failed to remove tool'); }
    setPtLoading(false);
  };

  // Add team member handler
  const handleAddTeamMember = async () => {
    if (!newMemberUserId) { toast.error('Please select a user'); return; }
    setAddMemberLoading(true);
    const res = await api.post(`/api/work-orders/${id}/team-members`, { userId: newMemberUserId, role: newMemberRole });
    if (res.success) { toast.success('Team member added'); setAddTeamMemberOpen(false); setNewMemberUserId(''); setNewMemberRole('assistant'); fetchWO(); }
    else { toast.error(res.error || 'Failed to add team member'); }
    setAddMemberLoading(false);
  };

  // Request team member handler (for technicians) — requests a TRADE, not a specific person
  const handleRequestTeamMember = async () => {
    if (!reqMemberTrade) { toast.error('Please select the trade/skill needed'); return; }
    setReqMemberLoading(true);
    const res = await api.post(`/api/work-orders/${id}/team-member-requests`, {
      requestedTrade: reqMemberTrade,
      role: reqMemberRole,
      reason: reqMemberReason || undefined,
    });
    if (res.success) {
      toast.success('Team member request submitted. Waiting for approval.');
      setRequestMemberOpen(false);
      setReqMemberTrade('');
      setReqMemberRole('assistant');
      setReqMemberReason('');
      fetchTeamRequests();
    } else {
      toast.error(res.error || 'Failed to submit request');
    }
    setReqMemberLoading(false);
  };

  // Review team member request (approve/reject)
  // For trade-based requests: assignUserId is the technician chosen by the planner
  const handleReviewTeamRequest = async (reqId: string, action: 'approve' | 'reject', reviewNotes?: string, assignUserId?: string) => {
    setReqActionLoading(reqId);
    const res = await api.put(`/api/work-orders/${id}/team-member-requests/${reqId}`, { action, reviewNotes, assignUserId });
    if (res.success) {
      toast.success(action === 'approve' ? 'Request approved — member added to team' : 'Request rejected');
      fetchTeamRequests();
      fetchWO(); // refresh team members
      setApproveReqId(null);
      setApproveAssignUserId('');
    } else {
      toast.error(res.error || `Failed to ${action} request`);
    }
    setReqActionLoading(null);
  };

  // Cancel team member request
  const handleCancelTeamRequest = async (reqId: string) => {
    setReqActionLoading(reqId);
    const res = await api.delete(`/api/work-orders/${id}/team-member-requests/${reqId}`);
    if (res.success) {
      toast.success('Request cancelled');
      fetchTeamRequests();
    } else {
      toast.error(res.error || 'Failed to cancel request');
    }
    setReqActionLoading(null);
  };

  // Remove team member
  const handleRemoveTeamMember = async (memberId: string, memberName: string) => {
    const res = await api.delete(`/api/work-orders/${id}/team-members/${memberId}`);
    if (res.success) { toast.success(`${memberName} removed from team`); fetchWO(); }
    else { toast.error(res.error || 'Failed to remove team member'); }
  };

  // --- Task Checklist Handlers ---
  const fetchTaskChecklist = useCallback(async () => {
    const res = await api.get(`/api/work-orders/${id}/tasks`);
    if (res.success && res.data) {
      setTaskChecklist(res.data);
      setTaskChecklistMeta((res as any).meta || null);
    }
    setTaskChecklistLoading(false);
  }, [id]);

  const handleTaskAction = async (taskId: string, action: 'in_progress' | 'completed' | 'skipped' | 'failed' | 'pending', extra?: Record<string, string>) => {
    setTaskActionLoading(taskId);
    const body: Record<string, string> = { status: action };
    if (extra?.notes) body.notes = extra.notes;
    if (extra?.findings) body.findings = extra.findings;
    const res = await api.patch(`/api/work-orders/${id}/tasks/${taskId}`, body);
    if (res.success) {
      const labels: Record<string, string> = { in_progress: 'Task started', completed: 'Task completed ✓', skipped: 'Task skipped', failed: 'Task marked as failed', pending: 'Task reopened' };
      toast.success(labels[action] || 'Task updated');
      fetchTaskChecklist();
      setCompleteTaskDialog(null);
      setSkipTaskDialog(null);
      setTaskNotes('');
      setTaskFindings('');
      setSkipReason('');
    } else {
      toast.error(res.error || 'Failed to update task');
    }
    setTaskActionLoading(null);
  };

  const handleAddManualTask = async () => {
    if (!addTaskDesc.trim()) { toast.error('Task description is required'); return; }
    setAddTaskLoading(true);
    const body: Record<string, unknown> = { description: addTaskDesc.trim(), taskType: addTaskType };
    if (addTaskMinutes) body.estimatedMinutes = parseInt(addTaskMinutes, 10);
    const res = await api.post(`/api/work-orders/${id}/tasks`, body);
    if (res.success) {
      toast.success('Task added');
      setAddTaskDialog(false);
      setAddTaskDesc('');
      setAddTaskType('check');
      setAddTaskMinutes('');
      fetchTaskChecklist();
    } else {
      toast.error(res.error || 'Failed to add task');
    }
    setAddTaskLoading(false);
  };

  if (loading) return <LoadingSkeleton />;
  if (!wo) return <div className="p-6">Work order not found</div>;

  // Map transitions to action handlers — each status maps to a dedicated API endpoint
  const statusToAction: Record<string, string> = {
    'approved': 'approve', 'requested': 'request', 'planned': 'plan',
    'assigned': 'assign', 'in_progress': 'start', 'completed': 'complete',
    'verified': 'verify', 'closed': 'close', 'on_hold': 'hold',
    'cancelled': 'cancel', 'waiting_parts': 'wait-parts',
  };

  // Build transition actions from state machine
  const transitionActions = availableTransitions.map(t => ({
    toStatus: t.toStatus,
    actionName: t.toStatus === 'in_progress' && wo.status !== 'assigned' ? 'resume' : (statusToAction[t.toStatus] || t.toStatus),
    label: t.toStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    requiresReason: t.requiresReason,
  }));

  // Special actions that need dialogs
  const needsDialog = new Set(['assign', 'complete']);

  // Confirm dialog descriptions for WO actions
  const woActionDescriptions: Record<string, { description: string; label: string; variant?: 'default' | 'destructive' }> = {
    'approve': { description: 'Are you sure you want to approve this work order? This will allow it to be planned and assigned.', label: 'Yes, Approve' },
    'request': { description: 'Are you sure you want to submit this work order for approval?', label: 'Yes, Submit' },
    'plan': { description: 'Are you sure you want to mark this work order as planned?', label: 'Yes, Plan' },
    'start': { description: 'Are you sure you want to start work on this work order? This will change the status to In Progress.', label: 'Yes, Start Work' },
    'verify': { description: 'Are you sure you want to verify this completed work order?', label: 'Yes, Verify' },
    'close': { description: 'Are you sure you want to close this work order? This action cannot be easily reversed.', label: 'Yes, Close', variant: 'destructive' },
    'hold': { description: 'Are you sure you want to put this work order on hold?', label: 'Yes, Put On Hold' },
    'resume': { description: 'Are you sure you want to resume this work order?', label: 'Yes, Resume' },
    'cancel': { description: 'Are you sure you want to cancel this work order? This will stop all work and cannot be easily reversed.', label: 'Yes, Cancel', variant: 'destructive' },
    'wait-parts': { description: 'Are you sure you want to set this work order to Waiting for Parts?', label: 'Yes, Wait for Parts' },
  };

  // WO is finalized when completed/verified/closed/cancelled/locked — all action buttons disabled
  const isWOFinalized = ['completed', 'verified', 'closed', 'cancelled'].includes(wo.status) || wo.isLocked;
  const isWOReadOnly = isWOFinalized; // alias for clarity
  const isWOPermanentlyLocked = wo.isLocked || wo.status === 'closed';
  // Edit: planner who created the WO, anyone with assign permissions, or admin can edit
  // Technicians with work_orders.update can only change status (start/complete), NOT edit WO fields
  const canEdit = !['completed', 'closed', 'cancelled', 'verified'].includes(wo.status) && (
    canManageTeamDirectly ||
    isAdmin() ||
    (wo.plannerId === user?.id) ||
    (wo.createdById === user?.id && hasPermission('work_orders.create'))
  );

  // Authorization controls visibility; lifecycle state controls disabling.
  // Viewers/read-only actors should not see execution buttons they cannot use.
  const canPerformWorkActions = !isReadOnly && isWorkerOnThisWO;
  const workActionDisabled = isWOFinalized || !canPerformWorkActions;
  // Disable ALL interactive buttons for completed/closed WOs
  const allActionsDisabled = isWOFinalized;

  // Format session duration
  const formatSessionDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <>
      {/* Sheet Header */}
      <SheetHeader className="pt-4 pb-4">
        <SheetTitle className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm text-muted-foreground">{wo.woNumber}</span>
          <StatusBadge status={wo.status} />
          <PriorityBadge priority={wo.priority} />
          <Badge variant="outline" className="capitalize">{wo.type.replace('_', ' ')}</Badge>
          {wo.status === 'verified' && !wo.isLocked && <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200"><ShieldCheck className="h-3 w-3 mr-1" />Under Review</Badge>}
          {(wo.isLocked || wo.status === 'closed') && <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" />Permanently Locked</Badge>}
          {wo.slaBreached && <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />SLA BREACHED</Badge>}
        </SheetTitle>
        <SheetDescription className="mt-1">
          <span className="text-base font-semibold text-foreground">{wo.title}</span>
        </SheetDescription>
      </SheetHeader>

      {/* Actions Bar */}
      <div className="pb-4 flex items-center gap-2">
        {/* When permanently locked or user has no action permission, hide the entire Actions dropdown */}
        {!isWOPermanentlyLocked && !isReadOnly && (canEdit || transitionActions.length > 0) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={isReadOnly}><CheckCircle2 className="h-4 w-4 mr-1" />Actions</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {canEdit && !isReadOnly && <DropdownMenuItem onClick={openEditWO}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>}
              {canEdit && !isReadOnly && <DropdownMenuSeparator />}
              {transitionActions.map(ta => (
                <DropdownMenuItem key={ta.toStatus} disabled={isReadOnly} onClick={() => {
                  if (needsDialog.has(ta.actionName)) {
                    setActionDialog(ta.actionName);
                  } else if (ta.requiresReason) {
                    setActionDialog(`reason:${ta.actionName}`);
                  } else if (woActionDescriptions[ta.actionName]) {
                    const desc = woActionDescriptions[ta.actionName];
                    setWoConfirmAction({
                      action: ta.actionName,
                      label: desc.label,
                      variant: desc.variant || 'default',
                      description: desc.description,
                    });
                  } else {
                    handleAction(ta.actionName);
                  }
                }}>{ta.label}</DropdownMenuItem>
              ))}
              {transitionActions.length === 0 && canEdit && (
                <DropdownMenuItem disabled>No transitions available</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {/* Print Work Order Button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={async () => {
                  try {
                    toast.loading('Generating PDF...', { id: 'print-wo' });
                    const res = await api.getRaw(`/api/work-orders/${id}/print?format=pdf`);
                    if (!res.ok) throw new Error('Failed to generate PDF');
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${wo?.woNumber || 'WO'}-Print.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    toast.success('PDF downloaded successfully', { id: 'print-wo' });
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to generate PDF', { id: 'print-wo' });
                  }
                }}
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Print WO</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download professional PDF with equipment details, parts list, labor & signatures</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {isReadOnly && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            Read-Only Access
          </div>
        )}
        {wo.status === 'verified' && !wo.isLocked && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            Supervisor reviewed — awaiting planner closure
          </div>
        )}
        {(wo.isLocked || wo.status === 'closed') && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Permanently locked — no modifications allowed
          </div>
        )}
        {!isWOPermanentlyLocked && !isReadOnly && !canTakeActions && !canManageTeamDirectly && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            View Only — you don't have permission to modify this work order
          </div>
        )}
      </div>

      {/* Assign Dialog */}
      <ResponsiveDialog open={actionDialog === 'assign'} onOpenChange={() => setActionDialog(null)} title="Assign Work Order" description="Select a technician to assign this work order.">
          <AsyncSearchableSelect
            value=""
            onValueChange={(val) => handleAction('assign', { assignedToId: val, assignedToName: val })}
            fetchOptions={async () => {
              const res = await api.get('/api/workers?role=technician');
              if (res.success && res.data) {
                return (Array.isArray(res.data) ? res.data : []).map((u: any) => ({
                  value: u.id,
                  label: `${u.fullName} (${u.username})`,
                }));
              }
              return [];
            }}
            placeholder="Select technician..."
            searchPlaceholder="Search technicians..."
          />
      </ResponsiveDialog>

      {/* Complete Dialog — Enhanced */}
      <ResponsiveDialog open={actionDialog === 'complete'} onOpenChange={() => setActionDialog(null)} large title="Complete Work Order" description="Mark this work order as completed with full details." footer={<Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={actionLoading || !completionNotes.trim()} onClick={() => handleAction('complete', { completionNotes, causeDescription: completeRootCause, failureDescription: completeFindings, actionDescription: completeCorrectiveAction })}>{actionLoading ? 'Completing...' : 'Mark as Completed'}</Button>}>
          <div className="grid gap-4 py-2">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground">Total Time</p>
                <p className="text-lg font-bold">{formatDuration(wo.actualHours || 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground">Materials Used</p>
                <p className="text-lg font-bold">{wo.materials?.length || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="text-lg font-bold">{formatCurrency(wo.totalCost)}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Completion Notes *</Label>
              <Textarea value={completionNotes} onChange={e => setCompletionNotes(e.target.value)} placeholder="What was done?" rows={3} />
            </div>
            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Failure Analysis</p>
            <div className="space-y-2"><Label>Root Cause</Label><Textarea value={completeRootCause} onChange={e => setCompleteRootCause(e.target.value)} placeholder="What caused the failure..." rows={2} /></div>
            <div className="space-y-2"><Label>Findings</Label><Textarea value={completeFindings} onChange={e => setCompleteFindings(e.target.value)} placeholder="What was discovered during the repair..." rows={2} /></div>
            <div className="space-y-2"><Label>Corrective Action</Label><Textarea value={completeCorrectiveAction} onChange={e => setCompleteCorrectiveAction(e.target.value)} placeholder="Actions taken to prevent recurrence..." rows={2} /></div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">Completion is automatically submitted to the assigned supervisor for review.</div>
          </div>
      </ResponsiveDialog>

      {/* Edit WO Dialog */}
      {!isMobile ? (
      <ResponsiveDialog open={editOpen} onOpenChange={setEditOpen} large desktopMaxWidth="sm:max-w-4xl" title={<span className="flex items-center gap-2"><Pencil className="h-5 w-5 text-emerald-600" />Edit Work Order</span>} description="Update work order details." footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={actionLoading} onClick={handleEditWO}>{actionLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving...</> : 'Save Changes'}</Button></div>}>
          <div className="grid gap-5 py-2">

            {/* Request Information (only if converted from MR) — immutable readonly */}
            {wo?.maintenanceRequest && (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 sm:p-6">
                <h3 className="text-sm font-semibold text-blue-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                  <FileText className="h-4 w-4" />Request Information <span className="text-[10px] font-normal normal-case tracking-normal text-blue-500">(read-only)</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[11px] text-blue-600 font-medium uppercase">Request Number</p>
                    <p className="text-sm font-semibold">{(wo as any).maintenanceRequest?.requestNumber}</p>
                  </div>
                  {assetsEnabled && <div>
                    <p className="text-[11px] text-blue-600 font-medium uppercase">Machine / Asset</p>
                    <p className="text-sm font-semibold">{(wo as any).maintenanceRequest?.asset?.name || wo.assetName || '-'}</p>
                  </div>}
                  <div>
                    <p className="text-[11px] text-blue-600 font-medium uppercase">Category</p>
                    <p className="text-sm font-semibold capitalize">{(wo as any).maintenanceRequest?.category || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-blue-600 font-medium uppercase">Breakdown</p>
                    <Badge variant={(wo as any).maintenanceRequest?.machineDownStatus ? 'destructive' : 'secondary'} className="text-xs">
                      {(wo as any).maintenanceRequest?.machineDownStatus ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <p className="text-[11px] text-blue-600 font-medium uppercase">Problem Description</p>
                    <p className="text-sm text-blue-900 mt-0.5 whitespace-pre-wrap bg-white/60 rounded-lg p-3 border border-blue-100 max-h-28 overflow-y-auto">{(wo as any).maintenanceRequest?.description || 'No description provided.'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-blue-600 font-medium uppercase">Requested By</p>
                    <p className="text-sm font-semibold">{(wo as any).maintenanceRequest?.requester?.fullName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-blue-600 font-medium uppercase">Date Sent</p>
                    <p className="text-sm font-semibold">{(wo as any).maintenanceRequest?.createdAt ? formatDateTime((wo as any).maintenanceRequest.createdAt) : '-'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── SECTION 1: Basic Info (no colored bg, matches CreateWOForm) ── */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={editForm.title || ''} onChange={e => editUpdateField('title', e.target.value)} placeholder="Work order title" required />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={editForm.description || ''} onChange={e => editUpdateField('description', e.target.value)} placeholder="Problem description..." rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {assetsEnabled && <div className="space-y-2">
                  <Label>Asset / Machine</Label>
                  <AsyncSearchableSelect
                    value={editForm.assetId || ''}
                    onValueChange={v => editUpdateField('assetId', v)}
                    fetchOptions={async () => {
                      const res = await api.get('/api/assets');
                      if (res.success && res.data) {
                        return (Array.isArray(res.data) ? res.data : []).map((a: any) => ({
                          value: a.id,
                          label: `${a.name} [${a.assetTag}]`,
                          badge: a.status,
                        }));
                      }
                      return [];
                    }}
                    placeholder="Select asset..."
                    searchPlaceholder="Search assets by name or tag..."
                  />
                </div>}
                <div className="space-y-2">
                  <Label>Department</Label>
                  <AsyncSearchableSelect
                    value={editForm.departmentId || ''}
                    onValueChange={v => editUpdateField('departmentId', v)}
                    fetchOptions={async () => {
                      const res = await api.get('/api/departments?limit=100');
                      if (res.success && res.data) {
                        return (Array.isArray(res.data) ? res.data : []).map((d: any) => ({
                          value: d.id,
                          label: d.name,
                        }));
                      }
                      return [];
                    }}
                    placeholder="Select department..."
                    searchPlaceholder="Search departments..."
                  />
                </div>
              </div>
            </div>

            {/* ── SECTION 2: Work Order Details (purple background) ── */}
            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-purple-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                <ClipboardCheck className="h-4 w-4" />Work Order Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Work Order Type</Label>
                  <Select value={editForm.type || 'corrective'} onValueChange={v => editUpdateField('type', v)}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breakdown">Breakdown</SelectItem>
                      <SelectItem value="corrective">Corrective</SelectItem>
                      <SelectItem value="preventive">Preventive</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                      <SelectItem value="inspection">Inspection</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="predictive">Predictive</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Priority</Label>
                  <Select value={editForm.priority || 'medium'} onValueChange={v => editUpdateField('priority', v)}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Trade Activity</Label>
                  <Select value={editForm.tradeActivity || 'mechanical'} onValueChange={v => editUpdateField('tradeActivity', v)}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mechanical">Mechanical</SelectItem>
                      <SelectItem value="electrical">Electrical</SelectItem>
                      <SelectItem value="civil">Civil</SelectItem>
                      <SelectItem value="facility">Facility</SelectItem>
                      <SelectItem value="workshop">Workshop</SelectItem>
                      <SelectItem value="instrumentation">Instrumentation</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Est. Hours</Label>
                  <Input
                    className="min-h-[44px]"
                    value={editForm.estimatedHoursDisplay || editForm.estimatedHours || ''}
                    onChange={e => editHandleEstHoursChange(e.target.value)}
                    placeholder="2.5 or 2:30"
                  />
                  <p className="text-[10px] text-muted-foreground">Supports 2.5 or 2:30 format</p>
                </div>
                <div className="sm:col-span-2 lg:col-span-4 space-y-1.5">
                  <Label className="text-xs">Technical Description</Label>
                  <Textarea
                    value={editForm.technicalDescription || ''}
                    onChange={e => editUpdateField('technicalDescription', e.target.value)}
                    placeholder="Detailed technical description of the work to be performed..."
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Scheduled Date</Label>
                  <DateTimePicker value={editForm.scheduledDate || undefined} onChange={v => editUpdateField('scheduledDate', v || '')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Delivery Date</Label>
                  <DatePicker value={editForm.deliveryDate || undefined} onChange={v => editUpdateField('deliveryDate', v || '')} />
                </div>
              </div>
            </div>

            {/* ── SECTION 3: Resource Assignment (green background) ── */}
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 sm:p-6">
              <div className="grid gap-4">
                <WorkerAssignmentSelector
                  selectedWorkerIds={editForm.selectedWorkerIds || []}
                  teamLeaderId={editForm.teamLeaderId || ''}
                  onSelectedWorkersChange={(ids) => editUpdateField('selectedWorkerIds', ids)}
                  onTeamLeaderChange={(id) => editUpdateField('teamLeaderId', id)}
                  assignType={editForm.assignType || 'technician'}
                  onAssignTypeChange={(type) => editUpdateField('assignType', type)}
                  label="Resource Assignment"
                />
                {editForm.assignType === 'technician' && (
                  <ResponsibleSupervisorSelect
                    value={editForm.responsibleSupervisorId}
                    onValueChange={(value) => editUpdateField('responsibleSupervisorId', value)}
                  />
                )}

                {/* Required Spare Parts */}
                {inventoryEnabled && <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1"><PackageSearch className="h-3.5 w-3.5" />Required Spare Parts</Label>
                  <div className="flex flex-wrap gap-1.5 min-h-[44px] p-2 border rounded-md bg-white">
                    {(editForm.requiredParts || []).length === 0 && <span className="text-sm text-muted-foreground">Select spare parts from inventory...</span>}
                    {(editForm.requiredParts || []).map((partId: string) => {
                      const item = editInventoryItems.find(i => i.id === partId);
                      return item ? (
                        <Badge key={partId} variant="secondary" className="gap-1">
                          {item.itemName || item.name}
                          <button onClick={() => editRemoveFromArray('requiredParts', partId)} className="ml-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-red-600"><X className="h-3 w-3" /></button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                  <Select onValueChange={v => editAddToArray('requiredParts', v)}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Add spare part..." /></SelectTrigger>
                    <SelectContent>
                      {editInventoryItems.filter(i => !(editForm.requiredParts || []).includes(i.id)).slice(0, 50).map(i => (
                        <SelectItem key={i.id} value={i.id}>{i.itemName || i.name}{i.itemCode ? ` [${i.itemCode}]` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>}

                {/* Required Tools */}
                {toolsEnabled && <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1"><Hammer className="h-3.5 w-3.5" />Required Tools</Label>
                  <div className="flex flex-wrap gap-1.5 min-h-[44px] p-2 border rounded-md bg-white">
                    {(editForm.requiredTools || []).length === 0 && <span className="text-sm text-muted-foreground">Select tools...</span>}
                    {(editForm.requiredTools || []).map((toolId: string) => {
                      const tool = editToolsData.find(t => t.id === toolId);
                      return tool ? (
                        <Badge key={toolId} variant="secondary" className="gap-1">
                          {tool.toolName || tool.name}
                          <button onClick={() => editRemoveFromArray('requiredTools', toolId)} className="ml-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-red-600"><X className="h-3 w-3" /></button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                  <Select onValueChange={v => editAddToArray('requiredTools', v)}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Add tool..." /></SelectTrigger>
                    <SelectContent>
                      {editToolsData.filter(t => !(editForm.requiredTools || []).includes(t.id)).slice(0, 50).map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.toolName || t.name}{t.toolCode ? ` [${t.toolCode}]` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>}
              </div>
            </div>

            {/* ── SECTION 4: Safety Notes (amber background) ── */}
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                <ShieldAlert className="h-4 w-4" />Safety Notes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">Safety Notes</Label>
                  <Textarea
                    value={editForm.safetyNotes || ''}
                    onChange={e => editUpdateField('safetyNotes', e.target.value)}
                    placeholder="Any safety hazards, precautions, or lockout/tagout requirements..."
                    rows={3}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><HardHat className="h-3.5 w-3.5" />PPE Required</Label>
                  <Input
                    className="min-h-[44px]"
                    value={editForm.ppeRequired || ''}
                    onChange={e => editUpdateField('ppeRequired', e.target.value)}
                    placeholder="e.g. Safety glasses, gloves, helmet, hearing protection"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">General Notes</Label>
                  <Textarea
                    value={editForm.notes || ''}
                    onChange={e => editUpdateField('notes', e.target.value)}
                    placeholder="Any additional notes or special instructions..."
                    rows={2}
                  />
                </div>
              </div>
            </div>

          </div>
      </ResponsiveDialog>
      ) : (
      /* ==================== MOBILE: Edit WO Stepper bottom sheet ==================== */
      <MobileStepperSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Work Order"
        description="Update work order details."
        steps={[
          { key: 'details', label: 'Details', icon: ClipboardCheck },
          { key: 'resources', label: 'Resources', icon: Users },
          { key: 'safety', label: 'Safety', icon: ShieldAlert },
        ]}
        actionLabel="Save Changes"
        actionLoading={actionLoading}
        onAction={handleEditWO}
        headerExtra={wo?.maintenanceRequest ? (
          <div className="bg-blue-50 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider">Request #</p>
                <p className="text-sm font-bold text-blue-900 mt-0.5">{(wo as any).maintenanceRequest?.requestNumber}</p>
              </div>
              {assetsEnabled && <div>
                <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider">Machine</p>
                <p className="text-sm font-bold text-blue-900 mt-0.5 truncate">{(wo as any).maintenanceRequest?.asset?.name || wo.assetName || '-'}</p>
              </div>}
              <div>
                <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider">Category</p>
                <p className="text-sm font-bold text-blue-900 mt-0.5 capitalize">{(wo as any).maintenanceRequest?.category || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider">Breakdown</p>
                <Badge variant={(wo as any).maintenanceRequest?.machineDownStatus ? 'destructive' : 'secondary'} className="text-xs">
                  {(wo as any).maintenanceRequest?.machineDownStatus ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider mb-1.5">Problem Description</p>
              <div className="bg-muted/50 rounded-xl p-3 text-sm text-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                {(wo as any).maintenanceRequest?.description || 'No description provided.'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Requested By</p>
                <p className="text-sm font-medium mt-0.5">{(wo as any).maintenanceRequest?.requester?.fullName || '-'}</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Date Sent</p>
                <p className="text-sm font-medium mt-0.5">{(wo as any).maintenanceRequest?.createdAt ? formatDateTime((wo as any).maintenanceRequest.createdAt) : '-'}</p>
              </div>
            </div>
          </div>
        ) : undefined}
      >
        {(stepKey) => stepKey === 'details' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Title *</Label>
              <Input className="min-h-[44px]" value={editForm.title || ''} onChange={e => editUpdateField('title', e.target.value)} placeholder="Work order title" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Description</Label>
              <Textarea value={editForm.description || ''} onChange={e => editUpdateField('description', e.target.value)} placeholder="Problem description..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Type</Label>
                <Select value={editForm.type || 'corrective'} onValueChange={v => editUpdateField('type', v)}>
                  <SelectTrigger className="min-h-[44px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakdown">Breakdown</SelectItem>
                    <SelectItem value="corrective">Corrective</SelectItem>
                    <SelectItem value="preventive">Preventive</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Priority</Label>
                <Select value={editForm.priority || 'medium'} onValueChange={v => editUpdateField('priority', v)}>
                  <SelectTrigger className="min-h-[44px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Trade Activity</Label>
              <Select value={editForm.tradeActivity || 'mechanical'} onValueChange={v => editUpdateField('tradeActivity', v)}>
                <SelectTrigger className="min-h-[44px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mechanical">Mechanical</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="civil">Civil</SelectItem>
                  <SelectItem value="facility">Facility</SelectItem>
                  <SelectItem value="workshop">Workshop</SelectItem>
                  <SelectItem value="instrumentation">Instrumentation</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Est. Hours</Label>
                <Input className="min-h-[44px]" value={editForm.estimatedHoursDisplay || editForm.estimatedHours || ''} onChange={e => editHandleEstHoursChange(e.target.value)} placeholder="2.5 or 2:30" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Scheduled</Label>
                <DateTimePicker value={editForm.scheduledDate || undefined} onChange={v => editUpdateField('scheduledDate', v || '')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Technical Description</Label>
              <Textarea className="rounded-xl min-h-[100px]" value={editForm.technicalDescription || ''} onChange={e => editUpdateField('technicalDescription', e.target.value)} placeholder="Detailed technical description..." rows={3} />
            </div>
          </div>
        ) : stepKey === 'resources' ? (
          <div className="space-y-4">
            <WorkerAssignmentSelector
              selectedWorkerIds={editForm.selectedWorkerIds || []}
              teamLeaderId={editForm.teamLeaderId || ''}
              onSelectedWorkersChange={(ids) => editUpdateField('selectedWorkerIds', ids)}
              onTeamLeaderChange={(id) => editUpdateField('teamLeaderId', id)}
              assignType={editForm.assignType || 'technician'}
              onAssignTypeChange={(type) => editUpdateField('assignType', type)}
              label="Resource Assignment"
            />
            {editForm.assignType === 'technician' && (
              <ResponsibleSupervisorSelect
                value={editForm.responsibleSupervisorId}
                onValueChange={(value) => editUpdateField('responsibleSupervisorId', value)}
              />
            )}
            {(inventoryEnabled || toolsEnabled) && <Accordion type="multiple" className="space-y-2">
              {inventoryEnabled && <AccordionItem value="parts" className="border rounded-xl px-1">
                <AccordionTrigger className="text-xs font-medium py-3 px-2">
                  <span className="flex items-center gap-1.5"><PackageSearch className="h-3.5 w-3.5" />Spare Parts {(editForm.requiredParts || []).length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5">{(editForm.requiredParts || []).length}</Badge>}</span>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-3 space-y-2">
                  {(editForm.requiredParts || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(editForm.requiredParts || []).map((partId: string) => {
                        const item = editInventoryItems.find(i => i.id === partId);
                        return item ? (
                          <Badge key={partId} variant="secondary" className="gap-1">
                            {item.itemName || item.name}
                            <button onClick={() => editRemoveFromArray('requiredParts', partId)} className="ml-0.5 h-5 w-5 flex items-center justify-center rounded-full hover:bg-red-100 hover:text-red-600"><X className="h-3 w-3" /></button>
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                  <Select onValueChange={v => editAddToArray('requiredParts', v)}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="+ Add spare part..." /></SelectTrigger>
                    <SelectContent>
                      {editInventoryItems.filter(i => !(editForm.requiredParts || []).includes(i.id)).slice(0, 50).map(i => (
                        <SelectItem key={i.id} value={i.id}>{i.itemName || i.name}{i.itemCode ? ` [${i.itemCode}]` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AccordionContent>
              </AccordionItem>}
              {toolsEnabled && <AccordionItem value="tools" className="border rounded-xl px-1">
                <AccordionTrigger className="text-xs font-medium py-3 px-2">
                  <span className="flex items-center gap-1.5"><Hammer className="h-3.5 w-3.5" />Tools {(editForm.requiredTools || []).length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5">{(editForm.requiredTools || []).length}</Badge>}</span>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-3 space-y-2">
                  {(editForm.requiredTools || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(editForm.requiredTools || []).map((toolId: string) => {
                        const tool = editToolsData.find(t => t.id === toolId);
                        return tool ? (
                          <Badge key={toolId} variant="secondary" className="gap-1">
                            {tool.toolName || tool.name}
                            <button onClick={() => editRemoveFromArray('requiredTools', toolId)} className="ml-0.5 h-5 w-5 flex items-center justify-center rounded-full hover:bg-red-100 hover:text-red-600"><X className="h-3 w-3" /></button>
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                  <Select onValueChange={v => editAddToArray('requiredTools', v)}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="+ Add tool..." /></SelectTrigger>
                    <SelectContent>
                      {editToolsData.filter(t => !(editForm.requiredTools || []).includes(t.id)).slice(0, 50).map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.toolName || t.name}{t.toolCode ? ` [${t.toolCode}]` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AccordionContent>
              </AccordionItem>}
            </Accordion>}
          </div>
        ) : stepKey === 'safety' ? (
          <div className="space-y-4">
            <div className="bg-amber-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-3">
                <ShieldAlert className="h-4 w-4" />Safety Information
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Safety Notes</Label>
                  <Textarea
                    className="rounded-xl min-h-[100px]"
                    value={editForm.safetyNotes || ''}
                    onChange={e => editUpdateField('safetyNotes', e.target.value)}
                    placeholder="Hazards, precautions, lockout/tagout..."
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1"><HardHat className="h-3.5 w-3.5" />PPE Required</Label>
                  <Input
                    className="h-12 rounded-xl"
                    value={editForm.ppeRequired || ''}
                    onChange={e => editUpdateField('ppeRequired', e.target.value)}
                    placeholder="Safety glasses, gloves, helmet..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">General Notes</Label>
                  <Textarea
                    className="rounded-xl min-h-[80px]"
                    value={editForm.notes || ''}
                    onChange={e => editUpdateField('notes', e.target.value)}
                    placeholder="Additional notes or instructions..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </MobileStepperSheet>
      )}

      {/* Time Log Dialog — Enterprise */}
      <ResponsiveDialog open={timeLogOpen} onOpenChange={(open) => { setTimeLogOpen(open); if (!open) setTlError(''); }} title="Log Time" description="Record time spent on this work order." footer={<Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={tlLoading || !!tlError} onClick={handleTimeLog}>{tlLoading ? 'Saving...' : 'Save Time Log'}</Button>}>
          <div className="space-y-4">
            {/* Team member selector — only team leader or admin */}
            {canLogForOthers && (wo?.teamMembers?.length > 0 || wo?.assignedToId) && (
              <div className="space-y-1.5">
                <Label>Log For</Label>
                <Select value={tlLoggedForUserId || undefined} onValueChange={(v) => setTlLoggedForUserId(v === '__self__' ? '' : v)}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Self (my own time)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__self__">Self (my own time)</SelectItem>
                    {wo.teamMembers?.map((tm: any) => (
                      tm.userId !== user?.id && (
                        <SelectItem key={tm.userId} value={tm.userId}>
                          {tm.user?.fullName || tm.userName || 'Unknown'}
                        </SelectItem>
                      )
                    ))}
                    {wo.assignedToId && wo.assignedToId !== user?.id && !wo.teamMembers?.some((tm: any) => tm.userId === wo.assignedToId) && (
                      <SelectItem key={wo.assignedToId} value={wo.assignedToId}>
                        {wo.assignee?.fullName || 'Assignee'}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {tlLoggedForUserId && (
                  <p className="text-xs text-amber-600">This will be logged as team time for the selected member.</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Activity Type</Label>
              <Select value={tlActivityType} onValueChange={setTlActivityType}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance"><span className="flex items-center gap-2"><Wrench className="h-3.5 w-3.5" /> Maintenance</span></SelectItem>
                  <SelectItem value="inspection"><span className="flex items-center gap-2"><Search className="h-3.5 w-3.5" /> Inspection</span></SelectItem>
                  <SelectItem value="testing"><span className="flex items-center gap-2"><FlaskConical className="h-3.5 w-3.5" /> Testing</span></SelectItem>
                  <SelectItem value="travel"><span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> Travel</span></SelectItem>
                  <SelectItem value="standby"><span className="flex items-center gap-2"><Hourglass className="h-3.5 w-3.5" /> Standby</span></SelectItem>
                  <SelectItem value="other"><span className="flex items-center gap-2"><MoreHorizontal className="h-3.5 w-3.5" /> Other</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time <span className="text-red-500">*</span></Label>
                <DateTimePicker
                  value={tlStartTime || undefined}
                  onChange={v => { setTlStartTime(v || ''); setTlError(''); }}
                  minDate={tlConstraints.minDate}
                  minTime={tlConstraints.minTime}
                  error={!tlStartTime ? undefined : tlError?.includes('Start date') || tlError?.includes('Start time') ? tlError : undefined}
                />
                <p className="text-[10px] text-muted-foreground">
                  {tlConstraints.minDate && <>Min: {tlConstraints.minDate}{tlConstraints.minTime ? ` ${tlConstraints.minTime}` : ''}</>}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <DateTimePicker
                  value={tlEndTime || undefined}
                  onChange={v => { setTlEndTime(v || ''); setTlError(''); }}
                  minDate={tlStartTime ? tlStartTime.slice(0, 10) : tlConstraints.minDate}
                  minTime={tlStartTime && tlStartTime.slice(0, 10) === tlConstraints.minDate ? tlConstraints.minTime : tlStartTime ? tlStartTime.slice(11, 16) : undefined}
                  error={tlError?.includes('End time') ? tlError : undefined}
                />
                <p className="text-[10px] text-muted-foreground">Leave blank if ongoing</p>
              </div>
            </div>
            {/* Auto-calculated duration preview */}
            {tlStartTime && tlEndTime && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-800">
                    Duration: {
                      (() => {
                        const ms = new Date(tlEndTime).getTime() - new Date(tlStartTime).getTime();
                        const totalMin = ms / 60000 - (parseInt(tlBreakMinutes) || 0);
                        const h = Math.floor(Math.max(0, totalMin) / 60);
                        const m = Math.floor(Math.max(0, totalMin) % 60);
                        return `${h}h ${m}m`;
                      })()
                    }
                  </span>
                </div>
                <p className="text-[10px] text-emerald-600 mt-0.5">Auto-calculated from start/end times</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Break (minutes)</Label>
              <Input className="min-h-[44px]" type="number" min="0" max="480" value={tlBreakMinutes} onChange={e => setTlBreakMinutes(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={tlNotes} onChange={e => setTlNotes(e.target.value)} placeholder="What was done during this time..." rows={2} />
            </div>
            {/* Error display */}
            {tlError && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-600">{tlError}</p>
              </div>
            )}
            <div className="p-2.5 rounded-lg bg-muted/50">
              <p className="text-[11px] text-muted-foreground">
                <strong>Tip:</strong> Set start &amp; end times for auto-calculation. Leave end blank for ongoing work.
              </p>
            </div>
          </div>
      </ResponsiveDialog>

      {/* Delete Time Log Confirm */}
      <ResponsiveDialog open={!!deleteTlId} onOpenChange={(open) => { if (!open) setDeleteTlId(null); }} title="Delete Time Log" description="Are you sure? This will reduce the work order's total hours." footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setDeleteTlId(null)}>Cancel</Button><Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteTlId && handleDeleteTimeLog(deleteTlId)}>Delete</Button></div>}>
          <p className="text-sm text-muted-foreground">This action cannot be undone. The work order's actual hours will be recalculated.</p>
      </ResponsiveDialog>

      {/* Pause Reason Dialog */}
      <ResponsiveDialog open={pauseDialogOpen} onOpenChange={(open) => { if (!open) { setPauseDialogOpen(false); setPauseReason(''); setPauseNotes(''); } }} title="Pause Work" description="Select a reason for pausing. You can resume or switch to another work order after." footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => { setPauseDialogOpen(false); setPauseReason(''); setPauseNotes(''); }}>Cancel</Button><Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white" disabled={pauseLoading || !pauseReason} onClick={() => handleQuickTimeAction('pause', pauseReason)}>{pauseLoading ? 'Pausing...' : 'Pause'}</Button></div>}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'break', label: 'Take a Break', icon: <Hourglass className="h-5 w-5" />, desc: 'Lunch, rest, personal', color: 'border-amber-200 bg-amber-50 hover:border-amber-400' },
                { value: 'switch_wo', label: 'Switch WO', icon: <ArrowRightLeft className="h-5 w-5" />, desc: 'Work on another order', color: 'border-sky-200 bg-sky-50 hover:border-sky-400' },
                { value: 'waiting_parts', label: 'Waiting Parts', icon: <Package className="h-5 w-5" />, desc: 'Awaiting materials/tools', color: 'border-violet-200 bg-violet-50 hover:border-violet-400' },
                { value: 'other', label: 'Other', icon: <MoreHorizontal className="h-5 w-5" />, desc: 'Different reason', color: 'border-gray-200 bg-gray-50 hover:border-gray-400' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPauseReason(opt.value)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${pauseReason === opt.value ? `${opt.color} ring-2 ring-offset-1 ring-current` : 'border-muted bg-background hover:bg-muted/50'}`}
                >
                  <div className={`mb-1 ${pauseReason === opt.value ? 'text-amber-700' : 'text-muted-foreground'}`}>{opt.icon}</div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea value={pauseNotes} onChange={e => setPauseNotes(e.target.value)} placeholder="Any additional details..." rows={2} />
            </div>
          </div>
      </ResponsiveDialog>

      {/* Add Material Dialog — pick from inventory */}
      <ResponsiveDialog open={materialOpen} onOpenChange={(open) => { setMaterialOpen(open); if (!open) { setMatItemId(''); setMatItemName(''); setMatQty(''); setMatReason(''); setMatUrgency('normal'); }}} title="Request Material" description="Select a material or part from inventory. It will go through supervisor and store approval." footer={<Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={matLoading || !matItemId} onClick={handleAddMaterial}>{matLoading ? 'Requesting...' : 'Submit Request'}</Button>}>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-800 font-medium">📋 Approval Workflow</p>
              <p className="text-xs text-amber-700 mt-1">Your request will be reviewed by a <strong>Supervisor</strong>, then <strong>Store/Shop</strong> before materials are issued.</p>
            </div>
            <div className="space-y-1.5"><Label>Item *</Label>
              <AsyncSearchableSelect
                value={matItemId}
                onValueChange={(val) => {
                  setMatItemId(val);
                }}
                fetchOptions={async () => {
                  const res = await api.get('/api/inventory?mode=lookup&limit=100');
                  if (res.success && res.data) {
                    const items = Array.isArray(res.data) ? res.data : (res.data as any).items || [];
                    return items.map((item: any) => ({
                      value: item.id,
                      label: `${item.itemName || item.name}${item.itemCode ? ` (${item.itemCode})` : ''}${item.unitOfMeasure ? ` — ${item.currentStock ?? 0} ${item.unitOfMeasure} in stock` : ''}`,
                    }));
                  }
                  return [];
                }}
                placeholder="Search inventory items..."
                searchPlaceholder="Search by name or part number..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Quantity</Label><Input className="min-h-[44px]" type="number" value={matQty} onChange={e => setMatQty(e.target.value)} placeholder="1" /></div>
              <div className="space-y-1.5"><Label>Unit</Label>
                <Select value={matUnit} onValueChange={setMatUnit}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="each">Each</SelectItem><SelectItem value="kg">Kg</SelectItem><SelectItem value="meter">Meter</SelectItem><SelectItem value="set">Set</SelectItem><SelectItem value="box">Box</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Urgency</Label>
                <Select value={matUrgency} onValueChange={setMatUrgency}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div></div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Textarea value={matReason} onChange={e => setMatReason(e.target.value)} placeholder="Why is this material needed? (e.g., replacing worn bearing, spare part for pump repair)" rows={2} />
            </div>
          </div>
      </ResponsiveDialog>

      {/* ═══════ Request Tool Dialog ═══════ */}
      <ResponsiveDialog open={toolReqOpen} onOpenChange={(open) => { setToolReqOpen(open); if (!open) resetToolReqForm(); }} title="Request Tools" description="Request one or more tools for this work order. Goes through supervisor → store approval." footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setToolReqOpen(false)}>Cancel</Button><Button className="bg-orange-600 hover:bg-orange-700 text-white" disabled={toolReqSubmitting || toolReqItems.filter(i => i.toolId && i.toolName.trim()).length === 0 || toolReqReason.trim().length < 5} onClick={handleToolRequest}>{toolReqSubmitting ? 'Submitting...' : 'Submit Request'}</Button></div>}>
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
            <p className="text-xs text-orange-800 font-medium">📋 Approval Workflow</p>
            <p className="text-xs text-orange-700 mt-1">Your request will be reviewed by a <strong>Supervisor</strong>, then <strong>Store/Shop</strong> before tools are issued.</p>
          </div>
          {/* Tool Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Tools *</Label>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={addToolReqItem}><Plus className="h-3 w-3" /> Add Another Tool</Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {toolReqItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2.5 bg-muted/30 rounded-lg border">
                  <span className="text-xs text-muted-foreground font-medium shrink-0 w-5">#{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <AsyncSearchableSelect
                      value={item.toolId}
                      onValueChange={(val) => {
                        const cached = toolsLookupCache.current.find(t => t.id === val);
                        updateToolReqItem(idx, { toolId: val, toolName: cached?.name || '', toolCode: cached?.toolCode || '' });
                      }}
                      fetchOptions={async () => {
                        const res = await api.get('/api/tools?mode=lookup&limit=100');
                        if (res.success && Array.isArray(res.data)) {
                          toolsLookupCache.current = res.data.map((t: any) => ({ id: t.id, name: t.name || '', toolCode: t.toolCode || '' }));
                          return res.data.map((t: any) => ({ value: t.id, label: `${t.name}${t.toolCode ? ` (${t.toolCode})` : ''}` }));
                        }
                        return [];
                      }}
                      placeholder="Search tools..."
                      searchPlaceholder="Search by name or code..."
                    />
                  </div>
                  <div className="w-16 shrink-0">
                    <Input type="number" min="1" value={item.quantityRequested} onChange={e => updateToolReqItem(idx, { quantityRequested: parseInt(e.target.value) || 1 })} className="h-9 text-center" />
                  </div>
                  {toolReqItems.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => removeToolReqItem(idx)}><X className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label>Urgency</Label>
            <div className="flex gap-2 mt-1">
              {(['low', 'normal', 'high', 'critical'] as const).map(u => (
                <button key={u} onClick={() => setToolReqUrgency(u)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-all ${toolReqUrgency === u ? (URGENCY_CFG[u]?.color || 'bg-gray-100') + ' ring-2 ring-offset-1 ring-gray-300' : 'border-gray-200 text-muted-foreground hover:border-gray-300'}`}>
                  <span className={`h-2 w-2 rounded-full ${URGENCY_CFG[u]?.dotColor || 'bg-gray-400'}`} />{URGENCY_CFG[u]?.label || u}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5"><Label>Reason * <span className="text-xs text-muted-foreground">(min 5 chars)</span></Label>
            <Textarea value={toolReqReason} onChange={e => setToolReqReason(e.target.value)} placeholder="Why are these tools needed for this work order?" rows={2} />
          </div>
        </div>
      </ResponsiveDialog>

      {/* ═══════ Transfer Tool Dialog ═══════ */}
      <ResponsiveDialog open={toolXferOpen} onOpenChange={(open) => { setToolXferOpen(open); if (!open) resetToolXferForm(); }} title="Transfer Tool" description="Transfer a tool from this work order to another technician. Store keeper approval required." footer={<Button className="w-full bg-teal-600 hover:bg-teal-700 text-white" disabled={toolXferSubmitting || !toolXferToolId || !toolXferToUserId || toolXferReason.trim().length < 5} onClick={handleToolTransfer}>{toolXferSubmitting ? 'Submitting...' : 'Submit Transfer Request'}</Button>}>
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-teal-50 border border-teal-200">
            <p className="text-xs text-teal-800 font-medium">🔄 Transfer Workflow</p>
            <p className="text-xs text-teal-700 mt-1">Only <strong>issued tools</strong> from this WO are shown. Already transferred or returned tools are excluded.</p>
          </div>
          <div className="space-y-1.5"><Label>Tool *</Label>
            <AsyncSearchableSelect
              value={toolXferToolId}
              onValueChange={(val) => {
                const cached = woToolOptions.current.find(t => t.value === val);
                setToolXferToolId(val);
                setToolXferToolName(cached?.name || '');
              }}
              fetchOptions={async () => {
                // Only show tools from this WO's issued requests (not transferred/returned)
                const options: { value: string; label: string; id: string; name: string; toolDbId: string | null }[] = [];
                if (wo?.repairToolRequests) {
                  for (const tr of wo.repairToolRequests as any[]) {
                    if (!['issued', 'pending_return'].includes(tr.status)) continue;
                    if (tr.items && tr.items.length > 0) {
                      for (const item of tr.items) {
                        const issued = item.quantityIssued || 0;
                        const returned = item.quantityReturned || 0;
                        const transferred = item.quantityTransferred || 0;
                        const outstanding = issued - returned - transferred;
                        if (outstanding > 0) {
                          // Use actual Tool DB ID if available, otherwise fall back to item ID
                          const actualToolId = item.tool?.id || item.toolId || item.id;
                          const entry = { value: actualToolId, label: `${item.toolName || 'Tool'}${item.toolCode ? ` (${item.toolCode})` : ''} — ${outstanding} available`, id: `${tr.id}__${item.id}`, name: item.toolName || '', toolDbId: item.tool?.id || item.toolId || null };
                          options.push(entry);
                        }
                      }
                    } else if (tr.toolName) {
                      const issued = tr.quantityIssued || 0;
                      const returned = tr.quantityReturned || 0;
                      const transferred = tr.quantityTransferred || 0;
                      const outstanding = issued - returned - transferred;
                      if (outstanding > 0) {
                        const actualToolId = tr.tool?.id || tr.toolId || tr.id;
                        options.push({ value: actualToolId, label: `${tr.toolName}${tr.tool?.toolCode ? ` (${tr.tool.toolCode})` : ''} — ${outstanding} available`, id: tr.id, name: tr.toolName, toolDbId: tr.tool?.id || tr.toolId || null });
                      }
                    }
                  }
                }
                woToolOptions.current = options;
                return options;
              }}
              placeholder={wo?.repairToolRequests?.some((tr: any) => ['issued', 'pending_return'].includes(tr.status)) ? 'Select tool from this WO...' : 'No issued tools available on this WO'}
              searchPlaceholder="Search tools..."
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 mb-1.5">
              <Label>From (You)</Label>
              <Badge variant="outline" className="text-xs">{user?.fullName}</Badge>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Transfer To *</Label>
            <AsyncSearchableSelect
              value={toolXferToUserId}
              onValueChange={(val) => { setToolXferToUserId(val); }}
              fetchOptions={async (query) => {
                if (!toolXferToolId) return [];
                const params = new URLSearchParams({ toolId: toolXferToolId });
                if (query.trim()) params.set('search', query.trim());
                const res = await api.get(`/api/repairs/tool-transfers/candidates?${params.toString()}`);
                const candidates = res.success && Array.isArray(res.data?.candidates)
                  ? res.data.candidates
                  : [];
                return candidates.map((u: any) => ({
                  value: u.id,
                  label: `${u.fullName}${u.staffId ? ` [${u.staffId}]` : u.username ? ` (${u.username})` : ''}`,
                }));
              }}
              placeholder="Select technician..."
              searchPlaceholder="Search technicians..."
            />
          </div>
          <div className="space-y-1.5"><Label>Reason * <span className="text-xs text-muted-foreground">(min 5 chars)</span></Label>
            <Textarea value={toolXferReason} onChange={e => setToolXferReason(e.target.value)} placeholder="Why is this transfer needed?" rows={2} />
          </div>
        </div>
      </ResponsiveDialog>

      {/* ═══════ Log Downtime Dialog ═══════ */}
      <ResponsiveDialog open={downtimeOpen} onOpenChange={(open) => { setDowntimeOpen(open); if (!open) resetDowntimeForm(); }} title="Log Downtime" description={`Record downtime for ${wo?.assetName || 'this asset'} on WO ${wo?.woNumber || ''}`} footer={<Button className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={downtimeSubmitting || !dtReason.trim() || !dtDurationMinutes || parseFloat(dtDurationMinutes) <= 0} onClick={handleDowntime}>{downtimeSubmitting ? 'Saving...' : 'Log Downtime'}</Button>}>
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-red-50 border border-red-200">
            <p className="text-xs text-red-800 font-medium">⚠️ Downtime Recording</p>
            <p className="text-xs text-red-700 mt-1">This will be recorded against <strong>WO {wo?.woNumber || ''}</strong> and asset <strong>{wo?.assetName || 'N/A'}</strong>.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Category</Label>
              <Select value={dtCategory} onValueChange={setDtCategory}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="unplanned">Unplanned</SelectItem><SelectItem value="planned">Planned</SelectItem><SelectItem value="partial">Partial</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Impact Level</Label>
              <Select value={dtImpactLevel} onValueChange={setDtImpactLevel}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Duration * <span className="text-xs text-muted-foreground font-normal">How long was the asset down?</span></Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <Input type="number" min="1" step="1" value={dtDurationMinutes} onChange={e => setDtDurationMinutes(e.target.value)} placeholder="e.g. 120" className="min-h-[44px] pr-12" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">min</span>
              </div>
              {dtDurationMinutes && parseFloat(dtDurationMinutes) > 0 && (
                <div className="flex items-center text-xs text-muted-foreground bg-muted/50 rounded-lg px-3">
                  <Clock className="h-3.5 w-3.5 mr-1.5 text-red-500" />
                  {parseFloat(dtDurationMinutes) >= 60
                    ? `${Math.floor(parseFloat(dtDurationMinutes) / 60)}h ${Math.round(parseFloat(dtDurationMinutes) % 60)}m`
                    : `${parseFloat(dtDurationMinutes)}m`}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Production Loss (₵) <span className="text-xs text-muted-foreground font-normal">Estimated monetary loss — optional</span></Label>
            <Input type="number" step="0.01" value={dtProductionLoss} onChange={e => setDtProductionLoss(e.target.value)} placeholder="e.g. 500.00" />
          </div>
          <div className="space-y-1.5"><Label>Reason * <span className="text-xs text-muted-foreground font-normal">Why was the asset down?</span></Label><Textarea value={dtReason} onChange={e => setDtReason(e.target.value)} placeholder="Describe the downtime reason..." rows={2} /></div>
        </div>
      </ResponsiveDialog>

      {/* ═══════ Return Spare Part / Material Dialog ═══════ */}
      <ResponsiveDialog open={spareReturnOpen} onOpenChange={(open) => { setSpareReturnOpen(open); if (!open) resetSpareReturnForm(); }} title="Return Material" description={spareReturnLinkedMR ? `Returning material from request — ${spareReturnLinkedMR.itemName}` : 'Register a material removed from the machine for return or disposal.'} footer={<Button className="w-full bg-violet-600 hover:bg-violet-700 text-white" disabled={spareReturnSubmitting || !spareReturnItemName.trim()} onClick={handleSpareReturn}>{spareReturnSubmitting ? 'Submitting...' : spareReturnIsReusable ? 'Submit for Return & Refurbishment' : 'Record as Consumed'}</Button>}>
        <div className="space-y-4">
          {/* Linked material request banner */}
          {spareReturnLinkedMR && (
            <div className="p-3 rounded-lg bg-sky-50 border border-sky-200">
              <p className="text-xs text-sky-800 font-medium">📋 Linked Material Request</p>
              <div className="flex items-center gap-3 text-xs text-sky-700 mt-1">
                <span>{spareReturnLinkedMR.itemName}</span>
                <span>Issued: <strong>{spareReturnLinkedMR.quantityIssued || spareReturnLinkedMR.quantityRequested}</strong></span>
              </div>
            </div>
          )}

          {/* Reusable vs Consumed toggle */}
          <div className="p-3 rounded-lg border space-y-3">
            <div className="flex items-center gap-3">
              <Switch id="spareReusable" checked={spareReturnIsReusable} onCheckedChange={(v) => {
                setSpareReturnIsReusable(!!v);
                if (!v) setSpareReturnNeedsRefurb(false);
              }} />
              <div>
                <Label htmlFor="spareReusable" className="text-sm font-medium cursor-pointer">Returnable / Reusable</Label>
                <p className="text-[11px] text-muted-foreground">{spareReturnIsReusable ? 'Part will go through inspection → refurbishment → storeroom return' : 'Part was consumed during repair and cannot be returned'}</p>
              </div>
            </div>
            {spareReturnIsReusable && (
              <div className="ml-9 p-2.5 rounded-lg bg-violet-50 border border-violet-100">
                <p className="text-[11px] text-violet-800 font-medium">♻️ Return Lifecycle</p>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-violet-700">
                  <span className="bg-violet-100 rounded px-1.5 py-0.5">Pending</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="bg-violet-100 rounded px-1.5 py-0.5">Inspect</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="bg-violet-100 rounded px-1.5 py-0.5">Refurbish</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="bg-emerald-100 text-emerald-800 rounded px-1.5 py-0.5">Return to Store</span>
                </div>
              </div>
            )}
          </div>

          {!spareReturnLinkedMR && (
            <div className="space-y-1.5"><Label>Item Name *</Label><Input value={spareReturnItemName} onChange={e => setSpareReturnItemName(e.target.value)} placeholder="Part/material name" className="min-h-[44px]" /></div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" min="1" value={spareReturnQty} onChange={e => setSpareReturnQty(e.target.value)} className="min-h-[44px]" /></div>
            {spareReturnIsReusable && (
              <div className="space-y-1.5"><Label>Condition</Label>
                <Select value={spareReturnCondition} onValueChange={setSpareReturnCondition}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem><SelectItem value="good">Good</SelectItem><SelectItem value="used">Used</SelectItem><SelectItem value="fair">Fair</SelectItem><SelectItem value="poor">Poor</SelectItem><SelectItem value="damaged">Damaged</SelectItem><SelectItem value="worn">Worn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {spareReturnIsReusable && (
            <>
              <div className="space-y-1.5"><Label>Damage/Wear Description</Label><Textarea value={spareReturnDamageDesc} onChange={e => setSpareReturnDamageDesc(e.target.value)} placeholder="Describe any damage or wear..." rows={2} /></div>
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Checkbox id="spareRefurb" checked={spareReturnNeedsRefurb} onCheckedChange={v => setSpareReturnNeedsRefurb(!!v)} />
                <Label htmlFor="spareRefurb" className="text-sm cursor-pointer">Needs Refurbishment</Label>
                <span className="text-[10px] text-muted-foreground ml-auto">{spareReturnNeedsRefurb ? 'Will go through refurb process' : 'Can return directly'}</span>
              </div>
            </>
          )}
        </div>
      </ResponsiveDialog>

      {/* Reason Dialog (for transitions requiring a reason like cancel, hold) */}
      <ResponsiveDialog open={actionDialog?.startsWith('reason:') || false} onOpenChange={() => setActionDialog(null)} title="Confirm Action" description="Please provide a reason for this action.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Textarea id="transition-reason" placeholder="Enter reason..." rows={3} />
            </div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={actionLoading} onClick={() => {
              const reason = (document.getElementById('transition-reason') as HTMLTextAreaElement)?.value;
              if (!reason?.trim()) { toast.error('Reason is required'); return; }
              const actionName = actionDialog?.replace('reason:', '') || '';
              handleAction(actionName, { notes: reason });
            }}>
              {actionLoading ? 'Processing...' : 'Confirm'}
            </Button>
          </div>
      </ResponsiveDialog>

      {/* WO Action Confirmation Dialog */}
      <ConfirmDialog
        open={!!woConfirmAction}
        onOpenChange={(open) => { if (!open) setWoConfirmAction(null); }}
        title={`Confirm Work Order Action`}
        description={woConfirmAction?.description || 'Are you sure you want to proceed with this action?'}
        confirmLabel={woConfirmAction?.label || 'Confirm'}
        variant={woConfirmAction?.variant || 'default'}
        loading={actionLoading}
        onConfirm={() => {
          if (woConfirmAction) {
            handleAction(woConfirmAction.action);
            setWoConfirmAction(null);
          }
        }}
      />

      {/* Body — stacked vertically for sheet width */}
      <div className="pb-6 space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{wo.description || 'No description'}</p></CardContent>
          </Card>

          {/* Comments */}
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">Comments ({wo.comments?.length || 0})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add comment..." disabled={isWOFinalized} onKeyDown={e => e.key === 'Enter' && !isWOFinalized && handleComment()} />
                <Button size="icon" className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0" disabled={isWOFinalized} onClick={handleComment}><MessageSquare className="h-4 w-4" /></Button>
              </div>
              <ScrollArea className="max-h-64">
                {wo.comments?.map(c => (
                  <div key={c.id} className="flex gap-3 py-2 border-b last:border-0">
                    <Avatar className="h-7 w-7 shrink-0"><AvatarFallback className="text-[10px]">{getInitials(c.user?.fullName || c.userName || 'U')}</AvatarFallback></Avatar>
                    <div>
                      <p className="text-xs"><span className="font-medium">{c.user?.fullName || c.userName || 'Unknown'}</span> <span className="text-muted-foreground">{timeAgo(c.createdAt)}</span></p>
                      <p className="text-sm mt-0.5">{c.content}</p>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Attachments */}
          <FileUpload entityType="work_order" entityId={id} />

          {/* Time Logs — Enterprise with Session Controls */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle className="text-base">Time Logs</CardTitle><CardDescription className="text-xs">{wo.timeLogs?.length || 0} entries · {formatDuration(wo.actualHours || 0)} total</CardDescription></div>
              <div className="flex items-center gap-2">
                {/* Context-aware action buttons */}
                {isActiveOnThisWO && !workActionDisabled && (
                  <>
                    <Button size="sm" variant="outline" className="gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50" disabled={tlLoading} onClick={() => { setPauseReason(''); setPauseNotes(''); setPauseDialogOpen(true); }}>
                      {tlLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                      Pause
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50" disabled={tlLoading} onClick={() => handleQuickTimeAction('complete')}>
                      <StopCircle className="h-3.5 w-3.5" />
                      Stop
                    </Button>
                  </>
                )}
                {!isActiveOnThisWO && !isActiveOnOtherWO && !workActionDisabled && (
                  <>
                    {hasPausedSession && (
                      <Button size="sm" variant="outline" className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50" disabled={tlLoading} onClick={() => handleQuickTimeAction('resume')}>
                        {tlLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        Resume
                      </Button>
                    )}
                    <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={tlLoading} onClick={() => handleQuickTimeAction('start')}>
                      {tlLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      {hasPausedSession ? 'Start New Session' : 'Start Work'}
                    </Button>
                  </>
                )}
                {isActiveOnOtherWO && !workActionDisabled && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-300" disabled>
                    <AlertCircle className="h-3.5 w-3.5" />
                    Busy on WO #{globalActiveSession?.workOrderNumber}
                  </Button>
                )}
                {canPerformWorkActions && <Button size="sm" variant="ghost" className="gap-1.5" disabled={isWOFinalized} onClick={() => { setTlStartTime(''); setTlEndTime(''); setTlActivityType('maintenance'); setTlBreakMinutes(''); setTlNotes(''); setTlLoggedForUserId(''); setTlAction('start'); setTlError(''); setTimeLogOpen(true); }} title="Log time"><Clock className="h-3.5 w-3.5" /></Button>}
              </div>
            </CardHeader>
            <CardContent>
              {/* Active Session Banner — running on THIS WO */}
              {isActiveOnThisWO && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center animate-pulse">
                      <Timer className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Active Session</p>
                      <p className="text-lg font-bold font-mono text-emerald-700">{sessionDuration !== null ? formatSessionDuration(sessionDuration) : '...'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-medium text-emerald-700">Recording</span>
                  </div>
                </div>
              )}

              {/* Active on OTHER WO — warning banner */}
              {isActiveOnOtherWO && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Active Session on Another Work Order</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        You are currently working on <button onClick={() => navigate('wo-detail', { id: globalActiveSession?.workOrderId })} className="underline font-medium hover:text-amber-900">WO #{globalActiveSession?.workOrderNumber}</button> since {globalActiveSession?.startedAt ? formatDateTime(globalActiveSession?.startedAt) : 'unknown'}.
                        Pause that work order first before starting work here.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Paused session indicator */}
              {hasPausedSession && !isActiveOnThisWO && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
                  <Pause className="h-4 w-4 text-amber-600" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Paused</p>
                    <p className="text-xs text-amber-700">Click "Resume" to continue working on this WO.</p>
                  </div>
                </div>
              )}

              {/* Summary Bar */}
              <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center"><Clock className="h-4 w-4" /></div>
                  <div><p className="text-[10px] text-muted-foreground uppercase">Total</p><p className="text-sm font-bold">{formatDuration(wo.actualHours || 0)}</p></div>
                </div>
                {wo.actualStart && (
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center"><Play className="h-4 w-4" /></div>
                    <div><p className="text-[10px] text-muted-foreground uppercase">Started</p><p className="text-xs font-bold">{formatDateTime(wo.actualStart)}</p></div>
                  </div>
                )}
              </div>
              {(!wo.timeLogs || wo.timeLogs.length === 0) ? (
                <div className="text-center py-6">
                  <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No time logs recorded yet.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Click "Start Work" to begin tracking your time.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {wo.timeLogs.map((tl: any) => {
                    const actType = tl.activityType || 'maintenance';
                    const actColors: Record<string, string> = {
                      maintenance: 'bg-emerald-100 text-emerald-700',
                      inspection: 'bg-blue-100 text-blue-700',
                      testing: 'bg-violet-100 text-violet-700',
                      travel: 'bg-amber-100 text-amber-700',
                      standby: 'bg-slate-100 text-slate-700',
                      other: 'bg-gray-100 text-gray-700',
                    };
                    const actIcons: Record<string, React.ElementType> = {
                      maintenance: Wrench, inspection: Search, testing: FlaskConical,
                      travel: MapPin, standby: Hourglass, other: MoreHorizontal,
                    };
                    const ActIcon = actIcons[actType] || MoreHorizontal;

                    // Action icon + color for session state
                    const actionStyles: Record<string, { icon: React.ElementType; color: string; label: string }> = {
                      start: { icon: Play, color: 'bg-emerald-100 text-emerald-700', label: 'Started' },
                      pause: { icon: Pause, color: 'bg-amber-100 text-amber-700', label: 'Paused' },
                      resume: { icon: Play, color: 'bg-sky-100 text-sky-700', label: 'Resumed' },
                      complete: { icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-700', label: 'Completed' },
                    };
                    const actionStyle = actionStyles[tl.action] || actionStyles.start;
                    const ActionIcon = actionStyle.icon;
                    const durStr = tl.duration ? formatDuration(tl.duration) : '—';

                    return (
                      <div key={tl.id} className="flex items-start gap-3 text-sm py-2.5 border-b last:border-0 group">
                        {/* Session action icon */}
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${actionStyle.color}`}>
                          <ActionIcon className="h-3.5 w-3.5" />
                        </div>
                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium capitalize text-xs">{actionStyle.label}</p>
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 gap-0.5">
                              <ActIcon className="h-2.5 w-2.5" />
                              {actType}
                            </Badge>
                            {tl.pauseReason && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">
                                {tl.pauseReason === 'break' ? 'Break' : tl.pauseReason === 'switch_wo' ? 'Switch WO' : tl.pauseReason === 'waiting_parts' ? 'Waiting Parts' : 'Other'}
                              </Badge>
                            )}
                            {tl.breakMinutes > 0 && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0">-{tl.breakMinutes}m break</Badge>
                            )}
                            {(tl as any).isTeamLog && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">team</Badge>
                            )}
                          </div>
                          {/* Time range */}
                          <p className="text-xs text-muted-foreground">
                            {tl.startTime ? formatDateTime(tl.startTime) : formatDateTime(tl.timestamp || tl.createdAt)}
                            {tl.endTime && tl.startTime && (
                              <> → {formatDateTime(tl.endTime)}</>
                            )}
                          </p>
                          {/* Worker */}
                          <p className="text-xs text-muted-foreground">
                            {tl.user?.fullName || tl.userName || 'Unknown'}
                            {(tl as any).loggedBy && (
                              <span className="text-amber-600"> (by {tl.loggedBy.fullName})</span>
                            )}
                          </p>
                          {/* Notes */}
                          {tl.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{tl.notes}</p>}
                        </div>
                        {/* Duration + delete */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {tl.duration != null && tl.duration > 0 && (
                            <Badge variant="outline" className="text-[10px] font-mono">{durStr}</Badge>
                          )}
                          {!workActionDisabled && (
                            <button
                              onClick={() => setDeleteTlId(tl.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-0.5"
                              title="Delete time log"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Suggested Materials & Tools — Planner's suggestions */}
          {(() => {
            const hasSuggestedItems = suggestedParts.length > 0 || suggestedTools.length > 0;
            const pendingSuggestedCount = [...suggestedParts, ...suggestedTools].filter((item: any) => item.pipelineStatus === 'suggested').length;
            return hasSuggestedItems ? (
          <Card className="border-0 shadow-sm border-l-4 border-l-violet-400">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-violet-600" />
                  Suggested Materials & Tools
                </CardTitle>
                <CardDescription className="text-xs">
                  Planner-suggested items for this work order
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {pendingSuggestedCount > 0 && (
                  <Button size="sm" variant="outline" className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
                    onClick={handleSendToStore}
                  >
                    <Warehouse className="h-3.5 w-3.5" />
                    Send to Store ({pendingSuggestedCount})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Suggested Parts */}
              {materialResourcesEnabled && suggestedParts.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                    <PackageSearch className="h-3 w-3" /> Spare Parts ({suggestedParts.length})
                  </p>
                  <div className="space-y-1.5">
                    {suggestedParts.map((part: any) => (
                      <div key={part.id || part.itemId} className="flex items-center gap-3 p-2.5 rounded-lg border bg-violet-50/30">
                        <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                          <Package className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{part.itemName}</p>
                          {part.itemCode && <p className="text-[10px] font-mono text-muted-foreground">{part.itemCode}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">Qty:</span>
                          <span className="text-sm font-semibold">{part.quantity} {part.unit || ''}</span>
                          {part.pipelineStatus && part.pipelineStatus !== 'suggested' && (
                            <Badge variant="outline" className={`text-[10px] ${
                              part.pipelineStatus === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              part.pipelineStatus === 'issued' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              part.pipelineStatus === 'rejected' ? 'bg-red-50 text-red-600 border-red-200' :
                              'bg-gray-50 border-gray-200'
                            }`}>{part.pipelineStatus.replace(/_/g, ' ')}</Badge>
                          )}
                          {!workActionDisabled && part.pipelineStatus === 'pending' && (
                            <button onClick={() => handleRejectSuggestedItem('part', part.itemId)}
                              className="min-h-[32px] min-w-[32px] flex items-center justify-center text-muted-foreground hover:text-red-600 rounded hover:bg-red-50">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Tools */}
              {toolResourcesEnabled && suggestedTools.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                    <Hammer className="h-3 w-3" /> Tools ({suggestedTools.length})
                  </p>
                  <div className="space-y-1.5">
                    {suggestedTools.map((tool: any) => (
                      <div key={tool.id || tool.toolId} className="flex items-center gap-3 p-2.5 rounded-lg border bg-violet-50/30">
                        <div className="h-7 w-7 rounded-md bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                          <Wrench className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tool.toolName}</p>
                          {tool.toolCode && <p className="text-[10px] font-mono text-muted-foreground">{tool.toolCode}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">Qty:</span>
                          <span className="text-sm font-semibold">{tool.quantity}</span>
                          {tool.pipelineStatus && tool.pipelineStatus !== 'suggested' && (
                            <Badge variant="outline" className={`text-[10px] ${
                              tool.pipelineStatus === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              tool.pipelineStatus === 'issued' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              tool.pipelineStatus === 'rejected' ? 'bg-red-50 text-red-600 border-red-200' :
                              'bg-gray-50 border-gray-200'
                            }`}>{tool.pipelineStatus.replace(/_/g, ' ')}</Badge>
                          )}
                          {!workActionDisabled && tool.pipelineStatus === 'pending' && (
                            <button onClick={() => handleRejectSuggestedItem('tool', tool.toolId)}
                              className="min-h-[32px] min-w-[32px] flex items-center justify-center text-muted-foreground hover:text-red-600 rounded hover:bg-red-50">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Technician: Add new item button */}
              {!workActionDisabled && (
                <div className="mt-3 flex items-center gap-2">
                  {materialResourcesEnabled && <Button size="sm" variant="ghost" className="gap-1 text-xs text-violet-600" onClick={() => setSuggestedPartDialogOpen(true)}>
                    <Plus className="h-3 w-3" /> Add Part
                  </Button>}
                  {toolResourcesEnabled && <Button size="sm" variant="ghost" className="gap-1 text-xs text-orange-600" onClick={() => setSuggestedToolDialogOpen(true)}>
                    <Plus className="h-3 w-3" /> Add Tool
                  </Button>}
                </div>
              )}
            </CardContent>
          </Card>
            ) : null;
          })()}

          {/* Materials — with approval pipeline */}
          {materialResourcesEnabled && <Card className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div className="min-w-0"><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-amber-600" />Materials & Parts</CardTitle><CardDescription className="text-xs">{wo.repairMaterialRequests?.length || 0} requests</CardDescription></div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(wo.repairMaterialRequests && wo.repairMaterialRequests.length > 0) && (
                  <Button size="sm" variant="outline" className="gap-1.5 hidden sm:flex" onClick={() => navigate('repairs-material-requests', { workOrderId: wo.id })}><ArrowUpRight className="h-3.5 w-3.5" /><span className="hidden md:inline">View All</span></Button>
                )}
                {canPerformWorkActions && <Button size="sm" variant="outline" className="gap-1.5" disabled={isWOFinalized} onClick={() => { setMaterialOpen(true); }}><Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Request Material</span></Button>}
              </div>
            </CardHeader>
            <CardContent>
              {/* Repair Material Requests — full approval pipeline */}
              {wo.repairMaterialRequests && wo.repairMaterialRequests.length > 0 ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-muted/50 border overflow-hidden">
                    <div className="flex items-center gap-2 sm:gap-4 text-[10px] text-muted-foreground mb-1 min-w-0">
                      {['Pending', 'Supervisor', 'Store', 'Picking', 'Issued', 'Done'].map(stage => (
                        <div key={stage} className="flex items-center gap-1 flex-1 justify-center min-w-0">
                          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                          <span className="hidden lg:inline truncate">{stage}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {wo.repairMaterialRequests.map((mr: any) => (
                      <div key={mr.id} className={`p-3 rounded-lg border ${mr.status === 'pending' && isSupervisorOrAdminLocal() ? 'border-amber-200 bg-amber-50/50' : mr.status === 'supervisor_approved' && isStoreOrAdminLocal() ? 'border-indigo-200 bg-indigo-50/50' : mr.status === 'storekeeper_approved' && isStoreOrAdminLocal() ? 'border-violet-200 bg-violet-50/50' : mr.status === 'picking' && isStoreOrAdminLocal() ? 'border-violet-200 bg-violet-50/50' : 'bg-muted/30'}`}>
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5"><Package className="h-3.5 w-3.5" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium truncate">{mr.itemName}</p>
                              {mr.urgency && mr.urgency !== 'normal' && <UrgencyBadge urgency={mr.urgency} />}
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                              <span>Qty: <strong>{mr.quantityRequested}</strong></span>
                              {mr.quantityApproved > 0 && <span>Approved: <strong className="text-sky-600">{mr.quantityApproved}</strong></span>}
                              {mr.quantityIssued > 0 && <span>Issued: <strong className="text-emerald-600">{mr.quantityIssued}</strong></span>}
                              {mr.unit && <span>{mr.unit}</span>}
                            </div>
                            {/* Pipeline dots */}
                            <div className="flex items-center gap-1 mt-2 overflow-x-auto">
                              {[
                                { key: 'pending', label: 'Pending' },
                                { key: 'supervisor_approved', label: 'Sup.' },
                                { key: 'storekeeper_approved', label: 'Store' },
                                { key: 'picking', label: 'Pick' },
                                { key: 'issued', label: 'Issued' },
                                { key: 'closed', label: 'Done' },
                              ].map((stage, idx) => {
                                const statusOrder = ['pending', 'supervisor_approved', 'storekeeper_approved', 'picking', 'issued', 'closed', 'rejected'];
                                const currentIdx = statusOrder.indexOf(mr.status);
                                const stageIdx = statusOrder.indexOf(stage.key);
                                const isCompleted = stageIdx < currentIdx;
                                const isCurrent = stage.key === mr.status;
                                const isRejected = mr.status === 'rejected';
                                return (
                                  <div key={stage.key} className="flex items-center gap-1">
                                    {idx > 0 && <div className={`h-0.5 w-3 ${isCompleted ? 'bg-emerald-400' : 'bg-muted-foreground/20'}`} />}
                                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                      <div className={`h-3 w-3 rounded-full border-2 ${isRejected ? 'bg-red-500 border-red-500' : isCompleted ? 'bg-emerald-500 border-emerald-500' : isCurrent ? 'bg-white border-amber-500 animate-pulse' : 'bg-muted border-muted-foreground/20'}`} />
                                    </TooltipTrigger><TooltipContent className="text-[10px]">{stage.label}</TooltipContent></Tooltip></TooltipProvider>
                                  </div>
                                );
                              })}
                              <Badge variant="outline" className={`text-[9px] shrink-0 ml-1 ${
                                mr.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                mr.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                                mr.status === 'supervisor_approved' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                                mr.status === 'storekeeper_approved' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                mr.status === 'picking' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                                mr.status === 'issued' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                mr.status === 'closed' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                                'bg-gray-50 border-gray-200'
                              }`}>{mr.status.replace(/_/g, ' ')}</Badge>
                            </div>
                            {/* Action buttons */}
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              {!isWOFinalized && mr.status === 'pending' && isSupervisorOrAdminLocal() && (
                                <>
                                  <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 text-emerald-600 hover:text-emerald-700 border-emerald-300 bg-emerald-50" onClick={() => handleMatRequestAction(mr.id, 'supervisor_approve')}><CheckCircle2 className="h-3 w-3 mr-1" />Approve</Button>
                                  <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 text-red-500 hover:text-red-600 border-red-200" onClick={() => { if (!confirm('Reject this material request?')) return; handleMatRequestAction(mr.id, 'supervisor_reject', { notes: 'Rejected by supervisor' }); }}><XCircle className="h-3 w-3 mr-1" />Reject</Button>
                                </>
                              )}
                              {!isWOFinalized && mr.status === 'supervisor_approved' && isStoreOrAdminLocal() && (
                                <>
                                  <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 text-teal-600 hover:text-teal-700 border-teal-300 bg-teal-50" onClick={() => handleMatRequestAction(mr.id, 'storekeeper_approve')}><Warehouse className="h-3 w-3 mr-1" />Store Approve</Button>
                                  <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 text-red-500 hover:text-red-600 border-red-200" onClick={() => { if (!confirm('Reject this material request?')) return; handleMatRequestAction(mr.id, 'storekeeper_reject', { notes: 'Rejected by store' }); }}><XCircle className="h-3 w-3 mr-1" />Reject</Button>
                                </>
                              )}
                              {!isWOFinalized && mr.status === 'storekeeper_approved' && isStoreOrAdminLocal() && (
                                <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 text-violet-600 hover:text-violet-700 border-violet-300 bg-violet-50" onClick={() => handleMatRequestPick(mr.id)}><PackageOpen className="h-3 w-3 mr-1" />Pick</Button>
                              )}
                              {!isWOFinalized && mr.status === 'picking' && isStoreOrAdminLocal() && (
                                <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 text-emerald-600 hover:text-emerald-700 border-emerald-300 bg-emerald-50" onClick={() => handleMatRequestAction(mr.id, 'issue', { quantityToIssue: mr.quantityApproved || mr.quantityRequested })}><PackageCheck className="h-3 w-3 mr-1" />Issue</Button>
                              )}
                              {!isWOFinalized && mr.status === 'issued' && (
                                <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 text-amber-600 hover:text-amber-700 border-amber-300 bg-amber-50" onClick={() => openSpareReturnFromMR(mr)}><RotateCcw className="h-3 w-3 mr-1" />Return</Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Package className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No material requests yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">Click "Request Material" to add items that need supervisor and store approval.</p>
                </div>
              )}
            </CardContent>
          </Card>}

          {/* Tool Requests (from Repair module) */}
          {toolResourcesEnabled && wo.repairToolRequests && wo.repairToolRequests.length > 0 && (
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div className="min-w-0"><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4 text-orange-600" />Tool Requests</CardTitle><CardDescription className="text-xs">{wo.repairToolRequests.length} requests</CardDescription></div>
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => navigate('repairs-tool-requests', { workOrderId: wo.id })}><ArrowUpRight className="h-3.5 w-3.5" /><span className="hidden sm:inline">View All</span></Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {wo.repairToolRequests.slice(0, 10).map((tr: any) => {
                  const toolItems = (tr.items && tr.items.length > 0) ? tr.items : (tr.toolName ? [{ toolName: tr.toolName, toolCode: tr.tool?.toolCode, quantityRequested: 1 }] : []);
                  const toolSummary = toolItems.map((i: any) => i.toolName || i.name || 'Tool').filter(Boolean);
                  const totalRequested = toolItems.reduce((s: number, i: any) => s + (i.quantityRequested || 1), 0);
                  return (
                  <div key={tr.id} className="flex items-start gap-3 p-2.5 rounded-lg border bg-muted/30">
                    <div className="h-8 w-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center shrink-0 mt-0.5"><Wrench className="h-3.5 w-3.5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tr.requestNumber && <Badge variant="outline" className="font-mono text-[10px] bg-sky-50 text-sky-700 border-sky-200">{tr.requestNumber}</Badge>}
                        <p className="text-sm font-medium truncate">{toolSummary.length <= 2 ? toolSummary.join(', ') : `${toolSummary.length} tools: ${toolSummary.slice(0, 2).join(', ')}, +${toolSummary.length - 2}`}</p>
                        {totalRequested > 1 && <span className="text-[10px] text-muted-foreground">({totalRequested} qty)</span>}
                      </div>
                      {tr.reason && <p className="text-xs text-muted-foreground truncate mt-0.5">{tr.reason}</p>}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span>{tr.requestedBy?.fullName || 'Unknown'}</span>
                        <span>·</span>
                        <span>{timeAgo(tr.createdAt)}</span>
                        {tr.urgency && tr.urgency !== 'normal' && (
                          <UrgencyBadge urgency={tr.urgency} />
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${
                      tr.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      tr.status === 'issued' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      tr.status === 'returned' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                      tr.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-200' :
                      tr.status?.includes('approved') ? 'bg-sky-50 text-sky-700 border-sky-200' : ''
                    }`}>{tr.status?.replace(/_/g, ' ') || 'pending'}</Badge>
                  </div>
                  );
                })}
                {wo.repairToolRequests.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center">+{wo.repairToolRequests.length - 10} more tool requests</p>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {/* Repairs Quick Access */}
          {repairsEnabled && <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4 text-teal-600" />Repair Resources</CardTitle>
              <CardDescription className="text-xs">Quick actions for tools, transfers, downtime & returns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {isWOFinalized ? (
                  <div className="col-span-full text-center py-3">
                    <p className="text-xs text-muted-foreground">Work order is {wo.status?.replace(/_/g, ' ') || 'closed'} — all actions are disabled</p>
                  </div>
                ) : (
                <>
                {toolResourcesEnabled && canPerformWorkActions && <button onClick={() => { resetToolReqForm(); setToolReqOpen(true); }} disabled={isWOFinalized} className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-orange-50 transition-colors disabled:opacity-40 disabled:pointer-events-none">
                  <div className="h-9 w-9 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center"><Wrench className="h-4 w-4" /></div>
                  <span className="text-xs font-medium">Request Tool</span>
                </button>}
                {toolResourcesEnabled && canPerformWorkActions && <button onClick={() => { resetToolXferForm(); setToolXferOpen(true); }} disabled={isWOFinalized} className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-teal-50 transition-colors disabled:opacity-40 disabled:pointer-events-none">
                  <div className="h-9 w-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center relative"><ArrowRightLeft className="h-4 w-4" />{wo.repairToolRequests?.some((tr: any) => tr.status === 'transferred' || tr.status === 'completed') && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white" />}</div>
                  <span className="text-xs font-medium">Transfer Tool</span>
                </button>}
                {downtimeEnabled && canPerformWorkActions && <button onClick={() => { resetDowntimeForm(); setDowntimeOpen(true); }} disabled={isWOFinalized} className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-red-50 transition-colors disabled:opacity-40 disabled:pointer-events-none">
                  <div className="h-9 w-9 rounded-lg bg-red-100 text-red-700 flex items-center justify-center"><Timer className="h-4 w-4" /></div>
                  <span className="text-xs font-medium">Log Downtime</span>
                </button>}
                {materialResourcesEnabled && canPerformWorkActions && <button onClick={() => openMatReturn()} disabled={isWOFinalized} className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-violet-50 transition-colors disabled:opacity-40 disabled:pointer-events-none">
                  <div className="h-9 w-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center"><RefreshCw className="h-4 w-4" /></div>
                  <span className="text-xs font-medium">Return Material</span>
                </button>}
                </>
                )}
                {toolResourcesEnabled && <button onClick={() => setViewAllToolsOpen(true)} className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-sky-50 transition-colors">
                  <div className="h-9 w-9 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center"><Wrench className="h-4 w-4" /></div>
                  <span className="text-xs font-medium">View All Tools</span>
                </button>}
                {!isWOFinalized && canPerformWorkActions && (
                <button onClick={() => setActionDialog('complete')} className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-emerald-50 transition-colors">
                  <div className="h-9 w-9 rounded-lg bg-green-100 text-green-700 flex items-center justify-center"><CheckCircle2 className="h-4 w-4" /></div>
                  <span className="text-xs font-medium">Complete WO</span>
                </button>
                )}
              </div>
            </CardContent>
          </Card>}

          {/* View All Tools Modal — shows tool requests + transfers + returns inline */}
          <ResponsiveDialog open={viewAllToolsOpen} onOpenChange={setViewAllToolsOpen} title="All Tools & Requests" description={`Tool requests, transfers and returns for WO ${wo?.woNumber || ''}`} className="max-w-2xl">
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {wo.repairToolRequests && wo.repairToolRequests.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{wo.repairToolRequests.length} Tool Request{wo.repairToolRequests.length > 1 ? 's' : ''}</p>
                  {wo.repairToolRequests.map((tr: any) => {
                    const toolItems = (tr.items && tr.items.length > 0) ? tr.items : (tr.toolName ? [{ toolName: tr.toolName, toolCode: tr.tool?.toolCode, quantityRequested: 1, quantityIssued: 0, quantityReturned: 0, quantityTransferred: 0 }] : []);
                    const isFinalStatus = ['returned', 'transferred', 'rejected'].includes(tr.status);
                    return (
                      <div key={tr.id} className={`p-3 rounded-lg border space-y-2 ${isFinalStatus ? 'bg-muted/20 opacity-60' : 'bg-muted/30'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {tr.requestNumber && <Badge variant="outline" className="font-mono text-[10px] bg-sky-50 text-sky-700 border-sky-200">{tr.requestNumber}</Badge>}
                            <Badge variant="outline" className={`text-[10px] ${tr.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : tr.status === 'issued' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : tr.status === 'pending_return' ? 'bg-violet-50 text-violet-700 border-violet-200' : tr.status === 'returned' ? 'bg-slate-50 text-slate-600 border-slate-200' : tr.status?.includes('approved') ? 'bg-sky-50 text-sky-700 border-sky-200' : tr.status === 'transferred' ? 'bg-teal-50 text-teal-700 border-teal-200' : tr.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-muted'}`}>{tr.status?.replace(/_/g, ' ')}</Badge>
                            {isFinalStatus && <span className="text-[10px] text-muted-foreground">{tr.status === 'transferred' ? '🔄 Transferred out' : tr.status === 'returned' ? '↩️ Returned' : '✓ Done'}</span>}
                          </div>
                          {tr.urgency && tr.urgency !== 'normal' && <UrgencyBadge urgency={tr.urgency} />}
                        </div>
                        {/* Per-item details */}
                        {toolItems.map((item: any, ii: number) => {
                          const issued = item.quantityIssued || 0;
                          const returned = item.quantityReturned || 0;
                          const transferred = item.quantityTransferred || 0;
                          const outstanding = Math.max(0, issued - returned - transferred);
                          return (
                            <div key={ii} className="pl-3 border-l-2 border-border space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-medium">{item.toolName || 'Tool'}</span>
                                {item.toolCode && <span className="text-[10px] font-mono text-muted-foreground">{item.toolCode}</span>}
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                                <span>Requested: <strong>{item.quantityRequested}</strong></span>
                                {issued > 0 && <span className="text-emerald-600">Issued: <strong>{issued}</strong></span>}
                                {transferred > 0 && <span className="text-teal-600">Transferred: <strong>{transferred}</strong></span>}
                                {returned > 0 && <span className="text-slate-500">Returned: <strong>{returned}</strong></span>}
                                {outstanding > 0 && !isFinalStatus && <span className="text-amber-600 font-medium">Outstanding: {outstanding}</span>}
                              </div>
                              {/* Pending return info */}
                              {item.pendingReturnQty > 0 && !isFinalStatus && (
                                <div className="p-2 rounded bg-violet-50 border border-violet-200 text-[11px]">
                                  <span className="text-violet-700 font-medium">⏳ Pending Return: {item.pendingReturnQty}</span>
                                  {item.pendingReturnCondition && <span className="text-violet-600 ml-2">Condition: {item.pendingReturnCondition}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
                          <span>By {tr.requestedBy?.fullName || 'Unknown'}</span><span>·</span>
                          <span>{formatDateTime(tr.createdAt)}</span>
                          {tr.reason && <span className="truncate">· {tr.reason}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Wrench className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No tool requests yet</p>
                </div>
              )}
            </div>
          </ResponsiveDialog>

          {/* Material Return Modal — lists issued materials for return/consume */}
          <ResponsiveDialog open={matReturnOpen} onOpenChange={(v) => { if (!v) setMatReturnOpen(false); }} title="Return Materials" description={`Select materials to return or mark as consumed for WO ${wo?.woNumber || ''}`}>
            <div className="space-y-3">
              {matReturnItems.length === 0 ? (
                <div className="text-center py-6">
                  <Package className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No issued materials to return on this WO.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {matReturnItems.map((item, idx) => (
                    <div key={item.id} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded flex items-center justify-center shrink-0 bg-amber-100 text-amber-700"><Package className="h-3 w-3" /></div>
                        <span className="font-medium text-sm truncate flex-1">{item.itemName}</span>
                        <span className="text-xs text-muted-foreground">Issued: {item.qtyIssued} · Returned: {item.qtyReturned}</span>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0" onClick={() => removeMatReturnItem(idx)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="w-full sm:w-24">
                          <Label className="text-xs">Qty</Label>
                          <Input type="number" min={0} max={item.qtyIssued - item.qtyReturned} value={item.qtyReturn}
                            onChange={e => updateMatReturnItem(idx, { qtyReturn: Math.max(0, Math.min(parseInt(e.target.value) || 0, item.qtyIssued - item.qtyReturned)) })}
                            className="h-8" />
                        </div>
                        <div className="flex items-end gap-2">
                          <Switch id={`mat-reusable-${idx}`} checked={item.isReusable} onCheckedChange={v => updateMatReturnItem(idx, { isReusable: !!v, condition: !!v ? 'used' : 'consumed' })} />
                          <Label htmlFor={`mat-reusable-${idx}`} className="text-xs whitespace-nowrap">{item.isReusable ? 'Return/Refurbish' : 'Consumed'}</Label>
                        </div>
                        {item.isReusable && (
                          <div className="w-full sm:w-32">
                            <Label className="text-xs">Condition</Label>
                            <Select value={item.condition} onValueChange={v => updateMatReturnItem(idx, { condition: v })}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="good">Good</SelectItem>
                                <SelectItem value="used">Used</SelectItem>
                                <SelectItem value="fair">Fair</SelectItem>
                                <SelectItem value="poor">Poor</SelectItem>
                                <SelectItem value="damaged">Damaged</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setMatReturnOpen(false)}>Cancel</Button>
                <Button className="gap-2 bg-violet-600 hover:bg-violet-700 text-white" onClick={handleMatReturnSubmit} disabled={matReturnSubmitting || matReturnItems.filter(i => i.qtyReturn > 0).length === 0}>
                  {matReturnSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  {matReturnSubmitting ? 'Processing...' : `Return ${matReturnItems.filter(i => i.qtyReturn > 0).length} Item(s)`}
                </Button>
              </div>
            </div>
          </ResponsiveDialog>

          {/* Personal Tools On-Site */}
          {toolResourcesEnabled && <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle className="text-base flex items-center gap-2"><Hammer className="h-4 w-4 text-orange-600" />Personal Tools On-Site</CardTitle><CardDescription className="text-xs">{personalTools.length} tools</CardDescription></div>
              {canPerformWorkActions && <Button size="sm" variant="outline" className="gap-1.5" disabled={isWOFinalized} onClick={() => setPtOpen(true)}><Plus className="h-3.5 w-3.5" />Add Tool</Button>}
            </CardHeader>
            <CardContent>
              {personalTools.length === 0 ? (
                <p className="text-sm text-muted-foreground">No personal tools recorded on-site.</p>
              ) : (
                <div className="grid gap-2">
                  {personalTools.map((tool, idx) => (
                    <div key={tool.id || idx} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <div className="h-9 w-9 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center shrink-0"><Hammer className="h-4 w-4" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{tool.toolName}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {tool.toolCode && <span className="font-mono">{tool.toolCode}</span>}
                          <Badge variant="outline" className={`text-[10px] ${tool.condition === 'new' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : tool.condition === 'good' ? 'bg-sky-50 text-sky-700 border-sky-200' : tool.condition === 'fair' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{tool.condition}</Badge>
                        </div>
                        {tool.notes && <p className="text-xs text-muted-foreground mt-0.5">{tool.notes}</p>}
                      </div>
                      {!workActionDisabled && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 shrink-0" disabled={ptLoading} onClick={() => handleRemovePersonalTool(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>}

          {/* Task Checklist — Guided step-by-step task execution during WO execution */}
          {wo.status === 'in_progress' && !taskChecklistLoading && taskChecklist.length > 0 && (() => {
            const totalTasks = taskChecklist.length;
            const completedCount = taskChecklist.filter(t => t.status === 'completed').length;
            const inProgressCount = taskChecklist.filter(t => t.status === 'in_progress').length;
            const skippedCount = taskChecklist.filter(t => t.status === 'skipped').length;
            const failedCount = taskChecklist.filter(t => t.status === 'failed').length;
            const pendingCount = totalTasks - completedCount - inProgressCount - skippedCount - failedCount;
            const progressPercent = Math.round((completedCount / totalTasks) * 100);
            const totalEstMinutes = taskChecklist.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
            const remainingEstMinutes = taskChecklist.filter(t => t.status === 'pending' || t.status === 'in_progress').reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
            const canBulkComplete = !workActionDisabled && pendingCount + inProgressCount > 0;

            // Task type icon mapping
            const TASK_TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
              check: { icon: <ClipboardCheck className="h-3 w-3" />, label: 'Check', color: 'bg-blue-50 text-blue-700 border-blue-200' },
              measure: { icon: <Ruler className="h-3 w-3" />, label: 'Measure', color: 'bg-purple-50 text-purple-700 border-purple-200' },
              inspect: { icon: <Eye className="h-3 w-3" />, label: 'Inspect', color: 'bg-amber-50 text-amber-700 border-amber-200' },
              lubricate: { icon: <Droplets className="h-3 w-3" />, label: 'Lubricate', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
              replace: { icon: <RefreshCw className="h-3 w-3" />, label: 'Replace', color: 'bg-orange-50 text-orange-700 border-orange-200' },
              record: { icon: <FileText className="h-3 w-3" />, label: 'Record', color: 'bg-slate-50 text-slate-700 border-slate-200' },
            };

            const handleBulkComplete = async () => {
              const tasksToComplete = taskChecklist.filter(t => t.status === 'pending' || t.status === 'in_progress');
              if (tasksToComplete.length === 0) return;
              setBulkCompleteLoading(true);
              let successCount = 0;
              for (const task of tasksToComplete) {
                const res = await api.patch(`/api/work-orders/${id}/tasks/${task.id}`, { status: 'completed' });
                if (res.success) successCount++;
              }
              if (successCount === tasksToComplete.length) {
                toast.success(`All ${successCount} tasks completed ✓`);
              } else {
                toast.success(`${successCount} of ${tasksToComplete.length} tasks completed`);
              }
              setBulkCompleteLoading(false);
              fetchTaskChecklist();
            };

            const handleQuickComplete = (taskId: string) => {
              handleTaskAction(taskId, 'completed');
            };

            return (
              <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                      Task Checklist
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {taskChecklistMeta?.templateTitle && `From: ${taskChecklistMeta.templateTitle} · `}
                      {progressPercent}% done · {completedCount}/{totalTasks} completed
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {canBulkComplete && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" disabled={bulkCompleteLoading} onClick={handleBulkComplete} title="Complete all remaining tasks">
                        {bulkCompleteLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                        <span className="hidden sm:inline">Complete All</span>
                      </Button>
                    )}
                    {!workActionDisabled && (
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddTaskDialog(true)}>
                        <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Add Task</span>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Summary Stats + Progress Bar */}
                  <div className="flex items-center gap-3">
                    <Progress
                      value={progressPercent}
                      className="h-2.5 flex-1"
                    />
                    <div className="flex items-center gap-1.5 text-[10px] shrink-0">
                      <span className="flex items-center gap-0.5 text-slate-500"><CircleDot className="h-2.5 w-2.5" />{pendingCount}</span>
                      <span className="flex items-center gap-0.5 text-amber-600"><Play className="h-2.5 w-2.5" />{inProgressCount}</span>
                      <span className="flex items-center gap-0.5 text-emerald-600"><CheckCircle2 className="h-2.5 w-2.5" />{completedCount}</span>
                      {(skippedCount > 0 || failedCount > 0) && (
                        <span className="flex items-center gap-0.5 text-slate-400"><ArrowRight className="h-2.5 w-2.5" />{skippedCount + failedCount}</span>
                      )}
                    </div>
                  </div>
                  {totalEstMinutes > 0 && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {remainingEstMinutes > 0 ? `~${remainingEstMinutes} min remaining` : 'All estimated time complete'}
                      {totalEstMinutes > 0 && <span className="text-muted-foreground/60">(of ~{totalEstMinutes} min total)</span>}
                    </p>
                  )}

                  {/* Task List */}
                  <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-0.5">
                    {taskChecklist.map((task, idx) => {
                      const isCompleted = task.status === 'completed';
                      const isInProgress = task.status === 'in_progress';
                      const isSkipped = task.status === 'skipped';
                      const isFailed = task.status === 'failed';
                      const isPending = task.status === 'pending';
                      const isLoading = taskActionLoading === task.id;
                      const typeConfig = TASK_TYPE_CONFIG[task.taskType] || TASK_TYPE_CONFIG.check;

                      let requiredPartsList: string[] = [];
                      try { requiredPartsList = task.requiredParts ? JSON.parse(task.requiredParts) : []; } catch { /* ignore */ }

                      const statusBg = isCompleted
                        ? 'bg-emerald-50/70 border-emerald-200/70'
                        : isInProgress
                          ? 'bg-amber-50 border-amber-200 shadow-sm ring-1 ring-amber-200/50'
                          : isSkipped
                            ? 'bg-slate-50/50 border-slate-200 opacity-60'
                            : isFailed
                              ? 'bg-red-50 border-red-200'
                              : 'bg-background border-border';

                      return (
                        <div key={task.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${statusBg}`}>
                          {/* Clickable status icon for quick complete */}
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="mt-0.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-full"
                                  onClick={() => {
                                    if (workActionDisabled) return;
                                    if (isPending) handleTaskAction(task.id, 'in_progress');
                                    else if (isInProgress) handleQuickComplete(task.id);
                                  }}
                                  disabled={workActionDisabled || isLoading || isCompleted || isSkipped || isFailed}
                                  title={isPending ? 'Click to start' : isInProgress ? 'Click to complete' : undefined}
                                >
                                  {isCompleted
                                    ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                    : isInProgress
                                      ? <div className="relative"><Play className="h-5 w-5 text-amber-500 animate-pulse" /><span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 animate-ping" /></div>
                                      : isSkipped
                                        ? <ArrowRight className="h-5 w-5 text-slate-400" />
                                        : isFailed
                                          ? <XCircle className="h-5 w-5 text-red-500" />
                                          : <CircleDot className="h-5 w-5 text-slate-300 hover:text-emerald-500 transition-colors" />}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-[11px]">
                                {isPending ? 'Click to start task' : isInProgress ? 'Click to mark done' : isCompleted ? 'Completed' : isSkipped ? 'Skipped' : isFailed ? 'Failed' : 'Pending'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <div className="flex-1 min-w-0">
                            {/* Step number + type badge + time */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-mono font-semibold text-muted-foreground/70">{idx + 1}</span>
                              <Badge variant="outline" className={`text-[10px] gap-0.5 capitalize ${typeConfig.color}`}>
                                {typeConfig.icon}{typeConfig.label}
                              </Badge>
                              {task.estimatedMinutes && (
                                <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                                  <Clock className="h-2.5 w-2.5" />{task.estimatedMinutes}m
                                </span>
                              )}
                            </div>
                            {/* Description */}
                            <p className={`text-sm mt-0.5 leading-snug ${isCompleted || isSkipped ? 'line-through text-muted-foreground/70' : isInProgress ? 'font-medium text-foreground' : 'font-medium'}`}>
                              {task.description}
                            </p>
                            {/* Required parts parsed */}
                            {requiredPartsList.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {requiredPartsList.slice(0, 4).map((part, pi) => (
                                  <span key={pi} className="text-[10px] bg-muted/60 text-muted-foreground rounded px-1.5 py-0.5 flex items-center gap-0.5">
                                    <Package className="h-2.5 w-2.5" />{part}
                                  </span>
                                ))}
                                {requiredPartsList.length > 4 && (
                                  <span className="text-[10px] text-muted-foreground">+{requiredPartsList.length - 4} more</span>
                                )}
                              </div>
                            )}
                            {/* Findings / Notes / Completion info */}
                            {(task.notes || task.findings) && (
                              <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
                                {task.findings && <p className="bg-background/50 rounded px-1.5 py-0.5"><span className="font-medium">Findings:</span> {task.findings}</p>}
                                {task.notes && <p className="truncate bg-background/50 rounded px-1.5 py-0.5"><span className="font-medium">Notes:</span> {task.notes}</p>}
                              </div>
                            )}
                            {task.completedBy && task.completedAt && (
                              <p className="text-[10px] text-muted-foreground/70 mt-1">
                                {isCompleted && '✓ '}{isSkipped && '→ '}{isFailed && '✗ '}
                                {task.completedBy.fullName} · {formatDateTime(task.completedAt)}
                              </p>
                            )}
                          </div>

                          {/* Action buttons */}
                          {!workActionDisabled && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              {isPending && (
                                <TooltipProvider delayDuration={400}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isLoading} onClick={() => handleTaskAction(task.id, 'in_progress')}>
                                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}<span className="hidden sm:inline">Start</span>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="text-[11px]">Begin this task</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {(isPending || isInProgress) && (
                                <>
                                  <TooltipProvider delayDuration={400}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-slate-500 hover:text-slate-700" disabled={isLoading} onClick={() => { setCompleteTaskDialog(task.id); setTaskNotes(''); setTaskFindings(''); }}>
                                          <MessageSquare className="h-3 w-3" /><span className="hidden sm:inline">Notes</span>
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="text-[11px]">Complete with notes/findings</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider delayDuration={400}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={isLoading} onClick={() => handleTaskAction(task.id, 'completed')}>
                                          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}<span className="hidden sm:inline">Done</span>
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="text-[11px]">Mark task as complete</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </>
                              )}
                              {(isPending || isInProgress) && (
                                <TooltipProvider delayDuration={400}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-slate-500" disabled={isLoading} onClick={() => setSkipTaskDialog(task.id)}>
                                        <ArrowRight className="h-3 w-3" /><span className="hidden sm:inline">Skip</span>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="text-[11px]">Skip this task</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {(isCompleted || isSkipped || isFailed) && (
                                <TooltipProvider delayDuration={400}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50" disabled={isLoading} onClick={() => handleTaskAction(task.id, 'pending')}>
                                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}<span className="hidden sm:inline">Undo</span>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="text-[11px]">Reopen this task</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Task Checklist - Empty state for in_progress WOs */}
          {wo.status === 'in_progress' && !taskChecklistLoading && taskChecklist.length === 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                    Task Checklist
                  </CardTitle>
                  <CardDescription className="text-xs">Break down your work into steps for better tracking</CardDescription>
                </div>
                {!workActionDisabled && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddTaskDialog(true)}>
                    <Plus className="h-3.5 w-3.5" />Add Task
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                    <ListChecks className="h-6 w-6 text-emerald-400" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">No tasks yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 max-w-[240px]">Add tasks to create a step-by-step checklist. This helps track progress and ensures nothing is missed.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Complete Task Dialog */}
          <ResponsiveDialog open={!!completeTaskDialog} onOpenChange={(v) => { setCompleteTaskDialog(v ? completeTaskDialog : null); setTaskNotes(''); setTaskFindings(''); }} title="Complete with Notes" description="Optionally record findings and notes for this task before completing." footer={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setCompleteTaskDialog(null); setTaskNotes(''); setTaskFindings(''); }}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!!taskActionLoading} onClick={() => { if (completeTaskDialog) handleTaskAction(completeTaskDialog, 'completed', { notes: taskNotes, findings: taskFindings }); }}>
                {taskActionLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Completing...</> : 'Complete Task'}
              </Button>
            </div>
          }>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Findings</Label><Textarea value={taskFindings} onChange={e => setTaskFindings(e.target.value)} placeholder="What did you find during this task?" rows={3} /></div>
              <div className="space-y-1.5"><Label>Notes</Label><Textarea value={taskNotes} onChange={e => setTaskNotes(e.target.value)} placeholder="Additional notes..." rows={2} /></div>
            </div>
          </ResponsiveDialog>

          {/* Skip Task Dialog */}
          <ResponsiveDialog open={!!skipTaskDialog} onOpenChange={(v) => { setSkipTaskDialog(v ? skipTaskDialog : null); setSkipReason(''); }} title="Skip Task" description="Provide a reason for skipping this task." footer={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setSkipTaskDialog(null); setSkipReason(''); }}>Cancel</Button>
              <Button variant="secondary" disabled={!!taskActionLoading || !skipReason.trim()} onClick={() => { if (skipTaskDialog) handleTaskAction(skipTaskDialog, 'skipped', { notes: `Skip reason: ${skipReason.trim()}` }); }}>
                {taskActionLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Skipping...</> : 'Skip Task'}
              </Button>
            </div>
          }>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Reason for Skipping *</Label><Textarea value={skipReason} onChange={e => setSkipReason(e.target.value)} placeholder="Why is this task being skipped?" rows={3} /></div>
            </div>
          </ResponsiveDialog>

          {/* Add Manual Task Dialog */}
          <ResponsiveDialog open={addTaskDialog} onOpenChange={setAddTaskDialog} title="Add Task" description="Add a manual task to the work order checklist." footer={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAddTaskDialog(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={addTaskLoading || !addTaskDesc.trim()} onClick={handleAddManualTask}>
                {addTaskLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Adding...</> : 'Add Task'}
              </Button>
            </div>
          }>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Description *</Label><Input className="min-h-[44px]" value={addTaskDesc} onChange={e => setAddTaskDesc(e.target.value)} placeholder="Describe the task to be performed" /></div>
              {/* Task type quick-select buttons */}
              <div className="space-y-1.5">
                <Label>Task Type</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { value: 'check', label: 'Check', icon: <ClipboardCheck className="h-3.5 w-3.5" /> },
                    { value: 'measure', label: 'Measure', icon: <Ruler className="h-3.5 w-3.5" /> },
                    { value: 'inspect', label: 'Inspect', icon: <Eye className="h-3.5 w-3.5" /> },
                    { value: 'lubricate', label: 'Lubricate', icon: <Droplets className="h-3.5 w-3.5" /> },
                    { value: 'replace', label: 'Replace', icon: <RefreshCw className="h-3.5 w-3.5" /> },
                    { value: 'record', label: 'Record', icon: <FileText className="h-3.5 w-3.5" /> },
                  ].map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setAddTaskType(type.value)}
                      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all min-h-[44px] ${
                        addTaskType === type.value
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm'
                          : 'border-border bg-background text-muted-foreground hover:border-slate-300 hover:bg-muted/50'
                      }`}
                    >
                      {type.icon}{type.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5"><Label>Est. Minutes (optional)</Label><Input className="min-h-[44px]" type="number" min="1" value={addTaskMinutes} onChange={e => setAddTaskMinutes(e.target.value)} placeholder="e.g. 15" /></div>
            </div>
          </ResponsiveDialog>

          {/* Personal Tool Add Dialog */}
          <ResponsiveDialog open={ptOpen} onOpenChange={setPtOpen} title="Add Personal Tool" description="Record a personal tool brought on-site." footer={<Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={ptLoading} onClick={handleAddPersonalTool}>{ptLoading ? 'Adding...' : 'Add Tool'}</Button>}>
              <div className="space-y-4">
                <div className="space-y-1.5"><Label>Tool Name *</Label><Input className="min-h-[44px]" value={ptForm.toolName} onChange={e => setPtForm(f => ({ ...f, toolName: e.target.value }))} placeholder="e.g. Digital Multimeter" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Tool Code</Label><Input className="min-h-[44px]" value={ptForm.toolCode} onChange={e => setPtForm(f => ({ ...f, toolCode: e.target.value }))} placeholder="e.g. DM-001" /></div>
                  <div className="space-y-1.5"><Label>Condition</Label>
                    <Select value={ptForm.condition} onValueChange={v => setPtForm(f => ({ ...f, condition: v as PersonalTool['condition'] }))}>
                      <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="good">Good</SelectItem><SelectItem value="fair">Fair</SelectItem><SelectItem value="poor">Poor</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea value={ptForm.notes} onChange={e => setPtForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes..." rows={2} /></div>
              </div>
          </ResponsiveDialog>

          {/* Add Team Member Dialog */}
          <ResponsiveDialog open={addTeamMemberOpen} onOpenChange={setAddTeamMemberOpen} title="Add Team Member" description="Add a new member to this work order team." footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setAddTeamMemberOpen(false)}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={addMemberLoading || !newMemberUserId} onClick={handleAddTeamMember}>{addMemberLoading ? 'Adding...' : 'Add Member'}</Button></div>}>
              <div className="space-y-4">
                <div className="space-y-1.5"><Label>User *</Label>
                  <AsyncSearchableSelect
                    value={newMemberUserId}
                    onValueChange={setNewMemberUserId}
                    fetchOptions={async () => {
                      const res = await api.get('/api/workers?role=all');
                      if (res.success && res.data) return (Array.isArray(res.data) ? res.data : []).map((u: any) => ({ value: u.id, label: `${u.fullName} (${u.username})` }));
                      return [];
                    }}
                    placeholder="Search users..."
                    searchPlaceholder="Search by name..."
                  />
                </div>
                <div className="space-y-1.5"><Label>Role</Label>
                  <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="assistant">Assistant</SelectItem><SelectItem value="specialist">Specialist</SelectItem><SelectItem value="supervisor">Supervisor</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
          </ResponsiveDialog>

          {/* Request Team Member Dialog (for technicians) */}
          <ResponsiveDialog open={requestMemberOpen} onOpenChange={setRequestMemberOpen} title="Request Team Member" description="Submit a request for additional support. The planner will assign the right technician." footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setRequestMemberOpen(false)}>Cancel</Button><Button className="bg-amber-600 hover:bg-amber-700 text-white" disabled={reqMemberLoading || !reqMemberTrade} onClick={handleRequestTeamMember}>{reqMemberLoading ? 'Submitting...' : 'Submit Request'}</Button></div>}>
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-700">
                    Select the trade/skill needed for this job. The planner will review your request and assign the right technician.
                  </p>
                </div>
                <div className="space-y-1.5"><Label>Trade / Skill Needed *</Label>
                  <Select value={reqMemberTrade} onValueChange={setReqMemberTrade}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Select the trade needed..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mechanical Fitter">Mechanical Fitter</SelectItem>
                      <SelectItem value="Electrician">Electrician</SelectItem>
                      <SelectItem value="Electrical Technician">Electrical Technician</SelectItem>
                      <SelectItem value="Instrumentation Technician">Instrumentation Technician</SelectItem>
                      <SelectItem value="Instrumentation Fitter">Instrumentation Fitter</SelectItem>
                      <SelectItem value="Welder">Welder</SelectItem>
                      <SelectItem value="Plumber">Plumber</SelectItem>
                      <SelectItem value="Pipe Fitter">Pipe Fitter</SelectItem>
                      <SelectItem value="HVAC Technician">HVAC Technician</SelectItem>
                      <SelectItem value="Machinist">Machinist</SelectItem>
                      <SelectItem value="Rigger">Rigger</SelectItem>
                      <SelectItem value="Painter">Painter</SelectItem>
                      <SelectItem value="Utility Technician">Utility Technician</SelectItem>
                      <SelectItem value="Workshop Technician">Workshop Technician</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Choose the trade/skill required to complete this task</p>
                </div>
                <div className="space-y-1.5"><Label>Role</Label>
                  <Select value={reqMemberRole} onValueChange={setReqMemberRole}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="assistant">Assistant</SelectItem><SelectItem value="specialist">Specialist</SelectItem><SelectItem value="supervisor">Supervisor</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Reason</Label>
                  <Textarea
                    value={reqMemberReason}
                    onChange={e => setReqMemberReason(e.target.value)}
                    placeholder="Why do you need this trade? (e.g., 'Need electrician for motor rewinding')"
                    rows={3}
                  />
                </div>
              </div>
          </ResponsiveDialog>

          {/* Assign Technician Dialog — for planner approving trade-based requests */}
          <ResponsiveDialog open={!!approveReqId} onOpenChange={(open) => { if (!open) { setApproveReqId(null); setApproveAssignUserId(''); } }} title="Assign Technician" description="Select the technician to assign for this trade request." footer={<div className="flex gap-2"><Button variant="outline" onClick={() => { setApproveReqId(null); setApproveAssignUserId(''); }}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!approveAssignUserId || !!reqActionLoading} onClick={() => { if (approveReqId) handleReviewTeamRequest(approveReqId, 'approve', '', approveAssignUserId); }}>{reqActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign & Approve'}</Button></div>}>
              <div className="space-y-4">
                {approveReqId && (() => {
                  const req = teamRequests.find((r: any) => r.id === approveReqId);
                  if (!req) return null;
                  return (
                    <div className="p-3 rounded-lg bg-sky-50 border border-sky-200">
                      <p className="text-xs text-sky-700">
                        <strong>Trade needed:</strong> {req.requestedTrade}
                        {req.reason && <> — {req.reason}</>}
                      </p>
                      <p className="text-xs text-sky-600 mt-1">Requested by {req.requestedByUser?.fullName} · {timeAgo(req.createdAt)}</p>
                    </div>
                  );
                })()}
                <div className="space-y-1.5">
                  <Label>Select Technician *</Label>
                  <AsyncSearchableSelect
                    value={approveAssignUserId}
                    onValueChange={setApproveAssignUserId}
                    fetchOptions={async () => {
                      try {
                        const req = teamRequests.find((r: any) => r.id === approveReqId);
                        const tradeFilter = String(req?.requestedTrade || '').trim();
                        const workerUrl = wo.plantId
                          ? `/api/workers?role=technician&plantId=${encodeURIComponent(wo.plantId)}`
                          : '/api/workers?role=technician';
                        const res = await api.get(workerUrl);
                        if (res.success && res.data) {
                          let users = Array.isArray(res.data) ? res.data : [];
                          if (tradeFilter) {
                            const requested = tradeFilter.toLowerCase();
                            users = users.filter((worker: any) => {
                              const skillLabels = [
                                worker.trade,
                                ...(Array.isArray(worker.skills)
                                  ? worker.skills.flatMap((skill: any) => [skill?.name, skill?.code])
                                  : []),
                              ]
                                .filter(Boolean)
                                .map((value: unknown) => String(value).trim().toLowerCase());
                              return skillLabels.includes(requested);
                            });
                          }
                          return users.map((u: any) => {
                            const matchingSkill = tradeFilter
                              ? (u.skills || []).find((skill: any) =>
                                  [skill?.name, skill?.code].some((value) =>
                                    String(value || '').trim().toLowerCase() === tradeFilter.toLowerCase(),
                                  ),
                                )
                              : null;
                            const tradeLabel = matchingSkill?.name || u.trade || tradeFilter || 'Technician';
                            const proficiency = matchingSkill?.proficiency ? ` · ${matchingSkill.proficiency}` : '';
                            return {
                              value: u.id,
                              label: `${u.fullName} — ${tradeLabel}${proficiency}${u.department ? ` (${u.department})` : ''}`,
                            };
                          });
                        }
                      } catch { /* ignore */ }
                      return [];
                    }}
                    placeholder="Search technicians..."
                    searchPlaceholder="Search by name or trade..."
                  />
                  <p className="text-xs text-muted-foreground">Only active technicians in this plant with the requested trade/skill are listed.</p>
                </div>
              </div>
          </ResponsiveDialog>

          {/* Right Panel — Details, Cost, Source, Team */}
        <div className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium capitalize">{wo.type.replace('_', ' ')}</span></div>
              <Separator />
              {assetsEnabled && <><div className="flex justify-between"><span className="text-muted-foreground">Asset</span><span className="font-medium">{wo.assetName || '-'}</span></div>
              <Separator /></>}
              <div className="flex justify-between"><span className="text-muted-foreground">Assigned To</span><span className="font-medium">{wo.assignee?.fullName || (wo.teamMembers?.length > 0 ? `Team (${wo.teamMembers.length} member${wo.teamMembers.length !== 1 ? 's' : ''})` : 'Unassigned')}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Est. Hours</span><span className="font-medium">{formatDuration(wo.estimatedHours || 0)}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Actual Hours</span><span className="font-medium">{formatDuration(wo.actualHours || 0)}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Created By</span><span className="font-medium">{wo.creator?.fullName || '-'}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="font-medium">{formatDateTime(wo.createdAt)}</span></div>
              {wo.plannedStart && (
                <><Separator /><div className="flex justify-between"><span className="text-muted-foreground">Planned Start</span><span className="font-medium">{formatDateTime(wo.plannedStart)}</span></div></>
              )}
              {wo.actualStart && (
                <><Separator /><div className="flex justify-between"><span className="text-muted-foreground">Actual Start</span><span className="font-medium">{formatDateTime(wo.actualStart)}</span></div></>
              )}
            </CardContent>
          </Card>

          {/* Linked Components */}
          {assetsEnabled && wo.workOrderComponents && wo.workOrderComponents.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base">Linked Components</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {wo.workOrderComponents.map((woc: any) => {
                    const comp = woc.componentRegistry;
                    if (!comp) return null;
                    return (
                      <div key={woc.id} className="flex items-center justify-between text-sm py-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate font-medium">{comp.name}</span>
                          {comp.componentCode && (
                            <span className="text-xs text-muted-foreground font-mono shrink-0">{comp.componentCode}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {comp.criticality && comp.criticality !== 'low' && (
                            <Badge variant={comp.criticality === 'critical' ? 'destructive' : comp.criticality === 'high' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                              {comp.criticality}
                            </Badge>
                          )}
                          {comp.healthScore != null && (
                            <span className={`text-[10px] font-medium ${comp.healthScore >= 80 ? 'text-emerald-600' : comp.healthScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                              {comp.healthScore}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Materials by Component */}
          {materialResourcesEnabled && wo.materials && wo.materials.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><PackageOpen className="h-4 w-4" />Materials & Parts</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {wo.materials.map((mat: any) => (
                    <div key={mat.id} className="flex items-start justify-between text-sm py-1 gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium truncate">{mat.itemName}</span>
                          {mat.componentRegistry && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{mat.componentRegistry.componentCode || mat.componentRegistry.name}</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Req: {mat.quantityRequested} · Issued: {mat.quantityIssued} · Returned: {mat.quantityReturned}
                          {mat.unitCost != null && mat.quantityIssued > 0 && <span className="ml-2">Cost: {formatCurrency(mat.unitCost * mat.quantityIssued)}</span>}
                        </div>
                      </div>
                      <Badge variant={mat.status === 'issued' || mat.status === 'closed' ? 'default' : mat.status === 'rejected' ? 'destructive' : 'secondary'} className="text-[10px] px-1.5 py-0 shrink-0">
                        {mat.status?.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cost Summary */}
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">Cost Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {materialResourcesEnabled && <div className="flex justify-between"><span className="text-muted-foreground">Material</span><span className="font-medium">{formatCurrency(wo.materialCost)}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Labor</span><span className="font-medium">{formatCurrency(wo.laborCost)}</span></div>
              <Separator />
              <div className="flex justify-between font-semibold"><span>Total</span><span>{formatCurrency(wo.totalCost)}</span></div>
            </CardContent>
          </Card>

          {/* Source Request */}
          {requestsEnabled && wo.request && (
            <Card className="border-teal-200 bg-teal-50/50">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-teal-700 uppercase tracking-wider mb-1">Source Request</p>
                <p className="font-semibold">{wo.request.requestNumber}</p>
                <p className="text-sm text-muted-foreground">{wo.request.title}</p>
                {wo.request.requester && <p className="text-xs text-muted-foreground mt-1">by {wo.request.requester.fullName}</p>}
              </CardContent>
            </Card>
          )}

          {/* Team Members — Enhanced with permission-aware controls */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Team</CardTitle>
              <div className="flex gap-1.5">
                {!isWOFinalized && canManageTeamDirectly && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddTeamMemberOpen(true)}><UserPlus className="h-3.5 w-3.5" />Add Member</Button>
                )}
                {!isWOFinalized && canRequestTeamMember && (
                  <Button size="sm" variant="outline" className="gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => setRequestMemberOpen(true)}><UserPlus className="h-3.5 w-3.5" />Request Member</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Pending Team Requests (for reviewers — planner/admin) */}
              {!isWOFinalized && canReviewTeamRequests && (() => {
                const pendingReqs = teamRequests.filter((r: any) => r.status === 'pending');
                if (pendingReqs.length === 0) return null;
                return (
                  <div className="space-y-2 mb-3">
                    <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Pending Requests</p>
                    {pendingReqs.map((req: any) => {
                      const isTradeBased = !!req.requestedTrade && !req.requestedUserId;
                      const displayLabel = req.requestedTrade || req.requestedUser?.fullName || 'Unknown';
                      return (
                        <div key={req.id} className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/50">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium">{displayLabel}</span>
                                {isTradeBased && <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200">Trade Request</Badge>}
                                <Badge variant="outline" className="text-[10px]">{req.role?.replace(/_/g, ' ')?.replace(/\b\w/g, (c: string) => c.toUpperCase())}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Requested by {req.requestedByUser?.fullName} {req.reason && <>— {req.reason}</>}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(req.createdAt)}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {isTradeBased ? (
                                <Button
                                  size="sm"
                                  className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                  disabled={reqActionLoading === req.id}
                                  onClick={() => { setApproveReqId(req.id); setApproveAssignUserId(''); }}
                                  title="Select technician to assign"
                                >
                                  <UserCheck className="h-3 w-3" />
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                  disabled={reqActionLoading === req.id}
                                  onClick={() => handleReviewTeamRequest(req.id, 'approve')}
                                >
                                  {reqActionLoading === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2 text-red-600 border-red-200 hover:bg-red-50"
                                disabled={reqActionLoading === req.id}
                                onClick={() => handleReviewTeamRequest(req.id, 'reject', '')}
                              >
                                <UserX className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Pending requests (for requester — non-reviewer view) */}
              {canRequestTeamMember && (() => {
                const myPendingReqs = teamRequests.filter((r: any) => r.status === 'pending');
                if (myPendingReqs.length === 0) return null;
                return (
                  <div className="space-y-2 mb-3">
                    <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">My Pending Requests</p>
                    {myPendingReqs.map((req: any) => {
                      const displayLabel = req.requestedTrade || req.requestedUser?.fullName || 'Unknown';
                      const isTradeBased = !!req.requestedTrade && !req.requestedUserId;
                      return (
                        <div key={req.id} className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/50">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium">{displayLabel}</span>
                                {isTradeBased && <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200">Trade Request</Badge>}
                                <Badge variant="outline" className="text-[10px]">{req.role?.replace(/_/g, ' ')?.replace(/\b\w/g, (c: string) => c.toUpperCase())}</Badge>
                              </div>
                              {req.reason && <p className="text-xs text-muted-foreground mt-0.5">{req.reason}</p>}
                              <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(req.createdAt)} · Awaiting approval</p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[10px] px-1.5 text-muted-foreground"
                              disabled={reqActionLoading === req.id}
                              onClick={() => handleCancelTeamRequest(req.id)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Resolved requests (brief summary) */}
              {(() => {
                const resolvedReqs = teamRequests.filter((r: any) => r.status !== 'pending' && r.status !== 'cancelled');
                if (resolvedReqs.length === 0) return null;
                return (
                  <div className="space-y-1 mb-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Request History</p>
                    {resolvedReqs.slice(0, 3).map((req: any) => {
                      const displayLabel = req.requestedTrade || req.requestedUser?.fullName || 'Unknown';
                      const assignedLabel = req.requestedUser?.fullName;
                      return (
                        <div key={req.id} className="flex items-center justify-between text-xs py-1">
                          <div className="flex items-center gap-1.5">
                            {req.status === 'approved' ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-red-400" />}
                            <span className="text-muted-foreground">{displayLabel}</span>
                            {assignedLabel && <span className="text-muted-foreground">→ {assignedLabel}</span>}
                            {req.reviewNotes && <span className="text-muted-foreground italic">— {req.reviewNotes}</span>}
                          </div>
                          <span className="text-muted-foreground">{timeAgo(req.createdAt)}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Team Members List */}
              {(!wo.teamMembers || wo.teamMembers.length === 0) ? (
                <p className="text-sm text-muted-foreground">No team members assigned.</p>
              ) : (
                wo.teamMembers.map(tm => {
                  const isTeamLeader = tm.userId === wo.teamLeaderId;
                  const isReadOnlyMember = tm.accessLevel === 'read_only';
                  const memberName = tm.userName || tm.user?.fullName || 'Unknown';
                  return (
                    <div key={tm.id} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-[10px]">{getInitials(memberName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{memberName}</span>
                          {isTeamLeader && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-[10px]">{tm.role?.replace(/_/g, ' ')?.replace(/\b\w/g, c => c.toUpperCase())}</Badge>
                          {isTeamLeader && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">Full Access</Badge>}
                          {isReadOnlyMember && <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600 border-slate-200">Read Only</Badge>}
                        </div>
                      </div>
                      {!isWOFinalized && canManageTeamDirectly && !isTeamLeader && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 shrink-0"
                          onClick={() => handleRemoveTeamMember(tm.id, memberName)}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
// --- PmSchedulesPage separator ---
export function PmSchedulesPage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [dueSoonFilter, setDueSoonFilter] = useState(false);
  const [saving, setSaving] = useState(false);
  const { hasPermission } = useAuthStore();

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formAssetId, setFormAssetId] = useState('');
  const [formFreqType, setFormFreqType] = useState('monthly');
  const [formFreqValue, setFormFreqValue] = useState('1');
  const [formPriority, setFormPriority] = useState('medium');
  const [formEstDuration, setFormEstDuration] = useState('');
  const [formAssignedToId, setFormAssignedToId] = useState('');
  const [formDepartmentId, setFormDepartmentId] = useState('');
  const [formAutoGenWO, setFormAutoGenWO] = useState(true);
  const [formLeadDays, setFormLeadDays] = useState('3');
  const [formNextDueDate, setFormNextDueDate] = useState('');

  const [pmAnalytics, setPmAnalytics] = useState<any>(null);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dueSoonFilter) params.set('dueSoon', 'true');
      const res = await api.get(`/api/pm-schedules?${params.toString()}`);
      if (res.success) setSchedules(res.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [dueSoonFilter]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  useEffect(() => {
    api.get('/api/pm-analytics').then(res => {
      if (res.success && res.data) setPmAnalytics(res.data);
    });
  }, []);

  // Background PM check: fire-and-forget trigger on page load
  useEffect(() => {
    api.post('/api/pm-schedules/check-due', {}).catch(() => { /* silent — background task */ });
  }, []);

  const resetForm = () => {
    setFormTitle(''); setFormDesc(''); setFormAssetId('');
    setFormFreqType('monthly'); setFormFreqValue('1');
    setFormPriority('medium'); setFormEstDuration('');
    setFormAssignedToId(''); setFormDepartmentId(''); setFormAutoGenWO(true);
    setFormLeadDays('3'); setFormNextDueDate('');
  };

  const openCreate = () => { resetForm(); setCreateOpen(true); };
  const openEdit = (item: any) => {
    setFormTitle(item.title || '');
    setFormDesc(item.description || '');
    setFormAssetId(item.assetId || '');
    setFormFreqType(item.frequencyType || 'monthly');
    setFormFreqValue(String(item.frequencyValue || 1));
    setFormPriority(item.priority || 'medium');
    setFormEstDuration(item.estimatedDuration ? String(item.estimatedDuration) : '');
    setFormAssignedToId(item.assignedToId || '');
    setFormDepartmentId(item.departmentId || '');
    setFormAutoGenWO(item.autoGenerateWO !== false);
    setFormLeadDays(String(item.leadDays || 3));
    setFormNextDueDate(item.nextDueDate ? item.nextDueDate.split('T')[0] : '');
    setEditItem(item);
  };

  const handleSave = async () => {
    if (!formTitle || !formAssetId) { toast.error('Title and asset are required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        title: formTitle, description: formDesc || null,
        assetId: formAssetId, frequencyType: formFreqType,
        frequencyValue: parseInt(formFreqValue, 10) || 1,
        priority: formPriority,
        estimatedDuration: formEstDuration ? parseFloat(formEstDuration) : null,
        assignedToId: formAssignedToId || null,
        departmentId: formDepartmentId || null,
        autoGenerateWO: formAutoGenWO,
        leadDays: parseInt(formLeadDays, 10) || 3,
        nextDueDate: formNextDueDate || null,
      };

      if (editItem) {
        const res = await api.put(`/api/pm-schedules/${editItem.id}`, payload);
        if (res.success) { toast.success('Schedule updated'); setEditItem(null); fetchSchedules(); }
        else toast.error(res.error || 'Update failed');
      } else {
        const res = await api.post('/api/pm-schedules', payload);
        if (res.success) { toast.success('Schedule created'); setCreateOpen(false); resetForm(); fetchSchedules(); }
        else toast.error(res.error || 'Create failed');
      }
    } catch { toast.error('Operation failed'); }
    setSaving(false);
  };

  const handleDeactivate = async (id: string) => {
    try {
      const res = await api.delete(`/api/pm-schedules/${id}`);
      if (res.success) { toast.success('Schedule deactivated'); fetchSchedules(); }
      else toast.error(res.error || 'Failed');
    } catch { toast.error('Failed'); }
  };

  const freqLabel = (type: string, val: number) => {
    const map: Record<string, string> = {
      daily: `Every ${val} day${val > 1 ? 's' : ''}`,
      weekly: `Every ${val} week${val > 1 ? 's' : ''}`,
      biweekly: `Every ${val * 2} weeks`,
      monthly: `Every ${val} month${val > 1 ? 's' : ''}`,
      quarterly: `Every ${val * 3} months`,
      semiannual: `Every ${val * 6} months`,
      annual: `Every ${val} year${val > 1 ? 's' : ''}`,
      custom_hours: `Every ${val} hours`,
      custom_days: `Every ${val} days`,
      meter_based: `Every ${val} units`,
    };
    return map[type] || `${type}/${val}`;
  };

  const isDueSoon = (d?: string) => {
    if (!d) return false;
    const due = new Date(d);
    const week = new Date(Date.now() + 7 * 86400000);
    return due <= week;
  };

  const isOverdue = (d?: string) => {
    if (!d) return false;
    return new Date(d) < new Date();
  };

  const activeSchedules = schedules.filter(s => s.isActive);
  const dueSoonCount = activeSchedules.filter(s => isDueSoon(s.nextDueDate)).length;
  const overdueCount = activeSchedules.filter(s => isOverdue(s.nextDueDate)).length;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Preventive Maintenance</p>
          <h1 className="text-2xl font-bold tracking-tight">PM Schedules</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage preventive maintenance schedules for your assets</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setDueSoonFilter(!dueSoonFilter); }}
            className={dueSoonFilter ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40' : ''}>
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            Due Soon
          </Button>
          {hasPermission('work_orders.create') && (
            <Button size="sm" onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New Schedule
            </Button>
          )}
        </div>
      </div>

      {/* PM Analytics KPI Banner */}
      {pmAnalytics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Schedules', value: pmAnalytics.totalSchedules ?? 0, icon: ClipboardList, color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' },
            { label: 'Compliance Rate', value: `${pmAnalytics.complianceRate ?? 0}%`, icon: Target, color: pmAnalytics.complianceRate >= 80 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : pmAnalytics.complianceRate >= 50 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' },
            { label: 'Overdue', value: pmAnalytics.overdueCount ?? 0, icon: AlertTriangle, color: pmAnalytics.overdueCount > 0 ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' : 'bg-slate-50 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400' },
            { label: 'Upcoming (7 days)', value: pmAnalytics.upcomingCount ?? 0, icon: Calendar, color: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400' },
            { label: 'PM WOs Generated', value: pmAnalytics.totalGenerated ?? 0, icon: Wrench, color: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400' },
            { label: 'Avg Completion Days', value: pmAnalytics.avgCompletionDays ?? '—', icon: Gauge, color: 'bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${s.color}`}>
                <s.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Department Compliance Table */}
      {pmAnalytics?.byDepartment && pmAnalytics.byDepartment.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Department Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold">Department</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Schedules</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Completed WOs</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Compliance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pmAnalytics.byDepartment.map((dept: any) => (
                  <TableRow key={dept.departmentName}>
                    <TableCell className="text-sm font-medium">{dept.departmentName}</TableCell>
                    <TableCell className="text-sm text-right">{dept.scheduleCount}</TableCell>
                    <TableCell className="text-sm text-right">{dept.completedWos}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={
                        dept.complianceRate == null ? 'bg-slate-100 text-slate-500 border-slate-200' :
                        dept.complianceRate >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        dept.complianceRate >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-red-50 text-red-700 border-red-200'
                      }>
                        {dept.complianceRate != null ? `${dept.complianceRate}%` : 'N/A'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Schedules', value: schedules.length, icon: Clock, color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' },
          { label: 'Active', value: activeSchedules.length, icon: Activity, color: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400' },
          { label: 'Due Soon', value: dueSoonCount, icon: AlertCircle, color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
          { label: 'Overdue', value: overdueCount, icon: AlertTriangle, color: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${s.color}`}>
              <s.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-semibold">Schedule</TableHead>
                <TableHead className="text-xs font-semibold">Asset</TableHead>
                <TableHead className="text-xs font-semibold hidden md:table-cell">Frequency</TableHead>
                <TableHead className="text-xs font-semibold">Priority</TableHead>
                <TableHead className="text-xs font-semibold">Next Due</TableHead>
                <TableHead className="text-xs font-semibold hidden lg:table-cell">Assigned To</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )) : schedules.length === 0 ? (
                <TableRow><TableCell colSpan={8}>
                  <EmptyState icon={Clock} title="No schedules found" description={dueSoonFilter ? "No schedules due in the next 7 days" : "Create your first PM schedule to get started"} />
                </TableCell></TableRow>
              ) : schedules.map(s => (
                <TableRow key={s.id} className="group">
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{s.title}</p>
                      {s.description && <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">{s.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs font-medium">{s.asset?.name || '—'}</p>
                        <p className="text-[10px] text-muted-foreground">{s.asset?.assetTag || ''}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" className="text-[10px] font-medium">
                      {freqLabel(s.frequencyType, s.frequencyValue)}
                    </Badge>
                  </TableCell>
                  <TableCell><PriorityBadge priority={s.priority} /></TableCell>
                  <TableCell>
                    <div>
                      <p className={`text-xs font-medium ${isOverdue(s.nextDueDate) ? 'text-red-600 dark:text-red-400' : isDueSoon(s.nextDueDate) ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                        {s.nextDueDate ? formatDate(s.nextDueDate) : '—'}
                      </p>
                      {isOverdue(s.nextDueDate) && <p className="text-[10px] text-red-500">OVERDUE</p>}
                      {isDueSoon(s.nextDueDate) && !isOverdue(s.nextDueDate) && <p className="text-[10px] text-amber-500">DUE SOON</p>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <p className="text-xs">{s.assignedTo?.fullName || 'Unassigned'}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={s.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700'}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {s.isActive && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
                          {hasPermission('roles.update') && (
                            <DropdownMenuItem onClick={() => handleDeactivate(s.id)} className="text-red-600">
                              <Trash2 className="h-3.5 w-3.5 mr-2" />Deactivate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <ResponsiveDialog open={createOpen || !!editItem} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditItem(null); } }} title={editItem ? 'Edit PM Schedule' : 'New PM Schedule'} description={editItem ? 'Update preventive maintenance schedule' : 'Define a new preventive maintenance schedule for an asset'} footer={<div className="flex gap-2"><Button variant="outline" onClick={() => { setCreateOpen(false); setEditItem(null); }}>Cancel</Button><Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : null}{editItem ? 'Update Schedule' : 'Create Schedule'}</Button></div>}>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Title *</Label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g., Monthly Motor Inspection" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Description</Label>
              <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Describe the maintenance tasks..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Asset *</Label>
              <AsyncSearchableSelect
                value={formAssetId}
                onValueChange={setFormAssetId}
                fetchOptions={async () => {
                  const res = await api.get('/api/assets');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).map((a: any) => ({
                      value: a.id,
                      label: `${a.name} [${a.assetTag}]`,
                      badge: a.status,
                    }));
                  }
                  return [];
                }}
                placeholder="Select asset..."
                searchPlaceholder="Search assets by name or tag..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Frequency Type *</Label>
                <Select value={formFreqType} onValueChange={setFormFreqType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom_hours', 'custom_days', 'meter_based'].map(f => (
                      <SelectItem key={f} value={f}>{f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Frequency Value *</Label>
                <Input type="number" min="1" value={formFreqValue} onChange={e => setFormFreqValue(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Priority</Label>
                <Select value={formPriority} onValueChange={setFormPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['low', 'medium', 'high', 'critical'].map(p => (
                      <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Est. Duration (hrs)</Label>
                <Input type="number" min="0" step="0.5" value={formEstDuration} onChange={e => setFormEstDuration(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Assigned To</Label>
              <AsyncSearchableSelect
                value={formAssignedToId}
                onValueChange={setFormAssignedToId}
                fetchOptions={async () => {
                  const res = await api.get('/api/workers?role=technician');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).map((u: any) => ({
                      value: u.id,
                      label: u.fullName,
                    }));
                  }
                  return [];
                }}
                placeholder="Select technician..."
                searchPlaceholder="Search technicians..."
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Department</Label>
              <AsyncSearchableSelect
                value={formDepartmentId}
                onValueChange={setFormDepartmentId}
                fetchOptions={async () => {
                  const res = await api.get('/api/departments?limit=100');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).map((d: any) => ({
                      value: d.id,
                      label: d.name,
                    }));
                  }
                  return [];
                }}
                placeholder="Select department..."
                searchPlaceholder="Search departments..."
              />
            </div>
            <DatePicker label="Next Due Date" value={formNextDueDate || undefined} onChange={v => setFormNextDueDate(v || '')} />
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div>
                <p className="text-sm font-medium">Auto-generate Work Order</p>
                <p className="text-[11px] text-muted-foreground">Automatically create WO when schedule is due</p>
              </div>
              <Switch checked={formAutoGenWO} onCheckedChange={setFormAutoGenWO} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Lead Days</Label>
              <Input type="number" min="0" value={formLeadDays} onChange={e => setFormLeadDays(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Days before due date to generate WO</p>
            </div>
          </div>
      </ResponsiveDialog>
    </div>
  );
}

// ============================================================================
// ANALYTICS PAGE
// ============================================================================

// --- MaintenanceWorkOrdersPage separator ---
export function MaintenanceWorkOrdersPage() {
  return <WorkOrdersPage />;
}

export function MaintenanceDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [woKpi, setWoKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { navigate } = useNavigationStore();
  const { hasPermission, user } = useAuthStore();
  const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/api/dashboard/stats', { timeout: 30_000 }),
      api.get('/api/work-orders/kpi'),
    ]).then(([statsRes, kpiRes]) => {
      if (!active) return;
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (kpiRes.success && kpiRes.data) setWoKpi(kpiRes.data);
    }).catch((err) => {
      if (active) setError(err?.message || 'Failed to load dashboard data');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  // ===== Derived KPI values =====
  const activeWOs = stats?.activeWorkOrders ?? woKpi?.byStatus?.in_progress ?? 0;
  const completedThisWeek = stats?.myKPIs?.completedThisWeek ?? stats?.completedTodayWO ?? 0;
  const overdueWOs = stats?.overdueWorkOrders ?? woKpi?.overdue ?? 0;
  const pmCompliance = stats?.maintenanceKPIs?.plannedRatio ?? 0;
  const avgMTTR = stats?.maintenanceKPIs?.mttr ?? woKpi?.completionMetrics?.avgHours ?? 0;
  const pendingMRs = stats?.pendingRequests ?? 0;
  const monthTrend = woKpi?.trend?.changePercent ?? 0;

  // ===== Chart data preparation (before early return) =====
  const statusChartData = useMemo(() => {
    const byStatus = woKpi?.byStatus || {};
    const labels: Record<string, string> = {
      draft: 'Draft', requested: 'Requested', approved: 'Approved',
      planned: 'Planned', assigned: 'Assigned', in_progress: 'In Progress',
      completed: 'Completed', verified: 'Verified', closed: 'Closed',
      waiting_parts: 'Waiting', on_hold: 'On Hold', cancelled: 'Cancelled',
    };
    return Object.entries(byStatus)
      .filter(([, count]) => (count as number) > 0)
      .map(([status, count]) => ({
        status: labels[status] || status.replace(/_/g, ' '),
        count: count as number,
      }));
  }, [woKpi?.byStatus]);

  const priorityChartData = useMemo(() => {
    const byPriority = woKpi?.byPriority || {};
    const labels: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
    return Object.entries(byPriority)
      .filter(([, count]) => (count as number) > 0)
      .map(([priority, count]) => ({
        priority: labels[priority] || priority,
        count: count as number,
      }));
  }, [woKpi?.byPriority]);

  const monthlyTrendData = useMemo(() => {
    if (!woKpi?.trend) return [];
    return [
      { label: 'Last Month', created: woKpi.trend.lastMonth || 0, completed: 0 },
      { label: 'This Month', created: woKpi.trend.thisMonth || 0, completed: 0 },
    ];
  }, [woKpi?.trend]);

  const backlogAgeData = useMemo(() => {
    const ages = woKpi?.openByAge || {};
    const total = Object.values(ages).reduce((s: number, v) => s + (v as number), 0);
    return Object.entries(ages).map(([range, count]) => ({
      range: range === '0-3' ? '0–3 days' : range === '4-7' ? '4–7 days' : range === '8-14' ? '8–14 days' : range === '15-30' ? '15–30 days' : '30+ days',
      count: count as number,
      pct: total > 0 ? Math.round(((count as number) / total) * 100) : 0,
    }));
  }, [woKpi?.openByAge]);

  const CHART_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#6366f1'];
  const AGE_COLORS: Record<string, string> = {
    '0–3 days': '#10b981', '4–7 days': '#f59e0b', '8–14 days': '#f97316', '15–30 days': '#ef4444', '30+ days': '#dc2626',
  };

  // ===== Quick Actions =====
  const quickActions = [
    { label: 'New Maintenance Request', icon: ClipboardList, page: 'create-mr' as PageName, permission: 'maintenance_requests.create', color: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 border-amber-200 hover:border-amber-300 dark:border-amber-900/40', iconColor: 'text-amber-600 dark:text-amber-400' },
    { label: 'New Work Order', icon: Wrench, page: 'maintenance-work-orders' as PageName, permission: 'work_orders.create', color: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50 border-emerald-200 hover:border-emerald-300 dark:border-emerald-900/40', iconColor: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'View PM Calendar', icon: CalendarClock, page: 'pm-calendar' as PageName, permission: 'pm_schedules.view', color: 'bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/30 dark:hover:bg-sky-950/50 border-sky-200 hover:border-sky-300 dark:border-sky-900/40', iconColor: 'text-sky-600 dark:text-sky-400' },
    { label: 'Repair Analytics', icon: BarChart3, page: 'repairs-analytics' as PageName, permission: 'repairs.view', color: 'bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/30 dark:hover:bg-violet-950/50 border-violet-200 hover:border-violet-300 dark:border-violet-900/40', iconColor: 'text-violet-600 dark:text-violet-400' },
  ];

  const visibleActions = quickActions.filter(a => hasPermission(a.permission) && (a.page !== 'pm-calendar' || pmEnabled));

  // ===== Recent work orders =====
  const recentWOs = stats?.recentWorkOrders || [];

  // ===== Status chart config =====
  const woStatusChartConfig: Record<string, { label: string; color: string }> = {};
  statusChartData.forEach((d, i) => { woStatusChartConfig[d.status] = { label: d.status, color: CHART_COLORS[i % CHART_COLORS.length] }; });

  const priorityChartConfig: Record<string, { label: string; color: string }> = {};
  const pColors: Record<string, string> = { Low: '#10b981', Medium: '#f59e0b', High: '#ef4444', Urgent: '#dc2626' };
  priorityChartData.forEach(d => { priorityChartConfig[d.priority] = { label: d.priority, color: pColors[d.priority] || '#94a3b8' }; });

  // ===== Loading / Error states =====
  if (loading) return <LoadingSkeleton />;
  if (error) {
    return (
      <div className="page-content">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h1 className="text-2xl font-bold tracking-tight">Maintenance Dashboard</h1><p className="text-muted-foreground mt-1">Maintenance operations overview and KPIs</p></div>
        </div>
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20"><CardContent className="p-6"><div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-red-500" /><div><p className="font-semibold text-red-700 dark:text-red-400">Failed to load dashboard</p><p className="text-sm text-red-600 dark:text-red-500">{error}</p></div></div></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Maintenance</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-0.5">Maintenance Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Maintenance operations overview &middot; Key performance indicators</p>
        </div>
        <Badge variant="outline" className="text-[11px] font-mono gap-1.5 border-primary/20 bg-primary/5 text-primary self-start">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Live
        </Badge>
      </div>

      {/* ===== KPI Summary Cards ===== */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {/* Active WOs */}
        <Card className={`border ${overdueWOs > 0 ? 'border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-100 dark:border-slate-800'} hover:shadow-lg transition-all duration-300 overflow-hidden relative`}>
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-white/40 to-transparent dark:from-white/5 rounded-bl-full" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                <Wrench className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active WOs</p>
            <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{activeWOs}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{stats?.createdTodayWO || 0} created today</p>
          </CardContent>
        </Card>

        {/* Completed This Week */}
        <Card className="border border-teal-100 dark:border-teal-900/40 bg-teal-50 dark:bg-teal-950/30 hover:shadow-lg transition-all duration-300 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-white/40 to-transparent dark:from-white/5 rounded-bl-full" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-lg bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Completed This Week</p>
            <p className="text-2xl font-bold tracking-tight text-teal-600 dark:text-teal-400">{completedThisWeek}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">of {stats?.totalWorkOrders || 0} total</p>
          </CardContent>
        </Card>

        {/* Overdue WOs */}
        <Card className={`border ${overdueWOs > 0 ? 'border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30' : 'border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/30'} hover:shadow-lg transition-all duration-300 overflow-hidden relative`}>
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-white/40 to-transparent dark:from-white/5 rounded-bl-full" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className={`h-9 w-9 rounded-lg ${overdueWOs > 0 ? 'bg-red-100 dark:bg-red-900/50' : 'bg-emerald-100 dark:bg-emerald-900/50'} flex items-center justify-center`}>
                <AlertTriangle className={`h-4 w-4 ${overdueWOs > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
              </div>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Overdue</p>
            <p className={`text-2xl font-bold tracking-tight ${overdueWOs > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{overdueWOs}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{overdueWOs > 0 ? 'Need attention' : 'All on track'}</p>
          </CardContent>
        </Card>

        {/* PM Compliance — only when the PM module is licensed and enabled */}
        {pmEnabled && <Card className="border border-sky-100 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-950/30 hover:shadow-lg transition-all duration-300 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-white/40 to-transparent dark:from-white/5 rounded-bl-full" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-lg bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center">
                <Target className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </div>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PM Compliance</p>
            <p className="text-2xl font-bold tracking-tight text-sky-600 dark:text-sky-400">{pmCompliance}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">planned vs reactive</p>
          </CardContent>
        </Card>}

        {/* Avg MTTR */}
        <Card className="border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 hover:shadow-lg transition-all duration-300 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-white/40 to-transparent dark:from-white/5 rounded-bl-full" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                <Timer className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg MTTR</p>
            <p className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{formatDuration(avgMTTR)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">mean time to repair</p>
          </CardContent>
        </Card>

        {/* Pending MRs */}
        <Card className="border border-violet-100 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-950/30 hover:shadow-lg transition-all duration-300 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-white/40 to-transparent dark:from-white/5 rounded-bl-full" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
                <ClipboardList className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pending Requests</p>
            <p className="text-2xl font-bold tracking-tight text-violet-600 dark:text-violet-400">{pendingMRs}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">awaiting approval</p>
          </CardContent>
        </Card>
      </div>

      {/* ===== Quick Actions ===== */}
      {visibleActions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {visibleActions.map(a => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  onClick={() => navigate(a.page)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all hover:shadow-sm ${a.color}`}
                >
                  <Icon className={`h-5 w-5 ${a.iconColor} shrink-0`} />
                  <span className="text-sm font-medium truncate">{a.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== Charts Row 1: Status Distribution + Monthly Trend ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* WO Status Distribution */}
        <Card className="border lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">WO Status Distribution</CardTitle>
                <CardDescription className="text-xs mt-0.5">Work orders by current status</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {statusChartData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No work order data</div>
            ) : (
              <ChartContainer config={woStatusChartConfig} className="h-[280px] w-full">
                <BarChart data={statusChartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/30" />
                  <XAxis dataKey="status" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {statusChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Priority Breakdown - Donut */}
        <Card className="border">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
                <PieChartIcon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Priority Breakdown</CardTitle>
                <CardDescription className="text-xs mt-0.5">Work orders by priority</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {priorityChartData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No priority data</div>
            ) : (
              <ChartContainer config={priorityChartConfig} className="h-[280px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={priorityChartData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="priority"
                  >
                    {priorityChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="priority" />} className="flex-wrap gap-x-4 gap-y-1" />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== Charts Row 2: Monthly Trend + Backlog Overview ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WO Monthly Trend */}
        <Card className="border">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Monthly WO Trend</CardTitle>
                <CardDescription className="text-xs mt-0.5">Work orders created per month</CardDescription>
              </div>
              {monthTrend !== 0 && (
                <Badge variant="outline" className={`ml-auto text-[10px] font-semibold ${monthTrend > 0 ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40' : 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40'}`}>
                  {monthTrend > 0 ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                  {Math.abs(monthTrend)}% vs last month
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {monthlyTrendData.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No trend data</div>
            ) : (
              <ChartContainer config={{ created: { label: 'Created', color: '#10b981' } }} className="h-[240px] w-full">
                <BarChart data={monthlyTrendData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/30" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="created" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Backlog Aging Overview */}
        <Card className="border">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
                <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Backlog Aging</CardTitle>
                <CardDescription className="text-xs mt-0.5">Open work orders by age bracket</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4 py-2">
              {backlogAgeData.map(item => {
                const barColor = AGE_COLORS[item.range] || '#94a3b8';
                return (
                  <div key={item.range} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{item.range}</span>
                      <span className="font-semibold text-muted-foreground">{item.count} <span className="text-xs font-normal">({item.pct}%)</span></span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(item.pct, 2)}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                );
              })}
              {backlogAgeData.length === 0 && (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No open work orders</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== Recent Activity ===== */}
      <Card className="border">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center">
              <Activity className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Recent Work Orders</CardTitle>
              <CardDescription className="text-xs mt-0.5">Latest {recentWOs.length} work orders</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => navigate('maintenance-work-orders')}>
              View All <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {recentWOs.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No recent work orders</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WO #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden md:table-cell">Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Assigned To</TableHead>
                  <TableHead className="hidden md:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentWOs.map((wo: any) => (
                  <TableRow key={wo.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate('maintenance-work-orders')}>
                    <TableCell className="font-mono text-xs">{wo.woNumber}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{wo.title}</TableCell>
                    <TableCell className="hidden md:table-cell"><PriorityBadge priority={wo.priority} /></TableCell>
                    <TableCell><StatusBadge status={wo.status} /></TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">{wo.assignee?.fullName || wo.assigner?.fullName || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{formatDate(wo.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function MaintenanceAnalyticsPage() {
  const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<DashboardStats>('/api/dashboard/stats', { timeout: 30_000 }),
      api.get<WorkOrder[]>('/api/work-orders'),
    ]).then(([statsRes, woRes]) => {
      if (!active) return;
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (woRes.success && woRes.data) setWorkOrders(woRes.data);
    }).catch(() => {
      // Silently handle error
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const completedWOs = workOrders.filter(wo => wo.status === 'completed' || wo.status === 'verified' || wo.status === 'closed');
  const mttr = completedWOs.length > 0 ? (completedWOs.reduce((sum, wo) => sum + (wo.actualHours || 0), 0) / completedWOs.length).toFixed(1) : '0.0';
  const totalHours = completedWOs.reduce((sum, wo) => sum + (wo.actualHours || 0), 0);
  const mtbf = completedWOs.length > 1 ? (totalHours / Math.max(completedWOs.length - 1, 1)).toFixed(1) : totalHours.toFixed(1);
  const totalWOs = stats?.totalWorkOrders || 0;
  const preventiveWOs = stats?.preventiveWO || 0;
  const pmCompliance = totalWOs > 0 ? Math.round((preventiveWOs / totalWOs) * 100) : 0;
  const totalCost = workOrders.reduce((sum, wo) => sum + (wo.totalCost || 0), 0);

  const typeBreakdown = [
    ...(pmEnabled ? [{ type: 'Preventive', count: stats?.preventiveWO || 0, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }] : []),
    { type: 'Corrective', count: stats?.correctiveWO || 0, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    { type: 'Emergency', count: stats?.emergencyWO || 0, color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    { type: 'Inspection', count: stats?.inspectionWO || 0, color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
    { type: 'Predictive', count: stats?.predictiveWO || 0, color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  ];

  const priorityBreakdown = [
    { priority: 'Low', count: workOrders.filter(wo => wo.priority === 'low').length },
    { priority: 'Medium', count: workOrders.filter(wo => wo.priority === 'medium').length },
    { priority: 'High', count: workOrders.filter(wo => wo.priority === 'high').length },
    { priority: 'Critical', count: workOrders.filter(wo => wo.priority === 'critical' || wo.priority === 'emergency').length },
  ];

  const kpis = [
    { label: 'MTTR (Hours)', value: mttr, icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'MTBF (Hours)', value: mtbf, icon: Activity, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    ...(pmEnabled ? [{ label: 'PM Compliance', value: `${pmCompliance}%`, icon: CheckCircle2, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' }] : []),
    { label: 'Total Maintenance Cost', value: formatCurrency(totalCost), icon: TrendingUp, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400' },
  ];

  return (
    <div className="page-content">
      <div><h1 className="text-2xl font-bold tracking-tight">Maintenance Analytics</h1><p className="text-muted-foreground mt-1">Advanced analytics for maintenance operations including MTTR, MTBF, and cost trends</p></div>
      {loading ? <LoadingSkeleton /> : (<>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map(k => { const I = k.icon; return (
            <Card key={k.label}><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
          ); })}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border"><CardHeader><CardTitle className="text-base">WO Type Distribution</CardTitle><CardDescription className="text-xs">Breakdown by work order type</CardDescription></CardHeader><CardContent>
            <div className="space-y-3">
              {typeBreakdown.map(t => {
                const pct = totalWOs > 0 ? Math.round((t.count / totalWOs) * 100) : 0;
                return (
                  <div key={t.type} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-24">{t.type}</span>
                    <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
                    <span className="text-sm font-semibold w-16 text-right">{t.count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </CardContent></Card>
          <Card className="border"><CardHeader><CardTitle className="text-base">Priority Breakdown</CardTitle><CardDescription className="text-xs">Work orders by priority level</CardDescription></CardHeader><CardContent>
            <div className="space-y-3">
              {priorityBreakdown.map(p => {
                const pct = workOrders.length > 0 ? Math.round((p.count / workOrders.length) * 100) : 0;
                return (
                  <div key={p.priority} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-24">{p.priority}</span>
                    <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${p.priority === 'Critical' ? 'bg-red-500' : p.priority === 'High' ? 'bg-amber-500' : p.priority === 'Medium' ? 'bg-sky-500' : 'bg-slate-400'}`} style={{ width: `${pct}%` }} /></div>
                    <span className="text-sm font-semibold w-16 text-right">{p.count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </CardContent></Card>
        </div>
        <Card className="border"><CardHeader><CardTitle className="text-base">Recent Cost Summary</CardTitle><CardDescription className="text-xs">Latest completed work orders by cost</CardDescription></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>WO #</TableHead><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Total Cost</TableHead><TableHead className="text-right">Material</TableHead><TableHead className="text-right">Labor</TableHead><TableHead className="hidden md:table-cell">Actual Hours</TableHead></TableRow></TableHeader><TableBody>
            {completedWOs.sort((a, b) => (b.totalCost || 0) - (a.totalCost || 0)).slice(0, 10).map(wo => (
              <TableRow key={wo.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-xs">{wo.woNumber}</TableCell>
                <TableCell className="font-medium max-w-[200px] truncate">{wo.title}</TableCell>
                <TableCell className="text-xs capitalize">{wo.type.replace('_', ' ')}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(wo.totalCost)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(wo.materialCost)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(wo.laborCost)}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{wo.actualHours || '-'}</TableCell>
              </TableRow>
            ))}
            {completedWOs.length === 0 && <TableRow><TableCell colSpan={7}><EmptyState icon={BarChart3} title="No completed work orders" description="Cost data will appear once work orders are completed." /></TableCell></TableRow>}
          </TableBody></Table>
        </CardContent></Card>
      </>)}
    </div>
  );
}
export function MaintenanceCalibrationPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ instrument: '', serialNumber: '', type: '', lastCalibration: '', nextDue: '', technician: '', certificates: '' });
  const [technicianId, setTechnicianId] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [calibrations, setCalibrations] = useState<any[]>([]);
  const [kpis, setKpis] = useState({ total: 0, calibrated: 0, dueSoon: 0, overdue: 0 });

  const fetchTechnicianOptions = useCallback(async () => {
    const res = await api.get('/api/users?limit=100&role=technician');
    if (res.success && res.data) {
      return (Array.isArray(res.data) ? res.data : []).map((u: any) => ({
        value: u.id,
        label: u.fullName + (u.staffId ? ` (${u.staffId})` : ''),
      }));
    }
    return [];
  }, []);

  const loadCalibrations = async () => {
    try {
      const res = await api.get('/api/calibrations');
      if (res.success && res.data) {
        setCalibrations(Array.isArray(res.data) ? res.data : []);
        if (res.kpis) setKpis(res.kpis as any);
      }
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/calibrations');
        if (res.success && res.data) {
          setCalibrations(Array.isArray(res.data) ? res.data : []);
          if (res.kpis) setKpis(res.kpis as any);
        }
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  const calStatusColors: Record<string, string> = {
    calibrated: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    out_of_calibration: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    due: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  };

  const kpiCards = [
    { label: 'Total Instruments', value: kpis.total, icon: Crosshair, color: 'text-slate-600 bg-slate-50 dark:bg-slate-800/50 dark:text-slate-300' },
    { label: 'Calibrated', value: kpis.calibrated, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Due Soon', value: kpis.dueSoon, icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Overdue', value: kpis.overdue, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400' },
  ];

  const mapStatus = (s: string) => {
    if (s === 'out_of_calibration') return 'overdue';
    if (s === 'due') return 'due_soon';
    return s;
  };

  const filtered = calibrations.filter(c => {
    const ms = mapStatus(c.status || '');
    const matchSearch = !search || (c.instrumentName || c.title || '').toLowerCase().includes(search.toLowerCase()) || (c.serialNumber || '').toLowerCase().includes(search.toLowerCase()) || (c.calibrationNumber || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || ms === statusFilter || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await api.post('/api/calibrations', {
        title: `Calibration - ${form.instrument}`,
        instrumentName: form.instrument,
        serialNumber: form.serialNumber || undefined,
        calibrationDate: form.lastCalibration || undefined,
        nextDueDate: form.nextDue || undefined,
        standardUsed: form.certificates || undefined,
        technicianId: technicianId || undefined,
        technicianName: form.technician || undefined,
      });
      if (res.success) {
        toast.success('Calibration record created successfully');
        setCreateOpen(false);
        setTechnicianId('');
        setForm({ instrument: '', serialNumber: '', type: '', lastCalibration: '', nextDue: '', technician: '', certificates: '' });
        loadCalibrations();
      } else {
        toast.error(res.error || 'Failed to create calibration record');
      }
    } catch { toast.error('Failed to create calibration record'); }
    setSaving(false);
  };

  return (
    <div className="page-content">
      <div><h1 className="text-2xl font-bold tracking-tight">Calibration</h1><p className="text-muted-foreground mt-1">Manage instrument calibration schedules, records, and compliance tracking</p></div>
      {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(k => { const I = k.icon; return (
          <Card key={k.label}><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
        ); })}
      </div>
      <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div><CardTitle className="text-base">Calibration Records</CardTitle><CardDescription className="text-xs">Track all instrument calibrations and due dates</CardDescription></div>
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" />New Record</Button>
            <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen} title="New Calibration Record" description="Add a new instrument calibration record" footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={saving || !form.instrument}>{saving ? 'Creating...' : 'Create Record'}</Button></div>}>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2"><Label className="text-xs">Instrument</Label><Input placeholder="e.g. Digital Pressure Gauge" value={form.instrument} onChange={e => setForm({ ...form, instrument: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2"><Label className="text-xs">Serial Number</Label><Input placeholder="e.g. DPG-2024-001" value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} /></div>
                    <div className="grid gap-2"><Label className="text-xs">Type</Label><Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent><SelectItem value="pressure">Pressure</SelectItem><SelectItem value="temperature">Temperature</SelectItem><SelectItem value="electrical">Electrical</SelectItem><SelectItem value="dimensional">Dimensional</SelectItem><SelectItem value="flow">Flow</SelectItem></SelectContent></Select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <DatePicker label="Last Calibration" value={form.lastCalibration || undefined} onChange={v => setForm(f => ({ ...f, lastCalibration: v || '' }))} />
                    <DatePicker label="Next Due" value={form.nextDue || undefined} onChange={v => setForm(f => ({ ...f, nextDue: v || '' }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2"><Label className="text-xs">Technician</Label><AsyncSearchableSelect
                      value={technicianId}
                      onValueChange={(val) => { setTechnicianId(val); setForm(f => ({ ...f, technician: val })); }}
                      fetchOptions={fetchTechnicianOptions}
                      placeholder="Select technician..."
                      searchPlaceholder="Search technicians..."
                    /></div>
                    <div className="grid gap-2"><Label className="text-xs">Certificates</Label><Input placeholder="e.g. CERT-2024-001" value={form.certificates} onChange={e => setForm({ ...form, certificates: e.target.value })} /></div>
                  </div>
                </div>
            </ResponsiveDialog>
          </div>
          <div className="filter-row flex flex-col sm:flex-row gap-2 mt-3">
            <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search instruments, serial numbers..." className="pl-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="calibrated">Calibrated</SelectItem><SelectItem value="out_of_calibration">Overdue</SelectItem><SelectItem value="due">Due Soon</SelectItem></SelectContent></Select>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table><TableHeader><TableRow><TableHead className="text-xs">ID</TableHead><TableHead className="text-xs">Instrument</TableHead><TableHead className="text-xs hidden md:table-cell">Serial #</TableHead><TableHead className="text-xs hidden lg:table-cell">Type</TableHead><TableHead className="text-xs hidden lg:table-cell">Last Calibration</TableHead><TableHead className="text-xs">Next Due</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs hidden md:table-cell">Result</TableHead></TableRow></TableHeader><TableBody>
              {filtered.map(c => {
                const displayStatus = mapStatus(c.status || '');
                const isOverdue = displayStatus === 'overdue';
                return (
                <TableRow key={c.id} className={`hover:bg-muted/30 ${isOverdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                  <TableCell className="font-mono text-xs">{c.calibrationNumber}</TableCell>
                  <TableCell className="font-medium text-sm">{c.instrumentName || c.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{c.serialNumber || '-'}</TableCell>
                  <TableCell className="text-xs capitalize hidden lg:table-cell">{c.standardUsed || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{formatDate(c.calibrationDate)}</TableCell>
                  <TableCell className="text-xs">{c.nextDueDate ? formatDate(c.nextDueDate) : '-'}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] uppercase font-semibold ${calStatusColors[c.status] || ''}`}>{(displayStatus || c.status).replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="text-xs hidden md:table-cell">{c.result || '-'}</TableCell>
                </TableRow>
                );
              })}
              {filtered.length === 0 && <TableRow><TableCell colSpan={8}><EmptyState icon={Crosshair} title="No calibration records found" description="Adjust your search or filter criteria" /></TableCell></TableRow>}
            </TableBody></Table>
          </div>
        </CardContent>
      </Card>
      </>}
    </div>
  );
}

export function MaintenanceRiskAssessmentPage() {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ asset: '', category: '', likelihood: '', consequence: '', mitigationPlan: '', assessor: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [kpis, setKpis] = useState({ total: 0, critical: 0, high: 0, medium: 0, low: 0 });
  const [viewItem, setViewItem] = useState<any>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', type: 'operational', status: 'open', assessor: '', department: '', assessmentDate: '', riskLevel: 'medium', hazards: '', mitigations: '' });
  const [editLoading, setEditLoading] = useState(false);

  const loadAssessments = async () => {
    try {
      const res = await api.get('/api/risk-assessments');
      if (res.success && res.data) {
        setAssessments(Array.isArray(res.data) ? res.data : []);
        if (res.kpis) setKpis(res.kpis as any);
      }
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/risk-assessments');
        if (res.success && res.data) {
          setAssessments(Array.isArray(res.data) ? res.data : []);
          if (res.kpis) setKpis(res.kpis as any);
        }
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  const riskLevelColors: Record<string, string> = {
    extreme: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    critical: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    high: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
    medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    low: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  };

  const riskScoreColor = (score: number) => score >= 15 ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300' : score >= 9 ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300';

  const kpiCards = [
    { label: 'Total Assessments', value: kpis.total, icon: ClipboardList, color: 'text-slate-600 bg-slate-50 dark:bg-slate-800/50 dark:text-slate-300' },
    { label: 'High Risk', value: kpis.critical, icon: AlertTriangle, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400' },
    { label: 'Medium Risk', value: kpis.medium, icon: ShieldAlert, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Low Risk', value: kpis.low, icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
  ];

  const fetchRiskAssetOptions = useCallback(async () => {
    const res = await api.get('/api/assets?limit=100');
    if (res.success && res.data) {
      return (Array.isArray(res.data) ? res.data : []).map((a: any) => ({
        value: a.id,
        label: a.name || a.assetTag,
      }));
    }
    return [];
  }, []);

  const mapRiskLevel = (level: string) => {
    if (level === 'extreme') return 'critical';
    return level;
  };

  const filtered = assessments.filter(a => {
    const ml = mapRiskLevel(a.riskLevel || '');
    const matchSearch = !search || (a.title || '').toLowerCase().includes(search.toLowerCase()) || (a.assessmentNumber || '').toLowerCase().includes(search.toLowerCase());
    const matchLevel = levelFilter === 'all' || ml === levelFilter || a.riskLevel === levelFilter;
    return matchSearch && matchLevel;
  });

  const handleCreate = async () => {
    setSaving(true);
    try {
      const hazards = form.category ? [{ category: form.category }] : [];
      const controls = form.mitigationPlan ? [{ plan: form.mitigationPlan }] : [];
      const res = await api.post('/api/risk-assessments', {
        title: `Risk Assessment - ${form.asset}`,
        assetId: form.asset || undefined,
        likelihood: form.likelihood ? parseInt(form.likelihood) : undefined,
        consequence: form.consequence ? parseInt(form.consequence) : undefined,
        hazards,
        controls,
      });
      if (res.success) {
        toast.success('Risk assessment created successfully');
        setCreateOpen(false);
        setForm({ asset: '', category: '', likelihood: '', consequence: '', mitigationPlan: '', assessor: '' });
        loadAssessments();
      } else {
        toast.error(res.error || 'Failed to create risk assessment');
      }
    } catch { toast.error('Failed to create risk assessment'); }
    setSaving(false);
  };
  const parseJsonArr = (jsonStr: string | null): string => {
    if (!jsonStr) return '-';
    try {
      const arr = JSON.parse(jsonStr);
      if (Array.isArray(arr)) return arr.map((item: any) => item.category || item.plan || item.task || item.text || JSON.stringify(item)).join(', ');
      return String(arr);
    } catch { return jsonStr; }
  };
  const handleEditOpen = (item: any) => {
    setEditItem(item);
    setEditForm({
      title: item.title || '',
      description: item.description || '',
      type: item.type || 'operational',
      status: item.status || 'open',
      assessor: item.assessor || '',
      department: item.department || '',
      assessmentDate: item.assessmentDate || '',
      riskLevel: item.riskLevel || 'medium',
      hazards: parseJsonArr(item.hazards),
      mitigations: parseJsonArr(item.controls),
    });
  };
  const handleEditSave = async () => {
    if (!editItem) return;
    setEditLoading(true);
    try {
      const hazards = editForm.hazards ? [{ category: editForm.hazards }] : [];
      const controls = editForm.mitigations ? [{ plan: editForm.mitigations }] : [];
      const res = await api.put(`/api/risk-assessments/${editItem.id}`, {
        title: editForm.title,
        description: editForm.description || undefined,
        type: editForm.type,
        status: editForm.status,
        assessor: editForm.assessor || undefined,
        department: editForm.department || undefined,
        assessmentDate: editForm.assessmentDate || undefined,
        riskLevel: editForm.riskLevel,
        hazards,
        controls,
      });
      if (res.success) {
        toast.success('Risk assessment updated successfully');
        setAssessments(prev => prev.map(a => a.id === editItem.id ? { ...a, ...res.data } : a));
        setEditItem(null);
        loadAssessments();
      } else {
        toast.error(res.error || 'Failed to update risk assessment');
      }
    } catch { toast.error('Failed to update risk assessment'); }
    setEditLoading(false);
  };

  return (
    <div className="page-content">
      <div><h1 className="text-2xl font-bold tracking-tight">Risk Assessment</h1><p className="text-muted-foreground mt-1">Evaluate and manage risks associated with asset failures and maintenance activities</p></div>
      {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(k => { const I = k.icon; return (
          <Card key={k.label}><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
        ); })}
      </div>
      <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div><CardTitle className="text-base">Risk Assessments</CardTitle><CardDescription className="text-xs">Risk matrix with likelihood and consequence scoring</CardDescription></div>
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" />New Assessment</Button>
            <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen} title="New Risk Assessment" description="Evaluate risk for an asset" footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={saving || !form.asset || !form.likelihood || !form.consequence}>{saving ? 'Creating...' : 'Create Assessment'}</Button></div>}>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2"><Label className="text-xs">Asset</Label><AsyncSearchableSelect
                    value={form.asset}
                    onValueChange={v => setForm({ ...form, asset: v })}
                    fetchOptions={fetchRiskAssetOptions}
                    placeholder="Select asset..."
                    searchPlaceholder="Search assets..."
                  /></div>
                  <div className="grid gap-2"><Label className="text-xs">Category</Label><Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent><SelectItem value="mechanical">Mechanical</SelectItem><SelectItem value="electrical">Electrical</SelectItem><SelectItem value="safety">Safety</SelectItem><SelectItem value="environmental">Environmental</SelectItem><SelectItem value="operational">Operational</SelectItem></SelectContent></Select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2"><Label className="text-xs">Likelihood (1-5)</Label><Select value={form.likelihood} onValueChange={v => setForm({ ...form, likelihood: v })}><SelectTrigger><SelectValue placeholder="1-5" /></SelectTrigger><SelectContent><SelectItem value="1">1 - Rare</SelectItem><SelectItem value="2">2 - Unlikely</SelectItem><SelectItem value="3">3 - Possible</SelectItem><SelectItem value="4">4 - Likely</SelectItem><SelectItem value="5">5 - Almost Certain</SelectItem></SelectContent></Select></div>
                    <div className="grid gap-2"><Label className="text-xs">Consequence (1-5)</Label><Select value={form.consequence} onValueChange={v => setForm({ ...form, consequence: v })}><SelectTrigger><SelectValue placeholder="1-5" /></SelectTrigger><SelectContent><SelectItem value="1">1 - Negligible</SelectItem><SelectItem value="2">2 - Minor</SelectItem><SelectItem value="3">3 - Moderate</SelectItem><SelectItem value="4">4 - Major</SelectItem><SelectItem value="5">5 - Catastrophic</SelectItem></SelectContent></Select></div>
                  </div>
                  <div className="grid gap-2"><Label className="text-xs">Mitigation Plan</Label><Textarea placeholder="Describe mitigation measures..." value={form.mitigationPlan} onChange={e => setForm({ ...form, mitigationPlan: e.target.value })} rows={3} /></div>
                  <div className="grid gap-2"><Label className="text-xs">Assessor</Label><Input placeholder="e.g. Sarah Chen" value={form.assessor} onChange={e => setForm({ ...form, assessor: e.target.value })} /></div>
                </div>
            </ResponsiveDialog>
          </div>
          <div className="filter-row flex flex-col sm:flex-row gap-2 mt-3">
            <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search assets, assessment IDs..." className="pl-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <Select value={levelFilter} onValueChange={setLevelFilter}><SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Risk Level" /></SelectTrigger><SelectContent><SelectItem value="all">All Levels</SelectItem><SelectItem value="extreme">Extreme</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table><TableHeader><TableRow><TableHead className="text-xs">ID</TableHead><TableHead className="text-xs">Asset</TableHead><TableHead className="text-xs hidden md:table-cell">Description</TableHead><TableHead className="text-xs text-center">L</TableHead><TableHead className="text-xs text-center">C</TableHead><TableHead className="text-xs text-center">Risk Score</TableHead><TableHead className="text-xs">Level</TableHead><TableHead className="text-xs hidden lg:table-cell">Status</TableHead><TableHead className="text-xs hidden md:table-cell">Date</TableHead><TableHead className="w-10"></TableHead></TableRow></TableHeader><TableBody>
              {filtered.map(a => {
                const rs = (a.likelihood || 0) * (a.consequence || 0);
                const dl = mapRiskLevel(a.riskLevel || '');
                return (
                <TableRow key={a.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{a.assessmentNumber}</TableCell>
                  <TableCell className="font-medium text-sm">{a.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">{a.description || '-'}</TableCell>
                  <TableCell className="text-xs text-center font-medium">{a.likelihood ?? '-'}</TableCell>
                  <TableCell className="text-xs text-center font-medium">{a.consequence ?? '-'}</TableCell>
                  <TableCell className="text-center"><Badge variant="outline" className={`text-[10px] font-bold ${riskScoreColor(rs)}`}>{rs || '-'}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] uppercase font-semibold ${riskLevelColors[a.riskLevel] || riskLevelColors[dl] || ''}`}>{dl || a.riskLevel || '-'}</Badge></TableCell>
                  <TableCell className="text-xs capitalize hidden lg:table-cell"><Badge variant="outline" className="text-[10px]">{(a.status || 'open').replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{formatDate(a.assessmentDate)}</TableCell>
                  <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setViewItem(a)}><Eye className="h-4 w-4 mr-2" />View</DropdownMenuItem><DropdownMenuItem onClick={() => handleEditOpen(a)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
                </TableRow>
                );
              })}
              {filtered.length === 0 && <TableRow><TableCell colSpan={10}><EmptyState icon={TriangleAlert} title="No assessments found" description="Adjust your search or filter criteria" /></TableCell></TableRow>}
            </TableBody></Table>
          </div>
        </CardContent>
      </Card>
      </>}
      <ResponsiveDialog open={!!viewItem} onOpenChange={open => { if (!open) setViewItem(null); }} title="Risk Assessment Details" description="View assessment information" footer={<Button variant="outline" onClick={() => setViewItem(null)}>Close</Button>}>
          {viewItem && <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="col-span-2"><span className="text-muted-foreground">Title</span><p className="font-medium">{viewItem.title || '-'}</p></div>
            <div><span className="text-muted-foreground">Type</span><p className="font-medium capitalize">{viewItem.type || '-'}</p></div>
            <div><span className="text-muted-foreground">Status</span><p className="font-medium capitalize">{(viewItem.status || 'open').replace(/_/g, ' ')}</p></div>
            <div><span className="text-muted-foreground">Assessor</span><p className="font-medium">{viewItem.assessor || '-'}</p></div>
            <div><span className="text-muted-foreground">Department</span><p className="font-medium">{viewItem.department || '-'}</p></div>
            <div><span className="text-muted-foreground">Assessment Date</span><p className="font-medium">{formatDate(viewItem.assessmentDate)}</p></div>
            <div><span className="text-muted-foreground">Risk Level</span><Badge variant="outline" className={`text-[10px] uppercase font-semibold ${riskLevelColors[viewItem.riskLevel] || ''}`}>{mapRiskLevel(viewItem.riskLevel || '') || '-'}</Badge></div>
            <div><span className="text-muted-foreground">Likelihood</span><p className="font-medium">{viewItem.likelihood ?? '-'}</p></div>
            <div><span className="text-muted-foreground">Consequence</span><p className="font-medium">{viewItem.consequence ?? '-'}</p></div>
            <div className="col-span-2"><span className="text-muted-foreground">Description</span><p className="font-medium">{viewItem.description || '-'}</p></div>
            <div className="col-span-2"><span className="text-muted-foreground">Hazards</span><p className="font-medium">{parseJsonArr(viewItem.hazards)}</p></div>
            <div className="col-span-2"><span className="text-muted-foreground">Mitigations</span><p className="font-medium">{parseJsonArr(viewItem.controls)}</p></div>
          </div>}
      </ResponsiveDialog>
      <ResponsiveDialog open={!!editItem} onOpenChange={open => { if (!open) setEditItem(null); }} title="Edit Risk Assessment" description="Update assessment details" footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button><Button onClick={handleEditSave} disabled={editLoading}>{editLoading ? 'Saving...' : 'Save Changes'}</Button></div>}>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label><Select value={editForm.type} onValueChange={v => setEditForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mechanical">Mechanical</SelectItem><SelectItem value="electrical">Electrical</SelectItem><SelectItem value="safety">Safety</SelectItem><SelectItem value="environmental">Environmental</SelectItem><SelectItem value="operational">Operational</SelectItem></SelectContent></Select></div>
              <div><Label>Status</Label><Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Assessor</Label><Input value={editForm.assessor} onChange={e => setEditForm(f => ({ ...f, assessor: e.target.value }))} /></div>
              <div><Label>Department</Label><Input value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DatePicker label="Assessment Date" value={editForm.assessmentDate || undefined} onChange={v => setEditForm(f => ({ ...f, assessmentDate: v || '' }))} />
              <div><Label>Risk Level</Label><Select value={editForm.riskLevel} onValueChange={v => setEditForm(f => ({ ...f, riskLevel: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem><SelectItem value="extreme">Extreme</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Description</Label><Textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
            <div><Label>Hazards</Label><Textarea value={editForm.hazards} onChange={e => setEditForm(f => ({ ...f, hazards: e.target.value }))} rows={2} placeholder="Describe hazards..." /></div>
            <div><Label>Mitigations</Label><Textarea value={editForm.mitigations} onChange={e => setEditForm(f => ({ ...f, mitigations: e.target.value }))} rows={2} placeholder="Describe mitigation measures..." /></div>
          </div>
      </ResponsiveDialog>
    </div>
  );
}

export function MaintenanceToolsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', category: '', location: '', serialNumber: '', condition: '', plantId: '', assignedToId: '', quantity: '1' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tools, setTools] = useState<any[]>([]);
  const [kpis, setKpis] = useState({ total: 0, available: 0, checkedOut: 0, inRepair: 0, retired: 0 });
  const { hasPermission, isAdmin } = useAuthStore();

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);
  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canEdit = hasPermission('tools.update') || isAdmin();
  const canDelete = hasPermission('tools.delete') || isAdmin();

  const loadTools = async () => {
    try {
      const res = await api.get('/api/tools?limit=100');
      if (res.success && res.data) {
        setTools(Array.isArray(res.data) ? res.data : []);
        if (res.kpis) setKpis(res.kpis);
      }
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/tools?limit=100');
        if (res.success && res.data) {
          setTools(Array.isArray(res.data) ? res.data : []);
          if (res.kpis) setKpis(res.kpis);
        }
      } catch { /* empty */ }
      setLoading(false);
    })();
  }, []);

  const toolStatusColors: Record<string, string> = {
    available: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    checked_out: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
    in_repair: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    transferred: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
    retired: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800',
  };

  const kpiCards = [
    { label: 'Total Tools', value: kpis.total, icon: WrenchIcon, color: 'text-slate-600 bg-slate-50 dark:bg-slate-800/50 dark:text-slate-300' },
    { label: 'Available', value: kpis.available, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Checked Out', value: kpis.checkedOut, icon: ArrowRightLeft, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Needs Repair', value: kpis.inRepair, icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
  ];

  const filtered = tools.filter((t: any) => {
    const matchSearch = !search || t.name?.toLowerCase().includes(search.toLowerCase()) || t.toolCode?.toLowerCase().includes(search.toLowerCase()) || t.location?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleCreate = async () => {
    if (!form.name || !form.category) { toast.error('Tool name and category are required'); return; }
    setSaving(true);
    try {
      const res = await api.post('/api/tools?limit=100', { ...form, quantity: parseInt(form.quantity) || 1 });
      if (res.success) {
        toast.success('Tool added successfully');
        setCreateOpen(false);
        setForm({ name: '', category: '', location: '', serialNumber: '', condition: '', plantId: '', assignedToId: '', quantity: '1' });
        loadTools();
      } else {
        toast.error(res.error || 'Failed to add tool');
      }
    } catch { toast.error('Failed to add tool'); }
    setSaving(false);
  };

  const openEditDialog = (t: any) => {
    setEditForm({
      id: t.id,
      name: t.name || '',
      description: t.description || '',
      category: t.category || '',
      serialNumber: t.serialNumber || '',
      condition: t.condition || 'good',
      status: t.status || 'available',
      location: t.location || '',
      plantId: t.plantId || '',
      assignedToId: t.assignedToId || '',
      quantity: String(t.quantity ?? 1),
      purchaseCost: t.purchaseCost != null ? String(t.purchaseCost) : '',
      currentValue: t.currentValue != null ? String(t.currentValue) : '',
      manufacturer: t.manufacturer || '',
      model: t.model || '',
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editForm.name || !editForm.category) { toast.error('Tool name and category are required'); return; }
    setEditSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: editForm.name,
        description: editForm.description || null,
        category: editForm.category,
        serialNumber: editForm.serialNumber || null,
        condition: editForm.condition,
        status: editForm.status,
        location: editForm.location || null,
        plantId: editForm.plantId || null,
        assignedToId: editForm.assignedToId || null,
        quantity: parseInt(editForm.quantity) || 1,
        purchaseCost: editForm.purchaseCost ? parseFloat(editForm.purchaseCost) : null,
        currentValue: editForm.currentValue ? parseFloat(editForm.currentValue) : null,
        manufacturer: editForm.manufacturer || null,
        model: editForm.model || null,
      };
      const res = await api.put(`/api/tools/${editForm.id}`, payload);
      if (res.success) {
        toast.success('Tool updated successfully');
        setEditOpen(false);
        loadTools();
      } else {
        toast.error(res.error || 'Failed to update tool');
      }
    } catch { toast.error('Failed to update tool'); }
    setEditSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      const res = await api.delete(`/api/tools/${deleteId}`);
      if (res.success) {
        toast.success('Tool deactivated successfully');
        setDeleteId(null);
        loadTools();
      } else {
        toast.error(res.error || 'Failed to deactivate tool');
      }
    } catch { toast.error('Failed to deactivate tool'); }
    setDeleteLoading(false);
  };

  const categoryOptions = [
    { value: 'Hand Tool', label: 'Hand Tool' },
    { value: 'Power Tool', label: 'Power Tool' },
    { value: 'Measurement', label: 'Measurement' },
    { value: 'Safety', label: 'Safety' },
    { value: 'Cutting', label: 'Cutting' },
    { value: 'Welding', label: 'Welding' },
    { value: 'Lifting', label: 'Lifting' },
    { value: 'Pneumatic', label: 'Pneumatic' },
    { value: 'Electrical', label: 'Electrical' },
  ];

  const renderToolForm = (f: any, setF: (updater: any) => void, showStatus?: boolean) => (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2"><Label className="text-xs">Tool Name <span className="text-destructive">*</span></Label><Input placeholder="e.g. Torque Wrench 1/2 inch" value={f.name} onChange={e => setF((p: any) => ({ ...p, name: e.target.value }))} /></div>
      <div className="grid gap-2"><Label className="text-xs">Description</Label><Textarea placeholder="Optional description..." value={f.description || ''} onChange={e => setF((p: any) => ({ ...p, description: e.target.value }))} rows={2} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2"><Label className="text-xs">Category <span className="text-destructive">*</span></Label>
          <SearchableSelect
            value={f.category}
            onValueChange={v => setF((p: any) => ({ ...p, category: v }))}
            options={categoryOptions.map(c => ({ ...c, group: 'Tool Types' }))}
            placeholder="Select category..."
            searchPlaceholder="Search categories..."
            groupBy={false}
          />
        </div>
        <div className="grid gap-2"><Label className="text-xs">Quantity</Label><Input type="number" min="1" value={f.quantity} onChange={e => setF((p: any) => ({ ...p, quantity: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2"><Label className="text-xs">Condition</Label><Select value={f.condition} onValueChange={v => setF((p: any) => ({ ...p, condition: v }))}><SelectTrigger><SelectValue placeholder="Condition" /></SelectTrigger><SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="good">Good</SelectItem><SelectItem value="fair">Fair</SelectItem><SelectItem value="poor">Poor</SelectItem></SelectContent></Select></div>
        {showStatus && <div className="grid gap-2"><Label className="text-xs">Status</Label><Select value={f.status} onValueChange={v => setF((p: any) => ({ ...p, status: v }))}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="available">Available</SelectItem><SelectItem value="checked_out">Checked Out</SelectItem><SelectItem value="in_repair">In Repair</SelectItem><SelectItem value="transferred">Transferred</SelectItem><SelectItem value="retired">Retired</SelectItem></SelectContent></Select></div>}
      </div>
      <div className="grid gap-2"><Label className="text-xs">Location</Label><Input placeholder="e.g. Tool Room A-1" value={f.location || ''} onChange={e => setF((p: any) => ({ ...p, location: e.target.value }))} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2"><Label className="text-xs">Serial Number</Label><Input placeholder="e.g. SN-2024-001" value={f.serialNumber || ''} onChange={e => setF((p: any) => ({ ...p, serialNumber: e.target.value }))} /></div>
        <div className="grid gap-2"><Label className="text-xs">Manufacturer</Label><Input placeholder="e.g. Bosch" value={f.manufacturer || ''} onChange={e => setF((p: any) => ({ ...p, manufacturer: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2"><Label className="text-xs">Model</Label><Input placeholder="e.g. GWS 18V-10" value={f.model || ''} onChange={e => setF((p: any) => ({ ...p, model: e.target.value }))} /></div>
        <div className="grid gap-2"><Label className="text-xs">Purchase Cost</Label><Input type="number" step="0.01" placeholder="0.00" value={f.purchaseCost || ''} onChange={e => setF((p: any) => ({ ...p, purchaseCost: e.target.value }))} /></div>
      </div>
      <div className="grid gap-2"><Label className="text-xs">Current Value</Label><Input type="number" step="0.01" placeholder="0.00" value={f.currentValue || ''} onChange={e => setF((p: any) => ({ ...p, currentValue: e.target.value }))} /></div>
      <div className="grid gap-2"><Label className="text-xs">Plant</Label>
        <AsyncSearchableSelect
          value={f.plantId || ''}
          onValueChange={v => setF((p: any) => ({ ...p, plantId: v }))}
          fetchOptions={async () => {
            const res = await api.get('/api/plants');
            if (res.success && res.data) {
              return (Array.isArray(res.data) ? res.data : []).map((p: any) => ({
                value: p.id,
                label: p.name,
                group: p.city || p.location || undefined,
              }));
            }
            return [];
          }}
          placeholder="Select plant..."
          searchPlaceholder="Search plants..."
        />
      </div>
      <div className="grid gap-2"><Label className="text-xs">Assigned To</Label>
        <AsyncSearchableSelect
          value={f.assignedToId || ''}
          onValueChange={v => setF((p: any) => ({ ...p, assignedToId: v }))}
          fetchOptions={async () => {
            const res = await api.get('/api/workers?role=all');
            if (res.success && res.data) {
              return (Array.isArray(res.data) ? res.data : []).map((u: any) => ({
                value: u.id,
                label: `${u.fullName || u.username} (${u.username || ''})`,
              }));
            }
            return [];
          }}
          placeholder="Select user..."
          searchPlaceholder="Search users..."
        />
      </div>
    </div>
  );

  return (
    <div className="page-content">
      <div><h1 className="text-2xl font-bold tracking-tight">Tools</h1><p className="text-muted-foreground mt-1">Manage maintenance tool inventory, assignments, and condition tracking</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(k => { const I = k.icon; return (
          <Card key={k.label}><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
        ); })}
      </div>
      <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div><CardTitle className="text-base">Tool Inventory</CardTitle><CardDescription className="text-xs">Track tool availability, assignments, and condition</CardDescription></div>
            {(hasPermission('tools.create') || isAdmin()) && (
              <Button size="sm" className="gap-1.5" onClick={() => { setForm({ name: '', category: '', location: '', serialNumber: '', condition: '', plantId: '', assignedToId: '', quantity: '1' }); setCreateOpen(true); }}><Plus className="h-3.5 w-3.5" />Add Tool</Button>
            )}
            <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen} title="Add New Tool" description="Register a new tool in the inventory" footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={saving}>{saving ? 'Adding...' : 'Add Tool'}</Button></div>}>
                {renderToolForm(form, setForm)}
            </ResponsiveDialog>
          </div>
          <div className="filter-row flex flex-col sm:flex-row gap-2 mt-3">
            <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search tools, locations..." className="pl-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="available">Available</SelectItem><SelectItem value="checked_out">Checked Out</SelectItem><SelectItem value="in_repair">In Repair</SelectItem><SelectItem value="retired">Retired</SelectItem></SelectContent></Select>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table><TableHeader><TableRow><TableHead className="text-xs">Code</TableHead><TableHead className="text-xs">Tool Name</TableHead><TableHead className="text-xs hidden md:table-cell">Category</TableHead><TableHead className="text-xs">Qty</TableHead><TableHead className="text-xs hidden lg:table-cell">Location</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs hidden md:table-cell">Condition</TableHead><TableHead className="text-xs hidden md:table-cell">Assigned To</TableHead><TableHead className="text-xs w-10"></TableHead></TableRow></TableHeader><TableBody>
              {loading && <TableRow><TableCell colSpan={9}><div className="flex items-center justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div></TableCell></TableRow>}
              {!loading && filtered.map((t: any) => (
                <TableRow key={t.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{t.toolCode}</TableCell>
                  <TableCell className="font-medium text-sm max-w-[180px] truncate">{t.name}</TableCell>
                  <TableCell className="text-xs hidden md:table-cell">{t.category?.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-xs font-medium">{t.quantity ?? 1}</TableCell>
                  <TableCell className="text-xs hidden lg:table-cell"><div className="flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{t.location || '-'}</div></TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] uppercase font-semibold ${toolStatusColors[t.status] || ''}`}>{t.status?.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="text-xs hidden md:table-cell capitalize">{t.condition || '-'}</TableCell>
                  <TableCell className="text-xs hidden md:table-cell">{t.assignedTo?.fullName || '-'}</TableCell>
                  <TableCell>
                    {(canEdit || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEdit && (
                            <DropdownMenuItem className="text-blue-600 focus:text-blue-600 focus:bg-blue-50" onClick={() => openEditDialog(t)}>
                              <Pencil className="h-4 w-4 mr-2" />Edit Tool
                            </DropdownMenuItem>
                          )}
                          {canDelete && t.isActive && (
                            <DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50" onClick={() => setDeleteId(t.id)}>
                              <Trash2 className="h-4 w-4 mr-2" />Deactivate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={9}><EmptyState icon={WrenchIcon} title="No tools found" description="Adjust your search or filter criteria" /></TableCell></TableRow>}
            </TableBody></Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <ResponsiveDialog open={editOpen} onOpenChange={setEditOpen} title="Edit Tool" description={`Editing: ${editForm.toolCode || editForm.name || ''}`} large footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button onClick={handleEdit} disabled={editSaving}>{editSaving ? 'Saving...' : 'Save Changes'}</Button></div>}>
        {renderToolForm(editForm, setEditForm, true)}
      </ResponsiveDialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Deactivate Tool"
        description="This will mark the tool as retired and remove any assignment. This action can be undone by editing the tool later."
        confirmLabel={deleteLoading ? 'Deactivating...' : 'Deactivate'}
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteLoading}
      />
    </div>
  );
}

// ============================================================================
// PM TEMPLATES PAGE
// ============================================================================

interface PmTemplateItem {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  category?: string | null;
  estimatedDuration: number;
  priority: string;
  requiredSkills?: string | null;
  requiredTools?: string | null;
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; fullName: string; username: string } | null;
  _count?: { tasks: number; schedules?: number };
  tasks?: PmTemplateTaskItem[];
}

interface PmTemplateTaskItem {
  id: string;
  templateId: string;
  taskNumber: number;
  description: string;
  taskType: string;
  requiredParts?: string | null;
  estimatedMinutes?: number | null;
  sortOrder: number;
  isActive: boolean;
}

const TEMPLATE_TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  preventive: { label: 'Preventive', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40', icon: CheckCircle2 },
  predictive: { label: 'Predictive', color: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/40', icon: TrendingUp },
  inspection: { label: 'Inspection', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40', icon: Eye },
  calibration: { label: 'Calibration', color: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900/40', icon: Gauge },
  lubrication: { label: 'Lubrication', color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-400 dark:border-teal-900/40', icon: Droplets },
};

const TASK_TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  check: { label: 'Check', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400', icon: CheckSquare },
  measure: { label: 'Measure', color: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400', icon: Ruler },
  inspect: { label: 'Inspect', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400', icon: Eye },
  lubricate: { label: 'Lubricate', color: 'bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400', icon: Droplets },
  replace: { label: 'Replace', color: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400', icon: RotateCcw },
  record: { label: 'Record', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-400', icon: FileText },
};

function TemplateTypeBadge({ type }: { type: string }) {
  const cfg = TEMPLATE_TYPE_CONFIG[type] || { label: type, color: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400', icon: ClipboardList };
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold gap-1 ${cfg.color}`}>
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function TaskTypeBadge({ type }: { type: string }) {
  const cfg = TASK_TYPE_CONFIG[type] || { label: type, color: 'bg-slate-100 text-slate-600', icon: CheckSquare };
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold gap-1 ${cfg.color}`}>
      <cfg.icon className="h-2.5 w-2.5" />
      {cfg.label}
    </Badge>
  );
}

export function PmTemplatesPage() {
  const [templates, setTemplates] = useState<PmTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<PmTemplateItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteTaskConfirmId, setDeleteTaskConfirmId] = useState<string | null>(null);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterActive, setFilterActive] = useState(true);

  // Template form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState('preventive');
  const [formCategory, setFormCategory] = useState('');
  const [formPriority, setFormPriority] = useState('medium');
  const [formDuration, setFormDuration] = useState('');
  const [formSkills, setFormSkills] = useState('');
  const [formTools, setFormTools] = useState('');

  // Task builder state
  const [taskList, setTaskList] = useState<PmTemplateTaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskType, setNewTaskType] = useState('check');
  const [newTaskMinutes, setNewTaskMinutes] = useState('');
  const [newTaskParts, setNewTaskParts] = useState('');
  const [addTaskLoading, setAddTaskLoading] = useState(false);

  const { hasPermission } = useAuthStore();

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType !== 'all') params.set('type', filterType);
      params.set('active', String(filterActive));
      const res = await api.get<PmTemplateItem[]>(`/api/pm-templates?${params.toString()}`);
      if (res.success && res.data) setTemplates(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filterType, filterActive]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const filteredTemplates = useMemo(() => {
    if (!searchText.trim()) return templates;
    const q = searchText.toLowerCase();
    return templates.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q)
    );
  }, [templates, searchText]);

  const stats = useMemo(() => {
    const total = templates.length;
    const active = templates.filter(t => t.isActive).length;
    const totalTasks = templates.reduce((sum, t) => sum + (t._count?.tasks ?? 0), 0);
    const avgTasks = total > 0 ? (totalTasks / total).toFixed(1) : '0';
    return { total, active, avgTasks };
  }, [templates]);

  const fetchTasks = useCallback(async (templateId: string) => {
    setTasksLoading(true);
    try {
      const res = await api.get<{ tasks: PmTemplateTaskItem[] }>(`/api/pm-templates/${templateId}`);
      if (res.success && res.data && (res.data as any).tasks) {
        setTaskList((res.data as any).tasks);
      } else {
        setTaskList([]);
      }
    } catch { setTaskList([]); }
    setTasksLoading(false);
  }, []);

  const resetForm = () => {
    setFormTitle(''); setFormDesc(''); setFormType('preventive');
    setFormCategory(''); setFormPriority('medium'); setFormDuration('');
    setFormSkills(''); setFormTools('');
  };

  const openCreate = () => { resetForm(); setCreateOpen(true); };

  const openEdit = (item: PmTemplateItem) => {
    setFormTitle(item.title || '');
    setFormDesc(item.description || '');
    setFormType(item.type || 'preventive');
    setFormCategory(item.category || '');
    setFormPriority(item.priority || 'medium');
    setFormDuration(String(item.estimatedDuration || ''));
    // Parse JSON skills/tools back to comma-separated
    try { setFormSkills(item.requiredSkills ? JSON.parse(item.requiredSkills).join(', ') : ''); } catch { setFormSkills(''); }
    try { setFormTools(item.requiredTools ? JSON.parse(item.requiredTools).join(', ') : ''); } catch { setFormTools(''); }
    setEditItem(item);
    setTasksExpanded(false);
    setTaskList([]);
  };

  const handleSave = async () => {
    if (!formTitle || !formDuration) { toast.error('Title and estimated duration are required'); return; }
    setSaving(true);
    try {
      const skillsArray = formSkills ? formSkills.split(',').map(s => s.trim()).filter(Boolean) : [];
      const toolsArray = formTools ? formTools.split(',').map(s => s.trim()).filter(Boolean) : [];

      if (editItem) {
        const res = await api.put(`/api/pm-templates/${editItem.id}`, {
          title: formTitle,
          description: formDesc || null,
          type: formType,
          category: formCategory || null,
          priority: formPriority,
          estimatedDuration: parseInt(formDuration, 10) || 0,
        });
        if (res.success) {
          toast.success('Template updated');
          setEditItem(null);
          fetchTemplates();
        } else { toast.error(res.error || 'Update failed'); }
      } else {
        const res = await api.post('/api/pm-templates', {
          title: formTitle,
          description: formDesc || null,
          type: formType,
          category: formCategory || null,
          priority: formPriority,
          estimatedDuration: parseInt(formDuration, 10) || 0,
          requiredSkills: skillsArray.length > 0 ? skillsArray : undefined,
          requiredTools: toolsArray.length > 0 ? toolsArray : undefined,
        });
        if (res.success) {
          toast.success('Template created');
          setCreateOpen(false);
          resetForm();
          fetchTemplates();
        } else { toast.error(res.error || 'Create failed'); }
      }
    } catch { toast.error('Operation failed'); }
    setSaving(false);
  };

  const handleToggleActive = async (item: PmTemplateItem) => {
    try {
      const res = await api.put(`/api/pm-templates/${item.id}`, { isActive: !item.isActive });
      if (res.success) {
        toast.success(item.isActive ? 'Template deactivated' : 'Template activated');
        fetchTemplates();
      } else { toast.error(res.error || 'Failed'); }
    } catch { toast.error('Failed'); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await api.delete(`/api/pm-templates/${deleteConfirmId}`);
      if (res.success) { toast.success('Template deactivated'); fetchTemplates(); }
      else { toast.error(res.error || 'Failed'); }
    } catch { toast.error('Failed'); }
    setDeleteConfirmId(null);
  };

  const handleAddTask = async () => {
    if (!editItem || !newTaskDesc.trim()) { toast.error('Task description is required'); return; }
    setAddTaskLoading(true);
    try {
      const partsArray = newTaskParts ? newTaskParts.split(',').map(s => s.trim()).filter(Boolean) : [];
      const res = await api.post(`/api/pm-templates/${editItem.id}/tasks`, {
        description: newTaskDesc.trim(),
        taskType: newTaskType,
        estimatedMinutes: newTaskMinutes ? parseInt(newTaskMinutes, 10) : undefined,
        requiredParts: partsArray.length > 0 ? partsArray : undefined,
      });
      if (res.success) {
        toast.success('Task added');
        setNewTaskDesc(''); setNewTaskMinutes(''); setNewTaskParts('');
        setNewTaskType('check');
        fetchTasks(editItem.id);
        fetchTemplates(); // refresh task count
      } else { toast.error(res.error || 'Failed to add task'); }
    } catch { toast.error('Failed to add task'); }
    setAddTaskLoading(false);
  };

  const handleDeleteTask = async () => {
    if (!editItem || !deleteTaskConfirmId) return;
    try {
      const res = await api.delete(`/api/pm-templates/${editItem.id}/tasks/${deleteTaskConfirmId}`);
      if (res.success) {
        toast.success('Task removed');
        fetchTasks(editItem.id);
        fetchTemplates();
      } else { toast.error(res.error || 'Failed to delete task'); }
    } catch { toast.error('Failed to delete task'); }
    setDeleteTaskConfirmId(null);
  };

  const dialogOpen = createOpen || !!editItem;
  const dialogTitle = editItem ? 'Edit PM Template' : 'New PM Template';
  const dialogDesc = editItem ? 'Update maintenance template and manage task checklist' : 'Create a reusable maintenance task checklist template';

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Preventive Maintenance</p>
          <h1 className="text-2xl font-bold tracking-tight">PM Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Define reusable maintenance task checklists for preventive work orders</p>
        </div>
        {hasPermission('work_orders.create') && (
          <Button size="sm" onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New Template
          </Button>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Total Templates', value: stats.total, icon: ClipboardList, color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' },
          { label: 'Active', value: stats.active, icon: Activity, color: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400' },
          { label: 'Avg Tasks/Tpl', value: stats.avgTasks, icon: ListChecks, color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${s.color}`}>
              <s.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="filter-row flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="preventive">Preventive</SelectItem>
            <SelectItem value="predictive">Predictive</SelectItem>
            <SelectItem value="inspection">Inspection</SelectItem>
            <SelectItem value="calibration">Calibration</SelectItem>
            <SelectItem value="lubrication">Lubrication</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card">
          <span className="text-xs text-muted-foreground">Active</span>
          <Switch
            checked={filterActive}
            onCheckedChange={setFilterActive}
          />
          <span className="text-xs text-muted-foreground">Show Inactive</span>
        </div>
      </div>

      {/* Templates Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-semibold">Template Name</TableHead>
                <TableHead className="text-xs font-semibold">Type</TableHead>
                <TableHead className="text-xs font-semibold hidden md:table-cell">Category</TableHead>
                <TableHead className="text-xs font-semibold">Tasks</TableHead>
                <TableHead className="text-xs font-semibold">Priority</TableHead>
                <TableHead className="text-xs font-semibold hidden lg:table-cell">Duration</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )) : filteredTemplates.length === 0 ? (
                <TableRow><TableCell colSpan={8}>
                  <EmptyState icon={ClipboardList} title="No templates found" description={searchText || filterType !== 'all' ? 'Try adjusting your filters' : 'Create your first PM template to get started'} />
                </TableCell></TableRow>
              ) : filteredTemplates.map(t => (
                <TableRow key={t.id} className="group">
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{t.title}</p>
                      {t.description && <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">{t.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell><TemplateTypeBadge type={t.type} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{t.category || '—'}</TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">{t._count?.tasks ?? 0}</span>
                    {t._count?.tasks === 0 && <span className="text-[10px] text-muted-foreground ml-1">tasks</span>}
                  </TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t.estimatedDuration} min
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={t.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700'}>
                      {t.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleActive(t)}>
                          {t.isActive ? (<><XCircle className="h-3.5 w-3.5 mr-2" />Deactivate</>) : (<><CheckCircle2 className="h-3.5 w-3.5 mr-2" />Activate</>)}
                        </DropdownMenuItem>
                        {t.isActive && (
                          <DropdownMenuItem onClick={() => setDeleteConfirmId(t.id)} className="text-red-600">
                            <Trash2 className="h-3.5 w-3.5 mr-2" />Deactivate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Template Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}
        title="Deactivate Template"
        description="Are you sure you want to deactivate this template? It will no longer be available for new PM schedules."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />

      {/* Delete Task Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTaskConfirmId}
        onOpenChange={(open) => { if (!open) setDeleteTaskConfirmId(null); }}
        title="Remove Task"
        description="Are you sure you want to remove this task from the template? This action cannot be undone."
        confirmLabel="Remove Task"
        variant="destructive"
        onConfirm={handleDeleteTask}
      />

      {/* Create/Edit Dialog */}
      <ResponsiveDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) { setCreateOpen(false); setEditItem(null); setTaskList([]); setTasksExpanded(false); }
        }}
        title={dialogTitle}
        description={dialogDesc}
        large
        footer={(
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditItem(null); setTaskList([]); setTasksExpanded(false); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving && <RefreshCw className="h-4 w-4 animate-spin mr-1.5" />}
              {editItem ? 'Update Template' : 'Create Template'}
            </Button>
          </div>
        )}
      >
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Title *</Label>
            <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g., Monthly Motor Inspection" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Description</Label>
            <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Describe the maintenance activities..." rows={2} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TEMPLATE_TYPE_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Category</Label>
              <SearchableSelect
                value={formCategory}
                onValueChange={setFormCategory}
                options={[
                  { value: 'Mechanical', label: 'Mechanical' },
                  { value: 'Electrical', label: 'Electrical' },
                  { value: 'Hydraulic', label: 'Hydraulic' },
                  { value: 'Pneumatic', label: 'Pneumatic' },
                  { value: 'Instrumentation', label: 'Instrumentation' },
                  { value: 'Civil', label: 'Civil' },
                  { value: 'Lubrication', label: 'Lubrication' },
                  { value: 'Inspection', label: 'Inspection' },
                  { value: 'Calibration', label: 'Calibration' },
                  { value: 'Other', label: 'Other' },
                ]}
                placeholder="Select category..."
                searchPlaceholder="Search categories..."
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Priority</Label>
              <Select value={formPriority} onValueChange={setFormPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['low', 'medium', 'high', 'critical'].map(p => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Est. Duration (min) *</Label>
              <Input type="number" min="1" value={formDuration} onChange={e => setFormDuration(e.target.value)} placeholder="60" />
            </div>
          </div>
          {!editItem && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Required Skills</Label>
                <Input value={formSkills} onChange={e => setFormSkills(e.target.value)} placeholder="Welding, Electrical, PLC (comma-separated)" />
                <p className="text-[11px] text-muted-foreground">Comma-separated list of required skills</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Required Tools</Label>
                <Input value={formTools} onChange={e => setFormTools(e.target.value)} placeholder="Multimeter, Torque Wrench (comma-separated)" />
                <p className="text-[11px] text-muted-foreground">Comma-separated list of required tools</p>
              </div>
            </>
          )}

          {/* Task Checklist Builder — only visible when editing */}
          {editItem && (
            <div className="mt-4">
              {/* Expandable header */}
              <button
                type="button"
                onClick={() => {
                  if (!tasksExpanded && taskList.length === 0) fetchTasks(editItem.id);
                  setTasksExpanded(!tasksExpanded);
                }}
                className="w-full flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold">Task Checklist</span>
                  <Badge variant="outline" className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
                    {taskList.length} {taskList.length === 1 ? 'task' : 'tasks'}
                  </Badge>
                </div>
                {tasksExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>

              {/* Expanded task list */}
              {tasksExpanded && (
                <div className="mt-3 space-y-3">
                  {/* Task list */}
                  <div className="max-h-64 overflow-y-auto space-y-1.5 custom-scrollbar">
                    {tasksLoading ? (
                      <div className="space-y-2 p-3">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-3/4" />
                      </div>
                    ) : taskList.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No tasks yet. Add your first task below.</p>
                      </div>
                    ) : (
                      taskList.map((task) => {
                        let parsedParts: string[] = [];
                        try { parsedParts = task.requiredParts ? JSON.parse(task.requiredParts) : []; } catch { /* ignore */ }
                        return (
                          <div
                            key={task.id}
                            className="flex items-center gap-2 p-2.5 rounded-lg border bg-card group/task hover:bg-muted/30 transition-colors"
                          >
                            {/* Drag handle */}
                            <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0 cursor-grab" />
                            {/* Task number */}
                            <span className="text-[10px] font-mono font-semibold text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                              {task.taskNumber}
                            </span>
                            {/* Description */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{task.description}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <TaskTypeBadge type={task.taskType} />
                                {task.estimatedMinutes && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <Clock className="h-2.5 w-2.5" />{task.estimatedMinutes}m
                                  </span>
                                )}
                                {parsedParts.length > 0 && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <Wrench className="h-2.5 w-2.5" />{parsedParts.join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Delete task button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover/task:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                              onClick={() => setDeleteTaskConfirmId(task.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Add Task form */}
                  <div className="p-3 rounded-lg border-2 border-dashed border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10">
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      Add Task
                    </p>
                    <div className="space-y-2">
                      <Input
                        value={newTaskDesc}
                        onChange={e => setNewTaskDesc(e.target.value)}
                        placeholder="Task description *"
                        className="text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={newTaskType} onValueChange={setNewTaskType}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(TASK_TYPE_CONFIG).map(([key, cfg]) => (
                              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min="1"
                          value={newTaskMinutes}
                          onChange={e => setNewTaskMinutes(e.target.value)}
                          placeholder="Est. minutes"
                          className="text-sm"
                        />
                      </div>
                      <Input
                        value={newTaskParts}
                        onChange={e => setNewTaskParts(e.target.value)}
                        placeholder="Required parts (comma-separated, optional)"
                        className="text-sm"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddTask}
                        disabled={addTaskLoading || !newTaskDesc.trim()}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                      >
                        {addTaskLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                        Add Task to Checklist
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ResponsiveDialog>
    </div>
  );
}

// ============================================================================
// INVENTORY SUBPAGES
// ============================================================================

