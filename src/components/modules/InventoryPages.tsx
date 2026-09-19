'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import type { InventoryItem } from '@/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/datetime-picker';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import {
  Package, Plus, Search, Pencil, Trash2, MoreHorizontal, AlertTriangle,
  TrendingUp, ArrowUpDown, History, X, ShoppingCart, Building, FolderOpen,
  ChevronRight,
  MapPin, ArrowRightLeft, FileText, Truck, Download, RefreshCw, Eye,
  CheckCircle2, Check, ClipboardCheck, ClipboardList, Clock, Filter, DollarSign, Box, Star,
  XCircle, Loader2,
} from 'lucide-react';
import { EmptyState, StatusBadge, PriorityBadge, getInitials, formatDate, formatDateTime, timeAgo, LoadingSkeleton, formatCurrency } from '@/components/shared/helpers';
import { AsyncSearchableSelect, SearchableSelect } from '@/components/ui/searchable-select';

export function InventoryPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Stock movement
  const [movementOpen, setMovementOpen] = useState(false);
  const [movType, setMovType] = useState('in');
  const [movItemId, setMovItemId] = useState('');
  const [movQty, setMovQty] = useState('');
  const [movReason, setMovReason] = useState('');
  const [movLoading, setMovLoading] = useState(false);
  // Stock movements list
  const [selectedMovItemId, setSelectedMovItemId] = useState<string | null>(null);
  const [movementsSheetOpen, setMovementsSheetOpen] = useState(false);
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  // KPI data from API
  const [kpi, setKpi] = useState<{
    total: number;
    byCategory: Record<string, number>;
    lowStock: number;
    totalValue: number;
    avgUnitCost: number;
    pendingRequests: number;
    pendingAdjustments: number;
    movements: { thisMonth: number; lastMonth: number; trendPercent: number };
    stockSummary: { totalQuantity: number; totalMinLevels: number; totalMaxCapacity: number };
  } | null>(null);

  const emptyForm = { itemCode: '', name: '', description: '', category: 'spare_part', unitOfMeasure: 'each', currentStock: '', minStockLevel: '', maxStockLevel: '', reorderQuantity: '', unitCost: '', supplier: '', location: '', binLocation: '', plantId: '' };
  const [form, setForm] = useState(emptyForm);

  const loadData = useCallback(() => {
    api.get<any[]>('/api/inventory').then((iRes) => {
      if (iRes.success && iRes.data) setItems(Array.isArray(iRes.data) ? iRes.data : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    api.get('/api/inventory/kpi').then((res: any) => {
      if (res.success && res.data) setKpi(res.data);
    });
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter(i => {
      if (searchText) { const q = searchText.toLowerCase(); if (!i.name.toLowerCase().includes(q) && !i.itemCode.toLowerCase().includes(q)) return false; }
      if (categoryFilter !== 'all' && i.category !== categoryFilter) return false;
      if (lowStockOnly && i.currentStock > i.minStockLevel) return false;
      return true;
    });
  }, [items, searchText, categoryFilter, lowStockOnly]);

  const stats = useMemo(() => {
    const lowStock = items.filter(i => i.currentStock <= i.minStockLevel).length;
    const totalValue = items.reduce((sum, i) => sum + (i.currentStock * (i.unitCost || 0)), 0);
    return { total: items.length, lowStock, totalValue };
  }, [items]);

  const openCreate = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (i: any) => { setEditId(i.id); setForm({ itemCode: i.itemCode, name: i.name, description: i.description || '', category: i.category || 'spare_part', unitOfMeasure: i.unitOfMeasure || 'each', currentStock: i.currentStock?.toString() || '', minStockLevel: i.minStockLevel?.toString() || '', maxStockLevel: i.maxStockLevel?.toString() || '', reorderQuantity: i.reorderQuantity?.toString() || '', unitCost: i.unitCost?.toString() || '', supplier: i.supplier || '', location: i.location || '', binLocation: i.binLocation || '', plantId: i.plantId || '' }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name || !form.itemCode) { toast.error('Name and item code required'); return; }
    setSaving(true);
    const payload: any = { ...form, currentStock: form.currentStock ? parseFloat(form.currentStock) : 0, minStockLevel: form.minStockLevel ? parseFloat(form.minStockLevel) : 0, maxStockLevel: form.maxStockLevel ? parseFloat(form.maxStockLevel) : undefined, reorderQuantity: form.reorderQuantity ? parseFloat(form.reorderQuantity) : undefined, unitCost: form.unitCost ? parseFloat(form.unitCost) : undefined };
    const res = editId ? await api.put(`/api/inventory/${editId}`, payload) : await api.post('/api/inventory', payload);
    if (res.success) { toast.success(editId ? 'Item updated' : 'Item created'); setDialogOpen(false); loadData(); } else { toast.error(res.error || 'Failed'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await api.delete(`/api/inventory/${deleteId}`);
    if (res.success) { toast.success('Item deleted'); setDeleteId(null); loadData(); }
    else { toast.error(res.error || 'Failed to delete'); }
  };

  const handleStockMovement = async () => {
    if (!movItemId || !movQty) { toast.error('Item and quantity required'); return; }
    setMovLoading(true);
    const res = await api.post(`/api/inventory/${movItemId}/stock-movements`, { type: movType, quantity: parseFloat(movQty), reason: movReason || undefined });
    if (res.success) { toast.success('Stock movement recorded'); setMovementOpen(false); setMovQty(''); setMovReason(''); loadData(); }
    else { toast.error(res.error || 'Failed'); }
    setMovLoading(false);
  };

  const loadMovements = useCallback((itemId: string) => {
    setSelectedMovItemId(itemId);
    setMovementsSheetOpen(true);
    api.get<any[]>(`/api/inventory/${itemId}/stock-movements`).then(res => {
      if (res.success && res.data) setStockMovements(Array.isArray(res.data) ? res.data : []);
    });
  }, []);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage spare parts, consumables, and supplies</p>
        </div>
        <div className="flex gap-2">
          {(hasPermission('inventory.manage') || isAdmin()) && <Button variant="outline" onClick={() => { setMovItemId(''); setMovQty(''); setMovReason(''); setMovType('in'); setMovementOpen(true); }} className="gap-1.5"><ArrowUpDown className="h-4 w-4" />Stock Movement</Button>}
          {(hasPermission('inventory.create') || isAdmin()) && <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-1.5" />Add Item</Button>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi?.total ?? stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpi?.byCategory ? `${Object.keys(kpi.byCategory).length} categories` : 'across all categories'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(kpi?.totalValue ?? stats.totalValue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpi?.avgUnitCost != null ? `Avg ${formatCurrency(kpi.avgUnitCost)}/unit` : 'total inventory value'}
            </p>
          </CardContent>
        </Card>
        <Card className={"border-0 shadow-sm" + ((kpi?.lowStock ?? stats.lowStock) > 0 ? ' border-l-4 border-l-amber-400' : '')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Low Stock</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${(kpi?.lowStock ?? stats.lowStock) > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(kpi?.lowStock ?? stats.lowStock) > 0 ? 'text-amber-600' : ''}`}>{kpi?.lowStock ?? stats.lowStock}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {(kpi?.lowStock ?? stats.lowStock) > 0 ? 'items below min level' : 'all items in stock'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Requests</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi?.pendingRequests ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpi?.pendingRequests != null ? 'awaiting approval' : 'pending requests'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Movements This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi?.movements?.thisMonth ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpi?.movements?.trendPercent != null
                ? (kpi.movements.trendPercent >= 0 ? '+' : '') + kpi.movements.trendPercent.toFixed(1) + '% vs last month'
                : 'stock movements'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Adjustments</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi?.pendingAdjustments ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpi?.pendingAdjustments != null ? 'awaiting review' : 'pending adjustments'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="filter-row flex flex-wrap gap-3 items-center">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search inventory..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Categories</SelectItem><SelectItem value="spare_part">Spare Part</SelectItem><SelectItem value="consumable">Consumable</SelectItem><SelectItem value="tool">Tool</SelectItem><SelectItem value="material">Material</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
        </Select>
        <label className="filter-row-checkbox flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={lowStockOnly} onChange={e => setLowStockOnly(e.target.checked)} className="rounded" />
          <span>Low Stock Only</span>
        </label>
      </div>

      <Card className="border-0 shadow-sm dark:bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead>Stock Level</TableHead>
                <TableHead className="hidden md:table-cell">Unit Cost</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead className="w-10">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-48"><EmptyState icon={Package} title="No items found" description="Try adjusting your filters." /></TableCell></TableRow>
              ) : filteredItems.map(i => {
                const isLow = i.currentStock <= i.minStockLevel;
                const max = i.maxStockLevel || Math.max(i.minStockLevel * 2, i.currentStock, 100);
                const pct = Math.min(100, (i.currentStock / max) * 100);
                return (
                  <TableRow key={i.id} className={isLow ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                    <TableCell className="font-mono text-xs">{i.itemCode}</TableCell>
                    <TableCell className="font-medium text-sm">{i.name}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell capitalize">{i.category?.replace(/_/g, ' ')}</TableCell>
                    <TableCell>
                      <div className="w-24">
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5"><span>{i.currentStock}</span><span>{i.maxStockLevel || '—'}</span></div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${isLow ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Min: {i.minStockLevel}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{i.unitCost ? formatCurrency(i.unitCost) : '-'}</TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">{i.location || '-'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {(hasPermission('inventory.update') || isAdmin()) && <DropdownMenuItem onClick={() => openEdit(i)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>}
                          <DropdownMenuItem onClick={() => loadMovements(i.id)}><History className="h-3.5 w-3.5 mr-2" />Movements</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {(hasPermission('inventory.delete') || isAdmin()) && <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(i.id)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">{editId ? 'Edit Item' : 'Add Inventory Item'}</h2><p className="text-sm text-muted-foreground">{editId ? 'Update inventory item.' : 'Add a new item to inventory.'}</p></div>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Item Code *</Label><Input value={form.itemCode} onChange={e => setForm(f => ({ ...f, itemCode: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="spare_part">Spare Part</SelectItem><SelectItem value="consumable">Consumable</SelectItem><SelectItem value="tool">Tool</SelectItem><SelectItem value="material">Material</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Unit of Measure</Label>
                <Select value={form.unitOfMeasure} onValueChange={v => setForm(f => ({ ...f, unitOfMeasure: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="each">Each</SelectItem><SelectItem value="kg">Kg</SelectItem><SelectItem value="liter">Liter</SelectItem><SelectItem value="meter">Meter</SelectItem><SelectItem value="set">Set</SelectItem><SelectItem value="box">Box</SelectItem><SelectItem value="roll">Roll</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Plant</Label>
                <AsyncSearchableSelect
                  value={form.plantId}
                  onValueChange={(val) => setForm(f => ({ ...f, plantId: val }))}
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
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label>Current Stock</Label><Input type="number" value={form.currentStock} onChange={e => setForm(f => ({ ...f, currentStock: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Min Stock Level</Label><Input type="number" value={form.minStockLevel} onChange={e => setForm(f => ({ ...f, minStockLevel: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Max Stock Level</Label><Input type="number" value={form.maxStockLevel} onChange={e => setForm(f => ({ ...f, maxStockLevel: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Reorder Qty</Label><Input type="number" value={form.reorderQuantity} onChange={e => setForm(f => ({ ...f, reorderQuantity: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Unit Cost (₵)</Label><Input type="number" value={form.unitCost} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Supplier</Label>
                <AsyncSearchableSelect
                  value={form.supplier}
                  onValueChange={(val) => setForm(f => ({ ...f, supplier: val }))}
                  fetchOptions={async () => {
                    const res = await api.get('/api/suppliers');
                    if (res.success && res.data) {
                      return (Array.isArray(res.data) ? res.data : []).map((s: any) => ({
                        value: s.id,
                        label: s.name,
                      }));
                    }
                    return [];
                  }}
                  placeholder="Select supplier..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Location</Label>
                <AsyncSearchableSelect
                  value={form.location}
                  onValueChange={(val) => setForm(f => ({ ...f, location: val }))}
                  fetchOptions={async () => {
                    const res = await api.get('/api/inventory/locations');
                    if (res.success && res.data) {
                      return (Array.isArray(res.data) ? res.data : []).map((l: any) => ({
                        value: l.id,
                        label: l.name + (l.code ? ` (${l.code})` : ''),
                      }));
                    }
                    return [];
                  }}
                  placeholder="Select location..."
                />
              </div>
              <div className="space-y-1.5"><Label>Bin Location</Label><Input value={form.binLocation} onChange={e => setForm(f => ({ ...f, binLocation: e.target.value }))} /></div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : null}{editId ? 'Save Changes' : 'Add Item'}</Button>
          </div>
        
      </ResponsiveDialog>

      {/* Delete Confirmation Dialog */}
      <ResponsiveDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Delete Inventory Item</h2><p className="text-sm text-muted-foreground">Are you sure? This action cannot be undone.</p></div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </div>
        
      </ResponsiveDialog>

      {/* Stock Movement Dialog */}
      <ResponsiveDialog open={movementOpen} onOpenChange={setMovementOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Stock Movement</h2><p className="text-sm text-muted-foreground">Record a stock movement.</p></div>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Movement Type</Label>
              <Select value={movType} onValueChange={setMovType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="in">Stock In</SelectItem><SelectItem value="out">Stock Out</SelectItem><SelectItem value="adjustment">Adjustment</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Item *</Label>
              <AsyncSearchableSelect
                value={movItemId}
                onValueChange={setMovItemId}
                fetchOptions={async () => {
                  const res = await api.get('/api/inventory?limit=999');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).map((it: any) => ({
                      value: it.id,
                      label: `${it.name} (${it.itemCode})`,
                    }));
                  }
                  return [];
                }}
                placeholder="Select item..."
                searchPlaceholder="Search items..."
              />
            </div>
            <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" value={movQty} onChange={e => setMovQty(e.target.value)} placeholder="Enter quantity" /></div>
            <div className="space-y-1.5"><Label>Reason</Label><Textarea value={movReason} onChange={e => setMovReason(e.target.value)} placeholder="Optional reason..." rows={2} /></div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={movLoading} onClick={handleStockMovement}>
              {movLoading ? 'Recording...' : 'Record Movement'}
            </Button>
          </div>
        
      </ResponsiveDialog>

      {/* Stock Movements Sheet */}
      <Sheet open={movementsSheetOpen} onOpenChange={(open) => { if (!open) { setMovementsSheetOpen(false); setSelectedMovItemId(null); setStockMovements([]); } }}>
        <SheetContent className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2"><History className="h-5 w-5 text-emerald-600" /> Stock Movements</SheetTitle>
            <SheetDescription>For item: {items.find(it => it.id === selectedMovItemId)?.name || selectedMovItemId}</SheetDescription>
          </SheetHeader>
          {stockMovements.length === 0 ? (
            <EmptyState icon={History} title="No stock movements" description="No stock movements found for this item." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Previous</TableHead>
                  <TableHead>New</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockMovements.map(m => (
                  <TableRow key={m.id}>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${m.type === 'in' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : m.type === 'out' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{m.type === 'in' ? 'Stock In' : m.type === 'out' ? 'Stock Out' : 'Adjustment'}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{m.type === 'out' ? '-' : '+'}{m.quantity}</TableCell>
                    <TableCell>{m.previousStock ?? '-'}</TableCell>
                    <TableCell className="font-medium">{m.newStock ?? '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{m.reason || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
// --- InventoryItemsPage separator ---
export function InventoryItemsPage() {
  return <InventoryPage />;
}

export function InventoryCategoriesPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedCat, setSelectedCat] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: '', code: '', description: '', parentId: '' });
  const [searchText, setSearchText] = useState('');

  const fetchCategories = async () => {
    try {
      const res = await api.get('/api/asset-categories');
      if (res.data) setCategories(res.data.categories || res.data || []);
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { fetchCategories(); }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getChildren = (parentId: string | null) => categories.filter(c => (parentId ? c.parentId === parentId : !c.parentId));

  const countDescendants = (id: string): number => {
    let count = 0;
    categories.filter(c => c.parentId === id).forEach(c => { count += 1 + countDescendants(c.id); });
    return count;
  };

  const renderTree = (parentId: string | null, depth: number = 0) => {
    const children = getChildren(parentId);
    const q = searchText.toLowerCase();
    const filtered = q ? children.filter((c: any) => c.name?.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q)) : children;
    return filtered.map((cat: any) => {
      const hasChildren = categories.some(c => c.parentId === cat.id);
      const isExpanded = expandedIds.has(cat.id);
      return (
        <div key={cat.id}>
          <div className="flex items-center gap-2 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors group" style={{ paddingLeft: `${depth * 24 + 12}px` }}>
            {hasChildren ? (
              <button onClick={() => toggleExpand(cat.id)} className="p-0.5 rounded hover:bg-muted">
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>
            ) : (
              <div className="w-5" />
            )}
            <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium truncate">{cat.name}</span>
              {cat.code && <span className="text-[10px] text-muted-foreground ml-2 font-mono">{cat.code}</span>}
            </div>
            <Badge variant="secondary" className="text-[10px] h-5">{cat._count?.assets ?? 0} items</Badge>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              {(hasPermission('inventory.update') || isAdmin()) && <button onClick={() => { setSelectedCat(cat); setForm({ name: cat.name, code: cat.code || '', description: cat.description || '', parentId: cat.parentId || '' }); setEditOpen(true); }} className="p-1 rounded hover:bg-muted"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>}
              {(hasPermission('inventory.delete') || isAdmin()) && <button onClick={async () => { if (confirm('Delete this category?')) { const r = await api.delete(`/api/asset-categories/${cat.id}`); if (r.success) { toast.success('Category deleted'); fetchCategories(); } else toast.error(r.error || 'Failed to delete'); } }} className="p-1 rounded hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" /></button>}
            </div>
          </div>
          {hasChildren && isExpanded && renderTree(cat.id, depth + 1)}
        </div>
      );
    });
  };

  const handleCreate = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    setSaving(true);
    const res = await api.post('/api/asset-categories', { name: form.name, code: form.code, description: form.description, parentId: form.parentId || null, isActive: true });
    if (res.success) { toast.success('Category created'); setCreateOpen(false); setForm({ name: '', code: '', description: '', parentId: '' }); fetchCategories(); }
    else toast.error(res.error || 'Failed to create category');
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!selectedCat) return;
    setSaving(true);
    const res = await api.put(`/api/asset-categories/${selectedCat.id}`, { name: form.name, code: form.code, description: form.description, parentId: form.parentId || null });
    if (res.success) { toast.success('Category updated'); setEditOpen(false); setSelectedCat(null); fetchCategories(); }
    else toast.error(res.error || 'Failed to update category');
    setSaving(false);
  };

  const rootCategories = getChildren(null);
  const totalItems = categories.reduce((sum: number, c: any) => sum + (c._count?.assets ?? 0), 0);

  if (loading) return <div className="p-6 lg:p-8"><LoadingSkeleton /></div>;

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory Categories</h1>
          <p className="text-muted-foreground text-sm mt-1">{categories.length} categories · {totalItems} total items</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search categories..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" />
          </div>
          {(hasPermission('inventory.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-1.5" />New Category</Button>}
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-2">
          {rootCategories.length === 0 ? (
            <EmptyState icon={FolderOpen} title="No categories yet" description="Create your first category to start organizing inventory items." />
          ) : (
            renderTree(null)
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Create Category</h2><p className="text-sm text-muted-foreground">Add a new inventory category to the hierarchy.</p></div>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Category Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Electrical Components" /></div>
            <div className="space-y-2"><Label>Code</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g., ELEC" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Category description..." rows={2} /></div>
            <div className="space-y-2">
              <Label>Parent Category</Label>
              <AsyncSearchableSelect
                value={form.parentId}
                onValueChange={(v) => setForm(f => ({ ...f, parentId: v }))}
                fetchOptions={async () => {
                  const res = await api.get('/api/asset-categories');
                  if (res.success && res.data) {
                    const cats = Array.isArray(res.data) ? res.data : (res.data.categories || []);
                    return cats.map((c: any) => ({
                      value: c.id,
                      label: c.name + (c.code ? ` (${c.code})` : ''),
                    }));
                  }
                  return [];
                }}
                placeholder="None (root category)"
              />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? 'Creating...' : 'Create Category'}</Button>
          </div>
        
      </ResponsiveDialog>

      {/* Edit Dialog */}
      <ResponsiveDialog open={editOpen} onOpenChange={setEditOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Edit Category</h2><p className="text-sm text-muted-foreground">Update category details.</p></div>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Category Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Code</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div className="space-y-2">
              <Label>Parent Category</Label>
              <AsyncSearchableSelect
                value={form.parentId}
                onValueChange={(v) => setForm(f => ({ ...f, parentId: v }))}
                fetchOptions={async () => {
                  const res = await api.get('/api/asset-categories');
                  if (res.success && res.data) {
                    const cats = Array.isArray(res.data) ? res.data : (res.data.categories || []);
                    return cats.filter((c: any) => c.id !== selectedCat?.id).map((c: any) => ({
                      value: c.id,
                      label: c.name + (c.code ? ` (${c.code})` : ''),
                    }));
                  }
                  return [];
                }}
                deps={[selectedCat]}
                placeholder="None (root)"
              />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}
export function InventoryLocationsPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [form, setForm] = useState({ code: '', name: '', type: '', zone: '', capacity: '', address: '' });

  const locationTypes = ['warehouse', 'staging', 'production', 'picking', 'receiving'];

  const fetchLocations = useCallback(async () => {
    try {
      const res = await api.get<any>('/api/inventory/locations');
      if (res.success) {
        setLocations(res.data || []);
        setKpis(res.kpis || {});
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  const filtered = locations.filter((l: any) => {
    const matchSearch = l.code.toLowerCase().includes(search.toLowerCase()) || l.name.toLowerCase().includes(search.toLowerCase()) || (l.address || '').toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || l.type === filterType;
    const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? l.isActive : !l.isActive);
    return matchSearch && matchType && matchStatus;
  });

  const kpiCards = [
    { label: 'Total Locations', value: kpis.total || 0, icon: MapPin, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Active', value: kpis.active || 0, icon: CheckCircle2, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Inactive', value: kpis.inactive || 0, icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Empty', value: locations.filter((l: any) => (l._count?.items || 0) === 0).length, icon: Box, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400' },
  ];

  const handleCreate = async () => {
    if (!form.code || !form.name || !form.type) { toast.error('Please fill in all required fields'); return; }
    setCreating(true);
    try {
      const res = await api.post('/api/inventory/locations', { name: form.name, code: form.code, type: form.type, address: form.address || null });
      if (res.success) { toast.success(`Location ${form.code} created successfully`); setCreateOpen(false); setForm({ code: '', name: '', type: '', zone: '', capacity: '', address: '' }); fetchLocations(); }
      else toast.error(res.error || 'Failed to create location');
    } catch { toast.error('Failed to create location'); } finally { setCreating(false); }
  };

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory Locations</h1>
          <p className="text-muted-foreground mt-1">Manage warehouse locations, bins, and storage areas</p>
        </div>
        {(hasPermission('inventory_locations.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-2" />Add Location</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(k => { const I = k.icon; return (
          <Card key={k.label} className="bg-card text-card-foreground border border-border/60 shadow-sm rounded-xl"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
        ); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search locations..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterType} onValueChange={setFilterType}><SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent>{locationTypes.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent></Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select>
      </div>
      <Card className="border-0 shadow-sm">
        <div className="overflow-x-auto rounded border">
          <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead className="hidden sm:table-cell">Type</TableHead><TableHead className="hidden md:table-cell">Address</TableHead><TableHead>Status</TableHead><TableHead className="hidden lg:table-cell text-right">Items</TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={6} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-48"><EmptyState icon={MapPin} title="No locations found" description="Try adjusting your search or filters." /></TableCell></TableRow>
            ) : filtered.map((l: any) => (
              <TableRow key={l.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-sm font-medium">{l.code}</TableCell>
                <TableCell className="font-medium">{l.name}</TableCell>
                <TableCell className="hidden sm:table-cell"><Badge variant="outline" className="capitalize">{(l.type || '').replace('_', ' ')}</Badge></TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{l.address || '-'}</TableCell>
                <TableCell><Badge variant="outline" className={l.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}>{l.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge></TableCell>
                <TableCell className="hidden lg:table-cell text-right font-medium">{l._count?.items || 0}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </Card>
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Add New Location</h2><p className="text-sm text-muted-foreground">Create a new storage location in the warehouse.</p></div>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Code *</Label><Input placeholder="WH-A1" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
              <div className="space-y-2"><Label>Name *</Label><Input placeholder="Warehouse A - Zone 1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Type *</Label><Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent>{locationTypes.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Zone</Label><Input placeholder="Zone A" value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Capacity</Label><Input type="number" placeholder="500" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} /></div>
            <div className="space-y-2"><Label>Address</Label><Input placeholder="Building A, Floor 1" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white">Create Location</Button>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}
export function InventoryTransactionsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    api.get<any[]>('/api/inventory').then(res => {
      if (res.success && res.data) setItems(res.data);
      setLoading(false);
    });
  }, []);

  const allTransactions = items.flatMap(item =>
    (item.stockMovements || []).map((m: any) => ({ ...m, itemName: item.name, itemCode: item.itemCode }))
  ).sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());

  const filtered = filterType === 'all' ? allTransactions : allTransactions.filter(t => t.type === filterType);
  const totalTransactions = allTransactions.length;
  const received = allTransactions.filter(t => t.type === 'received' || t.type === 'in').length;
  const issued = allTransactions.filter(t => t.type === 'issued' || t.type === 'out').length;
  const adjustments = allTransactions.filter(t => t.type === 'adjustment').length;

  const summaryCards = [
    { label: 'Total Transactions', value: totalTransactions, icon: ArrowRightLeft, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Items Received', value: received, icon: Download, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Items Issued', value: issued, icon: Package, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Adjustments', value: adjustments, icon: ArrowUpDown, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400' },
  ];

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Inventory Transactions</h1><p className="text-muted-foreground mt-1">View complete transaction history for all inventory movements</p></div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="adjustment">Adjustment</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {loading ? <LoadingSkeleton /> : (<>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {summaryCards.map(k => { const I = k.icon; return (
            <Card key={k.label}><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
          ); })}
        </div>
        <Card className="border-0 shadow-sm"><Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="hidden sm:table-cell">Code</TableHead><TableHead>Type</TableHead><TableHead>Quantity</TableHead><TableHead className="hidden md:table-cell">Reference</TableHead><TableHead className="hidden lg:table-cell">Date</TableHead></TableRow></TableHeader><TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="h-48"><EmptyState icon={ArrowRightLeft} title="No transactions found" description="Transactions will appear once inventory movements are recorded." /></TableCell></TableRow>
          ) : filtered.slice(0, 50).map((t, i) => (
            <TableRow key={i} className="hover:bg-muted/30">
              <TableCell className="font-medium">{t.itemName}</TableCell>
              <TableCell className="font-mono text-xs hidden sm:table-cell">{t.itemCode}</TableCell>
              <TableCell><Badge variant="outline" className={t.type === 'received' || t.type === 'in' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : t.type === 'issued' || t.type === 'out' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-sky-50 text-sky-700 border-sky-200'}>{(t.type || 'N/A').toUpperCase()}</Badge></TableCell>
              <TableCell className={t.type === 'issued' || t.type === 'out' ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium'}>{t.type === 'issued' || t.type === 'out' ? '-' : '+'}{Math.abs(t.quantity || 0)}</TableCell>
              <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{t.reference || '-'}</TableCell>
              <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{formatDate(t.createdAt || t.date)}</TableCell>
            </TableRow>
          ))}
        </TableBody></Table></Card>
      </>)}
    </div>
  );
}
export function InventoryAdjustmentsPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ item: '', location: '', type: '', quantityBefore: '', quantityAfter: '', reason: '' });

  const adjTypes = ['gain', 'loss', 'correction', 'write_off', 'damage', 'return'];

  const fetchAdjustments = useCallback(async () => {
    try {
      const [adjRes, itemRes] = await Promise.all([
        api.get<any>('/api/inventory/adjustments'),
        api.get<any>('/api/inventory?mode=request_catalog'),
      ]);
      if (adjRes.success) { setAdjustments(adjRes.data || []); setKpis(adjRes.kpis || {}); }
      if (itemRes.success) setInventoryItems(itemRes.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAdjustments(); }, [fetchAdjustments]);

  const fetchItemOptions = useCallback(async () => {
    const res = await api.get('/api/inventory?mode=request_catalog&limit=500');
    const items = res.success ? (res.data || []) : [];
    return items.map((item: any) => ({ value: item.id, label: item.name + (item.itemCode ? ` (${item.itemCode})` : '') }));
  }, []);

  const fetchLocationOptions = useCallback(async () => {
    const res = await api.get('/api/inventory/locations?limit=100');
    const locs = res.success ? (res.data || []) : [];
    return locs.map((loc: any) => ({ value: loc.id, label: loc.name || loc.code }));
  }, []);

  const adjStatusColors: Record<string, string> = { pending: 'bg-amber-50 text-amber-700 border-amber-200', approved: 'bg-emerald-50 text-emerald-700 border-emerald-200', rejected: 'bg-red-50 text-red-700 border-red-200' };

  const filtered = adjustments.filter((a: any) => {
    const matchSearch = a.adjustmentNumber.toLowerCase().includes(search.toLowerCase()) || (a.item?.name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const kpiCards = [
    { label: 'Total Adjustments', value: kpis.total || 0, icon: ArrowUpDown, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Pending Approval', value: kpis.pending || 0, icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Approved', value: kpis.approved || 0, icon: CheckCircle2, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Rejected', value: kpis.rejected || 0, icon: XCircle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400' },
  ];

  const handleCreate = async () => {
    if (!form.item || !form.type || !form.reason) { toast.error('Please fill in all required fields'); return; }
    setCreating(true);
    try {
      const selectedItem = inventoryItems.find((i: any) => i.id === form.item);
      const quantity = form.type === 'gain' || form.type === 'return'
        ? Math.abs(parseFloat(form.quantityAfter || '0') - parseFloat(form.quantityBefore || '0'))
        : Math.abs(parseFloat(form.quantityBefore || '0') - parseFloat(form.quantityAfter || '0'));
      const res = await api.post('/api/inventory/adjustments', {
        itemId: form.item,
        type: form.type === 'write_off' ? 'loss' : form.type === 'damage' ? 'loss' : form.type,
        quantity: quantity || 1,
        reason: form.reason,
        notes: form.location || null,
      });
      if (res.success) { toast.success('Adjustment created successfully'); setCreateOpen(false); setForm({ item: '', location: '', type: '', quantityBefore: '', quantityAfter: '', reason: '' }); fetchAdjustments(); }
      else toast.error(res.error || 'Failed to create adjustment');
    } catch { toast.error('Failed to create adjustment'); } finally { setCreating(false); }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      const res = await api.put(`/api/inventory/adjustments/${id}`, { action, type: action === 'approve' ? 'gain' : 'loss' });
      if (res.success) { toast.success(`Adjustment ${action}d`); fetchAdjustments(); }
      else toast.error(res.error || `Failed to ${action}`);
    } catch { toast.error(`Failed to ${action}`); }
  };

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Inventory Adjustments</h1><p className="text-muted-foreground mt-1">Record stock adjustments, write-offs, and corrections</p></div>
        {(hasPermission('inventory_adjustments.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-2" />New Adjustment</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(k => { const I = k.icon; return (
          <Card key={k.label} className="bg-card text-card-foreground border border-border/60 shadow-sm rounded-xl"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
        ); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search adjustments..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select>
      </div>
      <Card className="border-0 shadow-sm">
        <div className="overflow-x-auto rounded border">
          <Table><TableHeader><TableRow><TableHead>Adj #</TableHead><TableHead>Item</TableHead><TableHead className="hidden sm:table-cell">Type</TableHead><TableHead className="hidden sm:table-cell">Qty Change</TableHead><TableHead className="hidden md:table-cell">Reason</TableHead><TableHead>Status</TableHead><TableHead className="hidden lg:table-cell">Created By</TableHead><TableHead className="hidden lg:table-cell">Date</TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={8} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-48"><EmptyState icon={ArrowUpDown} title="No adjustments found" description="Try adjusting your search or filters." /></TableCell></TableRow>
            ) : filtered.map(a => (
              <TableRow key={a.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-sm font-medium">{a.adjustmentNumber}</TableCell>
                <TableCell className="font-medium">{a.item?.name || '-'}</TableCell>
                <TableCell className="hidden sm:table-cell"><Badge variant="outline" className="capitalize">{a.type?.replace('_', ' ')}</Badge></TableCell>
                <TableCell className="hidden sm:table-cell font-medium">{a.type === 'gain' ? '+' : '-'}{a.quantity}</TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{a.reason}</TableCell>
                <TableCell><Badge variant="outline" className={adjStatusColors[a.status]}>{a.status?.replace('_', ' ').toUpperCase()}</Badge></TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{a.createdBy?.fullName || '-'}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{formatDate(a.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </Card>
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">New Inventory Adjustment</h2><p className="text-sm text-muted-foreground">Record a stock adjustment for an inventory item.</p></div>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Item *</Label><AsyncSearchableSelect value={form.item} onValueChange={v => setForm({ ...form, item: v })} fetchOptions={fetchItemOptions} placeholder="Search item..." /></div>
              <div className="space-y-2"><Label>Location *</Label><AsyncSearchableSelect value={form.location} onValueChange={v => setForm({ ...form, location: v })} fetchOptions={fetchLocationOptions} placeholder="Search location..." /></div>
            </div>
            <div className="space-y-2"><Label>Adjustment Type *</Label><Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent>{adjTypes.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Quantity Before</Label><Input type="number" placeholder="100" value={form.quantityBefore} onChange={e => setForm({ ...form, quantityBefore: e.target.value })} /></div>
              <div className="space-y-2"><Label>Quantity After</Label><Input type="number" placeholder="95" value={form.quantityAfter} onChange={e => setForm({ ...form, quantityAfter: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Reason *</Label><Textarea placeholder="Describe the reason for this adjustment..." value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows={3} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white">Submit Adjustment</Button>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}
export function InventoryRequestsPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [form, setForm] = useState({ item: '', quantity: '', priority: '', description: '', notes: '' });

  const fetchRequests = useCallback(async () => {
    try {
      const [reqRes, itemRes] = await Promise.all([
        api.get<any>('/api/inventory/requests'),
        api.get<any>('/api/inventory?mode=request_catalog'),
      ]);
      if (reqRes.success) { setRequests(reqRes.data || []); setKpis(reqRes.kpis || {}); }
      if (itemRes.success) setInventoryItems(itemRes.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const reqStatusColors: Record<string, string> = { pending: 'bg-amber-50 text-amber-700 border-amber-200', approved: 'bg-emerald-50 text-emerald-700 border-emerald-200', partially_fulfilled: 'bg-sky-50 text-sky-700 border-sky-200', fulfilled: 'bg-teal-50 text-teal-700 border-teal-200', rejected: 'bg-red-50 text-red-700 border-red-200' };

  const filtered = requests.filter((r: any) => {
    const matchSearch = r.requestNumber?.toLowerCase().includes(search.toLowerCase()) || r.title?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    const matchPriority = filterPriority === 'all' || r.priority === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  });

  const kpiCards = [
    { label: 'Total Requests', value: kpis.total || 0, icon: FileText, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Pending', value: kpis.pending || 0, icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Approved', value: kpis.approved || 0, icon: CheckCircle2, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Fulfilled', value: kpis.fulfilled || 0, icon: Check, color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400' },
  ];

  const handleCreate = async () => {
    if (!form.item || !form.quantity || !form.priority) { toast.error('Please fill in all required fields'); return; }
    setCreating(true);
    try {
      const selectedItem = inventoryItems.find((i: any) => i.id === form.item);
      const res = await api.post('/api/inventory/requests', {
        title: selectedItem?.name || form.item,
        description: form.description || null,
        priority: form.priority,
        items: [{ itemId: form.item, quantity: parseFloat(form.quantity) || 1 }],
        notes: form.notes || null,
      });
      if (res.success) { toast.success('Request created successfully'); setCreateOpen(false); setForm({ item: '', quantity: '', priority: '', description: '', notes: '' }); fetchRequests(); }
      else toast.error(res.error || 'Failed to create request');
    } catch { toast.error('Failed to create request'); } finally { setCreating(false); }
  };

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Inventory Requests</h1><p className="text-muted-foreground mt-1">Submit and track material requisitions from work orders</p></div>
        {(hasPermission('material_requisitions.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-2" />New Request</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(k => { const I = k.icon; return (
          <Card key={k.label} className="bg-card text-card-foreground border border-border/60 shadow-sm rounded-xl"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
        ); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search requests..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="partially_fulfilled">Partial</SelectItem><SelectItem value="fulfilled">Fulfilled</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}><SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger><SelectContent><SelectItem value="all">All Priority</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select>
      </div>
      <Card className="border-0 shadow-sm">
        <div className="overflow-x-auto rounded border">
          <Table><TableHeader><TableRow><TableHead>Req #</TableHead><TableHead>Title</TableHead><TableHead className="hidden sm:table-cell">Items</TableHead><TableHead className="hidden sm:table-cell">Requested By</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead className="hidden lg:table-cell">Date</TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={7} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-48"><EmptyState icon={FileText} title="No requests found" description="Try adjusting your search or filters." /></TableCell></TableRow>
            ) : filtered.map((r: any) => (
              <TableRow key={r.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-sm font-medium">{r.requestNumber}</TableCell>
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell className="hidden sm:table-cell">{r.items?.length || 0}</TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">{r.requestedBy?.fullName || '-'}</TableCell>
                <TableCell><PriorityBadge priority={r.priority} /></TableCell>
                <TableCell><Badge variant="outline" className={reqStatusColors[r.status]}>{r.status?.replace(/_/g, ' ').toUpperCase()}</Badge></TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </Card>
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">New Inventory Request</h2><p className="text-sm text-muted-foreground">Submit a material requisition for inventory items.</p></div>
          <div className="grid gap-4 py-2">
            <div className="space-y-2"><Label>Item *</Label>
              <AsyncSearchableSelect
                value={form.item}
                onValueChange={v => setForm({ ...form, item: v })}
                fetchOptions={async () => {
                  const res = await api.get('/api/inventory?mode=request_catalog&limit=999');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).filter((i: any) => i.isActive !== false).map((i: any) => ({
                      value: i.id,
                      label: `${i.name} (${i.itemCode})`,
                    }));
                  }
                  return [];
                }}
                placeholder="Select item..."
                searchPlaceholder="Search items..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Quantity *</Label><Input type="number" placeholder="10" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
              <div className="space-y-2"><Label>Priority *</Label><Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Purpose or description..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea placeholder="Additional notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 text-white">{creating ? 'Creating...' : 'Submit Request'}</Button>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}
export function InventoryTransfersPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [form, setForm] = useState({ item: '', quantity: '', fromLocation: '', toLocation: '', notes: '' });

  const transferStatusColors: Record<string, string> = { pending: 'bg-amber-50 text-amber-700 border-amber-200', in_transit: 'bg-sky-50 text-sky-700 border-sky-200', completed: 'bg-emerald-50 text-emerald-700 border-emerald-200', cancelled: 'bg-slate-100 text-slate-600 border-slate-200' };

  const fetchTransfers = useCallback(async () => {
    try {
      const [txRes, itemRes, locRes] = await Promise.all([
        api.get<any>('/api/inventory/transfers'),
        api.get<any>('/api/inventory?mode=request_catalog'),
        api.get<any>('/api/inventory/locations'),
      ]);
      if (txRes.success) { setTransfers(txRes.data || []); setKpis(txRes.kpis || {}); }
      if (itemRes.success) setInventoryItems(itemRes.data || []);
      if (locRes.success) setLocations(locRes.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTransfers(); }, [fetchTransfers]);

  const filtered = transfers.filter((t: any) => {
    const matchSearch = t.transferNumber?.toLowerCase().includes(search.toLowerCase()) || t.item?.name?.toLowerCase().includes(search.toLowerCase()) || t.fromLocation?.name?.toLowerCase().includes(search.toLowerCase()) || t.toLocation?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const kpiCards = [
    { label: 'Total Transfers', value: kpis.total || 0, icon: Truck, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Pending', value: (kpis.pending || 0) + (kpis.inTransit || 0), icon: ArrowRightLeft, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Completed', value: kpis.completed || 0, icon: CheckCircle2, color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400' },
    { label: 'Cancelled', value: kpis.cancelled || 0, icon: XCircle, color: 'text-slate-600 bg-slate-100 dark:bg-slate-900/30 dark:text-slate-400' },
  ];

  const handleCreate = async () => {
    if (!form.item || !form.quantity || !form.fromLocation || !form.toLocation) { toast.error('Please fill in all required fields'); return; }
    if (form.fromLocation === form.toLocation) { toast.error('From and To locations cannot be the same'); return; }
    setCreating(true);
    try {
      const res = await api.post('/api/inventory/transfers', {
        itemId: form.item,
        quantity: parseFloat(form.quantity),
        fromLocationId: form.fromLocation,
        toLocationId: form.toLocation,
        notes: form.notes || null,
      });
      if (res.success) { toast.success('Transfer created successfully'); setCreateOpen(false); setForm({ item: '', quantity: '', fromLocation: '', toLocation: '', notes: '' }); fetchTransfers(); }
      else toast.error(res.error || 'Failed to create transfer');
    } catch { toast.error('Failed to create transfer'); } finally { setCreating(false); }
  };

  const handleAction = async (id: string, action: 'approve' | 'complete' | 'cancel') => {
    try {
      const res = await api.put(`/api/inventory/transfers/${id}`, { action });
      if (res.success) { toast.success(`Transfer ${action}d`); fetchTransfers(); }
      else toast.error(res.error || `Failed to ${action}`);
    } catch { toast.error(`Failed to ${action}`); }
  };

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Inventory Transfers</h1><p className="text-muted-foreground mt-1">Transfer inventory items between locations</p></div>
        {(hasPermission('inventory_transfers.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-2" />New Transfer</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(k => { const I = k.icon; return (
          <Card key={k.label} className="bg-card text-card-foreground border border-border/60 shadow-sm rounded-xl"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
        ); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search transfers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="in_transit">In Transit</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
      </div>
      <Card className="border-0 shadow-sm">
        <div className="overflow-x-auto rounded border">
          <Table><TableHeader><TableRow><TableHead>Transfer #</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead className="hidden sm:table-cell">From</TableHead><TableHead className="hidden sm:table-cell">To</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Date</TableHead><TableHead className="hidden lg:table-cell">Actions</TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={8} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-48"><EmptyState icon={Truck} title="No transfers found" description="Try adjusting your search or filters." /></TableCell></TableRow>
            ) : filtered.map((t: any) => (
              <TableRow key={t.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-sm font-medium">{t.transferNumber}</TableCell>
                <TableCell className="font-medium">{t.item?.name || '-'}</TableCell>
                <TableCell className="font-medium">{t.quantity}</TableCell>
                <TableCell className="hidden sm:table-cell"><Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">{t.fromLocation?.code || '-'}</Badge></TableCell>
                <TableCell className="hidden sm:table-cell"><Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">{t.toLocation?.code || '-'}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={transferStatusColors[t.status]}>{t.status?.replace('_', ' ').toUpperCase()}</Badge></TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{formatDate(t.createdAt)}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  {(hasPermission('inventory_transfers.update') || isAdmin()) && t.status === 'pending' && <Button size="sm" variant="outline" className="h-7 text-xs mr-1" onClick={() => handleAction(t.id, 'approve')}>Approve</Button>}
                  {(hasPermission('inventory_transfers.update') || isAdmin()) && t.status === 'in_transit' && <Button size="sm" variant="outline" className="h-7 text-xs mr-1" onClick={() => handleAction(t.id, 'complete')}>Complete</Button>}
                  {(hasPermission('inventory_transfers.update') || isAdmin()) && (t.status === 'pending' || t.status === 'in_transit') && <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => handleAction(t.id, 'cancel')}>Cancel</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </Card>
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">New Inventory Transfer</h2><p className="text-sm text-muted-foreground">Create a transfer request to move items between locations.</p></div>
          <div className="grid gap-4 py-2">
            <div className="space-y-2"><Label>Item *</Label>
              <AsyncSearchableSelect
                value={form.item}
                onValueChange={v => setForm({ ...form, item: v })}
                fetchOptions={async () => {
                  const res = await api.get('/api/inventory?mode=request_catalog&limit=999');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).filter((i: any) => i.isActive !== false).map((i: any) => ({
                      value: i.id,
                      label: `${i.name} (${i.itemCode})`,
                    }));
                  }
                  return [];
                }}
                placeholder="Select item..."
                searchPlaceholder="Search items..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Quantity *</Label><Input type="number" placeholder="10" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
              <div className="space-y-2"><Label>From Location *</Label>
                <AsyncSearchableSelect
                  value={form.fromLocation}
                  onValueChange={v => setForm({ ...form, fromLocation: v })}
                  fetchOptions={async () => {
                    const res = await api.get('/api/inventory/locations?limit=999');
                    if (res.success && res.data) {
                      return (Array.isArray(res.data) ? res.data : []).filter((l: any) => l.isActive !== false).map((l: any) => ({
                        value: l.id,
                        label: `${l.name} (${l.code})`,
                      }));
                    }
                    return [];
                  }}
                  placeholder="Select location..."
                  searchPlaceholder="Search locations..."
                />
              </div>
            </div>
            <div className="space-y-2"><Label>To Location *</Label>
              <AsyncSearchableSelect
                value={form.toLocation}
                onValueChange={v => setForm({ ...form, toLocation: v })}
                fetchOptions={async () => {
                  const res = await api.get('/api/inventory/locations?limit=999');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).filter((l: any) => l.isActive !== false).map((l: any) => ({
                      value: l.id,
                      label: `${l.name} (${l.code})`,
                    }));
                  }
                  return [];
                }}
                placeholder="Select location..."
                searchPlaceholder="Search locations..."
              />
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea placeholder="Additional notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 text-white">{creating ? 'Creating...' : 'Create Transfer'}</Button>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}
export function InventorySuppliersPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [form, setForm] = useState({ name: '', code: '', contactPerson: '', email: '', phone: '', address: '', city: '', country: '', website: '', rating: '' });

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await api.get<any>('/api/suppliers');
      if (res.success) { setSuppliers(res.data || []); setKpis(res.kpis || {}); }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const supplierStatusColors: Record<string, string> = { active: 'bg-emerald-50 text-emerald-700 border-emerald-200', on_hold: 'bg-amber-50 text-amber-700 border-amber-200', inactive: 'bg-slate-100 text-slate-600 border-slate-200' };

  const filtered = suppliers.filter((s: any) => {
    const matchSearch = s.code?.toLowerCase().includes(search.toLowerCase()) || s.name?.toLowerCase().includes(search.toLowerCase()) || s.contactPerson?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? s.isActive : !s.isActive);
    return matchSearch && matchStatus;
  });

  const kpiCards = [
    { label: 'Total Suppliers', value: kpis.total || 0, icon: Building, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Active', value: kpis.active || 0, icon: CheckCircle2, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Inactive', value: kpis.inactive || 0, icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Top Rated', value: suppliers.filter((s: any) => s.rating >= 4).length, icon: Star, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400' },
  ];

  const handleCreate = async () => {
    if (!form.name || !form.code) { toast.error('Name and code are required'); return; }
    setCreating(true);
    try {
      const res = await api.post('/api/suppliers', {
        name: form.name,
        code: form.code,
        contactPerson: form.contactPerson || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        city: form.city || null,
        country: form.country || null,
        website: form.website || null,
        rating: form.rating ? parseInt(form.rating) : null,
      });
      if (res.success) { toast.success(`Supplier ${form.name} added successfully`); setCreateOpen(false); setForm({ name: '', code: '', contactPerson: '', email: '', phone: '', address: '', city: '', country: '', website: '', rating: '' }); fetchSuppliers(); }
      else toast.error(res.error || 'Failed to add supplier');
    } catch { toast.error('Failed to add supplier'); } finally { setCreating(false); }
  };

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Suppliers</h1><p className="text-muted-foreground mt-1">Manage supplier information, contacts, and performance metrics</p></div>
        {(hasPermission('vendors.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-2" />Add Supplier</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(k => { const I = k.icon; return (
          <Card key={k.label} className="bg-card text-card-foreground border border-border/60 shadow-sm rounded-xl"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
        ); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select>
      </div>
      <Card className="border-0 shadow-sm">
        <div className="overflow-x-auto rounded border">
          <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Company</TableHead><TableHead className="hidden sm:table-cell">Contact</TableHead><TableHead className="hidden md:table-cell">Email</TableHead><TableHead className="hidden lg:table-cell">Rating</TableHead><TableHead>Status</TableHead><TableHead className="hidden xl:table-cell text-right">Items</TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={8} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-48"><EmptyState icon={Building} title="No suppliers found" description="Try adjusting your search or filters." /></TableCell></TableRow>
            ) : filtered.map((s: any) => (
              <TableRow key={s.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-sm font-medium">{s.code}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">{s.contactPerson || '-'}</TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{s.email || '-'}</TableCell>
                <TableCell className="hidden lg:table-cell"><span className="text-amber-500">{'★'.repeat(s.rating || 0)}</span><span className="text-muted/30">{'★'.repeat(5 - (s.rating || 0))}</span></TableCell>
                <TableCell><Badge variant="outline" className={s.isActive ? supplierStatusColors.active : supplierStatusColors.inactive}>{s.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge></TableCell>
                <TableCell className="hidden xl:table-cell text-right font-medium">{s._count?.items || 0}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </Card>
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">Add New Supplier</h2><p className="text-sm text-muted-foreground">Register a new supplier in the system.</p></div>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Company Name *</Label><Input placeholder="SKF Industries" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Code *</Label><Input placeholder="SUP-0001" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Contact Person</Label><Input placeholder="John Smith" value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="john@company.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Phone</Label><Input placeholder="+1-555-0100" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-2"><Label>Rating (1-5)</Label><Input type="number" min="1" max="5" placeholder="4" value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Address</Label><Input placeholder="Full address..." value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>City</Label><Input placeholder="City" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
              <div className="space-y-2"><Label>Country</Label><Input placeholder="Country" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 text-white">{creating ? 'Adding...' : 'Add Supplier'}</Button>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}
export function InventoryPurchaseOrdersPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [form, setForm] = useState({ supplier: '', priority: '', expectedDate: '', notes: '' });
  const [lineItems, setLineItems] = useState<{ itemId: string; quantity: string; unitCost: string; description: string }[]>([]);

  const addLineItem = () => setLineItems([...lineItems, { itemId: '', quantity: '1', unitCost: '0', description: '' }]);
  const removeLineItem = (idx: number) => setLineItems(lineItems.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: string, value: string) => {
    const updated = [...lineItems];
    updated[idx] = { ...updated[idx], [field]: value };
    setLineItems(updated);
  };

  const inventoryItemOptions = useMemo(() =>
    inventoryItems.map((it: any) => ({
      value: it.id,
      label: `${it.name} (${it.itemCode}) - ${formatCurrency(it.unitCost || 0)}/unit`,
    })),
    [inventoryItems]
  );

  const lineItemTotal = useMemo(() =>
    lineItems.reduce((sum, li) => sum + (parseFloat(li.quantity) || 0) * (parseFloat(li.unitCost) || 0), 0),
    [lineItems]
  );

  const [expandedPo, setExpandedPo] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const [poRes, supRes, itemRes] = await Promise.all([
        api.get<any>('/api/purchase-orders'),
        api.get<any>('/api/suppliers'),
        api.get<any>('/api/inventory'),
      ]);
      if (poRes.success) { setOrders(poRes.data || []); setKpis(poRes.kpis || {}); }
      if (supRes.success) setSuppliers(supRes.data || []);
      if (itemRes.success) setInventoryItems(itemRes.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const poStatusColors: Record<string, string> = { draft: 'bg-slate-100 text-slate-600 border-slate-200', pending: 'bg-amber-50 text-amber-700 border-amber-200', approved: 'bg-emerald-50 text-emerald-700 border-emerald-200', partially_received: 'bg-sky-50 text-sky-700 border-sky-200', received: 'bg-teal-50 text-teal-700 border-teal-200', cancelled: 'bg-red-50 text-red-600 border-red-200' };

  const filtered = orders.filter((po: any) => {
    const matchSearch = po.poNumber?.toLowerCase().includes(search.toLowerCase()) || po.supplier?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || po.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const kpiCards = [
    { label: 'Total POs', value: kpis.total || 0, icon: ShoppingCart, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Pending', value: kpis.pending || 0, icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Approved', value: kpis.approved || 0, icon: CheckCircle2, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Received', value: kpis.received || 0, icon: Check, color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400' },
  ];

  const handleCreate = async () => {
    if (!form.supplier || !form.priority) { toast.error('Supplier and priority are required'); return; }
    if (lineItems.length === 0) { toast.error('At least one line item is required'); return; }
    const validItems = lineItems.filter(li => li.itemId && li.quantity);
    if (validItems.length === 0) { toast.error('Please select an item and quantity for at least one line item'); return; }
    setCreating(true);
    try {
      const items = validItems.map(li => ({
        itemId: li.itemId,
        quantity: parseFloat(li.quantity) || 0,
        unitCost: parseFloat(li.unitCost) || 0,
        description: li.description || undefined,
      }));
      const res = await api.post('/api/purchase-orders', {
        supplierId: form.supplier,
        priority: form.priority,
        expectedDelivery: form.expectedDate || null,
        notes: form.notes || null,
        items,
      });
      if (res.success) { toast.success('Purchase order created successfully'); setCreateOpen(false); setForm({ supplier: '', priority: '', expectedDate: '', notes: '' }); setLineItems([]); fetchOrders(); }
      else toast.error(res.error || 'Failed to create PO');
    } catch { toast.error('Failed to create PO'); } finally { setCreating(false); }
  };

  const handleDialogClose = (open: boolean) => {
    setCreateOpen(open);
    if (!open) { setLineItems([]); }
  };

  const handleAction = async (id: string, action: 'approve') => {
    try {
      const res = await api.post(`/api/purchase-orders/${id}/${action}`, {});
      if (res.success) { toast.success(`PO ${action}d`); fetchOrders(); }
      else toast.error(res.error || `Failed to ${action}`);
    } catch { toast.error(`Failed to ${action}`); }
  };

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1><p className="text-muted-foreground mt-1">Create and manage purchase orders for inventory replenishment</p></div>
        {(hasPermission('inventory.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-2" />New PO</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(k => { const I = k.icon; return (
          <Card key={k.label} className="bg-card text-card-foreground border border-border/60 shadow-sm rounded-xl"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
        ); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search purchase orders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="partially_received">Partial</SelectItem><SelectItem value="received">Received</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
      </div>
      <Card className="border-0 shadow-sm">
        <div className="overflow-x-auto rounded border">
          <Table><TableHeader><TableRow><TableHead>PO #</TableHead><TableHead>Supplier</TableHead><TableHead className="hidden sm:table-cell">Items</TableHead><TableHead className="hidden sm:table-cell">Amount</TableHead><TableHead className="hidden md:table-cell">Priority</TableHead><TableHead>Status</TableHead><TableHead className="hidden lg:table-cell">Date</TableHead><TableHead className="hidden lg:table-cell">Actions</TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={8} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-48"><EmptyState icon={ShoppingCart} title="No purchase orders found" description="Try adjusting your search or filters." /></TableCell></TableRow>
            ) : filtered.map((po: any) => (
              <React.Fragment key={po.id}>
                <TableRow className="hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedPo(expandedPo === po.id ? null : po.id)}>
                  <TableCell className="font-mono text-sm font-medium"><div className="flex items-center gap-1.5"><ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expandedPo === po.id ? 'rotate-90' : ''}`} />{po.poNumber}</div></TableCell>
                  <TableCell className="font-medium">{po.supplier?.name || '-'}</TableCell>
                  <TableCell className="hidden sm:table-cell">{po.items?.length || 0}</TableCell>
                  <TableCell className="hidden sm:table-cell font-medium">{formatCurrency(po.totalAmount)}</TableCell>
                  <TableCell className="hidden md:table-cell"><PriorityBadge priority={po.priority} /></TableCell>
                  <TableCell><Badge variant="outline" className={poStatusColors[po.status]}>{po.status?.replace(/_/g, ' ').toUpperCase()}</Badge></TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{formatDate(po.createdAt)}</TableCell>
                  <TableCell className="hidden lg:table-cell" onClick={e => e.stopPropagation()}>
                    {(hasPermission('inventory.update') || isAdmin()) && po.status === 'draft' && <Button size="sm" variant="outline" className="h-7 text-xs mr-1" onClick={() => handleAction(po.id, 'approve')}>Approve</Button>}
                  </TableCell>
                </TableRow>
                {expandedPo === po.id && po.items?.length > 0 && po.items.map((item: any, i: number) => (
                  <TableRow key={`${po.id}-item-${i}`} className="bg-muted/20 hover:bg-muted/30">
                    <TableCell className="pl-12 text-xs text-muted-foreground" colSpan={3}>
                      <div className="flex items-center gap-2"><Box className="h-3 w-3" /><span className="font-medium text-foreground">{item.inventoryItem?.name || item.description || 'Item'}</span>{item.inventoryItem?.itemCode && <span className="text-muted-foreground">({item.inventoryItem.itemCode})</span>}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">
                      <span className="text-muted-foreground">{item.quantity} × {formatCurrency(item.unitCost)}</span>
                      <span className="ml-1 font-medium">= {formatCurrency((item.quantity || 0) * (item.unitCost || 0))}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell" /><TableCell className="hidden lg:table-cell" /><TableCell className="hidden lg:table-cell" /><TableCell className="hidden lg:table-cell" />
                  </TableRow>
                ))}
              </React.Fragment>
            ))}
          </TableBody></Table>
        </div>
      </Card>
      <ResponsiveDialog open={createOpen} onOpenChange={handleDialogClose}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">New Purchase Order</h2><p className="text-sm text-muted-foreground">Create a new purchase order for inventory items.</p></div>
          <div className="grid gap-4 py-2">
            <div className="space-y-2"><Label>Supplier *</Label>
              <AsyncSearchableSelect
                value={form.supplier}
                onValueChange={v => setForm({ ...form, supplier: v })}
                fetchOptions={async () => {
                  const res = await api.get('/api/suppliers?limit=999');
                  if (res.success && res.data) {
                    return (Array.isArray(res.data) ? res.data : []).filter((s: any) => s.isActive !== false).map((s: any) => ({
                      value: s.id,
                      label: `${s.name} (${s.code})`,
                    }));
                  }
                  return [];
                }}
                placeholder="Select supplier..."
                searchPlaceholder="Search suppliers..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Priority *</Label><Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
              <DatePicker label="Expected Date" value={form.expectedDate || undefined} onChange={v => setForm({ ...form, expectedDate: v || '' })} />
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea placeholder="Additional notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Line Items *</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addLineItem}><Plus className="h-3.5 w-3.5 mr-1" />Add Item</Button>
              </div>
              {lineItems.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-md">No line items added. Click &quot;Add Item&quot; to get started.</p>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {lineItems.map((li, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_80px_100px_32px] gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Item</Label>
                      <SearchableSelect
                        value={li.itemId}
                        onValueChange={v => {
                          updateLineItem(idx, 'itemId', v);
                          const selectedItem = inventoryItems.find((it: any) => it.id === v);
                          if (selectedItem) updateLineItem(idx, 'unitCost', String(selectedItem.unitCost || 0));
                        }}
                        options={inventoryItemOptions}
                        placeholder="Select item..."
                        searchPlaceholder="Search items..."
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Qty</Label>
                      <Input type="number" min="1" step="1" value={li.quantity} onChange={e => updateLineItem(idx, 'quantity', e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Unit Cost</Label>
                      <Input type="number" min="0" step="0.01" value={li.unitCost} onChange={e => updateLineItem(idx, 'unitCost', e.target.value)} className="h-8 text-sm" />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeLineItem(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
              {lineItems.length > 0 && (
                <div className="flex justify-end pt-1 border-t">
                  <span className="text-sm font-semibold">Total: {formatCurrency(lineItemTotal)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => handleDialogClose(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 text-white">{creating ? 'Creating...' : 'Create PO'}</Button>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}
export function InventoryReceivingPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filterCondition, setFilterCondition] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ purchaseOrder: '', itemId: '', quantity: '', condition: 'good', notes: '' });

  const fetchRecords = useCallback(async () => {
    try {
      const [recRes, poRes] = await Promise.all([
        api.get<any>('/api/receiving-records'),
        api.get<any>('/api/purchase-orders'),
      ]);
      if (recRes.success) { setRecords(recRes.data || []); setKpis(recRes.kpis || {}); }
      if (poRes.success) setPurchaseOrders(poRes.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const conditionColors: Record<string, string> = { good: 'bg-emerald-50 text-emerald-700 border-emerald-200', damaged: 'bg-amber-50 text-amber-700 border-amber-200', defective: 'bg-red-50 text-red-700 border-red-200' };

  const filtered = records.filter((r: any) => {
    const matchSearch = r.po?.poNumber?.toLowerCase().includes(search.toLowerCase()) || r.item?.name?.toLowerCase().includes(search.toLowerCase()) || r.item?.itemCode?.toLowerCase().includes(search.toLowerCase());
    const matchCondition = filterCondition === 'all' || r.condition === filterCondition;
    return matchSearch && matchCondition;
  });

  const kpiCards = [
    { label: 'Total GRNs', value: kpis.total || 0, icon: Download, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Good', value: kpis.good || 0, icon: CheckCircle2, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Damaged', value: kpis.pending || 0, icon: ClipboardCheck, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Defective', value: kpis.rejected || 0, icon: XCircle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400' },
  ];

  const handleCreate = async () => {
    if (!form.purchaseOrder || !form.itemId || !form.quantity) { toast.error('PO, item, and quantity are required'); return; }
    setCreating(true);
    try {
      const res = await api.post(`/api/purchase-orders/${form.purchaseOrder}/receive`, {
        itemId: form.itemId,
        quantityReceived: parseFloat(form.quantity),
        condition: form.condition,
        notes: form.notes || null,
      });
      if (res.success) { toast.success('Items received successfully'); setCreateOpen(false); setForm({ purchaseOrder: '', itemId: '', quantity: '', condition: 'good', notes: '' }); fetchRecords(); }
      else toast.error(res.error || 'Failed to receive items');
    } catch { toast.error('Failed to receive items'); } finally { setCreating(false); }
  };

  // Get available PO items (approved/partially_received) for the create form
  const availablePOItems = purchaseOrders.filter((po: any) => ['approved', 'partially_received'].includes(po.status)).flatMap((po: any) =>
    (po.items || []).map((pi: any) => ({
      ...pi,
      poId: po.id,
      poNumber: po.poNumber,
      supplierName: po.supplier?.name || '',
      remaining: (pi.quantity || 0) - (pi.quantityReceived || 0),
    }))
  ).filter((pi: any) => pi.remaining > 0);

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Receiving</h1><p className="text-muted-foreground mt-1">Receive delivered items and update inventory stock levels</p></div>
        {(hasPermission('inventory.update') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-2" />New GRN</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(k => { const I = k.icon; return (
          <Card key={k.label} className="bg-card text-card-foreground border border-border/60 shadow-sm rounded-xl"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
        ); })}
      </div>
      <div className="filter-row flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search records..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={filterCondition} onValueChange={setFilterCondition}><SelectTrigger className="w-44"><SelectValue placeholder="Condition" /></SelectTrigger><SelectContent><SelectItem value="all">All Conditions</SelectItem><SelectItem value="good">Good</SelectItem><SelectItem value="damaged">Damaged</SelectItem><SelectItem value="defective">Defective</SelectItem></SelectContent></Select>
      </div>
      <Card className="border-0 shadow-sm">
        <div className="overflow-x-auto rounded border">
          <Table><TableHeader><TableRow><TableHead>PO #</TableHead><TableHead className="hidden sm:table-cell">Supplier</TableHead><TableHead>Item</TableHead><TableHead className="hidden sm:table-cell">Qty</TableHead><TableHead>Condition</TableHead><TableHead className="hidden md:table-cell">Received By</TableHead><TableHead className="hidden lg:table-cell">Date</TableHead></TableRow></TableHeader><TableBody>
            {loading ? (<TableRow><TableCell colSpan={8} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-48"><EmptyState icon={Download} title="No receiving records found" description="Records will appear once items are received against purchase orders." /></TableCell></TableRow>
            ) : filtered.map((r: any) => (
              <TableRow key={r.id} className="hover:bg-muted/30">
                <TableCell><Badge variant="outline" className="font-mono text-xs">{r.po?.poNumber || '-'}</Badge></TableCell>
                <TableCell className="hidden sm:table-cell font-medium">{r.po?.supplier?.name || '-'}</TableCell>
                <TableCell className="font-medium">{r.item?.name || '-'}</TableCell>
                <TableCell className="hidden sm:table-cell font-medium">{r.quantityReceived}</TableCell>
                <TableCell><Badge variant="outline" className={conditionColors[r.condition]}>{r.condition?.toUpperCase()}</Badge></TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{r.receivedBy?.fullName || '-'}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </Card>
      <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
        
          <div className="space-y-1.5 mb-4"><h2 className="text-lg font-semibold leading-none tracking-tight">New Goods Receipt Note</h2><p className="text-sm text-muted-foreground">Record received items against a purchase order.</p></div>
          <div className="grid gap-4 py-2">
            <div className="space-y-2"><Label>PO *</Label>
              <SearchableSelect
                value={form.purchaseOrder || ''}
                onValueChange={v => { const [poId, itemId] = v.split('-'); setForm({ ...form, purchaseOrder: poId, itemId }); }}
                options={purchaseOrders.filter((po: any) => ['approved', 'partially_received'].includes(po.status)).map((po: any) => ({
                  value: po.id,
                  label: `${po.poNumber} — ${po.supplier?.name || ''}`,
                }))}
                placeholder="Select PO..."
                searchPlaceholder="Search POs..."
              />
            </div>
            {form.purchaseOrder && form.itemId && <div className="text-xs text-muted-foreground bg-muted rounded-md p-2">Item: {availablePOItems.find((pi: any) => pi.id === form.itemId && pi.poId === form.purchaseOrder)?.item?.name || 'Select an item'} — Remaining: {availablePOItems.find((pi: any) => pi.id === form.itemId && pi.poId === form.purchaseOrder)?.remaining || 0}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Quantity *</Label><Input type="number" placeholder="10" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
              <div className="space-y-2"><Label>Condition</Label><Select value={form.condition} onValueChange={v => setForm({ ...form, condition: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="good">Good</SelectItem><SelectItem value="damaged">Damaged</SelectItem><SelectItem value="defective">Defective</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea placeholder="Any observations, discrepancies, or special instructions..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 text-white">{creating ? 'Receiving...' : 'Receive Items'}</Button>
          </div>
        
      </ResponsiveDialog>
    </div>
  );
}

// ============================================================================
// IoT SUBPAGES
// ============================================================================

