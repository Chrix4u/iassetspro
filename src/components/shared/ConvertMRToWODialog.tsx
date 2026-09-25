'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useIsMobile } from '@/components/shared/ResponsiveDialog';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { MobileStepperSheet } from '@/components/shared/MobileStepperSheet';
import { WorkerAssignmentSelector } from '@/components/shared/WorkerAssignmentSelector';
import { formatDateTime } from '@/components/shared/helpers';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { DatePicker, DateTimePicker } from '@/components/ui/datetime-picker';

import {
  Loader2, ClipboardList, RefreshCw, FileText, ClipboardCheck,
  ShieldAlert, PackageSearch, Hammer, HardHat, Users, X,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface ConvertMRToWODialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mr: any | null;  // MaintenanceRequest
  onSuccess: (workOrder: any) => void;
}

interface ConvertForm {
  workOrderType: string;
  priority: string;
  tradeActivity: string;
  technicalDescription: string;
  scheduledDate: string;
  deliveryDate: string;
  estimatedHours: string;
  estimatedHoursDisplay: string;
  assignType: 'technician' | 'supervisor';
  selectedWorkerIds: string[];
  teamLeaderId: string;
  requiredParts: Array<{ itemId: string; quantity: number }>;
  requiredTools: Array<{ toolId: string; quantity: number }>;
  componentIds: string[];
  safetyNotes: string;
  ppeRequired: string;
  notes: string;
}

// ============================================================================
// Component
// ============================================================================

