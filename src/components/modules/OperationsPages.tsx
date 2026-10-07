'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/datetime-picker';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';;
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Gauge, GraduationCap, FileText, Clock, ArrowRightLeft, CheckSquare,
  Plus, Search, MoreHorizontal, Pencil, Trash2, AlertTriangle, CheckCircle2,
  Filter, Users, Calendar, Eye, ListChecks, ShieldAlert, Play, X,
  Activity, BookOpen, ClipboardCheck, ClipboardList, Settings, Send, Target, TrendingUp,
  Download, BarChart3,
} from 'lucide-react';
import { EmptyState, StatusBadge, PriorityBadge, getInitials, formatDate, formatDateTime, timeAgo, LoadingSkeleton, formatDuration } from '@/components/shared/helpers';
import { SearchableSelect } from '@/components/ui/searchable-select';

// MeterReadings: uses meters.create/update
export function OperationsMeterReadingsPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [readings, setReadings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ meter: '', value: '', unit: 'kWh', notes: '', readingDate: '' });
  const [kpis, setKpis] = useState<any[]>([]);
  const [viewItem, setViewItem] = useState<any>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ meterName: '', value: '', unit: 'kWh', readingDate: '', notes: '', reader: '' });
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    api.get<any>('/api/meter-readings').then(res => {
      if (res.success) {
        setReadings(res.data || []);
        if (res.kpis) {
          setKpis([
            { label: 'Total Readings', value: String(res.kpis.total || 0), icon: Gauge, color: 'bg-emerald-50 text-emerald-600' },
            { label: 'Meters Tracked', value: String(res.kpis.metersTracked || 0), icon: Activity, color: 'bg-sky-50 text-sky-600' },
            { label: 'This Month', value: String(res.kpis.thisMonth || 0), icon: AlertTriangle, color: 'bg-amber-50 text-amber-600' },
            { label: 'With Consumption', value: String(res.kpis.withConsumption || 0), icon: TrendingUp, color: 'bg-violet-50 text-violet-600' },
          ]);
        }
      }
      setLoading(false);
    });
  }, []);

  const filtered = searchText.trim() ? readings.filter(r => {
    const q = searchText.toLowerCase();
    return (r.meterName || '').toLowerCase().includes(q) || (r.readingNumber || '').toLowerCase().includes(q) || (r.unit || '').toLowerCase().includes(q) || (r.notes || '').toLowerCase().includes(q);
  }) : readings;

  const getReadingStatus = (r: any) => {
    if (!r.consumption || r.consumption === 0) return 'normal';
    if (r.previousValue && r.previousValue > 0) {
      const pct = ((r.value - r.previousValue) / r.previousValue) * 100;
      if (Math.abs(pct) > 20) return 'critical';
      if (Math.abs(pct) > 10) return 'warning';
    }
    return 'normal';
  };
  const getChangePct = (r: any) => {
    if (!r.previousValue || r.previousValue === 0) return 0;
    return ((r.value - r.previousValue) / r.previousValue) * 100;
  };

  const statusColor = (s: string) => s === 'normal' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : s === 'warning' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-red-600 bg-red-50 border-red-200';
  const handleCreate = async () => {
    setSaving(true);
    const res = await api.post('/api/meter-readings', {
      meterName: form.meter,
      value: Number(form.value),
      unit: form.unit,
      readingDate: form.readingDate || new Date().toISOString().split('T')[0],
      notes: form.notes || undefined,
    });
    if (res.success) {
      toast.success('Reading recorded successfully');
      setReadings(prev => [res.data, ...prev]);
      setCreateOpen(false);
      setForm({ meter: '', value: '', unit: 'kWh', notes: '', readingDate: '' });
    } else {
      toast.error(res.error || 'Failed to record reading');
    }
    setSaving(false);
  };
  const handleEditOpen = (item: any) => {
    setEditItem(item);
    setEditForm({
      meterName: item.meterName || '',
      value: String(item.value || ''),
      unit: item.unit || 'kWh',
      readingDate: item.readingDate || '',
      notes: item.notes || '',
      reader: item.reader || '',
    });
  };
  const handleEditSave = async () => {
    if (!editItem) return;
    setEditLoading(true);
    try {
      const res = await api.put(`/api/meter-readings/${editItem.id}`, {
        meterName: editForm.meterName,
        value: Number(editForm.value),
        unit: editForm.unit,
        readingDate: editForm.readingDate,
        notes: editForm.notes || undefined,
        reader: editForm.reader || undefined,
      });
      if (res.success) {
        toast.success('Reading updated successfully');
        setReadings(prev => prev.map(r => r.id === editItem.id ? { ...r, ...res.data } : r));
        setEditItem(null);
      } else {
        toast.error(res.error || 'Failed to update reading');
      }
    } catch { toast.error('Failed to update reading'); }
    setEditLoading(false);
  };
  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Meter Readings</h1><p className="text-muted-foreground mt-1">Record and track meter/gauge readings for utility meters and equipment</p></div>
        {(hasPermission('meters.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Record Reading</Button>}
      </div>
      {loading ? <LoadingSkeleton /> : (<>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => { const I = k.icon; return (
          <div key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-4">
              <div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div>
            </div>
          </div>
        ); })}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search readings..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" /></div>
      </div>
      <Card className="border border-border/60 shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Meter Name</TableHead><TableHead className="hidden md:table-cell">Unit</TableHead><TableHead className="text-right">Reading Value</TableHead><TableHead className="hidden sm:table-cell text-right">Previous</TableHead><TableHead className="text-right">Change</TableHead><TableHead className="hidden md:table-cell">Date</TableHead><TableHead>Status</TableHead><TableHead className="w-10"></TableHead></TableRow></TableHeader><TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={9} className="h-48"><EmptyState icon={Gauge} title="No meter readings found" description="Record a new reading to get started." /></TableCell></TableRow>
          ) : filtered.map(r => {
            const change = getChangePct(r);
            const status = getReadingStatus(r);
            return (
            <TableRow key={r.id} className="hover:bg-muted/30">
              <TableCell className="font-mono text-xs">{r.readingNumber || r.id.slice(0, 8)}</TableCell>
              <TableCell className="font-medium">{r.meterName}</TableCell>
              <TableCell className="hidden md:table-cell"><Badge variant="outline">{r.unit}</Badge></TableCell>
              <TableCell className="text-right font-medium">{r.value.toLocaleString()} <span className="text-xs text-muted-foreground">{r.unit}</span></TableCell>
              <TableCell className="text-right text-muted-foreground hidden sm:table-cell">{r.previousValue !== null ? r.previousValue.toLocaleString() : '-'}</TableCell>
              <TableCell className={`text-right font-medium ${r.previousValue ? (change > 0 ? 'text-red-600' : 'text-emerald-600') : 'text-muted-foreground'}`}>{r.previousValue ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%` : '-'}</TableCell>
              <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{formatDate(r.readingDate)}</TableCell>
              <TableCell><Badge variant="outline" className={statusColor(status)}><span className="capitalize">{status}</span></Badge></TableCell>
              <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setViewItem(r)}><Eye className="h-4 w-4 mr-2" />View</DropdownMenuItem>{(hasPermission('meters.update') || isAdmin()) && <DropdownMenuItem onClick={() => handleEditOpen(r)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></TableCell>
            </TableRow>
          ); })}
        </TableBody></Table></div>
      </CardContent></Card>
      </>)}
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Record New Reading</h2><p className="text-sm text-muted-foreground">Enter the meter reading details below</p></div>
          <div className="space-y-4">
            <div><Label>Meter Name</Label><Input placeholder="e.g. Main Electricity Meter" value={form.meter} onChange={e => setForm(f => ({ ...f, meter: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Reading Value</Label><Input type="number" placeholder="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} /></div>
              <div><Label>Unit</Label><Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="kWh">kWh</SelectItem><SelectItem value="m³">m³</SelectItem><SelectItem value="psi">psi</SelectItem><SelectItem value="bar">bar</SelectItem><SelectItem value="CFM">CFM</SelectItem></SelectContent></Select></div>
            </div>
            <DatePicker label="Reading Date" value={form.readingDate || undefined} onChange={v => setForm(f => ({ ...f, readingDate: v || '' }))} />
            <div><Label>Notes</Label><Textarea placeholder="Optional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={saving || !form.meter || !form.value}>{saving ? 'Saving...' : 'Record Reading'}</Button></div>
        
      </ResponsiveDialog>
      <ResponsiveDialog open={!!viewItem} onOpenChange={open => { if (!open) setViewItem(null); }}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Reading Details</h2><p className="text-sm text-muted-foreground">View meter reading information</p></div>
          {viewItem && <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Meter Name</span><p className="font-medium">{viewItem.meterName || '-'}</p></div>
            <div><span className="text-muted-foreground">Reading Value</span><p className="font-medium">{viewItem.value?.toLocaleString()} <span className="text-xs text-muted-foreground">{viewItem.unit}</span></p></div>
            <div><span className="text-muted-foreground">Unit</span><p className="font-medium">{viewItem.unit || '-'}</p></div>
            <div><span className="text-muted-foreground">Reading Date</span><p className="font-medium">{formatDate(viewItem.readingDate)}</p></div>
            <div className="col-span-2"><span className="text-muted-foreground">Notes</span><p className="font-medium">{viewItem.notes || '-'}</p></div>
            <div><span className="text-muted-foreground">Reader</span><p className="font-medium">{viewItem.reader || '-'}</p></div>
            <div><span className="text-muted-foreground">Reading ID</span><p className="font-mono text-xs">{viewItem.readingNumber || viewItem.id?.slice(0, 8)}</p></div>
          </div>}
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setViewItem(null)}>Close</Button></div>
        
      </ResponsiveDialog>
      <ResponsiveDialog open={!!editItem} onOpenChange={open => { if (!open) setEditItem(null); }}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Edit Reading</h2><p className="text-sm text-muted-foreground">Update meter reading details</p></div>
          <div className="space-y-4">
            <div><Label>Meter Name</Label><Input value={editForm.meterName} onChange={e => setEditForm(f => ({ ...f, meterName: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Reading Value</Label><Input type="number" value={editForm.value} onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))} /></div>
              <div><Label>Unit</Label><Select value={editForm.unit} onValueChange={v => setEditForm(f => ({ ...f, unit: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="kWh">kWh</SelectItem><SelectItem value="m³">m³</SelectItem><SelectItem value="psi">psi</SelectItem><SelectItem value="bar">bar</SelectItem><SelectItem value="CFM">CFM</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DatePicker label="Reading Date" value={editForm.readingDate || undefined} onChange={v => setEditForm(f => ({ ...f, readingDate: v || '' }))} />
              <div><Label>Reader</Label><Input value={editForm.reader} onChange={e => setEditForm(f => ({ ...f, reader: e.target.value }))} placeholder="Who recorded" /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button><Button onClick={handleEditSave} disabled={editLoading || !editForm.meterName || !editForm.value}>{editLoading ? 'Saving...' : 'Save Changes'}</Button></div>
        
      </ResponsiveDialog>
    </div>
  );
}
// Training: uses training.create/update
export function OperationsTrainingPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'safety', instructor: '', duration: '', description: '' });
  const [kpis, setKpis] = useState<any[]>([]);

  useEffect(() => {
    api.get<any>('/api/training-courses').then(res => {
      if (res.success) {
        setCourses(res.data || []);
        if (res.kpis) {
          setKpis([
            { label: 'Total Courses', value: String(res.kpis.total || 0), icon: GraduationCap, color: 'bg-emerald-50 text-emerald-600' },
            { label: 'Active', value: String(res.kpis.active || 0), icon: Play, color: 'bg-sky-50 text-sky-600' },
            { label: 'Archived', value: String(res.kpis.completed || 0), icon: CheckCircle2, color: 'bg-amber-50 text-amber-600' },
            { label: 'Certifications', value: String(res.kpis.withCertification || 0), icon: AlertTriangle, color: 'bg-red-50 text-red-600' },
          ]);
        }
      }
      setLoading(false);
    });
  }, []);

  const filtered = searchText.trim() ? courses.filter(c => {
    const q = searchText.toLowerCase();
    return (c.title || '').toLowerCase().includes(q) || (c.instructor || '').toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q);
  }) : courses;
  const statusColor = (s: string) => s === 'active' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : s === 'upcoming' ? 'text-sky-600 bg-sky-50 border-sky-200' : s === 'completed' || s === 'archived' ? 'text-slate-600 bg-slate-50 border-slate-200' : 'text-red-600 bg-red-50 border-red-200';
  const categoryColor = (c: string) => c === 'safety' ? 'text-red-600 bg-red-50 border-red-200' : c === 'technical' ? 'text-sky-600 bg-sky-50 border-sky-200' : c === 'compliance' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-violet-600 bg-violet-50 border-violet-200';
  const handleCreate = async () => {
    if (!form.name) { toast.error('Course name is required'); return; }
    setSaving(true);
    const res = await api.post('/api/training-courses', {
      title: form.name,
      category: form.category,
      type: 'classroom',
      durationHours: parseFloat(form.duration) || 1,
      instructor: form.instructor || undefined,
      description: form.description || undefined,
    });
    if (res.success) {
      toast.success('Course created successfully');
      setCourses(prev => [res.data, ...prev]);
      setCreateOpen(false);
      setForm({ name: '', category: 'safety', instructor: '', duration: '', description: '' });
    } else {
      toast.error(res.error || 'Failed to create course');
    }
    setSaving(false);
  };
  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Training</h1><p className="text-muted-foreground mt-1">Manage employee training records, certifications, and compliance</p></div>
        {(hasPermission('training.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />New Course</Button>}
      </div>
      {loading ? <LoadingSkeleton /> : (<>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => { const I = k.icon; return (
          <div key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-4">
              <div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div>
            </div>
          </div>
        ); })}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search courses..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" /></div>
      </div>
      <Card className="border border-border/60 shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Category</TableHead><TableHead className="hidden md:table-cell">Instructor</TableHead><TableHead className="hidden sm:table-cell">Duration</TableHead><TableHead className="hidden sm:table-cell">Type</TableHead><TableHead>Certification</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="h-48"><EmptyState icon={GraduationCap} title="No training courses found" description="Create a new course to get started." /></TableCell></TableRow>
          ) : filtered.map(c => (
            <TableRow key={c.id} className="hover:bg-muted/30">
              <TableCell className="font-medium">{c.title}</TableCell>
              <TableCell><Badge variant="outline" className={categoryColor(c.category)}><span className="capitalize">{c.category}</span></Badge></TableCell>
              <TableCell className="text-sm hidden md:table-cell">{c.instructor || '-'}</TableCell>
              <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{formatDuration(c.durationHours)}</TableCell>
              <TableCell className="text-sm text-muted-foreground hidden sm:table-cell capitalize">{(c.type || '').replace(/_/g, ' ')}</TableCell>
              <TableCell>{c.certification ? <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200">Yes</Badge> : <Badge variant="outline" className="text-muted-foreground">No</Badge>}</TableCell>
              <TableCell><Badge variant="outline" className={statusColor(c.status)}><span className="capitalize">{c.status}</span></Badge></TableCell>
            </TableRow>
          ))}
        </TableBody></Table></div>
      </CardContent></Card>
      </>)}
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Create New Course</h2><p className="text-sm text-muted-foreground">Add a new training course to the system</p></div>
          <div className="space-y-4">
            <div><Label>Course Name</Label><Input placeholder="e.g. Advanced Safety Training" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="safety">Safety</SelectItem><SelectItem value="technical">Technical</SelectItem><SelectItem value="compliance">Compliance</SelectItem><SelectItem value="leadership">Leadership</SelectItem></SelectContent></Select></div>
              <div><Label>Duration</Label><Input placeholder="e.g. 4 hours" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} /></div>
            </div>
            <div><Label>Instructor</Label><Input placeholder="Instructor name" value={form.instructor} onChange={e => setForm(f => ({ ...f, instructor: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea placeholder="Course description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={saving || !form.name}>{saving ? 'Creating...' : 'Create Course'}</Button></div>
        
      </ResponsiveDialog>
    </div>
  );
}
// Surveys: uses production_surveys.create/update
export function OperationsSurveysPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [surveys, setSurveys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'safety', description: '', questions: '', expiryDate: '' });
  const [kpis, setKpis] = useState<any[]>([]);

  useEffect(() => {
    api.get<any>('/api/surveys').then(res => {
      if (res.success) {
        setSurveys(res.data || []);
        if (res.kpis) {
          const completionRate = res.kpis.total > 0 ? Math.round((res.kpis.active / res.kpis.total) * 100) : 0;
          setKpis([
            { label: 'Total Surveys', value: String(res.kpis.total || 0), icon: ClipboardList, color: 'bg-emerald-50 text-emerald-600' },
            { label: 'Active', value: String(res.kpis.active || 0), icon: Play, color: 'bg-sky-50 text-sky-600' },
            { label: 'Responses', value: String(res.kpis.totalResponses || 0), icon: Users, color: 'bg-amber-50 text-amber-600' },
            { label: 'Completion Rate', value: `${completionRate}%`, icon: Target, color: 'bg-violet-50 text-violet-600' },
          ]);
        }
      }
      setLoading(false);
    });
  }, []);

  const filtered = searchText.trim() ? surveys.filter(s => {
    const q = searchText.toLowerCase();
    return (s.title || '').toLowerCase().includes(q) || (s.type || '').toLowerCase().includes(q) || (s.status || '').toLowerCase().includes(q);
  }) : surveys;
  const statusColor = (s: string) => s === 'active' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : s === 'draft' ? 'text-slate-600 bg-slate-50 border-slate-200' : 'text-sky-600 bg-sky-50 border-sky-200';
  const typeColor = (t: string) => t === 'safety' ? 'text-red-600 bg-red-50 border-red-200' : t === 'compliance' ? 'text-amber-600 bg-amber-50 border-amber-200' : t === 'audit' ? 'text-sky-600 bg-sky-50 border-sky-200' : 'text-violet-600 bg-violet-50 border-violet-200';
  const handleCreate = async () => {
    if (!form.title) { toast.error('Title is required'); return; }
    setSaving(true);
    const res = await api.post('/api/surveys', {
      title: form.title,
      type: form.type,
      description: form.description || undefined,
      questions: form.questions || undefined,
    });
    if (res.success) {
      toast.success('Survey created successfully');
      setSurveys(prev => [res.data, ...prev]);
      setCreateOpen(false);
      setForm({ title: '', type: 'safety', description: '', questions: '', expiryDate: '' });
    } else {
      toast.error(res.error || 'Failed to create survey');
    }
    setSaving(false);
  };
  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Surveys</h1><p className="text-muted-foreground mt-1">Create and conduct safety, compliance, and operational surveys</p></div>
        {(hasPermission('production_surveys.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />New Survey</Button>}
      </div>
      {loading ? <LoadingSkeleton /> : (<>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => { const I = k.icon; return (
          <div key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-4">
              <div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div>
            </div>
          </div>
        ); })}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search surveys..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" /></div>
      </div>
      <Card className="border border-border/60 shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Responses</TableHead><TableHead>Target Group</TableHead><TableHead className="hidden md:table-cell">Created</TableHead></TableRow></TableHeader><TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="h-48"><EmptyState icon={ClipboardList} title="No surveys found" description="Create a new survey to get started." /></TableCell></TableRow>
          ) : filtered.map(s => (
            <TableRow key={s.id} className="hover:bg-muted/30">
              <TableCell className="font-medium">{s.title}</TableCell>
              <TableCell><Badge variant="outline" className={typeColor(s.type)}><span className="capitalize">{s.type}</span></Badge></TableCell>
              <TableCell><Badge variant="outline" className={statusColor(s.status)}><span className="capitalize">{s.status}</span></Badge></TableCell>
              <TableCell className="text-right">{s.totalResponses || 0}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{s.targetGroup || 'All'}</TableCell>
              <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{formatDate(s.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody></Table></div>
      </CardContent></Card>
      </>)}
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Create New Survey</h2><p className="text-sm text-muted-foreground">Set up a new survey for your team</p></div>
          <div className="space-y-4">
            <div><Label>Title</Label><Input placeholder="e.g. Monthly Safety Checklist" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Type</Label><Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="safety">Safety</SelectItem><SelectItem value="compliance">Compliance</SelectItem><SelectItem value="audit">Audit</SelectItem><SelectItem value="feedback">Feedback</SelectItem></SelectContent></Select></div>
            <div><Label>Description</Label><Textarea placeholder="Survey description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div><Label>Questions (one per line)</Label><Textarea placeholder="Are fire extinguishers accessible?&#10;Are emergency exits clear?&#10;Is PPE being worn correctly?" rows={4} value={form.questions} onChange={e => setForm(f => ({ ...f, questions: e.target.value }))} /></div>
            <DatePicker label="Expiry Date" value={form.expiryDate || undefined} onChange={v => setForm(f => ({ ...f, expiryDate: v || '' }))} />
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={saving || !form.title}>{saving ? 'Creating...' : 'Create Survey'}</Button></div>
        
      </ResponsiveDialog>
    </div>
  );
}
// Time Logs: enhanced with dedicated API, permission gating, filters, export, and productivity metrics
export function OperationsTimeLogsPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  const fetchLogs = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    const url = `/api/time-logs?${params.toString()}`;
    Promise.all([
      api.get<any>(url),
      api.get<any>(`/api/time-logs?summary=true&${params.toString()}`),
    ]).then(([logsRes, summaryRes]) => {
      if (logsRes.success) setTimeLogs(logsRes.data || []);
      if (summaryRes.success) setSummary(summaryRes.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(); }, [fromDate, toDate]);

  const filtered = searchText.trim() ? timeLogs.filter((tl: any) => {
    const q = searchText.toLowerCase();
    return (tl.workOrder?.woNumber || '').toLowerCase().includes(q) || (tl.user?.fullName || '').toLowerCase().includes(q) || (tl.action || '').toLowerCase().includes(q);
  }) : timeLogs;

  const handleExport = () => {
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    params.set('export', 'csv');
    window.open(`/api/time-logs?${params.toString()}`, '_blank');
  };

  const summaryCards = summary ? [
    { label: 'Total Hours', value: `${summary.summary?.totalHours || 0}h`, icon: Clock, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Technicians', value: String(summary.summary?.uniqueTechnicians || 0), icon: Users, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Work Orders', value: String(summary.summary?.uniqueWorkOrders || 0), icon: ClipboardList, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Total Entries', value: String(summary.summary?.totalEntries || 0), icon: FileText, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400' },
  ] : [];

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Time Logs</h1><p className="text-muted-foreground mt-1">Track employee work hours, shifts, and labor allocation</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          {(hasPermission('time_logs.update') || hasPermission('reports.export') || isAdmin()) && (
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
          )}
          <Button variant={showSummary ? 'default' : 'outline'} size="sm" onClick={() => setShowSummary(!showSummary)}><BarChart3 className="h-4 w-4 mr-1" />Productivity</Button>
          <div className="relative min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search logs..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>

      {/* Date filters */}
      <div className="flex items-center gap-3 flex-wrap mt-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">From:</label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-auto" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">To:</label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-auto" />
        </div>
        {(fromDate || toDate) && (
          <Button variant="ghost" size="sm" onClick={() => { setFromDate(''); setToDate(''); }}>Clear</Button>
        )}
      </div>

      {loading && !timeLogs.length ? <LoadingSkeleton /> : (<>
        {/* Summary cards */}
        {summaryCards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-3">
            {summaryCards.map(k => { const I = k.icon; return (
              <Card key={k.label}><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
            ); })}
          </div>
        )}

        {/* Productivity summary view */}
        {showSummary && summary && summary.byTechnician && summary.byTechnician.length > 0 && (
          <Card className="mt-4 border-0 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Technician Productivity</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table><TableHeader><TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead className="hidden sm:table-cell">Department</TableHead>
                  <TableHead className="text-right">Total Hrs</TableHead>
                  <TableHead className="text-right hidden md:table-cell">WOs</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">Entries</TableHead>
                  <TableHead className="hidden lg:table-cell">Top Activity</TableHead>
                </TableRow></TableHeader><TableBody>
                  {summary.byTechnician.map((tech: any) => {
                    const activities = [
                      { name: 'Maintenance', hrs: tech.maintenanceHours },
                      { name: 'Travel', hrs: tech.travelHours },
                      { name: 'Inspection', hrs: tech.inspectionHours },
                      { name: 'Testing', hrs: tech.testingHours },
                      { name: 'Standby', hrs: tech.standbyHours },
                    ].sort((a: any, b: any) => b.hrs - a.hrs);
                    return (
                      <TableRow key={tech.userId} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-sm">{tech.fullName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{tech.department || '-'}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatDuration(tech.totalHours)}</TableCell>
                        <TableCell className="text-right text-sm hidden md:table-cell">{tech.woCount}</TableCell>
                        <TableCell className="text-right text-sm hidden lg:table-cell">{tech.entryCount}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{activities[0]?.hrs > 0 ? `${activities[0].name} (${formatDuration(activities[0].hrs)})` : '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody></Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Time logs table */}
        <Card className="mt-4 border-0 shadow-sm"><Table><TableHeader><TableRow><TableHead>WO #</TableHead><TableHead className="hidden sm:table-cell">Technician</TableHead><TableHead>Action</TableHead><TableHead className="hidden md:table-cell">Duration</TableHead><TableHead className="hidden md:table-cell">Activity</TableHead><TableHead className="hidden lg:table-cell">Notes</TableHead><TableHead className="hidden lg:table-cell">Timestamp</TableHead></TableRow></TableHeader><TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="h-48"><EmptyState icon={Clock} title="No time logs found" description="Time logs will appear once work order time tracking is used." /></TableCell></TableRow>
          ) : filtered.slice(0, 50).map((tl: any, i: number) => (
            <TableRow key={tl.id || i} className="hover:bg-muted/30">
              <TableCell className="font-mono text-xs">{tl.workOrder?.woNumber || '-'}</TableCell>
              <TableCell className="text-sm hidden sm:table-cell">{tl.user?.fullName || '-'}</TableCell>
              <TableCell className="text-sm"><Badge variant={tl.action === 'start' ? 'default' : tl.action === 'complete' ? 'secondary' : 'outline'} className="text-xs">{(tl.action || '').replace(/_/g, ' ')}</Badge></TableCell>
              <TableCell className="text-sm font-mono hidden md:table-cell">{tl.duration ? `${tl.duration}h` : '-'}</TableCell>
              <TableCell className="text-xs text-muted-foreground hidden md:table-cell capitalize">{(tl.activityType || '-').replace(/_/g, ' ')}</TableCell>
              <TableCell className="text-xs text-muted-foreground hidden lg:table-cell max-w-[200px] truncate">{tl.notes || '-'}</TableCell>
              <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{tl.timestamp ? formatDateTime(tl.timestamp) : '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody></Table></Card>
      </>)}
    </div>
  );
}
// Shift Handover: uses shift_handovers.create
export function OperationsShiftHandoverPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [handovers, setHandovers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ shift: 'Morning', fromOperator: '', toOperator: '', tasksCompleted: '', pendingItems: '', issues: '', escalations: '' });
  const [kpis, setKpis] = useState<any[]>([]);
  const [viewItem, setViewItem] = useState<any>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ shift: 'Morning', area: '', status: 'pending', fromOperator: '', toOperator: '', handoverDate: '', items: '', notes: '' });
  const [editLoading, setEditLoading] = useState(false);

  const areaOptions = [
    { value: 'Plant A', label: 'Plant A' },
    { value: 'Plant B', label: 'Plant B' },
    { value: 'Plant C', label: 'Plant C' },
    { value: 'Warehouse', label: 'Warehouse' },
    { value: 'Workshop', label: 'Workshop' },
    { value: 'Office', label: 'Office' },
    { value: 'External', label: 'External' },
  ];

  useEffect(() => {
    api.get<any>('/api/shift-handovers').then(res => {
      if (res.success) {
        setHandovers(res.data || []);
        if (res.kpis) {
          setKpis([
            { label: "Today's Handovers", value: String(res.kpis.today || 0), icon: ArrowRightLeft, color: 'bg-emerald-50 text-emerald-600' },
            { label: 'Pending', value: String(res.kpis.pending || 0), icon: Clock, color: 'bg-amber-50 text-amber-600' },
            { label: 'Confirmed', value: String(res.kpis.confirmed || 0), icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
            { label: 'Total', value: String(res.kpis.total || 0), icon: AlertTriangle, color: 'bg-violet-50 text-violet-600' },
          ]);
        }
      }
      setLoading(false);
    });
  }, []);

  const filtered = searchText.trim() ? handovers.filter(h => {
    const q = searchText.toLowerCase();
    const fromName = h.handedOverBy?.fullName || '';
    const toName = h.receivedBy?.fullName || '';
    return (h.shiftType || '').toLowerCase().includes(q) || fromName.toLowerCase().includes(q) || toName.toLowerCase().includes(q) || (h.safetyNotes || '').toLowerCase().includes(q) || (h.notes || '').toLowerCase().includes(q);
  }) : handovers;
  const shiftColor = (s: string) => s === 'morning' ? 'text-amber-600 bg-amber-50 border-amber-200' : s === 'afternoon' ? 'text-sky-600 bg-sky-50 border-sky-200' : 'text-indigo-600 bg-indigo-50 border-indigo-200';
  const parseJsonText = (jsonStr: string | null): string => {
    if (!jsonStr) return '-';
    try {
      const arr = JSON.parse(jsonStr);
      if (Array.isArray(arr)) return arr.map((item: any) => item.task || item.issue || item.text || JSON.stringify(item)).join('. ');
      return String(arr);
    } catch { return jsonStr; }
  };
  const handleCreate = async () => {
    if (!form.fromOperator) { toast.error('From operator is required'); return; }
    if (!form.toOperator) { toast.error('To operator is required'); return; }
    setSaving(true);
    const tasks = form.tasksCompleted ? [{ task: form.tasksCompleted }] : [];
    const issues = form.pendingItems ? [{ issue: form.pendingItems }] : [];
    const res = await api.post('/api/shift-handovers', {
      shiftType: form.shift,
      tasksSummary: tasks,
      pendingIssues: issues,
      safetyNotes: form.issues || undefined,
      notes: form.escalations || undefined,
    });
    if (res.success) {
      toast.success('Handover recorded successfully');
      setHandovers(prev => [res.data, ...prev]);
      setCreateOpen(false);
      setForm({ shift: 'Morning', fromOperator: '', toOperator: '', tasksCompleted: '', pendingItems: '', issues: '', escalations: '' });
    } else {
      toast.error(res.error || 'Failed to record handover');
    }
    setSaving(false);
  };
  const handleEditOpen = (item: any) => {
    setEditItem(item);
    setEditForm({
      shift: item.shiftType || 'Morning',
      area: item.area || '',
      status: item.status || 'pending',
      fromOperator: item.handedOverBy?.fullName || '',
      toOperator: item.receivedBy?.fullName || '',
      handoverDate: item.shiftDate || '',
      items: parseJsonText(item.tasksSummary),
      notes: item.notes || '',
    });
  };
  const handleEditSave = async () => {
    if (!editItem) return;
    setEditLoading(true);
    try {
      const res = await api.put(`/api/shift-handovers/${editItem.id}`, {
        shiftType: editForm.shift,
        area: editForm.area || undefined,
        status: editForm.status,
        shiftDate: editForm.handoverDate || undefined,
        tasksSummary: editForm.items ? [{ task: editForm.items }] : [],
        notes: editForm.notes || undefined,
      });
      if (res.success) {
        toast.success('Handover updated successfully');
        setHandovers(prev => prev.map(h => h.id === editItem.id ? { ...h, ...res.data } : h));
        setEditItem(null);
      } else {
        toast.error(res.error || 'Failed to update handover');
      }
    } catch { toast.error('Failed to update handover'); }
    setEditLoading(false);
  };
  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Shift Handover</h1><p className="text-muted-foreground mt-1">Manage shift-to-shift handover notes, pending tasks, and critical information</p></div>
        {(hasPermission('shift_handovers.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />New Handover</Button>}
      </div>
      {loading ? <LoadingSkeleton /> : (<>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => { const I = k.icon; return (
          <div key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-4">
              <div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div>
            </div>
          </div>
        ); })}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search handovers..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" /></div>
      </div>
      <Card className="border border-border/60 shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Shift</TableHead><TableHead className="hidden md:table-cell">Date</TableHead><TableHead>From / To</TableHead><TableHead className="hidden lg:table-cell">Tasks</TableHead><TableHead className="hidden lg:table-cell">Pending</TableHead><TableHead className="hidden md:table-cell">Safety Notes</TableHead><TableHead className="hidden sm:table-cell">Notes</TableHead><TableHead>Status</TableHead><TableHead className="w-10"></TableHead></TableRow></TableHeader><TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={9} className="h-48"><EmptyState icon={ArrowRightLeft} title="No handovers found" description="Create a new shift handover to get started." /></TableCell></TableRow>
          ) : filtered.map(h => (
            <TableRow key={h.id} className="hover:bg-muted/30">
              <TableCell><Badge variant="outline" className={shiftColor(h.shiftType)}><span className="capitalize">{h.shiftType}</span></Badge></TableCell>
              <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{formatDate(h.shiftDate)}</TableCell>
              <TableCell className="text-sm"><span className="font-medium">{h.handedOverBy?.fullName || '-'}</span><span className="text-muted-foreground mx-1">→</span><span className="font-medium">{h.receivedBy?.fullName || '-'}</span></TableCell>
              <TableCell className="text-xs text-muted-foreground hidden lg:table-cell max-w-[200px] truncate">{parseJsonText(h.tasksSummary)}</TableCell>
              <TableCell className="text-xs text-muted-foreground hidden lg:table-cell max-w-[180px] truncate">{parseJsonText(h.pendingIssues)}</TableCell>
              <TableCell className="text-xs hidden md:table-cell max-w-[150px] truncate"><span className={h.safetyNotes ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>{h.safetyNotes || '-'}</span></TableCell>
              <TableCell className="text-xs hidden sm:table-cell max-w-[150px] truncate"><span className={h.notes ? 'text-red-600 font-medium' : 'text-muted-foreground'}>{h.notes || '-'}</span></TableCell>
              <TableCell><Badge variant="outline" className={h.status === 'confirmed' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-amber-600 bg-amber-50 border-amber-200'}><span className="capitalize">{h.status}</span></Badge></TableCell>
              <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setViewItem(h)}><Eye className="h-4 w-4 mr-2" />View</DropdownMenuItem>{(hasPermission('shift_handovers.create') || isAdmin()) && <DropdownMenuItem onClick={() => handleEditOpen(h)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></TableCell>
            </TableRow>
          ))}
        </TableBody></Table></div>
      </CardContent></Card>
      </>)}
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">New Shift Handover</h2><p className="text-sm text-muted-foreground">Record handover details for the current shift</p></div>
          <div className="space-y-4">
            <div><Label>Shift</Label><Select value={form.shift} onValueChange={v => setForm(f => ({ ...f, shift: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Morning">Morning</SelectItem><SelectItem value="Afternoon">Afternoon</SelectItem><SelectItem value="Night">Night</SelectItem></SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From Operator</Label><Input placeholder="Name" value={form.fromOperator} onChange={e => setForm(f => ({ ...f, fromOperator: e.target.value }))} /></div>
              <div><Label>To Operator</Label><Input placeholder="Name" value={form.toOperator} onChange={e => setForm(f => ({ ...f, toOperator: e.target.value }))} /></div>
            </div>
            <div><Label>Tasks Completed</Label><Textarea placeholder="List completed tasks..." rows={2} value={form.tasksCompleted} onChange={e => setForm(f => ({ ...f, tasksCompleted: e.target.value }))} /></div>
            <div><Label>Pending Items</Label><Textarea placeholder="List pending tasks..." rows={2} value={form.pendingItems} onChange={e => setForm(f => ({ ...f, pendingItems: e.target.value }))} /></div>
            <div><Label>Issues</Label><Textarea placeholder="Any issues encountered..." rows={2} value={form.issues} onChange={e => setForm(f => ({ ...f, issues: e.target.value }))} /></div>
            <div><Label>Escalations</Label><Textarea placeholder="Items to escalate..." rows={2} value={form.escalations} onChange={e => setForm(f => ({ ...f, escalations: e.target.value }))} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={saving || !form.fromOperator || !form.toOperator}>{saving ? 'Saving...' : 'Save Handover'}</Button></div>
        
      </ResponsiveDialog>
      <ResponsiveDialog open={!!viewItem} onOpenChange={open => { if (!open) setViewItem(null); }}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Handover Details</h2><p className="text-sm text-muted-foreground">View shift handover information</p></div>
          {viewItem && <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Shift</span><p className="font-medium capitalize">{viewItem.shiftType || '-'}</p></div>
            <div><span className="text-muted-foreground">Status</span><p className="font-medium capitalize">{viewItem.status || '-'}</p></div>
            <div><span className="text-muted-foreground">From Operator</span><p className="font-medium">{viewItem.handedOverBy?.fullName || '-'}</p></div>
            <div><span className="text-muted-foreground">To Operator</span><p className="font-medium">{viewItem.receivedBy?.fullName || '-'}</p></div>
            <div><span className="text-muted-foreground">Handover Date</span><p className="font-medium">{formatDate(viewItem.shiftDate)}</p></div>
            <div><span className="text-muted-foreground">Area</span><p className="font-medium">{viewItem.area || '-'}</p></div>
            <div className="col-span-2"><span className="text-muted-foreground">Tasks Summary</span><p className="font-medium">{parseJsonText(viewItem.tasksSummary)}</p></div>
            <div className="col-span-2"><span className="text-muted-foreground">Pending Issues</span><p className="font-medium">{parseJsonText(viewItem.pendingIssues)}</p></div>
            <div className="col-span-2"><span className="text-muted-foreground">Safety Notes</span><p className="font-medium">{viewItem.safetyNotes || '-'}</p></div>
            <div className="col-span-2"><span className="text-muted-foreground">Notes</span><p className="font-medium">{viewItem.notes || '-'}</p></div>
          </div>}
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setViewItem(null)}>Close</Button></div>
        
      </ResponsiveDialog>
      <ResponsiveDialog open={!!editItem} onOpenChange={open => { if (!open) setEditItem(null); }}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Edit Handover</h2><p className="text-sm text-muted-foreground">Update shift handover details</p></div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Shift</Label><Select value={editForm.shift} onValueChange={v => setEditForm(f => ({ ...f, shift: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Morning">Morning</SelectItem><SelectItem value="Afternoon">Afternoon</SelectItem><SelectItem value="Night">Night</SelectItem></SelectContent></Select></div>
              <div><Label>Status</Label><Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="confirmed">Confirmed</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From Operator</Label><Input value={editForm.fromOperator} onChange={e => setEditForm(f => ({ ...f, fromOperator: e.target.value }))} /></div>
              <div><Label>To Operator</Label><Input value={editForm.toOperator} onChange={e => setEditForm(f => ({ ...f, toOperator: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DatePicker label="Handover Date" value={editForm.handoverDate || undefined} onChange={v => setEditForm(f => ({ ...f, handoverDate: v || '' }))} />
              <div><Label>Area</Label><SearchableSelect value={editForm.area} onValueChange={v => setEditForm(f => ({ ...f, area: v }))} options={areaOptions} placeholder="Select area..." clearable={false} /></div>
            </div>
            <div><Label>Tasks Summary</Label><Textarea value={editForm.items} onChange={e => setEditForm(f => ({ ...f, items: e.target.value }))} rows={3} /></div>
            <div><Label>Notes</Label><Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button><Button onClick={handleEditSave} disabled={editLoading}>{editLoading ? 'Saving...' : 'Save Changes'}</Button></div>
        
      </ResponsiveDialog>
    </div>
  );
}
// Checklists: uses checklists.create
export function OperationsChecklistsPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [checklists, setChecklists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [form, setForm] = useState({ name: '', description: '', category: 'safety', items: '' });

  useEffect(() => {
    api.get<any>('/api/checklists').then(res => {
      if (res.success) {
        setChecklists((res.data || []).map((cl: any) => ({
          id: cl.id,
          name: cl.title,
          description: cl.description,
          category: cl.type,
          itemsCount: (cl.items || []).length,
          lastUsed: cl.updatedAt || cl.createdAt,
          items: (cl.items || []).map((it: any) => it.item),
        })));
      }
      setLoading(false);
    });
  }, []);

  const categories = ['safety', 'maintenance', 'inspection', 'startup', 'shutdown', 'audit', 'calibration'];

  const catColors: Record<string, string> = {
    safety: 'bg-red-50 text-red-700 border-red-200',
    maintenance: 'bg-amber-50 text-amber-700 border-amber-200',
    inspection: 'bg-sky-50 text-sky-700 border-sky-200',
    startup: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    shutdown: 'bg-orange-50 text-orange-700 border-orange-200',
    audit: 'bg-violet-50 text-violet-700 border-violet-200',
    calibration: 'bg-teal-50 text-teal-700 border-teal-200',
  };

  const catIcons: Record<string, React.ElementType> = {
    safety: ShieldAlert,
    maintenance: Wrench,
    inspection: Search,
    startup: Play,
    shutdown: StopCircle,
    audit: FileCheck,
    calibration: Crosshair,
  };

  const filtered = useMemo(() => {
    if (!searchText.trim()) return checklists;
    const q = searchText.toLowerCase();
    return checklists.filter(c => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [checklists, searchText]);

  const handleCreate = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    if (!form.items.trim()) { toast.error('At least one checklist item is required'); return; }
    setSaving(true);
    const items = form.items.split('\n').map(s => s.trim()).filter(Boolean);
    const res = await api.post('/api/checklists', {
      title: form.name,
      description: form.description || undefined,
      type: form.category,
      frequency: 'daily',
      items,
    });
    if (res.success) {
      const newChecklist = {
        id: res.data.id,
        name: res.data.title,
        description: res.data.description,
        category: res.data.type,
        itemsCount: (res.data.items || []).length,
        lastUsed: res.data.updatedAt || res.data.createdAt,
        items: (res.data.items || []).map((it: any) => it.item),
      };
      setChecklists(prev => [newChecklist, ...prev]);
      toast.success('Checklist created');
      setCreateOpen(false);
      setForm({ name: '', description: '', category: 'safety', items: '' });
    } else {
      toast.error(res.error || 'Failed to create checklist');
    }
    setSaving(false);
  };

  if (loading) return <div className="p-6 lg:p-8"><LoadingSkeleton /></div>;

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Checklists</h1>
          <p className="text-muted-foreground text-sm mt-1">{checklists.length} checklist template(s)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search checklists..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" />
          </div>
          {(hasPermission('pm_checklists.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-1.5" />New Checklist</Button>}
        </div>
      </div>

      {/* Checklist grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full"><EmptyState icon={CheckSquare} title="No checklists found" description="Create a checklist template or adjust your search." /></div>
        ) : filtered.map(cl => {
          const CatIcon = catIcons[cl.category] || ClipboardList;
          return (
            <Card key={cl.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setSelected(cl); setViewOpen(true); }}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${catColors[cl.category] || 'bg-slate-100'}`}>
                    <CatIcon className="h-4 w-4" />
                  </div>
                  <Badge variant="outline" className={`text-[10px] capitalize ${catColors[cl.category] || ''}`}>{cl.category}</Badge>
                </div>
                <h3 className="font-semibold text-sm mb-1">{cl.name}</h3>
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{cl.description}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" />{cl.itemsCount} items</span>
                  <span>Used {cl.lastUsed ? timeAgo(cl.lastUsed) : 'never'}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create Dialog */}
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Create Checklist</h2><p className="text-sm text-muted-foreground">Define a new checklist template for routine procedures.</p></div>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Checklist Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Monthly Safety Walkthrough" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this checklist for..." rows={2} /></div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Checklist Items * (one per line)</Label><Textarea value={form.items} onChange={e => setForm(f => ({ ...f, items: e.target.value }))} placeholder={`Check fire extinguisher\nInspect emergency exits\nVerify PPE availability`} rows={6} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? 'Creating...' : 'Create Checklist'}</Button>
          </div>
        
      </ResponsiveDialog>

      {/* View Dialog */}
      <ResponsiveDialog open={viewOpen} onOpenChange={setViewOpen}>
        
          <div className="space-y-1.5 mb-4">
            <h2 className="text-lg font-semibold leading-none tracking-tight">{selected?.name}</h2>
            <p className="text-sm text-muted-foreground">{selected?.description}</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-[11px] capitalize ${catColors[selected?.category || ''] || ''}`}>{selected?.category}</Badge>
              <span className="text-xs text-muted-foreground">{selected?.itemsCount} items</span>
              {selected?.lastUsed && <span className="text-xs text-muted-foreground">· Last used {timeAgo(selected.lastUsed)}</span>}
            </div>
            <Separator />
            <div className="space-y-2">
              {selected?.items?.map((item: string, i: number) => (
                <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-muted/50">
                  <div className="h-4 w-4 rounded border border-muted-foreground/30 flex-shrink-0" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}

// ============================================================================
// PRODUCTION SUBPAGES
// ============================================================================

