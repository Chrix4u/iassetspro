'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Building2, GitBranch, Layers, Cpu, Activity, Monitor, MapPin, ChevronRight, Loader2, Plus, X,
} from 'lucide-react';
import { formatDate, formatDateTime, getInitials, LoadingSkeleton, formatCurrency } from '@/components/shared/helpers';

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%] truncate" title={String(value)}>{value || '-'}</span>
    </div>
  );
}

function EmptyTab({ icon: Icon, title, description, actionLabel, onAction }: { icon: any; title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm" className="mt-4"><Plus className="h-3.5 w-3.5 mr-1.5" />{actionLabel}</Button>
      )}
    </div>
  );
}

export function AssetDetailPage({ id }: { id: string }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bomItems, setBomItems] = useState<any[]>([]);
  const [bomAsChild, setBomAsChild] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [selectedComponentId, setSelectedComponentId] = useState<string>('');
  const [componentSpareParts, setComponentSpareParts] = useState<any[]>([]);
  const [sparePartForm, setSparePartForm] = useState({ inventoryItemId: '', quantityRequired: '1', leadTimeDays: '', criticality: 'medium', notes: '' });
  const [installedParts, setInstalledParts] = useState<any[]>([]);
  const [replacementHistory, setReplacementHistory] = useState<any[]>([]);
  const [installPartForm, setInstallPartForm] = useState({ inventoryItemId: '', serialNumber: '', lotNumber: '', quantity: '1', notes: '' });
  const [removalReasons, setRemovalReasons] = useState<Record<string, string>>({});
  const [twin, setTwin] = useState<any>(null);
  const [diagrams, setDiagrams] = useState<any[]>([]);
  const [tabDataLoading, setTabDataLoading] = useState(false);
  const loadedTabsRef = useRef<Set<string>>(new Set(['overview']));
  const tabDataLoadingRef = useRef(false);

  // Create dialogs
  const [showComponentForm, setShowComponentForm] = useState(false);
  const [showTwinForm, setShowTwinForm] = useState(false);
  const [showDiagramForm, setShowDiagramForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Component form
  const [compForm, setCompForm] = useState({ componentCode: '', name: '', componentType: 'component', parentId: '', criticality: 'medium', manufacturer: '', modelNumber: '', serialNumber: '', description: '', expectedLifeHours: '', operatingHours: '' });
  // Twin form
  const [twinForm, setTwinForm] = useState({ name: '', type: 'pump', syncInterval: '5min' });
  // Diagram form
  const [diagForm, setDiagForm] = useState({ name: '', type: 'process', description: '' });

  // Load main asset data
  useEffect(() => {
    api.get<any>(`/api/assets/${id}`).then(res => {
      if (res.success && res.data) {
        setAsset(res.data);
        if (res.data.digitalTwin) setTwin(res.data.digitalTwin);
      }
      setLoading(false);
    });
  }, [id]);

  // Reload components
  const reloadComponents = useCallback(() => {
    api.get(`/api/component-registry?assetId=${id}&limit=100`).then(res => {
      if (res.success && res.data) setComponents(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {});
  }, [id]);

  const reloadInventoryItems = useCallback(() => {
    api.get('/api/inventory?mode=lookup&status=available&limit=100').then(res => {
      if (res.success && res.data) setInventoryItems(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {});
  }, []);

  const loadComponentSpareParts = useCallback((componentId: string) => {
    setSelectedComponentId(componentId);
    Promise.all([
      api.get(`/api/component-registry/${componentId}/spare-parts`),
      api.get(`/api/component-registry/${componentId}/installed-parts`),
      api.get(`/api/component-registry/${componentId}/replacements`),
    ]).then(([sparesRes, installedRes, replacementsRes]) => {
      setComponentSpareParts(sparesRes.success && Array.isArray(sparesRes.data) ? sparesRes.data : []);
      setInstalledParts(installedRes.success && Array.isArray(installedRes.data) ? installedRes.data : []);
      setReplacementHistory(replacementsRes.success && Array.isArray(replacementsRes.data) ? replacementsRes.data : []);
    }).catch(() => {
      setComponentSpareParts([]);
      setInstalledParts([]);
      setReplacementHistory([]);
    });
  }, []);

  // Reload digital twin
  const reloadTwin = useCallback(() => {
    api.get(`/api/digital-twins?assetId=${id}&limit=1`).then(res => {
      if (res.success && res.data && Array.isArray(res.data) && res.data.length > 0) {
        setTwin(res.data[0]);
      }
    }).catch(() => {});
  }, [id]);

  // Reload diagrams
  const reloadDiagrams = useCallback(() => {
    api.get(`/api/system-diagrams?assetId=${id}&limit=100`).then(res => {
      if (res.success && res.data) setDiagrams(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {});
  }, [id]);

  // Lazy load tab data when tab changes
  // NOTE: loadedTabsRef is a ref (not state) to avoid infinite re-render loops.
  // Using a Set in useEffect deps (via useState) creates a new object reference
  // on every mutation, which triggers the effect again → Error #185.
  useEffect(() => {
    if (!asset || loadedTabsRef.current.has(activeTab) || tabDataLoadingRef.current) return;
    tabDataLoadingRef.current = true;
    setTabDataLoading(true);
    const promises: Promise<void>[] = [];

    if (activeTab === 'hierarchy' || activeTab === 'overview') {
      loadedTabsRef.current.add('hierarchy');
    }
    if (activeTab === 'bom') {
      promises.push(
        api.get(`/api/bill-of-materials?parentId=${id}&limit=100`).then(res => {
          if (res.success && res.data) setBomItems(Array.isArray(res.data) ? res.data : []);
        }).catch(() => {}),
        api.get(`/api/bill-of-materials?search=${encodeURIComponent(asset.name)}&limit=100`).then(res => {
          if (res.success && res.data) {
            const items = Array.isArray(res.data) ? res.data : [];
            setBomAsChild(items.filter((b: any) => b.childAssetId === id));
          }
        }).catch(() => {}),
      );
      loadedTabsRef.current.add('bom');
    }
    if (activeTab === 'components') {
      promises.push(reloadComponents(), reloadInventoryItems());
      loadedTabsRef.current.add('components');
    }
    if (activeTab === 'digital-twin' && !twin) {
      promises.push(reloadTwin());
      loadedTabsRef.current.add('digital-twin');
    }
    if (activeTab === 'diagrams') {
      promises.push(reloadDiagrams());
      loadedTabsRef.current.add('diagrams');
    }

    Promise.all(promises).finally(() => {
      tabDataLoadingRef.current = false;
      setTabDataLoading(false);
    });
  }, [activeTab, asset, id, twin, reloadComponents, reloadInventoryItems, reloadTwin, reloadDiagrams]);

  // Handlers
  const printComponentLabel = (component: any) => {
    const esc = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const parentName = component.parent?.name || 'Machine root';
    const popup = window.open('', '_blank', 'width=520,height=420');
    if (!popup) {
      toast.error('Allow pop-ups to print the component label');
      return;
    }
    popup.document.write(`<!doctype html>
      <html>
        <head>
          <title>Component Label - ${esc(component.componentCode)}</title>
          <style>
            @page { size: 100mm 55mm; margin: 4mm; }
            body { font-family: Arial, sans-serif; margin: 0; color: #111827; }
            .label { border: 2px solid #111827; padding: 10px; border-radius: 8px; }
            .code { font-size: 22px; font-weight: 800; letter-spacing: 1px; margin-bottom: 4px; }
            .name { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
            .row { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; padding: 2px 0; }
            .key { color: #6b7280; text-transform: uppercase; }
            .value { font-weight: 600; text-align: right; }
            .footer { margin-top: 8px; border-top: 1px solid #d1d5db; padding-top: 5px; font-size: 9px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="code">${esc(component.componentCode)}</div>
            <div class="name">${esc(component.name)}</div>
            <div class="row"><span class="key">Machine</span><span class="value">${esc(asset?.name)} [${esc(asset?.assetTag)}]</span></div>
            <div class="row"><span class="key">Type</span><span class="value">${esc(String(component.componentType || 'component').replace(/_/g, ' '))}</span></div>
            <div class="row"><span class="key">Parent</span><span class="value">${esc(parentName)}</span></div>
            <div class="row"><span class="key">Serial</span><span class="value">${esc(component.serialNumber || '—')}</span></div>
            <div class="row"><span class="key">Model</span><span class="value">${esc(component.modelNumber || '—')}</span></div>
            <div class="footer">Use the component code on work orders, inspections, PM schedules and spare-part records.</div>
          </div>
        </body>
      </html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const handleCreateComponent = async () => {
    if (!compForm.componentCode.trim() || !compForm.name.trim()) {
      toast.error('Component code and name are required');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/api/component-registry', {
        ...compForm,
        parentId: compForm.parentId || null,
        assetId: id,
        healthScore: 100,
        lifecycleStatus: 'operational',
        expectedLifeHours: compForm.expectedLifeHours ? parseFloat(compForm.expectedLifeHours) : null,
        operatingHours: compForm.operatingHours ? parseFloat(compForm.operatingHours) : 0,
      });
      if (res.success) {
        toast.success('Component registered successfully');
        setShowComponentForm(false);
        setCompForm({ componentCode: '', name: '', componentType: 'component', parentId: '', criticality: 'medium', manufacturer: '', modelNumber: '', serialNumber: '', description: '', expectedLifeHours: '', operatingHours: '' });
        reloadComponents();
      } else {
        toast.error(res.error || 'Failed to create component');
      }
    } catch {
      toast.error('Failed to create component');
    }
    setSaving(false);
  };

  const handleLinkSparePart = async () => {
    if (!selectedComponentId || !sparePartForm.inventoryItemId) {
      toast.error('Select a component and inventory item');
      return;
    }
    const item = inventoryItems.find((entry: any) => entry.id === sparePartForm.inventoryItemId);
    if (!item) {
      toast.error('Inventory item not found');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post(`/api/component-registry/${selectedComponentId}/spare-parts`, {
        inventoryItemId: item.id,
        sparePartName: item.name,
        sparePartCode: item.itemCode || item.sku || '',
        quantityRequired: Number(sparePartForm.quantityRequired || 1),
        unitCost: item.unitCost ?? null,
        leadTimeDays: sparePartForm.leadTimeDays ? Number(sparePartForm.leadTimeDays) : null,
        criticality: sparePartForm.criticality,
        notes: sparePartForm.notes || null,
      });
      if (!res.success) {
        toast.error(res.error || 'Failed to link spare part');
        return;
      }
      toast.success('Inventory spare part linked to component');
      setSparePartForm({ inventoryItemId: '', quantityRequired: '1', leadTimeDays: '', criticality: 'medium', notes: '' });
      loadComponentSpareParts(selectedComponentId);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkSparePart = async (sparePartId: string) => {
    if (!selectedComponentId) return;
    setSaving(true);
    try {
      const res = await api.delete(`/api/component-registry/${selectedComponentId}/spare-parts?sparePartId=${encodeURIComponent(sparePartId)}`);
      if (!res.success) {
        toast.error(res.error || 'Failed to remove spare-part link');
        return;
      }
      toast.success('Store part unlinked from component');
      loadComponentSpareParts(selectedComponentId);
      reloadComponents();
    } finally {
      setSaving(false);
    }
  };

  const handleInstallPart = async () => {
    if (!selectedComponentId || !installPartForm.inventoryItemId) {
      toast.error('Select a component and inventory item');
      return;
    }
    const item = inventoryItems.find((entry: any) => entry.id === installPartForm.inventoryItemId);
    if (!item) {
      toast.error('Inventory item not found');
      return;
    }
    const quantity = Number(installPartForm.quantity || 1);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Quantity must be greater than zero');
      return;
    }

    setSaving(true);
    try {
      const res = await api.post(`/api/component-registry/${selectedComponentId}/installed-parts`, {
        inventoryItemId: item.id,
        partName: item.name,
        partCode: item.itemCode || item.sku || null,
        serialNumber: installPartForm.serialNumber || null,
        lotNumber: installPartForm.lotNumber || null,
        quantity,
        sourceType: 'commissioning',
        notes: installPartForm.notes || null,
      });
      if (!res.success) {
        toast.error(res.error || 'Failed to record installed part');
        return;
      }
      toast.success('Installed part recorded on component');
      setInstallPartForm({ inventoryItemId: '', serialNumber: '', lotNumber: '', quantity: '1', notes: '' });
      loadComponentSpareParts(selectedComponentId);
    } catch {
      toast.error('Failed to record installed part');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveInstalledPart = async (installedPartId: string) => {
    if (!selectedComponentId) return;
    const removalReason = (removalReasons[installedPartId] || '').trim();
    if (!removalReason) {
      toast.error('Enter a removal reason first');
      return;
    }

    setSaving(true);
    try {
      const res = await api.patch(
        `/api/component-registry/${selectedComponentId}/installed-parts/${installedPartId}`,
        {
          removalReason,
          conditionOnRemoval: 'used',
          status: 'removed',
        },
      );
      if (!res.success) {
        toast.error(res.error || 'Failed to remove installed part');
        return;
      }
      toast.success('Part removal recorded');
      setRemovalReasons(current => {
        const next = { ...current };
        delete next[installedPartId];
        return next;
      });
      loadComponentSpareParts(selectedComponentId);
    } catch {
      toast.error('Failed to remove installed part');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTwin = async () => {
    if (!twinForm.name.trim()) {
      toast.error('Twin name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/api/digital-twins', {
        name: twinForm.name,
        assetId: id,
        type: twinForm.type,
        syncInterval: twinForm.syncInterval,
      });
      if (res.success) {
        toast.success('Digital twin created successfully');
        setShowTwinForm(false);
        setTwinForm({ name: '', type: 'pump', syncInterval: '5min' });
        reloadTwin();
      } else {
        toast.error(res.error || 'Failed to create digital twin');
      }
    } catch {
      toast.error('Failed to create digital twin');
    }
    setSaving(false);
  };

  const handleCreateDiagram = async () => {
    if (!diagForm.name.trim()) {
      toast.error('Diagram name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/api/system-diagrams', {
        name: diagForm.name,
        type: diagForm.type,
        description: diagForm.description || null,
        nodes: [],
        edges: [],
        isTemplate: false,
        assetId: id,
      });
      if (res.success) {
        toast.success('System diagram created successfully');
        setShowDiagramForm(false);
        setDiagForm({ name: '', type: 'process', description: '' });
        reloadDiagrams();
      } else {
        toast.error(res.error || 'Failed to create diagram');
      }
    } catch {
      toast.error('Failed to create diagram');
    }
    setSaving(false);
  };

  if (loading) return <LoadingSkeleton />;
  if (!asset) return <div className="p-6">Asset not found</div>;

  let specs: Record<string, string> = {};
  try { if (asset.specification) specs = JSON.parse(asset.specification); } catch (_e) { specs = {}; }
  const statusColors: Record<string, string> = { operational: 'bg-emerald-100 text-emerald-700 border-emerald-200', under_maintenance: 'bg-amber-100 text-amber-700 border-amber-200', standby: 'bg-sky-100 text-sky-700 border-sky-200', decommissioned: 'bg-slate-100 text-slate-600 border-slate-200', disposed: 'bg-red-100 text-red-600 border-red-200' };
  const criticalityColors: Record<string, string> = { low: 'bg-slate-100 text-slate-600 border-slate-200', medium: 'bg-sky-100 text-sky-700 border-sky-200', high: 'bg-amber-100 text-amber-700 border-amber-200', critical: 'bg-red-100 text-red-700 border-red-200' };
  const condColors: Record<string, string> = { new: 'bg-emerald-100 text-emerald-700 border-emerald-200', good: 'bg-emerald-100 text-emerald-700 border-emerald-200', fair: 'bg-amber-100 text-amber-700 border-amber-200', poor: 'bg-red-100 text-red-700 border-red-200', out_of_service: 'bg-red-100 text-red-800 border-red-300' };
  const hasHierarchy = asset.parent || (asset.children && asset.children.length > 0);
  const hasIoT = asset.iotDevices && asset.iotDevices.length > 0;
  const hasMR = asset.maintenanceRequests && asset.maintenanceRequests.length > 0;
  const hasWO = asset.workOrders && asset.workOrders.length > 0;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'hierarchy', label: 'Hierarchy', icon: GitBranch, badge: hasHierarchy ? asset.children.length + 1 : 0 },
    { id: 'bom', label: 'BOM', icon: Layers },
    { id: 'components', label: 'Components', icon: Cpu, badge: components.length || 0 },
    { id: 'condition', label: 'Monitoring', icon: Activity, badge: hasIoT ? asset.iotDevices.length : 0 },
    { id: 'digital-twin', label: 'Digital Twin', icon: Monitor },
    { id: 'diagrams', label: 'Diagrams', icon: MapPin },
  ];

  return (
    <>
      {/* Header */}
      <SheetHeader>
        <SheetTitle>{asset.name}</SheetTitle>
        <SheetDescription>{asset.assetTag} · {asset.category?.name || 'Asset'}</SheetDescription>
      </SheetHeader>
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <Badge variant="outline" className={`capitalize ${statusColors[asset.status] || ''}`}>{(asset.status || '').replace(/_/g, ' ')}</Badge>
        <Badge variant="outline" className={`capitalize ${condColors[asset.condition] || ''}`}>{asset.condition || '-'}</Badge>
        <Badge variant="outline" className={`uppercase ${criticalityColors[asset.criticality] || ''}`}>{asset.criticality || '-'}</Badge>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
        <TabsList className="w-full flex overflow-x-auto p-0 h-auto gap-0 bg-transparent border-b rounded-none">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-1.5 px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs whitespace-nowrap flex-shrink-0"
            >
              <TabIcon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.badge ? <span className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center">{tab.badge}</span> : null}
            </TabsTrigger>
            );
          })}
        </TabsList>

        <ScrollArea className="max-h-[calc(100vh-14rem)]">
          <div className="pb-6">
            {/* ==================== OVERVIEW TAB ==================== */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              {asset.description && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Description</CardTitle></CardHeader>
                  <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{asset.description}</p></CardContent>
                </Card>
              )}
              {Object.keys(specs).length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Specifications</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-x-6">
                      {Object.entries(specs).map(([key, value]) => (
                        <DetailRow key={key} label={key.replace(/_/g, ' ')} value={String(value)} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {asset.pmSchedules && asset.pmSchedules.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">PM Schedules ({asset.pmSchedules.length})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {asset.pmSchedules.map((pm: any) => (
                        <div key={pm.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                          <div>
                            <p className="font-medium">{pm.title}</p>
                            <p className="text-xs text-muted-foreground">{pm.frequencyType} · {(pm.priority || '').toUpperCase()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Next Due</p>
                            <p className="text-sm font-medium">{pm.nextDueDate ? formatDate(pm.nextDueDate) : 'N/A'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Details</CardTitle></CardHeader>
                  <CardContent className="space-y-0">
                    <DetailRow label="Category" value={asset.category?.name} />
                    <Separator className="my-1" />
                    <DetailRow label="Serial Number" value={asset.serialNumber} />
                    <Separator className="my-1" />
                    <DetailRow label="Manufacturer" value={asset.manufacturer} />
                    <Separator className="my-1" />
                    <DetailRow label="Model" value={asset.model} />
                    <Separator className="my-1" />
                    <DetailRow label="Location" value={asset.location} />
                    <Separator className="my-1" />
                    <DetailRow label="Plant" value={asset.plant?.name} />
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Financial</CardTitle></CardHeader>
                  <CardContent className="space-y-0">
                    <DetailRow label="Purchase Cost" value={asset.purchaseCost ? formatCurrency(asset.purchaseCost) : undefined} />
                    <Separator className="my-1" />
                    <DetailRow label="Current Value" value={asset.currentValue ? formatCurrency(asset.currentValue) : undefined} />
                    <Separator className="my-1" />
                    <DetailRow label="Purchase Date" value={formatDate(asset.purchaseDate)} />
                    <Separator className="my-1" />
                    <DetailRow label="Warranty Expiry" value={formatDate(asset.warrantyExpiry)} />
                    <Separator className="my-1" />
                    <DetailRow label="Expected Life" value={asset.expectedLifeYears ? `${asset.expectedLifeYears} years` : undefined} />
                  </CardContent>
                </Card>
              </div>
              {asset.assignedTo && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Assigned To</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm">
                      <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">{getInitials(asset.assignedTo.fullName || 'U')}</AvatarFallback></Avatar>
                      <span className="font-medium">{asset.assignedTo.fullName}</span>
                      <span className="text-muted-foreground">@{asset.assignedTo.username}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {hasHierarchy && (
                  <button onClick={() => setActiveTab('hierarchy')} className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs font-medium">Hierarchy</p><p className="text-[10px] text-muted-foreground">{asset.children.length} child(ren)</p></div>
                  </button>
                )}
                <button onClick={() => setActiveTab('bom')} className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs font-medium">BOM</p><p className="text-[10px] text-muted-foreground">View components</p></div>
                </button>
                {hasIoT && (
                  <button onClick={() => setActiveTab('condition')} className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs font-medium">Monitoring</p><p className="text-[10px] text-muted-foreground">{asset.iotDevices.length} device(s)</p></div>
                  </button>
                )}
                <button onClick={() => setActiveTab('digital-twin')} className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left">
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs font-medium">Digital Twin</p><p className="text-[10px] text-muted-foreground">{twin ? 'Active' : 'Not created'}</p></div>
                </button>
              </div>
              {hasMR && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Maintenance Requests</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {asset.maintenanceRequests.map((mr: any) => (
                        <div key={mr.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                          <div><p className="font-medium">{mr.title || mr.requestNumber}</p><p className="text-xs text-muted-foreground">{mr.requestNumber}</p></div>
                          <Badge variant="outline" className="text-[10px] capitalize">{(mr.status || '').replace(/_/g, ' ')}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {hasWO && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Work Orders</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {asset.workOrders.map((wo: any) => (
                        <div key={wo.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                          <div><p className="font-medium">{wo.title || wo.woNumber}</p><p className="text-xs text-muted-foreground">{wo.woNumber} · {wo.type}</p></div>
                          <Badge variant="outline" className="text-[10px] capitalize">{(wo.status || '').replace(/_/g, ' ')}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ==================== HIERARCHY TAB ==================== */}
            <TabsContent value="hierarchy" className="mt-4 space-y-4">
              {!hasHierarchy ? (
                <EmptyTab icon={GitBranch} title="No Hierarchy" description="This asset is not part of a hierarchy. Set a Parent Asset or add child assets to build the structure." />
              ) : (
                <>
                  {asset.parent && (
                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <span className="h-5 w-5 rounded bg-amber-100 flex items-center justify-center"><ChevronRight className="h-3 w-3 text-amber-700 -rotate-90" /></span>
                          Parent Asset
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{asset.parent.name}</p>
                            <p className="text-xs text-muted-foreground">{asset.parent.assetTag} · {(asset.parent.status || '').replace(/_/g, ' ')}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <Card className="border-0 shadow-sm border-l-4 border-l-primary">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><Building2 className="h-4 w-4 text-primary" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{asset.name}</p>
                          <p className="text-xs text-muted-foreground">{asset.assetTag} · {asset.category?.name}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">Current</Badge>
                      </div>
                    </CardContent>
                  </Card>
                  {asset.children && asset.children.length > 0 && (
                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Child Assets ({asset.children.length})</CardTitle></CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {asset.children.map((child: any) => (
                            <div key={child.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                              <Building2 className="h-4 w-4 text-muted-foreground ml-4" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{child.name}</p>
                                <p className="text-xs text-muted-foreground">{child.assetTag} · {child.category?.name || 'N/A'}</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className={`text-[9px] capitalize ${statusColors[child.status] || ''}`}>{(child.status || '').replace(/_/g, ' ')}</Badge>
                                <Badge variant="outline" className={`text-[9px] capitalize ${condColors[child.condition] || ''}`}>{child.condition || '-'}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            {/* ==================== BOM TAB ==================== */}
            <TabsContent value="bom" className="mt-4 space-y-4">
              {tabDataLoading && activeTab === 'bom' ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : bomItems.length === 0 && bomAsChild.length === 0 ? (
                <EmptyTab icon={Layers} title="No Bill of Materials" description="No BOM entries found for this asset. Add components to build the bill of materials." />
              ) : (
                <>
                  {bomAsChild.length > 0 && (
                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Used In ({bomAsChild.length})</CardTitle><CardDescription>This asset is a component in the following assemblies</CardDescription></CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table><TableHeader><TableRow><TableHead>Parent Assembly</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="hidden sm:table-cell">Unit</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
                            {bomAsChild.map((b: any) => (
                              <TableRow key={b.id}><TableCell className="font-medium text-sm">{(b.parent as any)?.name || '-'}</TableCell><TableCell className="text-right">{b.quantity}</TableCell><TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{b.unit}</TableCell><TableCell><Badge variant="outline" className={`text-[10px] capitalize ${b.status === 'active' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : ''}`}>{b.status}</Badge></TableCell></TableRow>
                            ))}
                          </TableBody></Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Components ({bomItems.length})</CardTitle><CardDescription>Parts and sub-assemblies that make up this asset</CardDescription></CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table><TableHeader><TableRow><TableHead>Component</TableHead><TableHead className="hidden sm:table-cell">Part Number</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="hidden sm:table-cell">Unit</TableHead><TableHead className="hidden lg:table-cell">Spec</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
                          {bomItems.map((b: any) => (
                            <TableRow key={b.id}>
                              <TableCell className="font-medium text-sm">{(b.childAsset as any)?.name || '-'}</TableCell>
                              <TableCell className="font-mono text-xs hidden sm:table-cell">{b.partNumber || '-'}</TableCell>
                              <TableCell className="text-right">{b.quantity}</TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{b.unit}</TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden lg:table-cell max-w-[150px] truncate">{b.specification || '-'}</TableCell>
                              <TableCell><Badge variant="outline" className={`text-[10px] capitalize ${b.status === 'active' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-amber-600 bg-amber-50 border-amber-200'}`}>{b.status}</Badge></TableCell>
                            </TableRow>
                          ))}
                          {bomItems.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No components added yet</TableCell></TableRow>}
                        </TableBody></Table>
                      </div>
                    </CardContent>
                  </Card>

                  {selectedComponentId && (
                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Component Spare Parts & Store Linkage</CardTitle>
                        <CardDescription>Link replaceable parts for the selected assembly/component to actual inventory items so technicians see store availability and stock.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_100px_120px_140px]">
                          <div className="space-y-1">
                            <Label className="text-xs">Inventory Item</Label>
                            <Select value={sparePartForm.inventoryItemId} onValueChange={v => setSparePartForm(f => ({ ...f, inventoryItemId: v }))}>
                              <SelectTrigger><SelectValue placeholder="Select store item" /></SelectTrigger>
                              <SelectContent>
                                {inventoryItems.map((item: any) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.itemCode || item.sku || '—'} · {item.name} · Stock {item.currentStock ?? 0}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1"><Label className="text-xs">Qty / Machine</Label><Input type="number" min="1" value={sparePartForm.quantityRequired} onChange={e => setSparePartForm(f => ({ ...f, quantityRequired: e.target.value }))} /></div>
                          <div className="space-y-1"><Label className="text-xs">Lead Days</Label><Input type="number" min="0" value={sparePartForm.leadTimeDays} onChange={e => setSparePartForm(f => ({ ...f, leadTimeDays: e.target.value }))} /></div>
                          <div className="space-y-1">
                            <Label className="text-xs">Criticality</Label>
                            <Select value={sparePartForm.criticality} onValueChange={v => setSparePartForm(f => ({ ...f, criticality: v }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="critical">Critical</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button size="sm" onClick={handleLinkSparePart} disabled={saving || !sparePartForm.inventoryItemId}>
                            Link Store Part
                          </Button>
                        </div>
                        <div className="overflow-x-auto rounded-md border">
                          <Table>
                            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Required</TableHead><TableHead>Stock</TableHead><TableHead>Location</TableHead><TableHead>Criticality</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                            <TableBody>
                              {componentSpareParts.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No store parts linked to this component yet.</TableCell></TableRow>
                              ) : componentSpareParts.map((part: any) => (
                                <TableRow key={part.id}>
                                  <TableCell><div className="font-medium">{part.sparePartName}</div><div className="text-xs text-muted-foreground">{part.sparePartCode || part.inventoryItem?.itemCode || '—'}</div></TableCell>
                                  <TableCell>{part.quantityRequired}</TableCell>
                                  <TableCell>{part.inventoryItem?.currentStock ?? 'Not stocked'}</TableCell>
                                  <TableCell>{part.inventoryItem?.location || '—'}</TableCell>
                                  <TableCell><Badge variant="outline" className="capitalize">{part.criticality}</Badge></TableCell>
                                  <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleUnlinkSparePart(part.id)} disabled={saving}>
                                      Remove
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            {/* ==================== COMPONENTS TAB ==================== */}
            <TabsContent value="components" className="mt-4 space-y-4">
              {/* Add Component Form */}
              {showComponentForm && (
                <Card className="border-0 shadow-sm border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Register New Component</CardTitle>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowComponentForm(false)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                    <CardDescription>Track this part&apos;s lifecycle, health, and maintenance history</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs">Component Code *</Label><Input className="h-8 text-sm" placeholder="e.g. RPM-DR-001" value={compForm.componentCode} onChange={e => setCompForm(f => ({ ...f, componentCode: e.target.value }))} /></div>
                      <div className="space-y-1"><Label className="text-xs">Name *</Label><Input className="h-8 text-sm" placeholder="e.g. Drive Roller" value={compForm.name} onChange={e => setCompForm(f => ({ ...f, name: e.target.value }))} /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Select value={compForm.componentType} onValueChange={v => setCompForm(f => ({ ...f, componentType: v }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="assembly">Assembly</SelectItem>
                            <SelectItem value="subassembly">Sub-Assembly</SelectItem>
                            <SelectItem value="component">Component</SelectItem>
                            <SelectItem value="part">Part</SelectItem>
                            <SelectItem value="auxiliary">Auxiliary</SelectItem>
                            <SelectItem value="instrument">Instrument</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Criticality</Label>
                        <Select value={compForm.criticality} onValueChange={v => setCompForm(f => ({ ...f, criticality: v }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1"><Label className="text-xs">Serial Number</Label><Input className="h-8 text-sm" placeholder="Optional" value={compForm.serialNumber} onChange={e => setCompForm(f => ({ ...f, serialNumber: e.target.value }))} /></div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Parent Assembly / Component</Label>
                      <Select value={compForm.parentId || 'root'} onValueChange={v => setCompForm(f => ({ ...f, parentId: v === 'root' ? '' : v }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Top level on machine" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="root">Top level on machine</SelectItem>
                          {components.map((component: any) => (
                            <SelectItem key={component.id} value={component.id}>
                              {component.componentCode} · {component.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs">Manufacturer</Label><Input className="h-8 text-sm" placeholder="e.g. SKF" value={compForm.manufacturer} onChange={e => setCompForm(f => ({ ...f, manufacturer: e.target.value }))} /></div>
                      <div className="space-y-1"><Label className="text-xs">Model Number</Label><Input className="h-8 text-sm" placeholder="e.g. 22222 EK" value={compForm.modelNumber} onChange={e => setCompForm(f => ({ ...f, modelNumber: e.target.value }))} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs">Expected Life (hours)</Label><Input type="number" className="h-8 text-sm" placeholder="e.g. 20000" value={compForm.expectedLifeHours} onChange={e => setCompForm(f => ({ ...f, expectedLifeHours: e.target.value }))} /></div>
                      <div className="space-y-1"><Label className="text-xs">Operating Hours</Label><Input type="number" className="h-8 text-sm" placeholder="e.g. 5000" value={compForm.operatingHours} onChange={e => setCompForm(f => ({ ...f, operatingHours: e.target.value }))} /></div>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Description</Label><Textarea className="text-sm" rows={2} placeholder="Brief description..." value={compForm.description} onChange={e => setCompForm(f => ({ ...f, description: e.target.value }))} /></div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setShowComponentForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleCreateComponent} disabled={saving || !compForm.componentCode.trim() || !compForm.name.trim()}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                        Register Component
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {tabDataLoading && activeTab === 'components' ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : components.length === 0 && !showComponentForm ? (
                <EmptyTab icon={Cpu} title="No Components Registered" description="Register components of this asset in the Component Registry to track their lifecycle, health, and maintenance." actionLabel="Add Component" onAction={() => setShowComponentForm(true)} />
              ) : !showComponentForm && (
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setShowComponentForm(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Component</Button>
                </div>
              )}

              {components.length > 0 && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Total', value: components.length, color: 'bg-slate-50 text-slate-700' },
                      { label: 'Operational', value: components.filter((c: any) => c.lifecycleStatus === 'operational').length, color: 'bg-emerald-50 text-emerald-700' },
                      { label: 'Needs Attention', value: components.filter((c: any) => c.healthScore < 70).length, color: 'bg-amber-50 text-amber-700' },
                      { label: 'Critical', value: components.filter((c: any) => c.healthScore < 40).length, color: 'bg-red-50 text-red-700' },
                    ].map(k => (
                      <div key={k.label} className={`${k.color} rounded-lg p-3 text-center`}>
                        <p className="text-xl font-bold">{k.value}</p>
                        <p className="text-[10px]">{k.label}</p>
                      </div>
                    ))}
                  </div>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead className="hidden sm:table-cell">Type</TableHead><TableHead className="hidden lg:table-cell">Parent</TableHead><TableHead className="hidden md:table-cell">Criticality</TableHead><TableHead className="text-right">Health</TableHead><TableHead className="hidden lg:table-cell">Life (hrs)</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
                          {components.map((c: any) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-mono text-xs">{c.componentCode}</TableCell>
                              <TableCell className="font-medium text-sm">{c.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden sm:table-cell capitalize">{c.componentType?.replace(/_/g, ' ')}</TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{c.parent?.name || 'Machine root'}</TableCell>
                              <TableCell className="hidden md:table-cell"><Badge variant="outline" className={`text-[10px] uppercase ${criticalityColors[c.criticality] || ''}`}>{c.criticality}</Badge></TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Progress value={c.healthScore || 0} className="h-1.5 w-16" />
                                  <span className="text-xs font-medium">{c.healthScore || 0}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                                {c.operatingHours ?? '-'} / {c.expectedLifeHours ?? '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1.5">
                                  <Button variant="ghost" size="sm" onClick={() => printComponentLabel(c)}>Print Label</Button>
                                  <Button variant="outline" size="sm" onClick={() => loadComponentSpareParts(c.id)}>
                                    Manage Parts ({c._count?.sparePartLinks || 0})
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody></Table>
                      </div>
                    </CardContent>

                  {selectedComponentId && (
                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Installed Parts & Replacement History</CardTitle>
                        <CardDescription>
                          Commissioning records describe what is physically installed on this component. Store issue/return quantities remain controlled by work-order material reconciliation.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr_1fr_100px]">
                          <div className="space-y-1">
                            <Label className="text-xs">Inventory / Spare Item</Label>
                            <Select value={installPartForm.inventoryItemId} onValueChange={value => setInstallPartForm(current => ({ ...current, inventoryItemId: value }))}>
                              <SelectTrigger><SelectValue placeholder="Select item already installed" /></SelectTrigger>
                              <SelectContent>
                                {inventoryItems.map((item: any) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.itemCode || item.sku || '—'} · {item.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Serial Number</Label>
                            <Input value={installPartForm.serialNumber} onChange={event => setInstallPartForm(current => ({ ...current, serialNumber: event.target.value }))} placeholder="Optional" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Lot / Batch</Label>
                            <Input value={installPartForm.lotNumber} onChange={event => setInstallPartForm(current => ({ ...current, lotNumber: event.target.value }))} placeholder="Optional" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Qty</Label>
                            <Input type="number" min="0.0001" step="any" value={installPartForm.quantity} onChange={event => setInstallPartForm(current => ({ ...current, quantity: event.target.value }))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                          <Textarea
                            value={installPartForm.notes}
                            onChange={event => setInstallPartForm(current => ({ ...current, notes: event.target.value }))}
                            placeholder="Commissioning / installation notes"
                            rows={2}
                          />
                          <Button onClick={handleInstallPart} disabled={saving || !installPartForm.inventoryItemId} className="self-end">
                            Record Installed Part
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">Currently Installed</p>
                            <Badge variant="outline">{installedParts.filter((part: any) => part.status === 'installed').length} active</Badge>
                          </div>
                          <div className="overflow-x-auto rounded-md border">
                            <Table>
                              <TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Serial / Lot</TableHead><TableHead>Qty</TableHead><TableHead>Installed</TableHead><TableHead>Source</TableHead><TableHead className="min-w-[260px]">Remove</TableHead></TableRow></TableHeader>
                              <TableBody>
                                {installedParts.filter((part: any) => part.status === 'installed').length === 0 ? (
                                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No installed parts recorded for this component.</TableCell></TableRow>
                                ) : installedParts.filter((part: any) => part.status === 'installed').map((part: any) => (
                                  <TableRow key={part.id}>
                                    <TableCell><div className="font-medium">{part.partName}</div><div className="text-xs text-muted-foreground">{part.partCode || part.inventoryItem?.itemCode || '—'}</div></TableCell>
                                    <TableCell><div className="text-xs">{part.serialNumber || '—'}</div><div className="text-[10px] text-muted-foreground">{part.lotNumber ? `Lot ${part.lotNumber}` : ''}</div></TableCell>
                                    <TableCell>{part.quantity}</TableCell>
                                    <TableCell className="text-xs">{part.installedAt ? formatDate(part.installedAt) : '—'}</TableCell>
                                    <TableCell><Badge variant="outline" className="capitalize">{String(part.sourceType || 'manual').replace(/_/g, ' ')}</Badge></TableCell>
                                    <TableCell>
                                      <div className="flex gap-2">
                                        <Input
                                          className="h-8"
                                          placeholder="Removal reason"
                                          value={removalReasons[part.id] || ''}
                                          onChange={event => setRemovalReasons(current => ({ ...current, [part.id]: event.target.value }))}
                                        />
                                        <Button variant="outline" size="sm" onClick={() => handleRemoveInstalledPart(part.id)} disabled={saving}>
                                          Remove
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-semibold">Installed-Part History</p>
                          <div className="overflow-x-auto rounded-md border">
                            <Table>
                              <TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Status</TableHead><TableHead>Installed</TableHead><TableHead>Removed</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                              <TableBody>
                                {installedParts.length === 0 ? (
                                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No installation history yet.</TableCell></TableRow>
                                ) : installedParts.map((part: any) => (
                                  <TableRow key={part.id}>
                                    <TableCell><div className="font-medium">{part.partName}</div><div className="text-xs text-muted-foreground">{part.serialNumber || part.partCode || '—'}</div></TableCell>
                                    <TableCell><Badge variant="outline" className="capitalize">{String(part.status || '').replace(/_/g, ' ')}</Badge></TableCell>
                                    <TableCell className="text-xs">{part.installedAt ? formatDate(part.installedAt) : '—'}</TableCell>
                                    <TableCell className="text-xs">{part.removedAt ? formatDate(part.removedAt) : '—'}</TableCell>
                                    <TableCell className="text-xs">{part.removalReason || '—'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-semibold">Replacement Records</p>
                          <div className="overflow-x-auto rounded-md border">
                            <Table>
                              <TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Old Serial</TableHead><TableHead>New Serial</TableHead><TableHead>Reason</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                              <TableBody>
                                {replacementHistory.length === 0 ? (
                                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No replacement records for this component.</TableCell></TableRow>
                                ) : replacementHistory.map((record: any) => (
                                  <TableRow key={record.id}>
                                    <TableCell><div className="font-medium">{record.partName}</div><div className="text-xs text-muted-foreground">{record.partCode || '—'}</div></TableCell>
                                    <TableCell className="text-xs">{record.serialNumberOld || '—'}</TableCell>
                                    <TableCell className="text-xs">{record.serialNumberNew || '—'}</TableCell>
                                    <TableCell className="text-xs capitalize">{String(record.reason || '').replace(/_/g, ' ') || '—'}</TableCell>
                                    <TableCell className="text-xs">{record.replacedAt ? formatDate(record.replacedAt) : '—'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  </Card>
                </>
              )}
            </TabsContent>

            {/* ==================== CONDITION MONITORING TAB ==================== */}
            <TabsContent value="condition" className="mt-4 space-y-4">
              {!hasIoT ? (
                <EmptyTab icon={Activity} title="No Monitoring Devices" description="No IoT sensors or monitoring devices are connected to this asset. Add monitoring points to track condition in real-time." />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {asset.iotDevices.map((d: any) => {
                    const dotColor = d.status === 'online' || d.status === 'active' ? 'bg-emerald-500' : d.status === 'warning' ? 'bg-amber-500' : 'bg-red-500';
                    return (
                      <Card key={d.id} className="border-0 shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold truncate">{d.name}</p>
                            <div className={`h-2.5 w-2.5 rounded-full ${dotColor} ${d.status === 'online' ? 'animate-pulse' : ''}`} />
                          </div>
                          <p className="text-[10px] text-muted-foreground capitalize">{d.parameter} · {d.type}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-muted-foreground">Status</span>
                            <Badge variant="outline" className="text-[9px] capitalize">{d.status}</Badge>
                          </div>
                          {d.lastSeen && <p className="text-[9px] text-muted-foreground mt-1">Last: {formatDateTime(d.lastSeen)}</p>}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ==================== DIGITAL TWIN TAB ==================== */}
            <TabsContent value="digital-twin" className="mt-4 space-y-4">
              {/* Create Twin Form */}
              {showTwinForm && (
                <Card className="border-0 shadow-sm border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Create Digital Twin</CardTitle>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowTwinForm(false)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                    <CardDescription>Create a digital replica of this asset for simulation and analysis</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1"><Label className="text-xs">Twin Name *</Label><Input className="h-8 text-sm" placeholder="e.g. Roller Printing Machine DT-001" value={twinForm.name} onChange={e => setTwinForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Select value={twinForm.type} onValueChange={v => setTwinForm(f => ({ ...f, type: v }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pump">Pump</SelectItem>
                            <SelectItem value="motor">Motor</SelectItem>
                            <SelectItem value="compressor">Compressor</SelectItem>
                            <SelectItem value="valve">Valve</SelectItem>
                            <SelectItem value="heat_exchanger">Heat Exchanger</SelectItem>
                            <SelectItem value="conveyor">Conveyor</SelectItem>
                            <SelectItem value="printing_machine">Printing Machine</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Sync Interval</Label>
                        <Select value={twinForm.syncInterval} onValueChange={v => setTwinForm(f => ({ ...f, syncInterval: v }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="real_time">Real-time</SelectItem>
                            <SelectItem value="1min">1 min</SelectItem>
                            <SelectItem value="5min">5 min</SelectItem>
                            <SelectItem value="15min">15 min</SelectItem>
                            <SelectItem value="1hr">1 hour</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setShowTwinForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleCreateTwin} disabled={saving || !twinForm.name.trim()}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                        Create Twin
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {tabDataLoading && activeTab === 'digital-twin' ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !twin && !showTwinForm ? (
                <EmptyTab icon={Monitor} title="No Digital Twin" description="A digital twin has not been created for this asset. Create one to enable simulation, monitoring, and predictive analysis." actionLabel="Create Digital Twin" onAction={() => setShowTwinForm(true)} />
              ) : twin && !showTwinForm && (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5 mr-1.5" />Recreate Twin</Button>
                </div>
              )}

              {twin && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="relative h-16 w-16">
                        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted/30" />
                          <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="2.5" strokeDasharray={`${(twin.healthScore || 0) * 1} ${100 - (twin.healthScore || 0)}`} className={twin.healthScore >= 80 ? 'text-emerald-500' : twin.healthScore >= 60 ? 'text-amber-500' : 'text-red-500'} strokeLinecap="round" />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{twin.healthScore || 0}%</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{twin.name}</h3>
                        <p className="text-xs text-muted-foreground capitalize">Type: {twin.type?.replace(/_/g, ' ')}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className={twin.isActive ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'}>
                            <span className="capitalize">{twin.isActive ? 'Active' : 'Inactive'}</span>
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">Sync: {twin.syncInterval || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                    {twin.lastSynced && <p className="text-[10px] text-muted-foreground mt-3 border-t pt-2">Last synced: {formatDateTime(twin.lastSynced)}</p>}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ==================== DIAGRAMS TAB ==================== */}
            <TabsContent value="diagrams" className="mt-4 space-y-4">
              {/* Create Diagram Form */}
              {showDiagramForm && (
                <Card className="border-0 shadow-sm border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Create System Diagram</CardTitle>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDiagramForm(false)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                    <CardDescription>Create piping, electrical, or process flow diagrams for this plant</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1"><Label className="text-xs">Diagram Name *</Label><Input className="h-8 text-sm" placeholder="e.g. Textile Production Line 1 - Process Flow" value={diagForm.name} onChange={e => setDiagForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Select value={diagForm.type} onValueChange={v => setDiagForm(f => ({ ...f, type: v }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="process">Process Flow</SelectItem>
                            <SelectItem value="piping">Piping & Instrumentation</SelectItem>
                            <SelectItem value="electrical">Electrical</SelectItem>
                            <SelectItem value="hvac">HVAC</SelectItem>
                            <SelectItem value="control">Control System</SelectItem>
                            <SelectItem value="safety">Safety</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1"><Label className="text-xs">Description</Label><Input className="h-8 text-sm" placeholder="Optional description" value={diagForm.description} onChange={e => setDiagForm(f => ({ ...f, description: e.target.value }))} /></div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setShowDiagramForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleCreateDiagram} disabled={saving || !diagForm.name.trim()}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                        Create Diagram
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {tabDataLoading && activeTab === 'diagrams' ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : diagrams.length === 0 && !showDiagramForm ? (
                <EmptyTab icon={MapPin} title="No System Diagrams" description="No system diagrams have been created yet. Create piping, electrical, or process flow diagrams for your plant." actionLabel="Create Diagram" onAction={() => setShowDiagramForm(true)} />
              ) : !showDiagramForm && (
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setShowDiagramForm(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />Create Diagram</Button>
                </div>
              )}

              {diagrams.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Available Diagrams ({diagrams.length})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {diagrams.map((d: any) => (
                        <div key={d.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="h-9 w-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0">
                            <MapPin className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{d.name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{d.type?.replace(/_/g, ' ')} · v{d.version || 1} · {formatDate(d.updatedAt)}</p>
                          </div>
                          {d.isTemplate && <Badge variant="outline" className="text-[9px]">Template</Badge>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </>
  );
}