export function ConvertMRToWODialog({ open, onOpenChange, mr, onSuccess }: ConvertMRToWODialogProps) {
  const isMobile = useIsMobile();

  const [form, setForm] = useState<ConvertForm>(defaultForm());
  const [loading, setLoading] = useState(false);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [toolsData, setToolsData] = useState<any[]>([]);
  const [availableComponents, setAvailableComponents] = useState<any[]>([]);
  const [componentsLoading, setComponentsLoading] = useState(false);
  const [componentPartSuggestions, setComponentPartSuggestions] = useState<any[]>([]);
  const [componentPartsLoading, setComponentPartsLoading] = useState(false);

  const loadDropdowns = async () => {
    setDropdownLoading(true);
    try {
      const [invRes, toolsRes] = await Promise.all([
        api.get('/api/inventory?limit=100'),
        api.get('/api/tools?limit=100'),
      ]);
      if (invRes.success && invRes.data) setInventoryItems(Array.isArray(invRes.data) ? invRes.data : []);
      if (toolsRes.success && toolsRes.data) setToolsData(Array.isArray(toolsRes.data) ? toolsRes.data : []);
    } catch (_e) {
      // Silent — dropdowns will be empty
    }
    setDropdownLoading(false);
  };

  // Reset form and load dropdowns when MR changes / dialog opens
  useEffect(() => {
    if (open && mr) {
      setForm({
        workOrderType: mr.category === 'preventive' ? 'preventive' : 'corrective',
        priority: mr.priority === 'urgent' ? 'high' : mr.priority || 'medium',
        tradeActivity: 'mechanical',
        technicalDescription: mr.title || '',
        scheduledDate: '',
        deliveryDate: '',
        estimatedHours: '',
        estimatedHoursDisplay: '',
        assignType: 'technician',
        selectedWorkerIds: [],
        teamLeaderId: '',
        requiredParts: [],
        requiredTools: [],
        componentIds: [],
        safetyNotes: '',
        ppeRequired: '',
        notes: '',
      });
      loadDropdowns();
      if (mr.assetId) {
        setComponentsLoading(true);
        api.get(`/api/component-registry?assetId=${mr.assetId}&limit=100`)
          .then((res) => setAvailableComponents(res.success && Array.isArray(res.data) ? res.data : []))
          .catch(() => setAvailableComponents([]))
          .finally(() => setComponentsLoading(false));
      } else {
        setAvailableComponents([]);
      }
    }
  }, [open, mr]);

  useEffect(() => {
    if (!open || form.componentIds.length === 0) {
      setComponentPartSuggestions([]);
      setComponentPartsLoading(false);
      return;
    }

    let active = true;
    setComponentPartsLoading(true);
    Promise.all(
      form.componentIds.map((componentId) =>
        api.get(`/api/component-registry/${componentId}/spare-parts`)
          .then((res) => ({ componentId, rows: res.success && Array.isArray(res.data) ? res.data : [] }))
          .catch(() => ({ componentId, rows: [] })),
      ),
    ).then((groups) => {
      if (!active) return;
      const componentById = new Map(availableComponents.map((component: any) => [component.id, component]));
      const merged = new Map<string, any>();
      for (const group of groups) {
        const component = componentById.get(group.componentId);
        for (const row of group.rows) {
          const inventoryItem = row.inventoryItem;
          if (!inventoryItem?.id) continue;
          const existing = merged.get(inventoryItem.id);
          const quantityRequired = Number(row.quantityRequired || 1);
          if (existing) {
            existing.quantityRequired += quantityRequired;
            existing.componentNames = Array.from(new Set([...existing.componentNames, component?.name || 'Component']));
          } else {
            merged.set(inventoryItem.id, {
              itemId: inventoryItem.id,
              itemCode: inventoryItem.itemCode || row.sparePartCode || '',
              itemName: inventoryItem.name || row.sparePartName || 'Spare part',
              currentStock: inventoryItem.currentStock ?? 0,
              unitOfMeasure: inventoryItem.unitOfMeasure || 'EA',
              location: inventoryItem.location || '',
              quantityRequired,
              criticality: row.criticality || 'medium',
              componentNames: [component?.name || 'Component'],
            });
          }
        }
      }
      setComponentPartSuggestions([...merged.values()]);
      setComponentPartsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [open, form.componentIds, availableComponents]);

  // Helpers
  const handleEstHoursChange = (val: string) => {
    let displayVal = val;
    let decimalVal = val;
    if (val.includes(':')) {
      const [h, m] = val.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) decimalVal = String(h + m / 60);
    }
    setForm(f => ({ ...f, estimatedHours: decimalVal, estimatedHoursDisplay: displayVal }));
  };

  const addPart = (itemId: string) => {
    setForm(f => {
      if (f.requiredParts.some(p => p.itemId === itemId)) return f;
      return { ...f, requiredParts: [...f.requiredParts, { itemId, quantity: 1 }] };
    });
  };
  const removePart = (itemId: string) => {
    setForm(f => ({ ...f, requiredParts: f.requiredParts.filter(p => p.itemId !== itemId) }));
  };
  const updatePartQty = (itemId: string, qty: number) => {
    setForm(f => ({ ...f, requiredParts: f.requiredParts.map(p => p.itemId === itemId ? { ...p, quantity: qty } : p) }));
  };

  const addTool = (toolId: string) => {
    setForm(f => {
      if (f.requiredTools.some(t => t.toolId === toolId)) return f;
      return { ...f, requiredTools: [...f.requiredTools, { toolId, quantity: 1 }] };
    });
  };
  const removeTool = (toolId: string) => {
    setForm(f => ({ ...f, requiredTools: f.requiredTools.filter(t => t.toolId !== toolId) }));
  };
  const updateToolQty = (toolId: string, qty: number) => {
    setForm(f => ({ ...f, requiredTools: f.requiredTools.map(t => t.toolId === toolId ? { ...t, quantity: qty } : t) }));
  };

  const componentLabel = (component: any) => {
    const byId = new Map(availableComponents.map((item: any) => [item.id, item]));
    let depth = 0;
    let cursor = component;
    const seen = new Set<string>();
    while (cursor?.parentId && depth < 8 && !seen.has(cursor.parentId)) {
      seen.add(cursor.parentId);
      const parent = byId.get(cursor.parentId);
      if (!parent) break;
      depth += 1;
      cursor = parent;
    }
    const prefix = depth > 0 ? `${'— '.repeat(depth)}` : '';
    return `${prefix}${component.componentCode ? `${component.componentCode} · ` : ''}${component.name}`;
  };

  const toggleComponent = (componentId: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      componentIds: checked
        ? Array.from(new Set([...current.componentIds, componentId]))
        : current.componentIds.filter((id) => id !== componentId),
    }));
  };

  // Submit
  const handleConvert = useCallback(async () => {
    if (!mr) return;
    setLoading(true);
    const payload: any = {
      title: mr.title,
      priority: form.priority,
      workOrderType: form.workOrderType,
      tradeActivity: form.tradeActivity,
      technicalDescription: form.technicalDescription || undefined,
      assignmentType: form.assignType === 'technician' ? 'direct' : 'via_supervisor',
      estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : undefined,
      plannedStart: form.scheduledDate || undefined,
      deliveryDateRequired: form.deliveryDate || undefined,
      safetyNotes: form.safetyNotes || undefined,
      ppeRequired: form.ppeRequired || undefined,
      notes: form.notes || undefined,
      requiredParts: form.requiredParts.length > 0 ? form.requiredParts : undefined,
      requiredTools: form.requiredTools.length > 0 ? form.requiredTools : undefined,
      componentIds: form.componentIds.length > 0 ? form.componentIds : undefined,
    };
    if (form.selectedWorkerIds.length > 0) {
      payload.teamMembers = form.selectedWorkerIds.map(workerId => ({
        userId: workerId,
        role: workerId === form.teamLeaderId ? 'team_leader' : 'assistant',
      }));
      payload.assignedTo = form.selectedWorkerIds[0];
      payload.teamLeaderId = form.teamLeaderId || null;
    }
    if (form.assignType === 'supervisor' && form.teamLeaderId) {
      payload.assignedSupervisorId = form.teamLeaderId;
    }
    const res = await api.post(`/api/maintenance-requests/${mr.id}/convert`, payload);
    if (res.success) {
      toast.success('Converted to Work Order');
      onOpenChange(false);
      onSuccess(res.data);
    } else {
      toast.error(res.error || 'Conversion failed');
    }
    setLoading(false);
  }, [mr, form, onOpenChange, onSuccess]);

  if (!mr) return null;

  // ============================================================================
  // Shared section renderers
  // ============================================================================

  const renderSection1_RequestInfo = () => (
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
          <p className="text-[11px] text-blue-600 font-medium uppercase">Location</p>
          <p className="text-sm font-semibold">{mr.location || '-'}</p>
        </div>
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
  );

  const renderSection2_WODetails = () => (
    <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-purple-800 uppercase tracking-wider flex items-center gap-2 mb-4">
        <ClipboardCheck className="h-4 w-4" />Work Order Details
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Work Order Type</Label>
          <Select value={form.workOrderType} onValueChange={v => setForm(f => ({ ...f, workOrderType: v }))}>
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
          <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
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
          <Select value={form.tradeActivity} onValueChange={v => setForm(f => ({ ...f, tradeActivity: v }))}>
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
            onChange={e => setForm(f => ({ ...f, technicalDescription: e.target.value }))}
            placeholder="Detailed technical description of the work to be performed..."
            rows={3}
          />
        </div>
        {mr.assetId && (
          <div className="sm:col-span-2 lg:col-span-4 space-y-1.5">
            <Label className="text-xs">Affected Assembly / Component</Label>
            {componentsLoading ? (
              <div className="text-xs text-muted-foreground py-2">Loading machine components...</div>
            ) : availableComponents.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No components are registered for this machine. The work order will remain linked to the parent machine only.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto rounded-md border bg-white/70 p-2">
                {availableComponents
                  .slice()
                  .sort((a: any, b: any) => componentLabel(a).localeCompare(componentLabel(b)))
                  .map((component: any) => (
                    <label key={component.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 cursor-pointer">
                      <Checkbox
                        checked={form.componentIds.includes(component.id)}
                        onCheckedChange={(checked) => toggleComponent(component.id, checked === true)}
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium truncate">{componentLabel(component)}</span>
                        <span className="block text-[10px] text-muted-foreground capitalize">{String(component.componentType || 'component').replace(/_/g, ' ')} · {component.criticality || 'medium'} criticality</span>
                      </span>
                    </label>
                  ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">Select the exact assembly/component affected. Reports still roll the work order up to the parent machine.</p>
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Scheduled Date</Label>
          <DateTimePicker value={form.scheduledDate || undefined} onChange={v => setForm(f => ({ ...f, scheduledDate: v || '' }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Delivery Date</Label>
          <DatePicker value={form.deliveryDate || undefined} onChange={v => setForm(f => ({ ...f, deliveryDate: v || '' }))} />
        </div>
      </div>
    </div>
  );

  const renderSection3_Resources = () => (
    <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 sm:p-6">
      <div className="grid gap-4">
        <WorkerAssignmentSelector
          selectedWorkerIds={form.selectedWorkerIds}
          teamLeaderId={form.teamLeaderId}
          onSelectedWorkersChange={(ids) => setForm(f => ({ ...f, selectedWorkerIds: ids }))}
          onTeamLeaderChange={(id) => setForm(f => ({ ...f, teamLeaderId: id }))}
          assignType={form.assignType}
          onAssignTypeChange={(type) => setForm(f => ({ ...f, assignType: type }))}
          label="Resource Assignment"
        />

        {/* Required Spare Parts */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1"><PackageSearch className="h-3.5 w-3.5" />Required Spare Parts</Label>
          <div className="flex flex-wrap items-center gap-1.5 min-h-[44px] p-2 border rounded-md bg-white">
            {form.requiredParts.length === 0 && <span className="text-sm text-muted-foreground">Select spare parts from inventory...</span>}
            {form.requiredParts.map(part => {
              const item = inventoryItems.find(i => i.id === part.itemId);
              return item ? (
                <div key={part.itemId} className="flex items-center gap-1">
                  <Badge variant="secondary" className="gap-1">
                    {item.itemName || item.name} <span className="font-semibold">x{part.quantity}</span>
                    <button onClick={() => removePart(part.itemId)} className="ml-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-red-600"><X className="h-3 w-3" /></button>
                  </Badge>
                  <Input type="number" min={1} value={part.quantity} onChange={e => updatePartQty(part.itemId, Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-7 w-14 text-center text-xs px-1" />
                </div>
              ) : null;
            })}
          </div>
          {form.componentIds.length > 0 && (
            <div className="rounded-md border border-dashed bg-white/70 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium">Linked Store Parts for Selected Components</p>
                  <p className="text-[10px] text-muted-foreground">These are recommendations from the machine/component registry. Add only the parts expected for this repair.</p>
                </div>
                {componentPartsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {!componentPartsLoading && componentPartSuggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No inventory spare parts are linked to the selected component(s).</p>
              ) : (
                <div className="space-y-1.5">
                  {componentPartSuggestions.map((suggestion) => {
                    const alreadyAdded = form.requiredParts.some((part) => part.itemId === suggestion.itemId);
                    return (
                      <div key={suggestion.itemId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{suggestion.itemCode ? `${suggestion.itemCode} · ` : ''}{suggestion.itemName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {suggestion.componentNames.join(', ')} · Required {suggestion.quantityRequired} · Stock {suggestion.currentStock} {suggestion.unitOfMeasure}{suggestion.location ? ` · ${suggestion.location}` : ''}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant={alreadyAdded ? 'secondary' : 'outline'}
                          size="sm"
                          disabled={alreadyAdded}
                          onClick={() => {
                            setForm((current) => ({
                              ...current,
                              requiredParts: current.requiredParts.some((part) => part.itemId === suggestion.itemId)
                                ? current.requiredParts
                                : [...current.requiredParts, { itemId: suggestion.itemId, quantity: Math.max(1, suggestion.quantityRequired) }],
                            }));
                          }}
                        >
                          {alreadyAdded ? 'Added' : 'Add Part'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <Select onValueChange={v => addPart(v)}>
            <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Add spare part..." /></SelectTrigger>
            <SelectContent>
              {inventoryItems.filter(i => !form.requiredParts.some(p => p.itemId === i.id)).slice(0, 50).map(i => (
                <SelectItem key={i.id} value={i.id}>{i.itemName || i.name}{i.itemCode ? ` [${i.itemCode}]` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Required Tools */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1"><Hammer className="h-3.5 w-3.5" />Required Tools</Label>
          <div className="flex flex-wrap items-center gap-1.5 min-h-[44px] p-2 border rounded-md bg-white">
            {form.requiredTools.length === 0 && <span className="text-sm text-muted-foreground">Select tools...</span>}
            {form.requiredTools.map(tool => {
              const toolItem = toolsData.find(t => t.id === tool.toolId);
              return toolItem ? (
                <div key={tool.toolId} className="flex items-center gap-1">
                  <Badge variant="secondary" className="gap-1">
                    {toolItem.toolName || toolItem.name} <span className="font-semibold">x{tool.quantity}</span>
                    <button onClick={() => removeTool(tool.toolId)} className="ml-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-red-600"><X className="h-3 w-3" /></button>
                  </Badge>
                  <Input type="number" min={1} value={tool.quantity} onChange={e => updateToolQty(tool.toolId, Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-7 w-14 text-center text-xs px-1" />
                </div>
              ) : null;
            })}
          </div>
          <Select onValueChange={v => addTool(v)}>
            <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Add tool..." /></SelectTrigger>
            <SelectContent>
              {toolsData.filter(t => !form.requiredTools.some(to => to.toolId === t.id)).slice(0, 50).map(t => (
                <SelectItem key={t.id} value={t.id}>{t.toolName || t.name}{t.toolCode ? ` [${t.toolCode}]` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  const renderSection4_Safety = () => (
    <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-2 mb-4">
        <ShieldAlert className="h-4 w-4" />Safety Notes
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">Safety Notes</Label>
          <Textarea
            value={form.safetyNotes}
            onChange={e => setForm(f => ({ ...f, safetyNotes: e.target.value }))}
            placeholder="Any safety hazards, precautions, or lockout/tagout requirements..."
            rows={3}
          />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><HardHat className="h-3.5 w-3.5" />PPE Required</Label>
          <Input
            className="min-h-[44px]"
            value={form.ppeRequired}
            onChange={e => setForm(f => ({ ...f, ppeRequired: e.target.value }))}
            placeholder="e.g. Safety glasses, gloves, helmet, hearing protection"
          />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">General Notes</Label>
          <Textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Any additional notes or special instructions..."
            rows={2}
          />
        </div>
      </div>
    </div>
  );

  // ============================================================================
  // Desktop: All 4 sections in a scrollable ResponsiveDialog
  // ============================================================================

  const desktopContent = (
    <ScrollArea className="max-h-[70vh] pr-1">
      <div className="grid gap-5 py-2">
        {renderSection1_RequestInfo()}
        {renderSection2_WODetails()}
        {renderSection3_Resources()}
        {renderSection4_Safety()}
      </div>
    </ScrollArea>
  );

  const footer = (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
        disabled={loading || dropdownLoading}
        onClick={handleConvert}
      >
        {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Converting...</> : <><RefreshCw className="h-4 w-4 mr-1" />Create Work Order</>}
      </Button>
    </div>
  );

  // ============================================================================
  // Mobile: Stepper with 4 steps
  // ============================================================================

  const mobileContent = (stepKey: string) => {
    if (stepKey === 'info') {
      return (
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
                <p className="text-[10px] font-semibold uppercase text-blue-500 tracking-wider">Location</p>
                <p className="text-sm font-bold text-blue-900 mt-0.5">{mr.location || '-'}</p>
              </div>
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
      );
    }
    if (stepKey === 'details') {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Work Order Type</Label>
            <Select value={form.workOrderType} onValueChange={v => setForm(f => ({ ...f, workOrderType: v }))}>
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
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
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
              <Select value={form.tradeActivity} onValueChange={v => setForm(f => ({ ...f, tradeActivity: v }))}>
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
                value={form.estimatedHoursDisplay || form.estimatedHours}
                onChange={e => handleEstHoursChange(e.target.value)}
                placeholder="2.5 or 2:30"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Scheduled</Label>
              <DateTimePicker value={form.scheduledDate || undefined} onChange={v => setForm(f => ({ ...f, scheduledDate: v || '' }))} />
            </div>
          </div>
          {mr.assetId && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Affected Assembly / Component</Label>
              {componentsLoading ? (
                <div className="text-xs text-muted-foreground">Loading...</div>
              ) : availableComponents.length === 0 ? (
                <div className="text-xs text-muted-foreground">No components registered for this machine.</div>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-xl border p-2 space-y-1">
                  {availableComponents
                    .slice()
                    .sort((a: any, b: any) => componentLabel(a).localeCompare(componentLabel(b)))
                    .map((component: any) => (
                      <label key={component.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50">
                        <Checkbox
                          checked={form.componentIds.includes(component.id)}
                          onCheckedChange={(checked) => toggleComponent(component.id, checked === true)}
                        />
                        <span className="text-xs truncate">{componentLabel(component)}</span>
                      </label>
                    ))}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Delivery Date</Label>
            <DatePicker value={form.deliveryDate || undefined} onChange={v => setForm(f => ({ ...f, deliveryDate: v || '' }))} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium">Technical Description</Label>
            <Textarea
              className="rounded-xl min-h-[100px]"
              value={form.technicalDescription}
              onChange={e => setForm(f => ({ ...f, technicalDescription: e.target.value }))}
              placeholder="Detailed technical description..."
              rows={4}
            />
          </div>
        </div>
      );
    }
    if (stepKey === 'resources') {
      return (
        <div className="space-y-4">
          <WorkerAssignmentSelector
            selectedWorkerIds={form.selectedWorkerIds}
            teamLeaderId={form.teamLeaderId}
            onSelectedWorkersChange={(ids) => setForm(f => ({ ...f, selectedWorkerIds: ids }))}
            onTeamLeaderChange={(id) => setForm(f => ({ ...f, teamLeaderId: id }))}
            assignType={form.assignType}
            onAssignTypeChange={(type) => setForm(f => ({ ...f, assignType: type }))}
            label="Resource Assignment"
          />
          <Accordion type="multiple" className="space-y-2">
            <AccordionItem value="parts" className="border rounded-xl px-1">
              <AccordionTrigger className="text-xs font-medium py-3 px-2">
                <span className="flex items-center gap-1.5"><PackageSearch className="h-3.5 w-3.5" />Spare Parts {form.requiredParts.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5">{form.requiredParts.length}</Badge>}</span>
              </AccordionTrigger>
              <AccordionContent className="px-2 pb-3 space-y-2">
                {form.requiredParts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {form.requiredParts.map(part => {
                      const item = inventoryItems.find(i => i.id === part.itemId);
                      return item ? (
                        <div key={part.itemId} className="flex items-center gap-1">
                          <Badge variant="secondary" className="gap-1">
                            {item.itemName || item.name} <span className="font-semibold">x{part.quantity}</span>
                            <button onClick={() => removePart(part.itemId)} className="ml-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-red-600"><X className="h-3 w-3" /></button>
                          </Badge>
                          <Input type="number" min={1} value={part.quantity} onChange={e => updatePartQty(part.itemId, Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-7 w-14 text-center text-xs px-1" />
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
                <Select onValueChange={v => addPart(v)}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Add spare part..." /></SelectTrigger>
                  <SelectContent>
                    {inventoryItems.filter(i => !form.requiredParts.some(p => p.itemId === i.id)).slice(0, 50).map(i => (
                      <SelectItem key={i.id} value={i.id}>{i.itemName || i.name}{i.itemCode ? ` [${i.itemCode}]` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="tools" className="border rounded-xl px-1">
              <AccordionTrigger className="text-xs font-medium py-3 px-2">
                <span className="flex items-center gap-1.5"><Hammer className="h-3.5 w-3.5" />Tools {form.requiredTools.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5">{form.requiredTools.length}</Badge>}</span>
              </AccordionTrigger>
              <AccordionContent className="px-2 pb-3 space-y-2">
                {form.requiredTools.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {form.requiredTools.map(tool => {
                      const toolItem = toolsData.find(t => t.id === tool.toolId);
                      return toolItem ? (
                        <div key={tool.toolId} className="flex items-center gap-1">
                          <Badge variant="secondary" className="gap-1">
                            {toolItem.toolName || toolItem.name} <span className="font-semibold">x{tool.quantity}</span>
                            <button onClick={() => removeTool(tool.toolId)} className="ml-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-red-600"><X className="h-3 w-3" /></button>
                          </Badge>
                          <Input type="number" min={1} value={tool.quantity} onChange={e => updateToolQty(tool.toolId, Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-7 w-14 text-center text-xs px-1" />
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
                <Select onValueChange={v => addTool(v)}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Add tool..." /></SelectTrigger>
                  <SelectContent>
                    {toolsData.filter(t => !form.requiredTools.some(to => to.toolId === t.id)).slice(0, 50).map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.toolName || t.name}{t.toolCode ? ` [${t.toolCode}]` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      );
    }
    if (stepKey === 'safety') {
      return (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />Safety Information
            </h4>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Safety Notes</Label>
              <Textarea
                className="rounded-xl min-h-[100px]"
                value={form.safetyNotes}
                onChange={e => setForm(f => ({ ...f, safetyNotes: e.target.value }))}
                placeholder="Safety hazards, precautions, LOTO requirements..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1"><HardHat className="h-3.5 w-3.5" />PPE Required</Label>
              <Input
                className="h-12 rounded-xl"
                value={form.ppeRequired}
                onChange={e => setForm(f => ({ ...f, ppeRequired: e.target.value }))}
                placeholder="e.g. Safety glasses, gloves, helmet"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">General Notes</Label>
              <Textarea
                className="rounded-xl min-h-[80px]"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Additional notes or special instructions..."
                rows={2}
              />
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <>
      {/* Desktop: ResponsiveDialog with all 4 sections */}
      {!isMobile && (
        <ResponsiveDialog
          open={open}
          onOpenChange={onOpenChange}
          large
          desktopMaxWidth="sm:max-w-4xl"
          title={(
            <span className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-emerald-600" />
              Convert to Work Order
            </span>
          )}
          description="Create a comprehensive work order from this maintenance request."
          footer={footer}
        >
          {desktopContent}
        </ResponsiveDialog>
      )}

      {/* Mobile: Stepper bottom sheet */}
      {isMobile && (
        <MobileStepperSheet
          open={open}
          onOpenChange={onOpenChange}
          title="Convert to Work Order"
          description="Create a work order from this maintenance request."
          steps={[
            { key: 'info', label: 'Request', icon: FileText },
            { key: 'details', label: 'Details', icon: ClipboardCheck },
            { key: 'resources', label: 'Resources', icon: Users },
            { key: 'safety', label: 'Safety', icon: ShieldAlert },
          ]}
          actionLabel="Create Work Order"
          actionLoading={loading}
          onAction={handleConvert}
        >
          {mobileContent}
        </MobileStepperSheet>
      )}
    </>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function defaultForm(): ConvertForm {
  return {
    workOrderType: 'corrective',
    priority: 'medium',
    tradeActivity: 'mechanical',
    technicalDescription: '',
    scheduledDate: '',
    deliveryDate: '',
    estimatedHours: '',
    estimatedHoursDisplay: '',
    assignType: 'technician',
    selectedWorkerIds: [],
    teamLeaderId: '',
    requiredParts: [],
    requiredTools: [],
    componentIds: [],
    safetyNotes: '',
    ppeRequired: '',
    notes: '',
  };
}
