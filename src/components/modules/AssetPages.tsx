'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { api } from '@/lib/api';
import type { Asset, PageName } from '@/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/datetime-picker';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AsyncSearchableSelect, SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';;
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Building2, Plus, Search, ArrowLeft, Pencil, Trash2, Eye, MoreHorizontal,
  Factory, Wrench, Clock, AlertTriangle, CheckCircle2, XCircle, Activity, AlertCircle,
  GitBranch, Layers, ListChecks, Box, HeartPulse, Settings, Monitor, Thermometer,
  ChevronRight,
  Droplets, Cpu, Zap, MapPin, Shield, BarChart3, Target, RefreshCw, Loader2, Play,
  FolderOpen, Sparkles, X,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { EmptyState, StatusBadge, PriorityBadge, getInitials, formatDate, formatDateTime, timeAgo, LoadingSkeleton, formatCurrency } from '@/components/shared/helpers';
import { AIAssetGenerator } from '@/components/shared/AIAssetGenerator';

export function AssetsPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [plantList, setPlantList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [conditionFilter, setConditionFilter] = useState('all');
  const [criticalityFilter, setCriticalityFilter] = useState('all');
  // Detail view
  const [detailId, setDetailId] = useState<string | null>(null);
  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false);
  const { navigate, pageParams } = useNavigationStore();
  const { hasPermission, isAdmin } = useAuthStore();

  // If navigated here with an asset ID, open detail view
  // If navigated with condition='at_risk', pre-filter to poor/critical condition
  const [atRiskFilter, setAtRiskFilter] = useState(false);
  useEffect(() => {
    if (pageParams?.id && !detailId) setDetailId(pageParams.id);
    if (pageParams?.condition === 'at_risk') setAtRiskFilter(true);
  }, [pageParams]);

  const emptyForm = { name: '', assetTag: '', serialNumber: '', categoryId: '', manufacturer: '', model: '', yearManufactured: '', condition: 'new', status: 'operational', criticality: 'medium', location: '', building: '', floor: '', area: '', plantId: '', departmentId: '', assignedToId: '', parentId: '', description: '', purchaseDate: '', purchaseCost: '', expectedLifeYears: '' };
  const [form, setForm] = useState(emptyForm);

  const [showAllAssets, setShowAllAssets] = useState(false);

  const loadData = useCallback(() => {
    // Asset register filtering/search happens client-side, so load the complete
    // authenticated plant scope instead of silently limiting search to page 1.
    const query = showAllAssets ? '?limit=500' : '?topLevelOnly=true&limit=500';
    Promise.all([api.get<any[]>(`/api/assets${query}`), api.get<any[]>('/api/asset-categories'), api.get<any[]>('/api/plants')]).then(([aRes, cRes, pRes]) => {
      if (aRes.success && aRes.data) setAssets(Array.isArray(aRes.data) ? aRes.data : []);
      if (cRes.success && cRes.data) setCategories(Array.isArray(cRes.data) ? cRes.data : []);
      if (pRes.success && pRes.data) setPlantList(Array.isArray(pRes.data) ? pRes.data : []);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      toast.error('Failed to load asset data');
    });
  }, [showAllAssets]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      if (searchText) { const q = searchText.toLowerCase(); if (!a.name.toLowerCase().includes(q) && !a.assetTag.toLowerCase().includes(q)) return false; }
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (atRiskFilter) {
        if (a.condition !== 'poor' && a.condition !== 'critical' && a.condition !== 'out_of_service') return false;
      } else if (conditionFilter !== 'all' && a.condition !== conditionFilter) return false;
      if (criticalityFilter !== 'all' && a.criticality !== criticalityFilter) return false;
      return true;
    });
  }, [assets, searchText, statusFilter, conditionFilter, criticalityFilter, atRiskFilter]);

  const stats = useMemo(() => ({
    total: assets.length,
    operational: assets.filter(a => a.status === 'operational').length,
    maintenance: assets.filter(a => a.status === 'under_maintenance').length,
    critical: assets.filter(a => a.criticality === 'critical').length,
  }), [assets]);

  const openCreate = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (a: any) => { setEditId(a.id); setForm({ name: a.name, assetTag: a.assetTag, serialNumber: a.serialNumber || '', categoryId: a.categoryId || '', manufacturer: a.manufacturer || '', model: a.model || '', yearManufactured: a.yearManufactured?.toString() || '', condition: a.condition || 'new', status: a.status || 'operational', criticality: a.criticality || 'medium', location: a.location || '', building: a.building || '', floor: a.floor || '', area: a.area || '', plantId: a.plantId || '', departmentId: a.departmentId || '', assignedToId: a.assignedToId || '', parentId: a.parentId || '', description: a.description || '', purchaseDate: a.purchaseDate ? a.purchaseDate.slice(0, 10) : '', purchaseCost: a.purchaseCost?.toString() || '', expectedLifeYears: a.expectedLifeYears?.toString() || '' }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name || !form.assetTag) { toast.error('Name and asset tag required'); return; }
    setSaving(true);
    const payload: any = { ...form, purchaseCost: form.purchaseCost ? parseFloat(form.purchaseCost) : undefined, yearManufactured: form.yearManufactured ? parseInt(form.yearManufactured) : undefined, expectedLifeYears: form.expectedLifeYears ? parseInt(form.expectedLifeYears) : undefined, purchaseDate: form.purchaseDate || undefined };
    const res = editId
      ? await api.put(`/api/assets/${editId}`, payload)
      : await api.post('/api/assets', payload, { headers: { 'x-plant-id': form.plantId } });

    if (res.success) {
      toast.success(editId ? 'Asset updated' : 'Asset created');
      setDialogOpen(false);

      if (!editId && res.data?.id) {
        const createdAssetId = String(res.data.id);
        const currentPlantId = localStorage.getItem('user_plant_id') || '';
        navigate('assets-machines', { id: createdAssetId, tab: 'components' });

        if (form.plantId && currentPlantId !== form.plantId) {
          localStorage.setItem('user_plant_id', form.plantId);
          window.location.reload();
          return;
        }

        setDetailId(createdAssetId);
      } else {
        loadData();
      }
    } else {
      toast.error(res.error || 'Failed');
    }
    setSaving(false);
  };

  const statusColors: Record<string, string> = { operational: 'bg-emerald-100 text-emerald-700', under_maintenance: 'bg-amber-100 text-amber-700', decommissioned: 'bg-slate-100 text-slate-500', disposed: 'bg-red-100 text-red-600' };
  const criticalityColors: Record<string, string> = { low: 'bg-slate-100 text-slate-600', medium: 'bg-sky-100 text-sky-700', high: 'bg-amber-100 text-amber-700', critical: 'bg-red-100 text-red-700' };

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await api.delete(`/api/assets/${deleteId}`);
    if (res.success) { toast.success('Asset deleted'); setDeleteId(null); loadData(); }
    else { toast.error(res.error || 'Failed to delete'); }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asset Register</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage all physical assets and equipment</p>
        </div>
        {(hasPermission('assets.create') || isAdmin()) && (
          <div className='flex gap-2'>
            <Button onClick={openCreate} className='bg-emerald-600 hover:bg-emerald-700 text-white'><Plus className='h-4 w-4 mr-1.5' />Add Asset</Button>
            <Button onClick={() => setAiGeneratorOpen(true)} variant='outline' className='border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/30 gap-1.5'><Sparkles className='h-4 w-4' />AI Generate</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Assets', value: stats.total, icon: Building2, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
          { label: 'Operational', value: stats.operational, icon: CheckCircle2, color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
          { label: 'Under Maintenance', value: stats.maintenance, icon: Wrench, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
          { label: 'Critical', value: stats.critical, icon: AlertTriangle, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm dark:bg-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${s.color}`}><s.icon className="h-5 w-5" /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="filter-row flex flex-wrap gap-3 items-center">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search assets..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="operational">Operational</SelectItem><SelectItem value="under_maintenance">Under Maintenance</SelectItem><SelectItem value="decommissioned">Decommissioned</SelectItem></SelectContent>
        </Select>
        <Select value={conditionFilter} onValueChange={setConditionFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Condition" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Condition</SelectItem><SelectItem value="new">New</SelectItem><SelectItem value="good">Good</SelectItem><SelectItem value="fair">Fair</SelectItem><SelectItem value="poor">Poor</SelectItem></SelectContent>
        </Select>
        <Select value={criticalityFilter} onValueChange={setCriticalityFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Criticality" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Criticality</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-muted-foreground whitespace-nowrap">Show sub-components</label>
          <Switch checked={showAllAssets} onCheckedChange={setShowAllAssets} />
        </div>
        {atRiskFilter && (
          <Badge variant="destructive" className="gap-1.5 cursor-pointer" onClick={() => setAtRiskFilter(false)}>
            <AlertTriangle className="h-3 w-3" />
            At Risk Filter Active
            <X className="h-3 w-3" />
          </Badge>
        )}
      </div>

      <Card className="border-0 shadow-sm dark:bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset Tag</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Criticality</TableHead>
                <TableHead className="hidden xl:table-cell">Condition</TableHead>
                <TableHead className="w-10">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssets.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-48"><EmptyState icon={Building2} title="No assets found" description="Try adjusting your filters." /></TableCell></TableRow>
              ) : filteredAssets.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.assetTag}</TableCell>
                  <TableCell className="font-medium text-sm">{a.name}</TableCell>
                  <TableCell className="text-sm hidden md:table-cell">{a.category?.name || '-'}</TableCell>
                  <TableCell className="text-sm hidden lg:table-cell">{a.location || '-'}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${statusColors[a.status] || ''}`}>{(a.status || '').replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="hidden md:table-cell"><Badge variant="outline" className={`text-[10px] ${criticalityColors[a.criticality] || ''}`}>{(a.criticality || '').toUpperCase()}</Badge></TableCell>
                  <TableCell className="text-xs hidden xl:table-cell capitalize">{a.condition || '-'}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailId(a.id)}><Eye className="h-3.5 w-3.5 mr-2" />View</DropdownMenuItem>
                        {(hasPermission('assets.update') || isAdmin()) && <DropdownMenuItem onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>}
                        {(hasPermission('assets.delete') || isAdmin()) && <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(a.id)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                        </>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">{editId ? 'Edit Asset' : 'Create Asset'}</h2><p className="text-sm text-muted-foreground">{editId ? 'Update asset information.' : 'Register a new asset.'}</p></div>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Asset Tag *</Label><Input value={form.assetTag} onChange={e => setForm(f => ({ ...f, assetTag: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Serial Number</Label><Input value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Category</Label>
                <AsyncSearchableSelect
                  value={form.categoryId}
                  onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}
                  fetchOptions={async () => {
                    const res = await api.get('/api/asset-categories');
                    if (res.success && res.data) {
                      return (Array.isArray(res.data) ? res.data : []).map((c: any) => ({
                        value: c.id,
                        label: c.name,
                      }));
                    }
                    return [];
                  }}
                  placeholder="Select category..."
                  searchPlaceholder="Search categories..."
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Manufacturer</Label><Input value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Model</Label><Input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Year</Label><Input value={form.yearManufactured} onChange={e => setForm(f => ({ ...f, yearManufactured: e.target.value }))} placeholder="2024" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Condition</Label>
                <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="good">Good</SelectItem><SelectItem value="fair">Fair</SelectItem><SelectItem value="poor">Poor</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="operational">Operational</SelectItem><SelectItem value="under_maintenance">Under Maintenance</SelectItem><SelectItem value="decommissioned">Decommissioned</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Criticality</Label>
                <Select value={form.criticality} onValueChange={v => setForm(f => ({ ...f, criticality: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label>Location</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Building</Label><Input value={form.building} onChange={e => setForm(f => ({ ...f, building: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Floor</Label><Input value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Area</Label><Input value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Plant</Label>
                <AsyncSearchableSelect
                  value={form.plantId}
                  onValueChange={v => setForm(f => ({ ...f, plantId: v }))}
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
              <div className="space-y-1.5"><Label>Department</Label>
                <AsyncSearchableSelect
                  value={form.departmentId}
                  onValueChange={v => setForm(f => ({ ...f, departmentId: v }))}
                  fetchOptions={async () => {
                    const res = await api.get('/api/departments');
                    if (res.success && res.data) {
                      return (Array.isArray(res.data) ? res.data : []).map((d: any) => ({
                        value: d.id,
                        label: `${d.name} (${d.code || ''})`,
                      }));
                    }
                    return [];
                  }}
                  placeholder="Select department..."
                  searchPlaceholder="Search departments..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Assigned To</Label>
                <AsyncSearchableSelect
                  value={form.assignedToId}
                  onValueChange={v => setForm(f => ({ ...f, assignedToId: v }))}
                  fetchOptions={async () => {
                    const res = await api.get('/api/users');
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
              <div className="space-y-1.5"><Label>Parent Asset</Label>
                <AsyncSearchableSelect
                  value={form.parentId}
                  onValueChange={v => setForm(f => ({ ...f, parentId: v }))}
                  fetchOptions={async () => {
                    const res = await api.get('/api/assets?limit=999');
                    if (res.success && res.data) {
                      return (Array.isArray(res.data) ? res.data : []).map((a: any) => ({
                        value: a.id,
                        label: `${a.name} [${a.assetTag || ''}]`,
                      }));
                    }
                    return [];
                  }}
                  placeholder="Select parent asset..."
                  searchPlaceholder="Search assets..."
                />
              </div>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div className="grid grid-cols-3 gap-3">
              <DatePicker label="Purchase Date" value={form.purchaseDate || undefined} onChange={v => setForm(f => ({ ...f, purchaseDate: v || '' }))} />
              <div className="space-y-1.5"><Label>Purchase Cost</Label><Input type="number" value={form.purchaseCost} onChange={e => setForm(f => ({ ...f, purchaseCost: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Expected Life (years)</Label><Input type="number" value={form.expectedLifeYears} onChange={e => setForm(f => ({ ...f, expectedLifeYears: e.target.value }))} /></div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : null}{editId ? 'Save Changes' : 'Create Asset'}</Button>
          </div>
        
      </ResponsiveDialog>

      {/* Delete Confirmation Dialog */}
      <ResponsiveDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Delete Asset</h2><p className="text-sm text-muted-foreground">Are you sure you want to delete this asset? This action cannot be undone.</p></div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </div>
        
      </ResponsiveDialog>

      {/* Detail Side Sheet */}
      <Sheet open={!!detailId} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <SheetContent className="!w-screen !max-w-none sm:!max-w-none md:!max-w-none lg:!max-w-none xl:!max-w-none 2xl:!max-w-none h-dvh overflow-y-auto overflow-x-hidden p-0 gap-0">
          {detailId && <AssetDetailPage id={detailId} />}
        </SheetContent>
      </Sheet>

      {/* AI Asset Generator Dialog */}
      <AIAssetGenerator open={aiGeneratorOpen} onOpenChange={setAiGeneratorOpen} onSuccess={loadData} />
    </div>
  );
}

import { AssetDetailPage } from './AssetDetailPage';
export { AssetDetailPage };

// ============================================================================
// INVENTORY PAGE
// ============================================================================

// --- AssetsMachinesPage separator ---
export function AssetsMachinesPage() {
  return <AssetsPage />;
}

export function AssetsHierarchyPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const navigate = useNavigationStore(s => s.navigate);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/assets?limit=9999');
        if (res.success && res.data) setAssets(Array.isArray(res.data) ? res.data : []);
      } catch { /* empty */ }
      setLoading(false);
    })();
  }, []);

  const roots = assets.filter((a: any) => !a.parentId);
  const getChildren = (parentId: string) => assets.filter((a: any) => a.parentId === parentId);
  const toggle = (id: string) => {
    setExpanded(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });
  };

  const renderTree = (items: any[], depth: number = 0) => items.map(a => {
    const children = getChildren(a.id);
    const isOpen = expanded.has(a.id);
    return (
      <div key={a.id}>
        <div className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 text-sm transition-colors" style={{ paddingLeft: `${depth * 20 + 12}px` }}>
          {children.length > 0 ? (
            <button onClick={() => toggle(a.id)} className="shrink-0 p-0.5 rounded hover:bg-muted">
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-4.5" />
          )}
          <button onClick={() => navigate('asset-detail', { id: a.id })} className="flex items-center gap-2 flex-1 min-w-0 text-left hover:underline">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate font-medium">{a.name}</span>
          </button>
          <Badge variant="outline" className="text-[10px] shrink-0">{a.status?.replace(/_/g,' ')}</Badge>
        </div>
        {isOpen && children.length > 0 && renderTree(children, depth + 1)}
      </div>
    );
  });

  if (loading) return <div className="p-6 lg:p-8"><LoadingSkeleton /></div>;

  return (
    <div className="page-content">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Asset Hierarchy</h1>
        <p className="text-muted-foreground mt-1">Visualize the parent-child relationships between assets</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tree View</CardTitle>
          <CardDescription>Click asset name to view details. Click chevron to expand/collapse branches.</CardDescription>
        </CardHeader>
        <CardContent>
          {roots.length === 0 ? (
            <EmptyState icon={GitBranch} title="No assets found" description="Create assets to build the hierarchy tree" />
          ) : (
            <div className="max-h-[500px] overflow-y-auto">{renderTree(roots)}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AssetHealthPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/assets?limit=9999');
        if (res.success && res.data) setAssets(Array.isArray(res.data) ? res.data : []);
      } catch { /* empty */ }
      setLoading(false);
    })();
  }, []);

  const conditions = ['new', 'good', 'fair', 'poor', 'out_of_service'];
  const condColors: Record<string, string> = { new: 'bg-emerald-500', good: 'bg-emerald-400', fair: 'bg-amber-400', poor: 'bg-red-400', out_of_service: 'bg-red-600' };
  const condBadgeColors: Record<string, string> = { new: 'bg-emerald-50 text-emerald-700 border-emerald-200', good: 'bg-emerald-50 text-emerald-700 border-emerald-200', fair: 'bg-amber-50 text-amber-700 border-amber-200', poor: 'bg-red-50 text-red-700 border-red-200', out_of_service: 'bg-red-100 text-red-800 border-red-300' };
  const condLabels: Record<string, string> = { new: 'New', good: 'Good', fair: 'Fair', poor: 'Poor', out_of_service: 'Out of Service' };
  const critColors: Record<string, string> = { low: 'text-emerald-600', medium: 'text-amber-600', high: 'text-orange-600', critical: 'text-red-600' };

  const condCounts = conditions.map(c => ({ condition: c, count: assets.filter((a: any) => a.condition === c).length }));
  const critCounts = ['low', 'medium', 'high', 'critical'].map(c => ({ criticality: c, count: assets.filter((a: any) => a.criticality === c).length }));
  const statusCounts = ['operational', 'standby', 'under_maintenance', 'decommissioned'].map(s => ({ status: s, count: assets.filter((a: any) => a.status === s).length }));
  const total = assets.length || 1;

  const goodCount = assets.filter((a: any) => a.condition === 'good' || a.condition === 'new').length;
  const fairCount = assets.filter((a: any) => a.condition === 'fair').length;
  const poorCount = assets.filter((a: any) => a.condition === 'poor').length;
  const criticalCount = assets.filter((a: any) => a.condition === 'out_of_service').length;

  const summaryCards = [
    { label: 'Total Assets', value: assets.length, icon: Box, color: 'text-slate-600 bg-slate-50 dark:bg-slate-900/30 dark:text-slate-400' },
    { label: 'Good Condition', value: goodCount, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Fair Condition', value: fairCount, icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Poor Condition', value: poorCount, icon: AlertCircle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400' },
    { label: 'Critical', value: criticalCount, icon: XCircle, color: 'text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-300' },
  ];

  // Category distribution
  const categories = useMemo(() => {
    const map = new Map<string, { total: number; good: number; fair: number; poor: number; critical: number }>();
    assets.forEach((a: any) => {
      const cat = typeof a.category === 'object' && a.category ? (a.category.name || a.category.code || 'Uncategorized') : (a.category || 'Uncategorized');
      if (!map.has(cat)) map.set(cat, { total: 0, good: 0, fair: 0, poor: 0, critical: 0 });
      const c = map.get(cat)!;
      c.total++;
      if (a.condition === 'good' || a.condition === 'new') c.good++;
      else if (a.condition === 'fair') c.fair++;
      else if (a.condition === 'poor') c.poor++;
      else c.critical++;
    });
    return Array.from(map.entries()).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [assets]);

  // Health matrix: group by criticality, show condition badges
  const criticalityLevels = ['critical', 'high', 'medium', 'low'];
  const healthMatrix = criticalityLevels.map(crit => {
    const group = assets.filter((a: any) => a.criticality === crit);
    return { criticality: crit, assets: group };
  });

  // Assets needing attention
  const attentionAssets = assets.filter((a: any) => a.condition === 'poor' || a.condition === 'out_of_service').sort((a: any, b: any) => {
    const order: Record<string, number> = { out_of_service: 0, poor: 1 };
    return (order[a.condition] ?? 2) - (order[b.condition] ?? 2);
  });

  if (loading) return <div className="p-6 lg:p-8"><LoadingSkeleton /></div>;

  return (
    <div className="page-content">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Asset Health</h1>
        <p className="text-muted-foreground mt-1">Overview of asset conditions, criticality, and operational status</p>
      </div>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {summaryCards.map(k => { const I = k.icon; return (
          <Card key={k.label}><CardContent className="p-4"><div className="flex items-center gap-3"><div className={`h-10 w-10 rounded-lg ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
        ); })}
      </div>

      {/* Health Matrix */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Health Matrix</CardTitle><CardDescription>Asset conditions grouped by criticality level</CardDescription></CardHeader>
        <CardContent>
          {healthMatrix.map(group => (
            <div key={group.criticality} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className={`capitalize font-semibold ${critColors[group.criticality]} border-current/20`}>{group.criticality}</Badge>
                <span className="text-xs text-muted-foreground">{group.assets.length} asset(s)</span>
              </div>
              {group.assets.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {group.assets.map((a: any) => (
                    <Badge key={a.id} variant="outline" className={`text-[11px] ${condBadgeColors[a.condition] || ''} ${a.condition === 'out_of_service' ? 'animate-pulse' : ''}`}>
                      {a.name || a.assetTag}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground pl-1">No assets in this criticality level</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Health distribution by category */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Health by Category</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-h-96 overflow-y-auto">
            {categories.length === 0 ? (
              <EmptyState icon={FolderOpen} title="No categories" description="Asset categories will appear here." />
            ) : categories.map((cat, idx) => {
              const pct = total > 0 ? Math.round((cat.total / total) * 100) : 0;
              const goodPct = cat.total > 0 ? Math.round((cat.good / cat.total) * 100) : 0;
              const fairPct = cat.total > 0 ? Math.round((cat.fair / cat.total) * 100) : 0;
              const poorPct = cat.total > 0 ? Math.round((cat.poor / cat.total) * 100) : 0;
              return (
                <div key={`${cat.name}-${idx}`} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate max-w-[200px]">{cat.name}</span>
                    <span className="text-xs text-muted-foreground">{cat.total} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                    <div className="bg-emerald-400 h-full" style={{ width: `${goodPct}%` }} />
                    <div className="bg-amber-400 h-full" style={{ width: `${fairPct}%` }} />
                    <div className="bg-red-400 h-full" style={{ width: `${poorPct}%` }} />
                  </div>
                </div>
              );
            })}
            {categories.length > 0 && (
              <div className="flex items-center gap-4 pt-2 border-t">
                <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-emerald-400" /><span className="text-[10px] text-muted-foreground">Good</span></div>
                <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-amber-400" /><span className="text-[10px] text-muted-foreground">Fair</span></div>
                <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-red-400" /><span className="text-[10px] text-muted-foreground">Poor/Critical</span></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* By Criticality + By Status */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">By Criticality</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {critCounts.map(c => (
                <div key={c.criticality} className="flex items-center gap-3">
                  <span className={`text-sm font-medium capitalize w-24 ${critColors[c.criticality]}`}>{c.criticality}</span>
                  <div className="flex-1 bg-muted rounded-full h-2.5"><div className="bg-primary rounded-full h-2.5 transition-all" style={{ width: `${(c.count / total) * 100}%` }} /></div>
                  <span className="text-sm font-semibold w-8 text-right">{c.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">By Status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {statusCounts.map(s => (
                <div key={s.status} className="flex items-center gap-3">
                  <span className="text-sm font-medium capitalize w-44">{s.status.replace(/_/g,' ')}</span>
                  <div className="flex-1 bg-muted rounded-full h-2.5"><div className="bg-primary rounded-full h-2.5 transition-all" style={{ width: `${(s.count / total) * 100}%` }} /></div>
                  <span className="text-sm font-semibold w-8 text-right">{s.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Assets needing attention */}
      {attentionAssets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <CardTitle className="text-base">Assets Needing Attention</CardTitle>
            </div>
            <CardDescription>{attentionAssets.length} asset(s) in poor or critical condition</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead className="hidden md:table-cell">Tag</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead className="hidden lg:table-cell">Criticality</TableHead>
                    <TableHead className="hidden md:table-cell">Location</TableHead>
                    <TableHead className="hidden lg:table-cell">Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attentionAssets.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium text-sm">{a.name || '-'}</TableCell>
                      <TableCell className="font-mono text-xs hidden md:table-cell">{a.assetTag || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[11px] ${condBadgeColors[a.condition] || ''} ${a.condition === 'out_of_service' ? 'animate-pulse' : ''}`}>
                          {condLabels[a.condition] || a.condition}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell"><span className={`capitalize text-sm font-medium ${critColors[a.criticality] || ''}`}>{a.criticality || '-'}</span></TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{a.location || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{typeof a.category === 'object' && a.category ? (a.category.name || a.category.code || '-') : (a.category || '-')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Asset detail pages
export function AssetsBomPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [searchText, setSearchText] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bomItems, setBomItems] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [kpis, setKpis] = useState({ totalBoms: 0, components: 0, active: 0, pending: 0 });
  const [form, setForm] = useState({ parentAsset: '', component: '', partNumber: '', quantity: '', unit: 'ea', specification: '', revision: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [bomRes, assetRes] = await Promise.all([
        api.get('/api/bill-of-materials'),
        api.get('/api/assets?limit=200'),
      ]);
      if (bomRes.success && bomRes.data) {
        const d = bomRes.data as any;
        setBomItems(Array.isArray(d) ? d : []);
        if (bomRes.kpis) setKpis(bomRes.kpis as any);
      }
      if (assetRes.success && assetRes.data) {
        setAssets(Array.isArray(assetRes.data) ? assetRes.data : []);
      }
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = searchText.trim() ? bomItems.filter(b => {
    const q = searchText.toLowerCase();
    const pn = (b.parent as any)?.name || '';
    const cn = (b.childAsset as any)?.name || '';
    return pn.toLowerCase().includes(q) || cn.toLowerCase().includes(q) || (b.partNumber || '').toLowerCase().includes(q);
  }) : bomItems;

  const statusColor = (s: string) => s === 'active' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : s === 'pending' || s === 'under_review' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-red-600 bg-red-50 border-red-200';

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await api.post('/api/bill-of-materials', {
        parentId: form.parentAsset,
        childAssetId: form.component,
        partNumber: form.partNumber || undefined,
        quantity: parseFloat(form.quantity) || 1,
        unit: form.unit || 'ea',
        specification: form.specification || undefined,
        revision: form.revision || undefined,
      });
      if (res.success) {
        toast.success('BOM component added successfully');
        setCreateOpen(false);
        setForm({ parentAsset: '', component: '', partNumber: '', quantity: '', unit: 'ea', specification: '', revision: '' });
        fetchData();
      } else {
        toast.error(res.error || 'Failed to add BOM component');
      }
    } catch { toast.error('Failed to add BOM component'); }
    setSaving(false);
  };
  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Bill of Materials</h1><p className="text-muted-foreground mt-1">Manage hierarchical parts lists for each asset</p></div>
        {(hasPermission('assets.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Component</Button>}
      </div>
      {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total BOMs', value: kpis.totalBoms, icon: ListChecks, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Components', value: kpis.components, icon: Layers, color: 'bg-sky-50 text-sky-600' },
          { label: 'Active', value: kpis.active, icon: CheckCircle2, color: 'bg-amber-50 text-amber-600' },
          { label: 'Under Review', value: kpis.pending, icon: Clock, color: 'bg-violet-50 text-violet-600' },
        ].map(k => { const I = k.icon; return (
          <div key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-4">
              <div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div>
            </div>
          </div>
        ); })}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search BOM items..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" /></div>
      </div>
      <Card className="border border-border/60 shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Parent Asset</TableHead><TableHead>Component</TableHead><TableHead className="hidden sm:table-cell">Part Number</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="hidden sm:table-cell">Unit</TableHead><TableHead className="hidden lg:table-cell">Specification</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Rev</TableHead></TableRow></TableHeader><TableBody>
          {filtered.map(b => (
            <TableRow key={b.id} className="hover:bg-muted/30">
              <TableCell className="font-medium">{(b.parent as any)?.name || b.parentId || '-'}</TableCell>
              <TableCell>{(b.childAsset as any)?.name || b.childAssetId || '-'}</TableCell>
              <TableCell className="font-mono text-xs hidden sm:table-cell">{b.partNumber || '-'}</TableCell>
              <TableCell className="text-right">{b.quantity}</TableCell>
              <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{b.unit}</TableCell>
              <TableCell className="text-xs text-muted-foreground hidden lg:table-cell max-w-[200px] truncate">{b.specification || '-'}</TableCell>
              <TableCell><Badge variant="outline" className={statusColor(b.status)}><span className="capitalize">{b.status}</span></Badge></TableCell>
              <TableCell className="font-mono text-xs hidden md:table-cell">{b.revision || '-'}</TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground text-sm">No BOM items found</TableCell></TableRow>}
        </TableBody></Table></div>
      </CardContent></Card>
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Add BOM Component</h2><p className="text-sm text-muted-foreground">Add a new component to a Bill of Materials</p></div>
          <div className="space-y-4">
            <div><Label>Parent Asset</Label>
                <AsyncSearchableSelect
                  value={form.parentAsset}
                  onValueChange={v => setForm(f => ({ ...f, parentAsset: v }))}
                  fetchOptions={async () => {
                    const res = await api.get('/api/assets?limit=999');
                    if (res.success && res.data) {
                      return (Array.isArray(res.data) ? res.data : []).map((a: any) => ({
                        value: a.id,
                        label: `${a.name} [${a.assetTag || ''}]`,
                      }));
                    }
                    return [];
                  }}
                  placeholder="Select parent asset..."
                  searchPlaceholder="Search assets..."
                />
              </div>
            <div><Label>Component</Label>
                <AsyncSearchableSelect
                  value={form.component}
                  onValueChange={v => setForm(f => ({ ...f, component: v }))}
                  fetchOptions={async () => {
                    const res = await api.get('/api/assets?limit=999');
                    if (res.success && res.data) {
                      return (Array.isArray(res.data) ? res.data : []).map((a: any) => ({
                        value: a.id,
                        label: `${a.name} (${a.assetTag})`,
                      }));
                    }
                    return [];
                  }}
                  placeholder="Select component..."
                  searchPlaceholder="Search components..."
                />
              </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Part Number</Label><Input placeholder="e.g. SPD-4521-A" value={form.partNumber} onChange={e => setForm(f => ({ ...f, partNumber: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Quantity</Label><Input type="number" placeholder="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
                <div><Label>Unit</Label><Input placeholder="ea" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /></div>
              </div>
            </div>
            <div><Label>Specification</Label><Textarea placeholder="Component specifications..." value={form.specification} onChange={e => setForm(f => ({ ...f, specification: e.target.value }))} /></div>
            <div><Label>Revision</Label><Input placeholder="e.g. A" value={form.revision} onChange={e => setForm(f => ({ ...f, revision: e.target.value }))} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={saving || !form.parentAsset || !form.component}>{saving ? 'Saving...' : 'Add Component'}</Button></div>
        
      </ResponsiveDialog>
      </>}
    </div>
  );
}
export function AssetsConditionMonitoringPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [monitoringData, setMonitoringData] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ asset: '', parameter: 'vibration', normalMin: '', normalMax: '', alertThreshold: '' });
  const [searchText, setSearchText] = useState('');

  const parameterUnits: Record<string, string> = { vibration: 'mm/s', temperature: '°C', pressure: 'bar', flow: 'L/min', current: 'A' };

  const fetchAssetOptions = useCallback(async () => {
    const res = await api.get('/api/assets?limit=500');
    const assets = res.success ? (res.data || []) : [];
    return assets.map((a: any) => ({ value: a.id, label: a.name || a.assetTag }));
  }, []);

  const fetchMonitoring = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/iot/monitoring/summary');
      if (res.success && res.data) {
        setMonitoringData(res.data);
      }
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchMonitoring();
  }, []);

  // Build asset cards from devices with readings
  const assetCards = (monitoringData?.devicesWithReadings || []).map((d: any) => {
    const lastReading = d.readings?.[0];
    const val = lastReading?.value ?? d.lastReading ?? 0;
    const rule = d.rules?.[0];
    const inThreshold = rule ? val < rule.threshold : true;
    const status = d.status === 'warning' || d.status === 'error' ? d.status : (inThreshold ? 'normal' : 'warning');
    const prevReading = d.readings?.[1];
    const trend = prevReading ? (val > prevReading.value ? 'rising' : val < prevReading.value ? 'falling' : 'stable') : 'stable';
    return { id: d.id, name: d.name, parameter: d.parameter || '-', value: val, unit: d.unit || '', status, trend };
  });

  // Build table data from devices
  const tableData = (monitoringData?.devicesWithReadings || []).map((d: any) => {
    const lastReading = d.readings?.[0];
    const val = lastReading?.value ?? d.lastReading ?? 0;
    const rule = d.rules?.[0];
    const inThreshold = rule ? val < rule.threshold : true;
    const status = d.status === 'warning' || d.status === 'error' ? d.status : (inThreshold ? 'normal' : 'warning');
    const prevReading = d.readings?.[1];
    const trend = prevReading ? (val > prevReading.value ? '↑' : val < prevReading.value ? '↓' : '→') : '→';
    return {
      id: d.id, asset: d.name, parameter: d.parameter || '-',
      current: `${val} ${d.unit || ''}`,
      normal: d.thresholdMin != null && d.thresholdMax != null ? `${d.thresholdMin}–${d.thresholdMax} ${d.unit || ''}` : '-',
      status, lastReading: lastReading?.timestamp || d.lastSeen,
      trend,
    };
  });

  const filtered = searchText.trim() ? tableData.filter(r => {
    const q = searchText.toLowerCase();
    return r.asset.toLowerCase().includes(q) || r.parameter.toLowerCase().includes(q);
  }) : tableData;

  const kpis = [
    { label: 'Assets Monitored', value: monitoringData?.devices?.total || 0, icon: Activity, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Normal', value: monitoringData?.devices?.online || 0, icon: CheckCircle2, color: 'bg-sky-50 text-sky-600' },
    { label: 'Warning', value: monitoringData?.devices?.warning || 0, icon: AlertTriangle, color: 'bg-amber-50 text-amber-600' },
    { label: 'Critical', value: monitoringData?.devices?.error || 0, icon: AlertCircle, color: 'bg-red-50 text-red-600' },
  ];
  const statusColor = (s: string) => s === 'normal' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : s === 'warning' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-red-600 bg-red-50 border-red-200';
  const dotColor = (s: string) => s === 'normal' ? 'bg-emerald-500' : s === 'warning' ? 'bg-amber-500' : 'bg-red-500';
  const barColor = (s: string) => s === 'normal' ? 'bg-emerald-400' : s === 'warning' ? 'bg-amber-400' : 'bg-red-400';
  const handleCreate = async () => {
    if (!form.asset) { toast.error('Asset name is required'); return; }
    setSaving(true);
    try {
      const res = await api.post('/api/iot/devices', {
        name: form.asset,
        type: 'sensor',
        protocol: 'mqtt',
        parameter: form.parameter,
        unit: parameterUnits[form.parameter] || '',
        thresholdMin: form.normalMin ? parseFloat(form.normalMin) : null,
        thresholdMax: form.normalMax ? parseFloat(form.normalMax) : null,
      });
      if (res.success) {
        toast.success('Monitoring point added successfully');
        setCreateOpen(false);
        setForm({ asset: '', parameter: 'vibration', normalMin: '', normalMax: '', alertThreshold: '' });
        await fetchMonitoring();
      } else { toast.error(res.error || 'Failed to add monitoring point'); }
    } catch { toast.error('Failed to add monitoring point'); }
    setSaving(false);
  };
  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Condition Monitoring</h1><p className="text-muted-foreground mt-1">Real-time monitoring of asset health parameters</p></div>
        {(hasPermission('assets.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Monitoring Point</Button>}
      </div>
      {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : <>
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
      {assetCards.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {assetCards.map(card => (
          <Card key={card.id} className={`border border-border/60 shadow-sm cursor-pointer transition-all hover:shadow-md ${selectedCard === card.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedCard(selectedCard === card.id ? null : card.id)}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-sm">{card.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.parameter}</p>
                </div>
                <div className={`h-3 w-3 rounded-full ${dotColor(card.status)} animate-pulse`} />
              </div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold">{typeof card.value === 'number' ? card.value.toFixed(1) : card.value}</span>
                <span className="text-sm text-muted-foreground mb-0.5">{card.unit}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="outline" className={statusColor(card.status)}><span className="capitalize">{card.status}</span></Badge>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${barColor(card.status)} rounded-full`} style={{ width: card.status === 'normal' ? '40%' : card.status === 'warning' ? '70%' : '95%' }} />
                </div>
                <span className="text-xs text-muted-foreground">{card.trend === 'rising' ? '↑' : card.trend === 'falling' ? '↓' : '→'}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search assets..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" /></div>
      </div>
      <Card className="border border-border/60 shadow-sm"><CardContent className="p-0">
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Asset</TableHead><TableHead className="hidden sm:table-cell">Parameter</TableHead><TableHead>Current Value</TableHead><TableHead className="hidden md:table-cell">Normal Range</TableHead><TableHead>Status</TableHead><TableHead className="hidden lg:table-cell">Last Reading</TableHead><TableHead>Trend</TableHead></TableRow></TableHeader><TableBody>
          {filtered.map(r => (
            <TableRow key={r.id} className="hover:bg-muted/30">
              <TableCell className="font-medium">{r.asset}</TableCell>
              <TableCell className="text-sm hidden sm:table-cell">{r.parameter}</TableCell>
              <TableCell className="font-medium">{r.current}</TableCell>
              <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{r.normal}</TableCell>
              <TableCell><Badge variant="outline" className={statusColor(r.status)}><span className="capitalize">{r.status}</span></Badge></TableCell>
              <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{r.lastReading ? formatDateTime(r.lastReading) : '-'}</TableCell>
              <TableCell><span className={`text-lg font-bold ${r.trend === '↑' ? 'text-red-500' : r.trend === '↓' ? 'text-emerald-500' : 'text-slate-400'}`}>{r.trend}</span></TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground text-sm">{monitoringData ? 'No monitoring data available' : 'Loading...'}</TableCell></TableRow>}
        </TableBody></Table></div>
      </CardContent></Card>
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Add Monitoring Point</h2><p className="text-sm text-muted-foreground">Configure a new condition monitoring point</p></div>
          <div className="space-y-4">
            <div><Label>Asset</Label><AsyncSearchableSelect value={form.asset} onValueChange={v => setForm(f => ({ ...f, asset: v }))} fetchOptions={fetchAssetOptions} placeholder="Search asset..." /></div>
            <div><Label>Parameter</Label><Select value={form.parameter} onValueChange={v => setForm(f => ({ ...f, parameter: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="vibration">Vibration</SelectItem><SelectItem value="temperature">Temperature</SelectItem><SelectItem value="pressure">Pressure</SelectItem><SelectItem value="flow">Flow Rate</SelectItem><SelectItem value="current">Current</SelectItem></SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Normal Min</Label><Input placeholder="0" value={form.normalMin} onChange={e => setForm(f => ({ ...f, normalMin: e.target.value }))} /></div>
              <div><Label>Normal Max</Label><Input placeholder="100" value={form.normalMax} onChange={e => setForm(f => ({ ...f, normalMax: e.target.value }))} /></div>
            </div>
            <div><Label>Alert Threshold</Label><Input placeholder="e.g. 90" value={form.alertThreshold} onChange={e => setForm(f => ({ ...f, alertThreshold: e.target.value }))} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={saving || !form.asset}>{saving ? 'Saving...' : 'Add Point'}</Button></div>
        
      </ResponsiveDialog>
      </>}
    </div>
  );
}
export function AssetsDigitalTwinPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [selectedTwin, setSelectedTwin] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [twins, setTwins] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [kpis, setKpis] = useState({ total: 0, activeSync: 0, simulationRuns: 0, alerts: 0 });
  const [form, setForm] = useState({ name: '', asset: '', type: 'pump', syncInterval: '1min' });
  const [selectedTwinDetail, setSelectedTwinDetail] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [twinsRes, assetRes] = await Promise.all([
        api.get('/api/digital-twins'),
        api.get('/api/assets?limit=200'),
      ]);
      if (twinsRes.success && twinsRes.data) {
        setTwins(Array.isArray(twinsRes.data) ? twinsRes.data : []);
        if (twinsRes.kpis) setKpis(twinsRes.kpis as any);
      }
      if (assetRes.success && assetRes.data) {
        setAssets(Array.isArray(assetRes.data) ? assetRes.data : []);
      }
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (!selectedTwin) { setSelectedTwinDetail(null); return; }
    const fetchDetail = async () => {
      try {
        const res = await api.get(`/api/digital-twins/${selectedTwin}`);
        if (res.success && res.data) setSelectedTwinDetail(res.data);
      } catch { /* silent */ }
    };
    fetchDetail();
  }, [selectedTwin]);

  // Build specs from detail data
  const twinSpecs: Record<string, any[]> = {};
  if (selectedTwinDetail) {
    const params = selectedTwinDetail.parameters ? (() => { try { return JSON.parse(selectedTwinDetail.parameters); } catch { return []; } })() : [];
    const specs = selectedTwinDetail.specification ? (() => { try { return JSON.parse(selectedTwinDetail.specification); } catch { return []; } })() : [];
    twinSpecs[selectedTwin] = [...params, ...specs];
  }

  const currentTwin = twins.find(t => t.id === selectedTwin);

  const kpiCards = [
    { label: 'Digital Twins', value: kpis.total, icon: Box, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Active Sync', value: kpis.activeSync, icon: RefreshCw, color: 'bg-sky-50 text-sky-600' },
    { label: 'Simulation Runs', value: kpis.simulationRuns, icon: Play, color: 'bg-amber-50 text-amber-600' },
    { label: 'Alerts', value: kpis.alerts, icon: AlertTriangle, color: 'bg-red-50 text-red-600' },
  ];
  const statusColor = (s: string) => s === 'normal' ? 'text-emerald-600' : s === 'warning' ? 'text-amber-600' : 'text-red-600';
  const healthRingColor = (score: number) => score >= 80 ? 'text-emerald-500' : score >= 60 ? 'text-amber-500' : 'text-red-500';
  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await api.post('/api/digital-twins', {
        name: form.name,
        assetId: form.asset,
        type: form.type,
        syncInterval: form.syncInterval,
      });
      if (res.success) {
        toast.success('Digital twin created successfully');
        setCreateOpen(false);
        setForm({ name: '', asset: '', type: 'pump', syncInterval: '1min' });
        fetchData();
      } else {
        toast.error(res.error || 'Failed to create digital twin');
      }
    } catch { toast.error('Failed to create digital twin'); }
    setSaving(false);
  };
  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Digital Twin</h1><p className="text-muted-foreground mt-1">Create and manage digital replicas of physical assets</p></div>
        {(hasPermission('assets.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Create Twin</Button>}
      </div>
      {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(k => { const I = k.icon; return (
          <div key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-4">
              <div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div>
            </div>
          </div>
        ); })}
      </div>
      {twins.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {twins.map(twin => (
          <Card key={twin.id} className={`border border-border/60 shadow-sm cursor-pointer transition-all hover:shadow-md ${selectedTwin === twin.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedTwin(twin.id)}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-sm">{twin.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{(twin.asset as any)?.name || '-'}</p>
                </div>
                <Badge variant="outline" className={twin.isActive ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'}>
                  <span className="capitalize">{twin.isActive ? 'active' : 'inactive'}</span>
                </Badge>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-muted-foreground">Type: <span className="capitalize font-medium text-foreground">{twin.type}</span></div>
                <div className="relative h-12 w-12">
                  <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/30" /><circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="2.5" strokeDasharray={`${twin.healthScore * 1} ${100 - twin.healthScore}`} className={healthRingColor(twin.healthScore)} strokeLinecap="round" /></svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{twin.healthScore}%</span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Last sync: {twin.lastSynced ? formatDateTime(twin.lastSynced) : '-'}</p>
            </CardContent>
          </Card>
        ))}
      </div>}
      {currentTwin && selectedTwinDetail && (
        <Card className="border border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{currentTwin.name} — Specifications</CardTitle>
            <CardDescription className="text-xs">Real-time parameter data from the digital twin model</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Parameter</TableHead><TableHead>Value</TableHead><TableHead className="hidden sm:table-cell">Unit</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
              {(twinSpecs[selectedTwin] || []).map((spec: any, i: number) => (
                <TableRow key={i} className="hover:bg-muted/30">
                  <TableCell className="font-medium text-sm">{spec.name}</TableCell>
                  <TableCell className="font-mono">{spec.value}</TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">{spec.unit || ''}</TableCell>
                  <TableCell><span className={`text-xs font-medium ${statusColor(spec.status)}`}>{spec.status === 'normal' ? '● Normal' : spec.status === 'warning' ? '● Warning' : '● Critical'}</span></TableCell>
                </TableRow>
              ))}
              {(twinSpecs[selectedTwin] || []).length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground text-sm">No specification data available</TableCell></TableRow>}
            </TableBody></Table></div>
          </CardContent>
        </Card>
      )}
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Create Digital Twin</h2><p className="text-sm text-muted-foreground">Create a new digital replica for an asset</p></div>
          <div className="space-y-4">
            <div><Label>Twin Name</Label><Input placeholder="e.g. Centrifugal Pump P-101" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Asset</Label>
                <AsyncSearchableSelect
                  value={form.asset}
                  onValueChange={v => setForm(f => ({ ...f, asset: v }))}
                  fetchOptions={async () => {
                    const res = await api.get('/api/assets?limit=999');
                    if (res.success && res.data) {
                      return (Array.isArray(res.data) ? res.data : []).map((a: any) => ({
                        value: a.id,
                        label: `${a.name} (${a.assetTag})`,
                      }));
                    }
                    return [];
                  }}
                  placeholder="Select asset..."
                  searchPlaceholder="Search assets..."
                />
              </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label><Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pump">Pump</SelectItem><SelectItem value="motor">Motor</SelectItem><SelectItem value="compressor">Compressor</SelectItem><SelectItem value="valve">Valve</SelectItem><SelectItem value="heat_exchanger">Heat Exchanger</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
              <div><Label>Sync Interval</Label><Select value={form.syncInterval} onValueChange={v => setForm(f => ({ ...f, syncInterval: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="real_time">Real-time</SelectItem><SelectItem value="1min">1 min</SelectItem><SelectItem value="5min">5 min</SelectItem><SelectItem value="15min">15 min</SelectItem></SelectContent></Select></div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={saving || !form.name || !form.asset}>{saving ? 'Creating...' : 'Create Twin'}</Button></div>
        
      </ResponsiveDialog>
      </>}
    </div>
  );
}

// ============================================================================
// MAINTENANCE SUBPAGES
// ============================================================================
