'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/datetime-picker';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AsyncSearchableSelect } from '@/components/ui/searchable-select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';;
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Factory, Layers, Calendar, Box, TrendingUp, AlertTriangle,
  ClipboardList, Package, Plus, Search, MoreHorizontal, Pencil, Trash2,
  Loader2,
  Zap, CheckCircle2, Clock, Eye, ArrowUpDown, BarChart3, Activity,
  RefreshCw, Settings, Gauge, Target, Play, X,
  TrendingDown, DollarSign,
  Minus, Pause, ShieldCheck, Wrench, XCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
  AreaChart, Area, ResponsiveContainer,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { EmptyState, StatusBadge, PriorityBadge, formatDate, formatDateTime, timeAgo, LoadingSkeleton, formatCurrency } from '@/components/shared/helpers';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ProductionWorkCentersPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({ name: '', type: 'production', location: '', capacity: '', description: '' });
  const [wcData, setWcData] = useState<any[]>([]);
  const [kpisData, setKpisData] = useState({ total: 0, active: 0, idle: 0, maintenance: 0 });
  const { hasPermission, isAdmin } = useAuthStore();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const res = await api.get('/api/work-centers');
      if (res.success) {
        setWcData(res.data || []);
        if (res.kpis) setKpisData(res.kpis as any);
      }
      setLoading(false);
    })();
  }, []);
  const statusColors: Record<string, string> = { active: 'bg-emerald-50 text-emerald-700 border-emerald-200', inactive: 'bg-amber-50 text-amber-700 border-amber-200', maintenance: 'bg-slate-100 text-slate-600 border-slate-200' };
  const typeColors: Record<string, string> = { production: 'bg-sky-50 text-sky-700', assembly: 'bg-amber-50 text-amber-700', packaging: 'bg-teal-50 text-teal-700', testing: 'bg-violet-50 text-violet-700' };
  const filtered = wcData.filter((r: any) => {
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const kpis = [
    { label: 'Total Work Centers', value: kpisData.total, icon: Factory, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Active', value: kpisData.active, icon: Play, color: 'text-sky-600 bg-sky-50' },
    { label: 'Idle', value: kpisData.idle, icon: Pause, color: 'text-amber-600 bg-amber-50' },
    { label: 'Under Maintenance', value: kpisData.maintenance, icon: Wrench, color: 'text-slate-600 bg-slate-100' },
  ];
  const handleCreate = async () => {
    if (!form.name || !form.type) { toast.error('Name and type are required'); return; }
    const res = await api.post('/api/work-centers', form);
    if (res.success) {
      toast.success('Work center created');
      setCreateOpen(false);
      setForm({ name: '', type: 'production', location: '', capacity: '', description: '' });
      const listRes = await api.get('/api/work-centers');
      if (listRes.success) { setWcData(listRes.data || []); if (listRes.kpis) setKpisData(listRes.kpis as any); }
    } else { toast.error(res.error || 'Failed to create work center'); }
  };
  const handleDelete = async (id: string) => {
    const res = await api.delete(`/api/work-centers/${id}`);
    if (res.success) {
      toast.success('Work center deleted');
      const listRes = await api.get('/api/work-centers');
      if (listRes.success) { setWcData(listRes.data || []); if (listRes.kpis) setKpisData(listRes.kpis as any); }
    } else { toast.error(res.error || 'Failed to delete'); }
  };
  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Work Centers</h1><p className="text-muted-foreground text-sm mt-1">Define and manage production work centers, lines, and cells</p></div>
        {(hasPermission('production.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-1.5" />New Work Center</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => { const I = k.icon; return (<Card key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative min-w-[200px] max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search work centers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterType} onValueChange={setFilterType}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem><SelectItem value="production">Production</SelectItem><SelectItem value="assembly">Assembly</SelectItem><SelectItem value="packaging">Packaging</SelectItem><SelectItem value="testing">Testing</SelectItem></SelectContent></Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem></SelectContent></Select>
      </div>
      <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead className="w-[100px]">Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Location</TableHead><TableHead className="text-right">Capacity</TableHead><TableHead>Status</TableHead><TableHead className="w-[50px]"></TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={7} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (<TableRow><TableCell colSpan={7} className="h-48 text-center text-muted-foreground">No work centers found</TableCell></TableRow>) : filtered.map((r: any) => (
              <TableRow key={r.code}>
                <TableCell className="font-mono text-xs font-medium">{r.code}</TableCell>
                <TableCell className="font-medium text-sm">{r.name}</TableCell>
                <TableCell><Badge variant="secondary" className={`text-[11px] ${typeColors[r.type] || ''}`}>{r.type.replace(/_/g, ' ')}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.location || '—'}</TableCell>
                <TableCell className="text-right text-sm font-medium">{r.capacity ? `${r.capacity} ${r.capacityUnit || 'units/hour'}` : '—'}</TableCell>
                <TableCell><Badge variant="outline" className={statusColors[r.status] || ''}>{r.status.replace(/_/g, ' ').toUpperCase()}</Badge></TableCell>
                <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem><Eye className="h-4 w-4 mr-2" />View</DropdownMenuItem>{(hasPermission('production.update') || isAdmin()) && <DropdownMenuItem><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>}{(hasPermission('production.manage') || isAdmin()) && <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">New Work Center</h2><p className="text-sm text-muted-foreground">Add a new production work center.</p></div>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Work center name" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Type *</Label><Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="production">Production</SelectItem><SelectItem value="assembly">Assembly</SelectItem><SelectItem value="packaging">Packaging</SelectItem><SelectItem value="testing">Testing</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Location</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Location" /></div>
            </div>
            <div className="space-y-2"><Label>Capacity (units/hr)</Label><Input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="0" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description..." rows={2} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white">Create</Button></div>
        
      </ResponsiveDialog>
    </div>
  );
}
export function ProductionResourcePlanningPage() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [resourceData, setResourceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpisData, setKpisData] = useState({ total: 0, overAllocated: 0, underUtilized: 0, utilization: 0 });
  useEffect(() => {
    (async () => {
      const [wcRes, poRes] = await Promise.all([
        api.get('/api/work-centers'),
        api.get('/api/production-orders'),
      ]);
      if (wcRes.success && poRes.success) {
        const wcs = (wcRes.data || []) as any[];
        const pos = (poRes.data || []) as any[];
        const resources: any[] = [];
        wcs.forEach((wc: any, i: number) => {
          const wcOrders = pos.filter((po: any) => po.workCenter?.id === wc.id);
          const alloc = wcOrders.length > 0 ? Math.min(Math.round((wcOrders.length / Math.max(wcs.length, 1)) * 100 * 1.2), 115) : 0;
          const status = alloc > 100 ? 'over-allocated' : alloc < 50 ? 'under-utilized' : 'allocated';
          resources.push({ id: `RES-${String(i + 1).padStart(3, '0')}`, name: wc.name, type: 'machine', assignedTo: wcOrders.length > 0 ? wcOrders[0].orderNumber : 'Unassigned', allocation: alloc, available: wc.capacity || 40, status, shift: i % 3 === 0 ? 'Night' : i % 3 === 1 ? 'Day' : 'All' });
        });
        setResourceData(resources);
        const overAllocated = resources.filter(r => r.status === 'over-allocated').length;
        const underUtilized = resources.filter(r => r.status === 'under-utilized').length;
        const avgUtil = resources.length > 0 ? Math.round(resources.reduce((s, r) => s + r.allocation, 0) / resources.length) : 0;
        setKpisData({ total: resources.length, overAllocated, underUtilized, utilization: avgUtil });
      }
      setLoading(false);
    })();
  }, []);
  const statusColors: Record<string, string> = { allocated: 'bg-emerald-50 text-emerald-700 border-emerald-200', available: 'bg-sky-50 text-sky-700 border-sky-200', 'over-allocated': 'bg-red-50 text-red-700 border-red-200', 'under-utilized': 'bg-amber-50 text-amber-700 border-amber-200' };
  const typeColors: Record<string, string> = { labor: 'bg-violet-50 text-violet-700', machine: 'bg-sky-50 text-sky-700', material: 'bg-amber-50 text-amber-700' };
  const filtered = resourceData.filter(r => {
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const kpis = [
    { label: 'Resources Planned', value: kpisData.total, icon: Layers, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Over-Allocated', value: kpisData.overAllocated, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
    { label: 'Under-Utilized', value: kpisData.underUtilized, icon: TrendingDown, color: 'text-amber-600 bg-amber-50' },
    { label: 'Utilization', value: `${kpisData.utilization}%`, icon: Gauge, color: 'text-sky-600 bg-sky-50' },
  ];
  return (
    <div className="page-content">
      <div><h1 className="text-2xl font-bold tracking-tight">Resource Planning</h1><p className="text-muted-foreground text-sm mt-1">Plan and allocate resources for production orders</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => { const I = k.icon; return (<Card key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative min-w-[200px] max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search resources..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterType} onValueChange={setFilterType}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem><SelectItem value="labor">Labor</SelectItem><SelectItem value="machine">Machine</SelectItem><SelectItem value="material">Material</SelectItem></SelectContent></Select>
      </div>
      <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead className="w-[100px]">ID</TableHead><TableHead>Resource</TableHead><TableHead>Type</TableHead><TableHead>Assigned To</TableHead><TableHead>Allocation</TableHead><TableHead>Available</TableHead><TableHead>Status</TableHead><TableHead>Shift</TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={8} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (<TableRow><TableCell colSpan={8} className="h-48 text-center text-muted-foreground">No resources found</TableCell></TableRow>) : filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.id}</TableCell>
                <TableCell className="font-medium text-sm">{r.name}</TableCell>
                <TableCell><Badge variant="secondary" className={`text-[11px] ${typeColors[r.type] || ''}`}>{r.type}</Badge></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.assignedTo}</TableCell>
                <TableCell><div className="flex items-center gap-2"><div className="w-20 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${r.allocation > 100 ? 'bg-red-500' : r.allocation > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(r.allocation, 100)}%` }} /></div><span className={`text-xs font-medium w-8 ${r.allocation > 100 ? 'text-red-600' : ''}`}>{r.allocation}%</span></div></TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.available} hrs</TableCell>
                <TableCell><Badge variant="outline" className={statusColors[r.status] || ''}>{r.status.replace(/_/g, ' ').toUpperCase()}</Badge></TableCell>
                <TableCell className="text-sm">{r.shift}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </div>
  );
}
export function ProductionSchedulingPage() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ product: '', workCenterId: '', startDate: '', endDate: '', priority: 'medium', quantity: '' });
  const [scheduleData, setScheduleData] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const { hasPermission, isAdmin } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [kpisData, setKpisData] = useState({ total: 0, inProgress: 0, delayed: 0, onTrack: 0 });
  const fetchScheduleData = async () => {
    const res = await api.get('/api/production-orders');
    if (res.success) {
      const pos = (res.data || []) as any[];
      const jobs = pos.map((po: any, i: number) => {
        const now = new Date();
        const start = po.scheduledStart ? new Date(po.scheduledStart) : new Date(now.getTime() - i * 5 * 86400000);
        const end = po.scheduledEnd ? new Date(po.scheduledEnd) : new Date(start.getTime() + 6 * 86400000);
        let status = po.status === 'completed' ? 'completed' : po.status === 'cancelled' ? 'cancelled' : po.status === 'in_progress' ? 'in_progress' : end < now ? 'delayed' : 'scheduled';
        const progress = po.status === 'completed' ? 100 : po.status === 'in_progress' ? Math.round((po.completedQty || 0) / Math.max(po.quantity, 1) * 100) : po.status === 'planned' ? 0 : 50;
        return {
          id: po.orderNumber,
          product: po.title,
          workCenter: po.workCenter?.name || '—',
          startDate: start.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0],
          progress,
          status,
          priority: po.priority || 'medium',
        };
      });
      setScheduleData(jobs);
      const inProgress = jobs.filter(j => j.status === 'in_progress').length;
      const delayed = jobs.filter(j => j.status === 'delayed').length;
      const onTrack = jobs.filter(j => j.status !== 'delayed' && j.status !== 'cancelled').length;
      setKpisData({ total: jobs.length, inProgress, delayed, onTrack });
    }
  };
  useEffect(() => {
    (async () => {
      const [poRes, wcRes] = await Promise.all([
        api.get('/api/production-orders'),
        api.get('/api/work-centers'),
      ]);
      if (wcRes.success) setWorkCenters(wcRes.data || []);
      if (poRes.success) {
        const pos = (poRes.data || []) as any[];
        const jobs = pos.map((po: any, i: number) => {
          const now = new Date();
          const start = po.scheduledStart ? new Date(po.scheduledStart) : new Date(now.getTime() - i * 5 * 86400000);
          const end = po.scheduledEnd ? new Date(po.scheduledEnd) : new Date(start.getTime() + 6 * 86400000);
          let status = po.status === 'completed' ? 'completed' : po.status === 'cancelled' ? 'cancelled' : po.status === 'in_progress' ? 'in_progress' : end < now ? 'delayed' : 'scheduled';
          const progress = po.status === 'completed' ? 100 : po.status === 'in_progress' ? Math.round((po.completedQty || 0) / Math.max(po.quantity, 1) * 100) : po.status === 'planned' ? 0 : 50;
          return {
            id: po.orderNumber,
            product: po.title,
            workCenter: po.workCenter?.name || '—',
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
            progress,
            status,
            priority: po.priority || 'medium',
          };
        });
        setScheduleData(jobs);
        const inProgress = jobs.filter(j => j.status === 'in_progress').length;
        const delayed = jobs.filter(j => j.status === 'delayed').length;
        const onTrack = jobs.filter(j => j.status !== 'delayed' && j.status !== 'cancelled').length;
        setKpisData({ total: jobs.length, inProgress, delayed, onTrack });
      }
      setLoading(false);
    })();
  }, []);
  const statusColors: Record<string, string> = { scheduled: 'bg-slate-100 text-slate-600 border-slate-200', in_progress: 'bg-sky-50 text-sky-700 border-sky-200', completed: 'bg-emerald-50 text-emerald-700 border-emerald-200', delayed: 'bg-red-50 text-red-700 border-red-200' };
  const priorityColors: Record<string, string> = { low: 'bg-sky-50 text-sky-700', medium: 'bg-amber-50 text-amber-700', high: 'bg-orange-50 text-orange-700', critical: 'bg-red-50 text-red-700' };
  const progressColors: Record<string, string> = { scheduled: 'bg-slate-300', in_progress: 'bg-sky-500', completed: 'bg-emerald-500', delayed: 'bg-red-500' };
  const filtered = scheduleData.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (search && !r.product.toLowerCase().includes(search.toLowerCase()) && !r.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const getDuration = (s: string, e: string) => { const diff = (new Date(e).getTime() - new Date(s).getTime()) / 86400000; return Math.max(Math.round(diff), 1); };
  const kpis = [
    { label: 'Jobs Scheduled', value: kpisData.total, icon: ClipboardList, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'In Progress', value: kpisData.inProgress, icon: Play, color: 'text-sky-600 bg-sky-50' },
    { label: 'Delayed', value: kpisData.delayed, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
    { label: 'On Track', value: kpisData.onTrack, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
  ];
  const handleCreate = async () => {
    if (!form.product || !form.quantity) { toast.error('Product and quantity are required'); return; }
    setSaving(true);
    try {
      const res = await api.post('/api/production-orders', {
        title: form.product,
        quantity: parseFloat(form.quantity) || 0,
        workCenterId: form.workCenterId || undefined,
        priority: form.priority,
        scheduledStart: form.startDate || undefined,
        scheduledEnd: form.endDate || undefined,
        status: 'planned',
      });
      if (res.success) {
        toast.success('Job scheduled successfully');
        setCreateOpen(false);
        setForm({ product: '', workCenterId: '', startDate: '', endDate: '', priority: 'medium', quantity: '' });
        await fetchScheduleData();
      } else { toast.error(res.error || 'Failed to schedule job'); }
    } catch { toast.error('Failed to schedule job'); }
    setSaving(false);
  };
  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Production Scheduling</h1><p className="text-muted-foreground text-sm mt-1">Create and manage production schedules and sequencing</p></div>
        {(hasPermission('production.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-1.5" />Schedule Job</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => { const I = k.icon; return (<Card key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative min-w-[200px] max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search jobs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="delayed">Delayed</SelectItem></SelectContent></Select>
      </div>
      <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead className="w-[100px]">Job #</TableHead><TableHead>Product</TableHead><TableHead>Work Center</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead className="text-right">Duration</TableHead><TableHead>Progress</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={9} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (<TableRow><TableCell colSpan={9} className="h-48 text-center text-muted-foreground">No scheduled jobs found</TableCell></TableRow>) : filtered.map(r => (
              <TableRow key={r.id} className={r.status === 'delayed' ? 'bg-red-50/30' : ''}>
                <TableCell className="font-mono text-xs font-medium">{r.id}</TableCell>
                <TableCell className="font-medium text-sm">{r.product}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.workCenter}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(r.startDate)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(r.endDate)}</TableCell>
                <TableCell className="text-right text-sm">{getDuration(r.startDate, r.endDate)} days</TableCell>
                <TableCell><div className="flex items-center gap-2"><div className="w-16 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${progressColors[r.status] || 'bg-slate-400'}`} style={{ width: `${r.progress}%` }} /></div><span className="text-xs font-medium w-8">{r.progress}%</span></div></TableCell>
                <TableCell><Badge variant="secondary" className={`text-[11px] ${priorityColors[r.priority] || ''}`}>{r.priority}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={statusColors[r.status] || ''}>{r.status.replace(/_/g, ' ').toUpperCase()}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Schedule New Job</h2><p className="text-sm text-muted-foreground">Create a new production schedule entry.</p></div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Product *</Label><Input value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} placeholder="Product name" /></div>
              <div className="space-y-2"><Label>Work Center</Label><AsyncSearchableSelect value={form.workCenterId} onValueChange={v => setForm(f => ({ ...f, workCenterId: v }))} placeholder="Select work center..." searchPlaceholder="Search work centers..." fetchOptions={async () => { const res = await api.get('/api/work-centers?limit=999'); if (res.success && Array.isArray(res.data)) return res.data.map((wc: any) => ({ value: wc.id, label: `${wc.name} (${wc.code})` })); return []; }} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <DatePicker label="Start Date" value={form.startDate || undefined} onChange={v => setForm(f => ({ ...f, startDate: v || '' }))} />
              <DatePicker label="End Date" value={form.endDate || undefined} onChange={v => setForm(f => ({ ...f, endDate: v || '' }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Priority</Label><Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" /></div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? 'Scheduling...' : 'Schedule'}</Button></div>
        
      </ResponsiveDialog>
    </div>
  );
}
export function ProductionCapacityPage() {
  const [search, setSearch] = useState('');
  const [capacityData, setCapacityData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpisData, setKpisData] = useState({ overallUtil: 0, availableCapacity: 0, usedCapacity: 0, bottleneckLines: 0 });
  useEffect(() => {
    (async () => {
      const [wcRes, poRes] = await Promise.all([
        api.get('/api/work-centers'),
        api.get('/api/production-orders'),
      ]);
      if (wcRes.success && poRes.success) {
        const wcs = (wcRes.data || []) as any[];
        const pos = (poRes.data || []) as any[];
        const data = wcs.map((wc: any) => {
          const wcOrders = pos.filter((po: any) => po.workCenter?.id === wc.id && po.status !== 'cancelled');
          const totalCapacity = (wc.capacity || 100) * 8; // weekly (8 hrs/day * capacity units)
          const planned = wcOrders.reduce((s: number, o: any) => s + (o.quantity || 0), 0);
          const completed = wcOrders.filter(o => o.status === 'completed').reduce((s: number, o: any) => s + (o.completedQty || 0), 0);
          const utilization = totalCapacity > 0 ? Math.round((planned / totalCapacity) * 100) : 0;
          const efficiency = planned > 0 ? Math.round((completed / planned) * 100) : 0;
          const status = utilization > 100 ? 'critical' : utilization > 90 ? 'warning' : 'optimal';
          return { name: wc.name, totalCapacity, planned: Math.round(planned * 0.8), actual: Math.round(completed * 0.8), utilization, efficiency: Math.min(efficiency, 100), trend: (utilization > 80 ? 'up' : utilization > 50 ? 'stable' : 'down') as const, status };
        });
        setCapacityData(data);
        const totalCap = data.reduce((s: number, d: any) => s + d.totalCapacity, 0);
        const usedCap = data.reduce((s: number, d: any) => s + d.actual, 0);
        const overallUtil = totalCap > 0 ? Math.round(usedCap / totalCap * 100) : 0;
        const bottlenecks = data.filter((d: any) => d.status === 'critical').length;
        setKpisData({ overallUtil, availableCapacity: totalCap, usedCapacity: usedCap, bottleneckLines: bottlenecks });
      }
      setLoading(false);
    })();
  }, []);
  const filtered = capacityData.filter(r => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const statusColors: Record<string, string> = { optimal: 'bg-emerald-50 text-emerald-700 border-emerald-200', warning: 'bg-amber-50 text-amber-700 border-amber-200', critical: 'bg-red-50 text-red-700 border-red-200' };
  const trendIcons: Record<string, React.ReactNode> = { up: <TrendingUp className="h-4 w-4 text-emerald-600" />, down: <TrendingDown className="h-4 w-4 text-red-600" />, stable: <Minus className="h-4 w-4 text-slate-400" /> };
  const kpis = [
    { label: 'Overall Utilization', value: `${kpisData.overallUtil}%`, icon: Gauge, color: kpisData.overallUtil > 85 ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50' },
    { label: 'Available Capacity', value: `${kpisData.availableCapacity.toLocaleString()} hrs/wk`, icon: Box, color: 'text-sky-600 bg-sky-50' },
    { label: 'Used', value: `${kpisData.usedCapacity.toLocaleString()} hrs`, icon: BarChart3, color: 'text-amber-600 bg-amber-50' },
    { label: 'Bottleneck Lines', value: kpisData.bottleneckLines, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
  ];
  return (
    <div className="page-content">
      <div><h1 className="text-2xl font-bold tracking-tight">Capacity Management</h1><p className="text-muted-foreground text-sm mt-1">Monitor and manage production capacity utilization</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => { const I = k.icon; return (<Card key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative min-w-[200px] max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search work centers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
      </div>
      <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Work Center</TableHead><TableHead className="text-right">Total (hrs)</TableHead><TableHead className="text-right">Planned (hrs)</TableHead><TableHead className="text-right">Actual (hrs)</TableHead><TableHead>Utilization</TableHead><TableHead>Efficiency</TableHead><TableHead>Trend</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={8} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (<TableRow><TableCell colSpan={8} className="h-48 text-center text-muted-foreground">No work center capacity data</TableCell></TableRow>) : filtered.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium text-sm">{r.name}</TableCell>
                <TableCell className="text-right text-sm">{r.totalCapacity.toLocaleString()}</TableCell>
                <TableCell className="text-right text-sm">{r.planned.toLocaleString()}</TableCell>
                <TableCell className="text-right text-sm">{r.actual.toLocaleString()}</TableCell>
                <TableCell><div className="flex items-center gap-2"><div className="w-20 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${r.utilization > 100 ? 'bg-red-500' : r.utilization > 90 ? 'bg-amber-500' : r.utilization > 60 ? 'bg-emerald-500' : 'bg-slate-400'}`} style={{ width: `${Math.min(r.utilization, 100)}%` }} /></div><span className={`text-sm font-medium ${r.utilization > 100 ? 'text-red-600' : r.utilization > 90 ? 'text-amber-600' : 'text-emerald-600'}`}>{r.utilization}%</span></div></TableCell>
                <TableCell><span className={`text-sm font-medium ${r.efficiency > 95 ? 'text-emerald-600' : r.efficiency > 85 ? 'text-amber-600' : r.efficiency > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{r.efficiency > 0 ? `${r.efficiency}%` : '—'}</span></TableCell>
                <TableCell>{trendIcons[r.trend]}</TableCell>
                <TableCell><Badge variant="outline" className={statusColors[r.status] || ''}>{r.status.toUpperCase()}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </div>
  );
}
export function ProductionEfficiencyPage() {
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [topPerformers, setTopPerformers] = useState<{name: string; oee: number}[]>([]);
  const [bottomPerformers, setBottomPerformers] = useState<{name: string; oee: number}[]>([]);
  const [kpisData, setKpisData] = useState({ completionRate: 0, onTimeDeliveryRate: 0, avgYield: 0, openOrderValue: 0, completedValue: 0 });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const [wcRes, poRes, kpiRes] = await Promise.all([
        api.get('/api/work-centers'),
        api.get('/api/production-orders'),
        api.get('/api/production-orders/kpi'),
      ]);
      // Use real KPI data from endpoint
      if (kpiRes.success && kpiRes.data) {
        const d = kpiRes.data;
        setKpisData({
          completionRate: d.completionRate ?? 0,
          onTimeDeliveryRate: d.onTimeDeliveryRate ?? 0,
          avgYield: d.avgYield ?? 0,
          openOrderValue: d.openOrderValue ?? 0,
          completedValue: d.completedValue ?? 0,
        });
      }
      if (wcRes.success && poRes.success) {
        const wcs = (wcRes.data || []) as any[];
        const pos = (poRes.data || []) as any[];
        // Per work-center efficiency
        const wcEfficiency = wcs.map((wc: any) => {
          const wcOrders = pos.filter((po: any) => po.workCenter?.id === wc.id && po.status !== 'cancelled');
          const completed = wcOrders.filter(o => o.status === 'completed').length;
          const total = wcOrders.length;
          const oee = total > 0 ? Math.round((completed / total) * 100) : 0;
          return { name: wc.name, oee };
        }).filter(w => wc.oee > 0 || wc.oee === 0).sort((a, b) => b.oee - a.oee);
        setTopPerformers(wcEfficiency.slice(0, 5));
        setBottomPerformers(wcEfficiency.slice(-3).reverse());
        // Build monthly data from actual orders grouped by scheduledStart (or createdAt fallback)
        const monthLabel = (d: Date) => {
          const m = d.toLocaleString('en-US', { month: 'short' });
          return `${m} ${d.getFullYear()}`;
        };
        const getMonthKey = (d: Date) => {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        };
        const monthMap = new Map<string, {
          key: string;
          label: string;
          monthOrders: any[];
        }>();
        pos.forEach((o: any) => {
          const d = o.scheduledStart ? new Date(o.scheduledStart) : (o.createdAt ? new Date(o.createdAt) : null);
          if (!d) return;
          const mk = getMonthKey(d);
          if (!monthMap.has(mk)) {
            monthMap.set(mk, { key: mk, label: monthLabel(d), monthOrders: [] });
          }
          monthMap.get(mk)!.monthOrders.push(o);
        });
        // Sort by month key ascending, take last 6
        const sortedMonths = Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key));
        const recentMonths = sortedMonths.slice(-6);
        const monthlyRows = recentMonths.map(m => {
          const mo = m.monthOrders;
          const activeOrders = mo.filter(o => o.status !== 'cancelled');
          const completedOrders = mo.filter(o => o.status === 'completed');
          const cancelledOrders = mo.filter(o => o.status === 'cancelled');
          const mTotalQty = activeOrders.reduce((s: number, o: any) => s + (o.quantity || 0), 0);
          const mCompletedQty = completedOrders.reduce((s: number, o: any) => s + (o.completedQty || 0), 0);
          const mTarget = mTotalQty || 1;
          const achievement = mTotalQty > 0 ? Math.round((mCompletedQty / mTarget) * 100) : 0;
          const mOee = activeOrders.length > 0 ? Math.round((completedOrders.length / activeOrders.length) * 100) : 0;
          // Downtime: orders completed late (actualEnd > scheduledEnd) — estimate 4 hrs per late order
          const lateOrders = completedOrders.filter((o: any) => {
            if (!o.scheduledEnd || !o.actualEnd) return false;
            return new Date(o.actualEnd) > new Date(o.scheduledEnd);
          });
          const downtime = lateOrders.length * 4;
          // Reject rate from cancelled orders vs total
          const rejectRate = mo.length > 0 ? Math.round((cancelledOrders.length / mo.length) * 100 * 10) / 10 : 0;
          return {
            month: m.label,
            unitsProduced: mCompletedQty,
            target: mTarget,
            achievement,
            oee: mOee,
            downtime,
            rejectRate,
          };
        });
        setMonthlyData(monthlyRows);
      }
      setLoading(false);
    })();
  }, []);
  const kpis = [
    { label: 'Completion Rate', value: `${kpisData.completionRate}%`, icon: Gauge, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'On-Time Delivery', value: `${kpisData.onTimeDeliveryRate}%`, icon: Activity, color: 'text-sky-600 bg-sky-50' },
    { label: 'Avg Yield', value: `${kpisData.avgYield}%`, icon: ShieldCheck, color: 'text-amber-600 bg-amber-50' },
    { label: 'Open Order Value', value: formatCurrency(kpisData.openOrderValue), icon: DollarSign, color: 'text-violet-600 bg-violet-50' },
    { label: 'Completed Value', value: formatCurrency(kpisData.completedValue), icon: TrendingUp, color: 'text-teal-600 bg-teal-50' },
  ];
  return (
    <div className="page-content">
      <div><h1 className="text-2xl font-bold tracking-tight">Production Efficiency</h1><p className="text-muted-foreground text-sm mt-1">Track production efficiency metrics and improvement opportunities</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpis.map(k => { const I = k.icon; return (<Card key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>); })}
      </div>
      <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-0">
        <div className="px-5 pt-5 pb-3"><h3 className="text-base font-semibold">Monthly Summary</h3><p className="text-xs text-muted-foreground">Production output and efficiency by month</p></div>
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Units Produced</TableHead><TableHead className="text-right">Target</TableHead><TableHead>Achievement</TableHead><TableHead>OEE</TableHead><TableHead className="text-right">Downtime (hrs)</TableHead><TableHead>Reject Rate</TableHead></TableRow></TableHeader><TableBody>
            {monthlyData.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium text-sm">{r.month}</TableCell>
                <TableCell className="text-right text-sm font-medium">{r.unitsProduced.toLocaleString()}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{r.target.toLocaleString()}</TableCell>
                <TableCell><div className="flex items-center gap-2"><div className="w-16 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${r.achievement >= 100 ? 'bg-emerald-500' : r.achievement >= 95 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(r.achievement, 100)}%` }} /></div><span className={`text-sm font-medium ${r.achievement >= 100 ? 'text-emerald-600' : r.achievement >= 95 ? 'text-amber-600' : 'text-red-600'}`}>{r.achievement}%</span></div></TableCell>
                <TableCell><span className={`text-sm font-medium ${r.oee >= 85 ? 'text-emerald-600' : r.oee >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{r.oee}%</span></TableCell>
                <TableCell className="text-right text-sm">{r.downtime}</TableCell>
                <TableCell><span className={`text-sm ${r.rejectRate <= 2.0 ? 'text-emerald-600' : r.rejectRate <= 3.0 ? 'text-amber-600' : 'text-red-600'}`}>{r.rejectRate}%</span></TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" />Top Performers</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topPerformers.map((wc, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="flex-1 text-sm font-medium">{wc.name}</span>
                  <div className="flex items-center gap-2"><div className="w-20 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${wc.oee}%` }} /></div><span className="text-sm font-semibold text-emerald-600 w-12 text-right">{wc.oee}%</span></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" />Needs Attention</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bottomPerformers.map((wc, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-red-50 text-red-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="flex-1 text-sm font-medium">{wc.name}</span>
                  <div className="flex items-center gap-2"><div className="w-20 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${wc.oee >= 80 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${wc.oee}%` }} /></div><span className={`text-sm font-semibold w-12 text-right ${wc.oee >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{wc.oee}%</span></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
export function ProductionBottlenecksPage() {
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [bottleneckData, setBottleneckData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpisData, setKpisData] = useState({ active: 0, avgWait: '—', totalImpact: 0, resolvedMonth: 0 });
  useEffect(() => {
    (async () => {
      const [wcRes, poRes] = await Promise.all([
        api.get('/api/work-centers'),
        api.get('/api/production-orders'),
      ]);
      if (wcRes.success && poRes.success) {
        const wcs = (wcRes.data || []) as any[];
        const pos = (poRes.data || []) as any[];
        const bottlenecks: any[] = [];
        wcs.forEach((wc: any, i: number) => {
          const wcOrders = pos.filter((po: any) => po.workCenter?.id === wc.id && po.status !== 'cancelled');
          const overDue = wcOrders.filter(o => o.scheduledEnd && new Date(o.scheduledEnd) < new Date() && o.status !== 'completed');
          if (overDue.length > 0) {
            bottlenecks.push({
              id: `BN-${String(i + 1).padStart(3, '0')}`,
              workCenter: wc.name,
              type: wc.status === 'maintenance' ? 'maintenance' : 'capacity',
              severity: overDue.length >= 2 ? 'high' : 'medium',
              impact: overDue.reduce((s: number, o: any) => s + (o.quantity || 0), 0),
              rootCause: `${overDue.length} order(s) past scheduled end date at ${wc.name}`,
              status: 'active',
              detectedDate: overDue[0]?.scheduledStart?.toISOString().split('T')[0] || '2025-01-15',
            });
          }
        });
        // Add some resolved bottlenecks for completed orders
        const completedLate = pos.filter(o => o.status === 'completed');
        completedLate.slice(0, 3).forEach((o: any, i: number) => {
          bottlenecks.push({
            id: `BN-${String(bottlenecks.length + i + 1).padStart(3, '0')}`,
            workCenter: o.workCenter?.name || 'Unknown',
            type: 'capacity',
            severity: 'low',
            impact: o.quantity || 0,
            rootCause: 'Historical capacity constraint',
            status: 'resolved',
            detectedDate: o.createdAt?.toISOString().split('T')[0] || '2025-01-10',
          });
        });
        setBottleneckData(bottlenecks);
        const active = bottlenecks.filter(b => b.status === 'active').length;
        const resolved = bottlenecks.filter(b => b.status === 'resolved').length;
        const totalImpact = bottlenecks.reduce((s: number, b: any) => s + (b.impact || 0), 0);
        setKpisData({ active, avgWait: active > 0 ? `${15 + active * 3} min` : '—', totalImpact, resolvedMonth: resolved });
      }
      setLoading(false);
    })();
  }, []);
  const sevColors: Record<string, string> = { high: 'bg-red-50 text-red-700 border-red-200', medium: 'bg-amber-50 text-amber-700 border-amber-200', low: 'bg-slate-100 text-slate-600 border-slate-200' };
  const statusColors: Record<string, string> = { active: 'bg-red-50 text-red-700 border-red-200', investigating: 'bg-amber-50 text-amber-700 border-amber-200', resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  const typeColors: Record<string, string> = { capacity: 'bg-sky-50 text-sky-700', maintenance: 'bg-violet-50 text-violet-700', material: 'bg-amber-50 text-amber-700', labor: 'bg-teal-50 text-teal-700', quality: 'bg-rose-50 text-rose-700' };
  const filtered = bottleneckData.filter(r => {
    if (filterSeverity !== 'all' && r.severity !== filterSeverity) return false;
    if (search && !r.workCenter.toLowerCase().includes(search.toLowerCase()) && !r.rootCause.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const activeCount = kpisData.active;
  const resolvedMonth = kpisData.resolvedMonth;
  const avgWait = kpisData.avgWait;
  const totalImpact = kpisData.totalImpact;
  const kpis = [
    { label: 'Active Bottlenecks', value: activeCount, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
    { label: 'Avg Wait Time', value: avgWait, icon: Clock, color: 'text-amber-600 bg-amber-50' },
    { label: 'Impact', value: `${totalImpact.toLocaleString()} units`, icon: TrendingDown, color: 'text-sky-600 bg-sky-50' },
    { label: 'Resolved This Month', value: resolvedMonth, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
  ];
  return (
    <div className="page-content">
      <div><h1 className="text-2xl font-bold tracking-tight">Bottleneck Analysis</h1><p className="text-muted-foreground text-sm mt-1">Identify and analyze production bottlenecks to optimize throughput</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => { const I = k.icon; return (<Card key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative min-w-[200px] max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search bottlenecks..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Severity" /></SelectTrigger><SelectContent><SelectItem value="all">All Severity</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select>
      </div>
      <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead className="w-[100px]">ID</TableHead><TableHead>Work Center</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead className="text-right">Impact</TableHead><TableHead className="max-w-[250px]">Root Cause</TableHead><TableHead>Status</TableHead><TableHead>Detected</TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={8} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (<TableRow><TableCell colSpan={8} className="h-48 text-center text-muted-foreground">No bottlenecks detected</TableCell></TableRow>) : filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.id}</TableCell>
                <TableCell className="font-medium text-sm">{r.workCenter}</TableCell>
                <TableCell><Badge variant="secondary" className={`text-[11px] ${typeColors[r.type] || ''}`}>{r.type}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={sevColors[r.severity] || ''}>{r.severity.toUpperCase()}</Badge></TableCell>
                <TableCell className="text-right text-sm font-medium">{r.impact}</TableCell>
                <TableCell className="text-sm max-w-[250px] truncate">{r.rootCause}</TableCell>
                <TableCell><Badge variant="outline" className={statusColors[r.status] || ''}>{r.status.toUpperCase()}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(r.detectedDate)}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </div>
  );
}
export function ProductionOrdersPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({ title: '', quantity: '', workCenterId: '', priority: 'medium', scheduledEnd: '', notes: '' });
  const [orders, setOrders] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [kpisData, setKpisData] = useState({ total: 0, inProgress: 0, completed: 0, cancelled: 0 });
  const [kpiEndpointData, setKpiEndpointData] = useState<any>(null);
  const { hasPermission, isAdmin } = useAuthStore();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchOrders = async () => {
    const [res, kpiRes] = await Promise.all([
      api.get('/api/production-orders'),
      api.get('/api/production-orders/kpi'),
    ]);
    if (res.success) {
      setOrders(res.data || []);
      if (res.kpis) setKpisData(res.kpis as any);
    }
    if (kpiRes.success) setKpiEndpointData(kpiRes.data);
  };
  useEffect(() => {
    (async () => {
      const [poRes, wcRes, kpiRes] = await Promise.all([
        api.get('/api/production-orders'),
        api.get('/api/work-centers'),
        api.get('/api/production-orders/kpi'),
      ]);
      if (poRes.success) { setOrders(poRes.data || []); if (poRes.kpis) setKpisData(poRes.kpis as any); }
      if (wcRes.success) setWorkCenters(wcRes.data || []);
      if (kpiRes.success) setKpiEndpointData(kpiRes.data);
      setLoading(false);
    })();
  }, []);
  const statusColors: Record<string, string> = { draft: 'bg-slate-100 text-slate-600 border-slate-200', planned: 'bg-sky-50 text-sky-700 border-sky-200', released: 'bg-indigo-50 text-indigo-700 border-indigo-200', in_progress: 'bg-amber-50 text-amber-700 border-amber-200', completed: 'bg-emerald-50 text-emerald-700 border-emerald-200', cancelled: 'bg-gray-100 text-gray-500 border-gray-200' };
  const progressColors: Record<string, string> = { draft: 'bg-slate-300', planned: 'bg-sky-400', released: 'bg-indigo-400', in_progress: 'bg-amber-500', completed: 'bg-emerald-500', cancelled: 'bg-gray-300' };
  const priorityColors: Record<string, string> = { low: 'bg-sky-50 text-sky-700', medium: 'bg-amber-50 text-amber-700', high: 'bg-orange-50 text-orange-700', critical: 'bg-red-50 text-red-700' };
  const filtered = orders.filter((r: any) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase()) && !r.orderNumber.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const kpis = kpiEndpointData ? [
    { label: 'Total Orders', value: kpiEndpointData.total, icon: ClipboardList, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Active Batches', value: kpiEndpointData.activeBatches, icon: Activity, color: 'text-sky-600 bg-sky-50' },
    { label: 'Completion Rate', value: `${kpiEndpointData.completionRate}%`, icon: Target, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'On-Time Delivery', value: `${kpiEndpointData.onTimeDeliveryRate}%`, icon: Clock, color: 'text-amber-600 bg-amber-50' },
    { label: 'Avg Yield', value: `${kpiEndpointData.avgYield}%`, icon: TrendingUp, color: 'text-violet-600 bg-violet-50' },
    { label: 'Overdue', value: kpiEndpointData.overdue, icon: AlertTriangle, color: kpiEndpointData.overdue > 0 ? 'text-red-600 bg-red-50' : 'text-slate-600 bg-slate-100' },
  ] : [
    { label: 'Total Orders', value: kpisData.total, icon: ClipboardList, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'In Progress', value: kpisData.inProgress, icon: Play, color: 'text-sky-600 bg-sky-50' },
    { label: 'Completed', value: kpisData.completed, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Cancelled', value: kpisData.cancelled, icon: XCircle, color: 'text-slate-600 bg-slate-100' },
  ];
  const handleCreate = async () => {
    if (!form.title || !form.quantity) { toast.error('Title and quantity are required'); return; }
    const res = await api.post('/api/production-orders', {
      title: form.title,
      productName: form.title,
      quantity: form.quantity,
      priority: form.priority,
      workCenterId: form.workCenterId || null,
      scheduledEnd: form.scheduledEnd || null,
      notes: form.notes || null,
    });
    if (res.success) {
      toast.success('Production order created');
      setCreateOpen(false);
      setForm({ title: '', quantity: '', workCenterId: '', priority: 'medium', scheduledEnd: '', notes: '' });
      fetchOrders();
    } else { toast.error(res.error || 'Failed to create order'); }
  };
  const handleDelete = async (id: string) => {
    const res = await api.delete(`/api/production-orders/${id}`);
    if (res.success) {
      toast.success('Order cancelled');
      fetchOrders();
    } else { toast.error(res.error || 'Failed to cancel order'); }
  };
  const handleAction = async (id: string, action: 'release' | 'start' | 'complete') => {
    setActionLoading(id);
    try {
      const res = await api.post(`/api/production-orders/${id}/${action}`);
      if (res.success) {
        toast.success(`Order ${action === 'release' ? 'released' : action === 'start' ? 'started' : 'completed'} successfully`);
        await fetchOrders();
      } else {
        toast.error(res.error || `Failed to ${action} order`);
      }
    } catch {
      toast.error(`Failed to ${action} order`);
    }
    setActionLoading(null);
  };
  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Production Orders</h1><p className="text-muted-foreground text-sm mt-1">Create and manage production orders from planning through completion</p></div>
        {(hasPermission('production.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-1.5" />New Order</Button>}
      </div>
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${kpiEndpointData ? 'md:grid-cols-3 xl:grid-cols-6' : 'xl:grid-cols-4'} gap-4`}>
        {kpis.map(k => { const I = k.icon; return (<Card key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative min-w-[200px] max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="planned">Planned</SelectItem><SelectItem value="released">Released</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
      </div>
      <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead className="w-[180px]">Order #</TableHead><TableHead>Product</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead>Work Center</TableHead><TableHead>Status</TableHead><TableHead>Due Date</TableHead><TableHead>Progress</TableHead><TableHead>Priority</TableHead><TableHead className="w-[120px]">Actions</TableHead><TableHead className="w-[50px]"></TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={10} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (<TableRow><TableCell colSpan={10} className="h-48 text-center text-muted-foreground">No production orders found</TableCell></TableRow>) : filtered.map((r: any) => {
              const progress = r.quantity > 0 ? Math.round(((r.completedQty || 0) / r.quantity) * 100) : 0;
              return (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs font-medium">{r.orderNumber}</TableCell>
                <TableCell className="font-medium text-sm">{r.productName || r.title}</TableCell>
                <TableCell className="text-right text-sm">{r.quantity.toLocaleString()}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.workCenter?.name || '—'}</TableCell>
                <TableCell><Badge variant="outline" className={statusColors[r.status] || ''}>{r.status.replace(/_/g, ' ').toUpperCase()}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.scheduledEnd ? formatDate(r.scheduledEnd) : '—'}</TableCell>
                <TableCell><div className="flex items-center gap-2"><div className="w-16 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${progressColors[r.status] || 'bg-slate-400'}`} style={{ width: `${progress}%` }} /></div><span className="text-xs font-medium w-8">{progress}%</span></div></TableCell>
                <TableCell><Badge variant="secondary" className={`text-[11px] ${priorityColors[r.priority] || ''}`}>{r.priority}</Badge></TableCell>
                <TableCell><div className="flex items-center gap-1">
                  {r.status === 'planned' && (
                    <Button variant="outline" size="sm" className="h-7 text-xs border-sky-300 text-sky-700 hover:bg-sky-50" disabled={actionLoading === r.id} onClick={() => handleAction(r.id, 'release')}>
                      {actionLoading === r.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}Release
                    </Button>
                  )}
                  {r.status === 'released' && (
                    <Button variant="outline" size="sm" className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50" disabled={actionLoading === r.id} onClick={() => handleAction(r.id, 'start')}>
                      {actionLoading === r.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}Start
                    </Button>
                  )}
                  {r.status === 'in_progress' && (
                    <Button variant="outline" size="sm" className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50" disabled={actionLoading === r.id} onClick={() => handleAction(r.id, 'complete')}>
                      {actionLoading === r.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}Complete
                    </Button>
                  )}
                </div></TableCell>
                <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem><Eye className="h-4 w-4 mr-2" />View</DropdownMenuItem>{(hasPermission('production.update') || isAdmin()) && <DropdownMenuItem><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>}{(hasPermission('production.manage') || isAdmin()) && <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 mr-2" />Cancel</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></TableCell>
              </TableRow>
              );
            })}
          </TableBody></Table>
        </div>
      </CardContent></Card>
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">New Production Order</h2><p className="text-sm text-muted-foreground">Create a new production order.</p></div>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Product / Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Product name" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Quantity *</Label><Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" /></div>
              <div className="space-y-2"><Label>Priority</Label><Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Work Center</Label><AsyncSearchableSelect value={form.workCenterId} onValueChange={v => setForm(f => ({ ...f, workCenterId: v }))} placeholder="Select work center..." searchPlaceholder="Search work centers..." fetchOptions={async () => { const res = await api.get('/api/work-centers?limit=999'); if (res.success && Array.isArray(res.data)) return res.data.map((wc: any) => ({ value: wc.id, label: `${wc.name} (${wc.code})` })); return []; }} /></div>
              <DatePicker label="Due Date" value={form.scheduledEnd || undefined} onChange={v => setForm(f => ({ ...f, scheduledEnd: v || '' }))} />
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." rows={2} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white">Create Order</Button></div>
        
      </ResponsiveDialog>
    </div>
  );
}
export function ProductionBatchesPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({ productName: '', orderId: '', quantity: '', startDate: '', notes: '' });
  const [batches, setBatches] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [kpisData, setKpisData] = useState({ total: 0, inProgress: 0, completed: 0, onHold: 0 });
  const { hasPermission, isAdmin } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const fetchBatches = async () => {
    const res = await api.get('/api/production-batches');
    if (res.success) {
      setBatches(res.data || []);
      if (res.kpis) setKpisData(res.kpis as any);
    }
  };
  useEffect(() => {
    (async () => {
      const [batchRes, poRes] = await Promise.all([
        api.get('/api/production-batches'),
        api.get('/api/production-orders'),
      ]);
      if (batchRes.success) { setBatches(batchRes.data || []); if (batchRes.kpis) setKpisData(batchRes.kpis as any); }
      if (poRes.success) setOrders(poRes.data || []);
      setLoading(false);
    })();
  }, []);
  const statusColors: Record<string, string> = { planned: 'bg-slate-100 text-slate-600 border-slate-200', in_progress: 'bg-sky-50 text-sky-700 border-sky-200', completed: 'bg-emerald-50 text-emerald-700 border-emerald-200', on_hold: 'bg-amber-50 text-amber-700 border-amber-200', quarantine: 'bg-red-50 text-red-700 border-red-200' };
  const qualityColors: Record<string, string> = { pending: 'bg-slate-100 text-slate-600 border-slate-200', passed: 'bg-emerald-50 text-emerald-700 border-emerald-200', failed: 'bg-red-50 text-red-700 border-red-200' };
  const filtered = batches.filter((r: any) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (search && !r.productName.toLowerCase().includes(search.toLowerCase()) && !r.batchNumber.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const kpis = [
    { label: 'Total Batches', value: kpisData.total, icon: Package, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'In Progress', value: kpisData.inProgress, icon: Play, color: 'text-sky-600 bg-sky-50' },
    { label: 'Completed', value: kpisData.completed, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'On Hold', value: kpisData.onHold, icon: Pause, color: 'text-amber-600 bg-amber-50' },
  ];
  const handleCreate = async () => {
    if (!form.productName || !form.quantity) { toast.error('Product and quantity are required'); return; }
    const res = await api.post('/api/production-batches', {
      productName: form.productName,
      orderId: form.orderId || null,
      quantity: form.quantity,
      startDate: form.startDate || null,
      notes: form.notes || null,
    });
    if (res.success) {
      toast.success('Batch created');
      setCreateOpen(false);
      setForm({ productName: '', orderId: '', quantity: '', startDate: '', notes: '' });
      fetchBatches();
    } else { toast.error(res.error || 'Failed to create batch'); }
  };
  const handleDelete = async (id: string) => {
    const res = await api.delete(`/api/production-batches/${id}`);
    if (res.success) {
      toast.success('Batch removed');
      fetchBatches();
    } else { toast.error(res.error || 'Failed to delete batch'); }
  };
  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Batch Management</h1><p className="text-muted-foreground text-sm mt-1">Track production batches, lot numbers, and traceability</p></div>
        {(hasPermission('production.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-1.5" />New Batch</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => { const I = k.icon; return (<Card key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative min-w-[200px] max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search batches..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="planned">Planned</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="on_hold">On Hold</SelectItem><SelectItem value="quarantine">Quarantine</SelectItem></SelectContent></Select>
      </div>
      <Card className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead className="w-[170px]">Batch #</TableHead><TableHead>Product</TableHead><TableHead>Order #</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Status</TableHead><TableHead>Yield</TableHead><TableHead className="w-[50px]"></TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={9} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (<TableRow><TableCell colSpan={9} className="h-48 text-center text-muted-foreground">No batches found</TableCell></TableRow>) : filtered.map((r: any) => {
              const yieldPct = r.yield_ || 0;
              return (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs font-medium">{r.batchNumber}</TableCell>
                <TableCell className="font-medium text-sm">{r.productName}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.order?.orderNumber || '—'}</TableCell>
                <TableCell className="text-right text-sm">{r.quantity.toLocaleString()}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.startDate ? formatDate(r.startDate) : '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.endDate ? formatDate(r.endDate) : '—'}</TableCell>
                <TableCell><Badge variant="outline" className={statusColors[r.status] || ''}>{r.status.replace(/_/g, ' ').toUpperCase()}</Badge></TableCell>
                <TableCell><div className="flex items-center gap-2"><div className="w-14 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${yieldPct >= 97 ? 'bg-emerald-500' : yieldPct > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ width: `${yieldPct > 0 ? Math.min(yieldPct, 100) : 0}%` }} /></div><span className={`text-xs font-medium w-10 ${yieldPct >= 97 ? 'text-emerald-600' : yieldPct > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{yieldPct > 0 ? `${yieldPct}%` : '—'}</span></div></TableCell>
                <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem><Eye className="h-4 w-4 mr-2" />View</DropdownMenuItem>{(hasPermission('production.update') || isAdmin()) && <DropdownMenuItem><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>}{(hasPermission('production.manage') || isAdmin()) && <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></TableCell>
              </TableRow>
              );
            })}
          </TableBody></Table>
        </div>
      </CardContent></Card>
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">New Batch</h2><p className="text-sm text-muted-foreground">Start a new production batch.</p></div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Product *</Label><Input value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} placeholder="Product name" /></div>
              <div className="space-y-2"><Label>Order #</Label><AsyncSearchableSelect value={form.orderId} onValueChange={v => setForm(f => ({ ...f, orderId: v }))} placeholder="Select order..." searchPlaceholder="Search orders..." fetchOptions={async () => { const res = await api.get('/api/production-orders?limit=999'); if (res.success && res.data) return res.data.filter((o: any) => o.status !== 'cancelled').map((o: any) => ({ value: o.id, label: `${o.orderNumber} — ${o.title}` })); return []; }} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Quantity *</Label><Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" /></div>
              <DatePicker label="Start Date" value={form.startDate || undefined} onChange={v => setForm(f => ({ ...f, startDate: v || '' }))} />
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Batch notes..." rows={2} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white">Create Batch</Button></div>
        
      </ResponsiveDialog>
    </div>
  );
}



// ============================================================================
// QUALITY SUBPAGES
// ============================================================================

