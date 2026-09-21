'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { format, formatDistanceToNow, differenceInDays, differenceInHours } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { ConvertMRToWODialog } from '@/components/shared/ConvertMRToWODialog';
import { DatePicker, DateRangePicker } from '@/components/ui/datetime-picker';
import { EmptyState, LoadingSkeleton, formatDate, formatCurrency, formatDuration } from '@/components/shared/helpers';
import {
  LayoutDashboard, GripVertical, ChevronLeft, ChevronRight, Clock, AlertTriangle,
  CheckCircle2, XCircle, Filter, Search, Plus, Users, Calendar, Wrench,
  ArrowRightLeft, BarChart3, Target, Timer, TrendingUp, ArrowDown,
  ArrowUp, Package, ClipboardList, Settings, Zap, CircleDot,
  Activity, UserCheck, AlertCircle, Eye, MoreHorizontal, Layers,
  Factory, Hammer, HardHat, Play, Pause, Square, RefreshCw, X,
  ChevronDown, GripHorizontal, Workflow, CalendarClock, Truck, DollarSign,
  ShieldCheck,
} from 'lucide-react';

import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  type UniqueIdentifier,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

const KANBAN_COLUMNS = [
  { key: 'approved', label: 'Approved', color: 'bg-sky-100 border-sky-200 text-sky-800', icon: CheckCircle2 },
  { key: 'assigned', label: 'Assigned', color: 'bg-violet-100 border-violet-200 text-violet-800', icon: UserCheck },
  { key: 'in_progress', label: 'In Progress', color: 'bg-amber-100 border-amber-200 text-amber-800', icon: Play },
  { key: 'verified', label: 'Verified', color: 'bg-orange-100 border-orange-200 text-orange-800', icon: ShieldCheck },
  { key: 'completed', label: 'Completed', color: 'bg-emerald-100 border-emerald-200 text-emerald-800', icon: CheckCircle2 },
] as const;

type KanbanStatus = typeof KANBAN_COLUMNS[number]['key'];

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Low', color: 'text-slate-600', bgColor: 'bg-slate-100 border-slate-300' },
  medium: { label: 'Medium', color: 'text-sky-700', bgColor: 'bg-sky-100 border-sky-300' },
  high: { label: 'High', color: 'text-amber-700', bgColor: 'bg-amber-100 border-amber-300' },
  critical: { label: 'Critical', color: 'text-red-700', bgColor: 'bg-red-100 border-red-300' },
};

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  return <Badge variant="outline" className={`${cfg.bgColor} ${cfg.color} text-xs font-medium`}>{cfg.label}</Badge>;
}

function SLAIndicator({ createdAt, priority }: { createdAt: string; priority: string }) {
  const hours = useMemo(() => {
    const slaMap: Record<string, number> = { low: 72, medium: 48, high: 24, critical: 8 };
    const sla = slaMap[priority] || 48;
    return differenceInHours(new Date(createdAt), new Date()) + sla;
  }, [createdAt, priority]);

  if (hours <= 0) {
    return (
      <TooltipProvider><Tooltip><TooltipTrigger asChild>
        <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
          <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span>
          BREACHED
        </span>
      </TooltipTrigger><TooltipContent>Breached by {formatDuration(Math.abs(hours))}</TooltipContent></Tooltip></TooltipProvider>
    );
  }
  if (hours <= 12) {
    return <span className="flex items-center gap-1 text-xs text-amber-600 font-medium"><Timer className="h-3 w-3" />{formatDuration(hours)}</span>;
  }
  return <span className="flex items-center gap-1 text-xs text-emerald-600"><Timer className="h-3 w-3" />{formatDuration(hours)}</span>;
}

// ============================================================================
// PLANNER WORKBENCH
// ============================================================================

export default function PlannerWorkbench() {
  const { hasPermission, isAdmin, user } = useAuthStore();

  // Data state
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [approvedMRs, setApprovedMRs] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Panel visibility
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // Filters
  const [woFilterPriority, setWoFilterPriority] = useState('all');
  const [woFilterPlant, setWoFilterPlant] = useState('all');
  const [woFilterTech, setWoFilterTech] = useState('all');
  const [woSearch, setWoSearch] = useState('');
  const [mrFilterPriority, setMrFilterPriority] = useState('all');
  const [mrSearch, setMrSearch] = useState('');

  // Selected items
  const [selectedMRs, setSelectedMRs] = useState<string[]>([]);
  const [selectedWOs, setSelectedWOs] = useState<string[]>([]);
  const [detailWO, setDetailWO] = useState<any>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  // Create WO dialog
  const [createWODialogOpen, setCreateWODialogOpen] = useState(false);
  const [createWOForm, setCreateWOForm] = useState({
    title: '', priority: 'medium', type: 'corrective', estimatedHours: '', plannedStart: '', notes: '',
  });
  const [createWOLoading, setCreateWOLoading] = useState(false);

  // Convert MR to WO dialog
  const [convertMR, setConvertMR] = useState<any>(null);

  // Work Package dialog
  const [workPackageDialogOpen, setWorkPackageDialogOpen] = useState(false);
  const [wpForm, setWpForm] = useState({ name: '', assignTo: '', scheduledDate: '', shift: 'day' });
  const [wpLoading, setWpLoading] = useState(false);
  const [workPackages, setWorkPackages] = useState<any[]>([]);
  const [wpLoadingList, setWpLoadingList] = useState(false);

  // STO / Shutdown state
  const [stoEvents, setStoEvents] = useState<any[]>([]);
  const [stoLoading, setStoLoading] = useState(false);
  const [selectedSTO, setSelectedSTO] = useState<any>(null);
  const [stoDetailOpen, setStoDetailOpen] = useState(false);
  const [stoDetailLoading, setStoDetailLoading] = useState(false);
  const [stoDetailData, setStoDetailData] = useState<any>(null);
  const [createSTODialogOpen, setCreateSTODialogOpen] = useState(false);
  const [createSTOForm, setCreateSTOForm] = useState({
    name: '', type: 'planned_shutdown', description: '', plannedStartDate: '',
    plannedEndDate: '', estimatedDurationHours: '', budgetAmount: '',
  });
  const [createSTOLoading, setCreateSTOLoading] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState('kanban');

  // DnD state
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [localKanbanData, setLocalKanbanData] = useState<Record<string, any[]>>({});
  const dndApiCalledRef = useRef(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [woRes, mrRes, userRes] = await Promise.all([
        api.get('/api/work-orders?limit=100'),
        api.get('/api/maintenance-requests?status=approved&limit=50'),
        api.get('/api/users?limit=100'),
      ]);
      if (woRes.success && woRes.data) setWorkOrders(woRes.data);
      if (mrRes.success && mrRes.data) {
        const approved = Array.isArray(mrRes.data) ? mrRes.data : [];
        setApprovedMRs(approved.filter((mr: any) => mr.status === 'approved'));
      }
      if (userRes.success && userRes.data) {
        const users = Array.isArray(userRes.data) ? userRes.data : [];
        setTechnicians(users.filter((u: any) => u.roles?.some((r: any) =>
          ['maintenance_technician', 'maintenance_supervisor', 'maintenance_manager'].includes(r.slug)
        )));
      }
    } catch (_e) {
      // Silent catch
    }
    setLoading(false);
  }, []);

  const fetchWorkPackages = useCallback(async () => {
    setWpLoadingList(true);
    try {
      const res = await api.get('/api/work-packages?limit=100');
      if (res.success && res.data) setWorkPackages(res.data);
    } catch (_e) {
      // Silent catch
    }
    setWpLoadingList(false);
  }, []);

  // Fetch STO events
  const fetchSTOEvents = useCallback(async () => {
    setStoLoading(true);
    try {
      const res = await api.get('/api/sto/events?limit=100');
      if (res.success && res.data) {
        setStoEvents(Array.isArray(res.data) ? res.data : res.data.events || []);
      }
    } catch (_e) {
      // Silent catch
    }
    setStoLoading(false);
  }, []);

  // View STO detail
  const handleViewSTO = useCallback(async (event: any) => {
    setSelectedSTO(event);
    setStoDetailOpen(true);
    setStoDetailLoading(true);
    setStoDetailData(null);
    try {
      const [detailRes, milestoneRes] = await Promise.all([
        api.get(`/api/sto/events/${event.id}`),
        api.get(`/api/sto/events/${event.id}/milestones`).catch(() => ({ success: false })),
      ]);
      if (detailRes.success && detailRes.data) setStoDetailData(detailRes.data);
      if (milestoneRes.success && milestoneRes.data) {
        setStoDetailData(prev => prev ? { ...prev, milestones: milestoneRes.data } : null);
      }
    } catch (_e) {
      toast.error('Failed to load shutdown details');
    }
    setStoDetailLoading(false);
  }, []);

  // Create STO event
  const handleCreateSTO = useCallback(async () => {
    if (!createSTOForm.name.trim()) {
      toast.error('Shutdown name is required');
      return;
    }
    setCreateSTOLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: createSTOForm.name,
        type: createSTOForm.type,
        plantId: user?.plantId || undefined,
        description: createSTOForm.description || null,
        plannedStartDate: createSTOForm.plannedStartDate ? new Date(createSTOForm.plannedStartDate).toISOString() : null,
        plannedEndDate: createSTOForm.plannedEndDate ? new Date(createSTOForm.plannedEndDate).toISOString() : null,
        estimatedDurationHours: createSTOForm.estimatedDurationHours ? parseFloat(createSTOForm.estimatedDurationHours) : null,
        budgetAmount: createSTOForm.budgetAmount ? parseFloat(createSTOForm.budgetAmount) : null,
      };
      const res = await api.post('/api/sto/events', payload);
      if (res.success) {
        toast.success('Shutdown event created successfully');
        setCreateSTODialogOpen(false);
        setCreateSTOForm({ name: '', type: 'planned_shutdown', description: '', plannedStartDate: '', plannedEndDate: '', estimatedDurationHours: '', budgetAmount: '' });
        fetchSTOEvents();
      } else {
        toast.error(res.error || 'Failed to create shutdown event');
      }
    } catch (_e) {
      toast.error('Failed to create shutdown event');
    }
    setCreateSTOLoading(false);
  }, [createSTOForm, fetchSTOEvents, user]);

  useEffect(() => { fetchData(); fetchWorkPackages(); fetchSTOEvents(); }, [fetchData, fetchWorkPackages, fetchSTOEvents, refreshKey]);

  // Filtered WOs for Kanban
  const filteredWOs = useMemo(() => {
    return workOrders.filter(wo => {
      if (woFilterPriority !== 'all' && wo.priority !== woFilterPriority) return false;
      if (woFilterPlant !== 'all' && wo.plantId !== woFilterPlant) return false;
      if (woFilterTech !== 'all' && wo.assignedTo?.id !== woFilterTech) return false;
      if (woSearch) {
        const q = woSearch.toLowerCase();
        if (!wo.woNumber?.toLowerCase().includes(q) && !wo.title?.toLowerCase().includes(q) && !wo.assetName?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [workOrders, woFilterPriority, woFilterPlant, woFilterTech, woSearch]);

  // Filtered MRs for Planning Queue
  const filteredMRs = useMemo(() => {
    return approvedMRs.filter(mr => {
      if (mrFilterPriority !== 'all' && mr.priority !== mrFilterPriority) return false;
      if (mrSearch) {
        const q = mrSearch.toLowerCase();
        if (!mr.title?.toLowerCase().includes(q) && !mr.requestNumber?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [approvedMRs, mrFilterPriority, mrSearch]);

  // Group WOs by kanban column
  const kanbanData = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    KANBAN_COLUMNS.forEach(col => { grouped[col.key] = []; });
    filteredWOs.forEach(wo => {
      // Map all real schema statuses to the appropriate kanban column.
      // Real statuses: draft, requested, approved, planned, assigned, in_progress,
      //                waiting_parts, on_hold, completed, verified, closed, cancelled
      const status = (() => {
        switch (wo.status) {
          case 'approved':
          case 'requested':
          case 'planned':
            return 'approved';
          case 'assigned':
            return 'assigned';
          case 'in_progress':
          case 'waiting_parts':
          case 'on_hold':
            return 'in_progress';
          case 'verified':
            return 'verified';
          case 'completed':
          case 'closed':
            return 'completed';
          default:
            // draft, cancelled, or unknown — not shown in kanban
            return null;
        }
      })();
      if (status && grouped[status]) grouped[status].push(wo);
    });
    return grouped;
  }, [filteredWOs]);

  // Backlog aging data
  const backlogAging = useMemo(() => {
    const openWOs = workOrders.filter(wo => wo.status !== 'completed' && wo.status !== 'closed');
    const brackets = [
      { label: '0-7 days', min: 0, max: 7, color: 'bg-emerald-100 text-emerald-800' },
      { label: '8-14 days', min: 8, max: 14, color: 'bg-sky-100 text-sky-800' },
      { label: '15-30 days', min: 15, max: 30, color: 'bg-amber-100 text-amber-800' },
      { label: '31-60 days', min: 31, max: 60, color: 'bg-orange-100 text-orange-800' },
      { label: '60+ days', min: 61, max: 999, color: 'bg-red-100 text-red-800' },
    ];
    return brackets.map(b => {
      const items = openWOs.filter(wo => {
        const days = differenceInDays(new Date(), new Date(wo.createdAt));
        return days >= b.min && days <= b.max;
      });
      return { ...b, count: items.length, items };
    });
  }, [workOrders]);

  // Capacity planning data for technicians
  const techCapacity = useMemo(() => {
    return technicians.map(tech => {
      const assignedWOs = workOrders.filter(wo =>
        wo.assignedTo?.id === tech.id && !['completed', 'closed'].includes(wo.status)
      );
      const totalHours = assignedWOs.reduce((sum: number, wo: any) => sum + (wo.estimatedHours || 4), 0);
      const maxHours = 40;
      const utilization = Math.min(100, Math.round((totalHours / maxHours) * 100));
      return {
        ...tech,
        assignedCount: assignedWOs.length,
        totalHours,
        utilization,
        overAllocated: utilization > 100,
      };
    });
  }, [technicians, workOrders]);

  // Stats
  const stats = useMemo(() => ({
    totalOpen: workOrders.filter(wo => !['completed', 'closed'].includes(wo.status)).length,
    inProgress: workOrders.filter(wo => wo.status === 'in_progress').length,
    awaitingMR: approvedMRs.length,
    overdue: workOrders.filter(wo => {
      if (!wo.plannedEnd || ['completed', 'closed'].includes(wo.status)) return false;
      return new Date(wo.plannedEnd) < new Date();
    }).length,
    completed: workOrders.filter(wo => wo.status === 'completed').length,
  }), [workOrders, approvedMRs]);

  // Handlers
  const handleCreateWO = async () => {
    if (!createWOForm.title.trim()) { toast.error('Title is required'); return; }
    setCreateWOLoading(true);
    const payload: any = { title: createWOForm.title, priority: createWOForm.priority, type: createWOForm.type };
    if (createWOForm.estimatedHours) payload.estimatedHours = parseFloat(createWOForm.estimatedHours);
    if (createWOForm.plannedStart) payload.plannedStart = createWOForm.plannedStart;
    if (createWOForm.notes) payload.notes = createWOForm.notes;
    const res = await api.post('/api/work-orders', payload);
    if (res.success) {
      toast.success('Work order created');
      setCreateWODialogOpen(false);
      setCreateWOForm({ title: '', priority: 'medium', type: 'corrective', estimatedHours: '', plannedStart: '', notes: '' });
      setRefreshKey(k => k + 1);
    } else {
      toast.error(res.error || 'Failed to create work order');
    }
    setCreateWOLoading(false);
  };

  const handleCreateWOFromMR = (mrId: string) => {
    const mr = approvedMRs.find(m => m.id === mrId);
    if (mr) setConvertMR(mr);
  };

  const handleConvertSuccess = () => {
    setConvertMR(null);
    setRefreshKey(k => k + 1);
    toast.success('Work order created from maintenance request');
  };

  const handleCreateWorkPackage = async () => {
    if (!wpForm.name.trim()) { toast.error('Package name is required'); return; }
    if (selectedWOs.length === 0) { toast.error('Select at least one work order'); return; }
    setWpLoading(true);
    const res = await api.post('/api/work-packages', {
      name: wpForm.name,
      assignedToId: wpForm.assignTo || undefined,
      scheduledDate: wpForm.scheduledDate || undefined,
      shift: wpForm.shift !== 'day' ? wpForm.shift : undefined,
      workOrderIds: selectedWOs,
    });
    if (res.success) {
      toast.success(`Work package "${wpForm.name}" created with ${selectedWOs.length} WOs`);
      setWorkPackageDialogOpen(false);
      setWpForm({ name: '', assignTo: '', scheduledDate: '', shift: 'day' });
      setSelectedWOs([]);
      fetchWorkPackages();
    } else {
      toast.error(res.error || 'Failed to create work package');
    }
    setWpLoading(false);
  };

  const toggleMRSelection = (id: string) => {
    setSelectedMRs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleWOSelection = (id: string) => {
    setSelectedWOs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // --- DnD Handlers ---

  // Find which column a WO id belongs to
  const findColumnForId = useCallback((id: UniqueIdentifier): string | undefined => {
    for (const col of KANBAN_COLUMNS) {
      const items = localKanbanData[col.key];
      if (items && items.some(wo => wo.id === id)) return col.key;
    }
    return undefined;
  }, [localKanbanData]);

  // Find the WO data object for a given id
  const findWOById = useCallback((id: UniqueIdentifier): any => {
    for (const col of KANBAN_COLUMNS) {
      const items = localKanbanData[col.key];
      if (items) {
        const found = items.find(wo => wo.id === id);
        if (found) return found;
      }
    }
    return null;
  }, [localKanbanData]);

  // Sync local kanban data from kanbanData whenever it changes
  useEffect(() => {
    setLocalKanbanData(prev => {
      const next: Record<string, any[]> = {};
      let changed = false;
      for (const col of KANBAN_COLUMNS) {
        const source = kanbanData[col.key] || [];
        const prevItems = prev[col.key] || [];
        // Use source when source has different length or if local has stale items
        if (source.length !== prevItems.length) {
          next[col.key] = source;
          changed = true;
        } else {
          next[col.key] = prevItems;
        }
      }
      // On first load, always use kanbanData
      if (Object.keys(prev).length === 0) {
        return { ...kanbanData };
      }
      return changed ? next : prev;
    });
  }, [kanbanData]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id);
    dndApiCalledRef.current = false;
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeColumn = findColumnForId(active.id);
    const overColumn = findColumnForId(over.id);
    if (!activeColumn || !overColumn) return;

    setLocalKanbanData(prev => {
      const sourceItems = [...(prev[activeColumn] || [])];
      const destItems = [...(prev[overColumn] || [])];
      const activeIdx = sourceItems.findIndex(wo => wo.id === active.id);
      if (activeIdx === -1) return prev;

      // Remove from source
      const [movedItem] = sourceItems.splice(activeIdx, 1);

      if (activeColumn === overColumn) {
        // Same column reorder
        const overIdx = destItems.findIndex(wo => wo.id === over.id);
        destItems.splice(overIdx, 0, movedItem);
        return { ...prev, [activeColumn]: destItems };
      }

      // Cross-column move: insert before over item or at end
      const overIdx = destItems.findIndex(wo => wo.id === over.id);
      if (overIdx === -1) {
        destItems.push(movedItem);
      } else {
        destItems.splice(overIdx, 0, movedItem);
      }

      return {
        ...prev,
        [activeColumn]: sourceItems,
        [overColumn]: destItems,
      };
    });
  }, [findColumnForId]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    if (dndApiCalledRef.current) return;

    const sourceColumn = findColumnForId(active.id);
    const destColumn = findColumnForId(over.id);
    if (!sourceColumn || !destColumn) return;

    // Determine if this was a cross-column move (status change)
    const isCrossColumn = sourceColumn !== destColumn;

    if (isCrossColumn) {
      dndApiCalledRef.current = true;
      const woId = String(active.id);
      const targetStatus = destColumn;

      try {
        let endpoint = '';
        let statusLabel = '';

        switch (targetStatus) {
          case 'in_progress':
            endpoint = `/api/work-orders/${woId}/start`;
            statusLabel = 'In Progress';
            break;
          case 'verified':
            endpoint = `/api/work-orders/${woId}/verify`;
            statusLabel = 'Verified';
            break;
          case 'completed':
            endpoint = `/api/work-orders/${woId}/complete`;
            statusLabel = 'Completed';
            break;
          case 'assigned':
            endpoint = `/api/work-orders/${woId}/assign`;
            statusLabel = 'Assigned';
            break;
          case 'approved':
            // No specific API for moving back to approved, just update status
            statusLabel = 'Approved';
            break;
          default:
            statusLabel = targetStatus;
        }

        if (endpoint) {
          const res = await api.post(endpoint, {});
          if (res.success) {
            toast.success(`WO moved to ${statusLabel}`);
            setRefreshKey(k => k + 1);
          } else {
            toast.error(res.error || `Failed to move WO to ${statusLabel}`);
            setRefreshKey(k => k + 1); // Revert
          }
        } else {
          // Just refresh to reflect the move
          setRefreshKey(k => k + 1);
        }
      } catch {
        toast.error('Failed to update work order status');
        setRefreshKey(k => k + 1); // Revert
      }
    }
  }, [findColumnForId]);

  // The WO card being dragged for DragOverlay
  const activeWO = activeId ? findWOById(activeId) : null;

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-emerald-600" />
            Planner Workbench
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Plan, schedule, and manage work orders from a single workspace</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <Button variant="outline" size="sm" onClick={() => setLeftPanelOpen(!leftPanelOpen)}>
            <ChevronLeft className={`h-4 w-4 transition-transform ${leftPanelOpen ? '' : 'rotate-180'}`} />
            <span className="hidden sm:inline ml-1">Queue</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRightPanelOpen(!rightPanelOpen)}>
            <span className="hidden sm:inline mr-1">Capacity</span>
            <ChevronRight className={`h-4 w-4 transition-transform ${rightPanelOpen ? '' : 'rotate-180'}`} />
          </Button>
          {hasPermission('work_orders.create') && (
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" onClick={() => setCreateWODialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />New WO
            </Button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: 'Open WOs', value: stats.totalOpen, className: 'bg-slate-100 text-slate-700 border-slate-200' },
          { label: 'In Progress', value: stats.inProgress, className: 'bg-amber-50 text-amber-700 border-amber-200' },
          { label: 'Awaiting Planning', value: stats.awaitingMR, className: 'bg-sky-50 text-sky-700 border-sky-200' },
          { label: 'Overdue', value: stats.overdue, className: 'bg-red-50 text-red-700 border-red-200' },
          { label: 'Completed (MTD)', value: stats.completed, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
        ].map(s => (
          <div key={s.label} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${s.className} transition-colors`}>
            {s.value} {s.label}
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="kanban"><LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />Kanban Board</TabsTrigger>
          <TabsTrigger value="work-package"><Layers className="h-3.5 w-3.5 mr-1.5" />Work Packages</TabsTrigger>
          <TabsTrigger value="backlog"><ArrowDown className="h-3.5 w-3.5 mr-1.5" />Backlog Aging</TabsTrigger>
          <TabsTrigger value="shutdown"><CalendarClock className="h-3.5 w-3.5 mr-1.5" />Shutdowns</TabsTrigger>
        </TabsList>

        {/* KANBAN TAB */}
        <TabsContent value="kanban">
          <div className="flex min-w-0 gap-4 mt-4">
            {/* LEFT: Planning Queue */}
            {leftPanelOpen && (
              <div className="w-72 shrink-0 hidden lg:block">
                <Card className="border border-border/60 shadow-sm sticky top-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-sky-600" />
                      Planning Queue
                      <Badge variant="secondary" className="ml-auto text-xs">{filteredMRs.length}</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input placeholder="Search..." value={mrSearch} onChange={e => setMrSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                      </div>
                      <Select value={mrFilterPriority} onValueChange={setMrFilterPriority}>
                        <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Med</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[calc(100vh-340px)]">
                      <div className="p-2 space-y-1.5">
                        {filteredMRs.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground text-xs">No approved requests</div>
                        ) : filteredMRs.map(mr => (
                          <div
                            key={mr.id}
                            className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                              selectedMRs.includes(mr.id) ? 'border-emerald-400 bg-emerald-50/50' : 'border-transparent hover:bg-muted/50'
                            }`}
                            onClick={() => toggleMRSelection(mr.id)}
                          >
                            <div className="flex items-start gap-2">
                              <GripVertical className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[10px] text-muted-foreground">{mr.requestNumber}</span>
                                  <PriorityBadge priority={mr.priority} />
                                </div>
                                <p className="text-xs font-medium mt-1 truncate">{mr.title}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-[10px] text-muted-foreground">{mr.assetName || 'N/A'}</span>
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                  <SLAIndicator createdAt={mr.createdAt} priority={mr.priority} />
                                  <Button size="sm" className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2"
                                    onClick={(e) => { e.stopPropagation(); handleCreateWOFromMR(mr.id); }}>
                                    Create WO
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* MAIN: Kanban Board */}
            <div className="flex-1 min-w-0">
              {/* Filters */}
              <div className="filter-row flex items-center gap-2 flex-wrap mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search WOs..." value={woSearch} onChange={e => setWoSearch(e.target.value)} className="pl-9" />
                </div>
                <Select value={woFilterPriority} onValueChange={setWoFilterPriority}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                {selectedWOs.length > 0 && (
                  <Button variant="outline" size="sm" className="gap-1.5 border-emerald-300 text-emerald-700" onClick={() => setWorkPackageDialogOpen(true)}>
                    <Layers className="h-3.5 w-3.5" /> Package ({selectedWOs.length})
                  </Button>
                )}
              </div>

              {/* Kanban Columns — DnD enabled */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-5">
                  {KANBAN_COLUMNS.map(col => {
                    const items = localKanbanData[col.key] || [];
                    return (
                      <KanbanColumn
                        key={col.key}
                        id={col.key}
                        column={col}
                        items={items}
                        selectedWOs={selectedWOs}
                        onToggleSelect={toggleWOSelection}
                        onCardClick={(wo) => { setDetailWO(wo); setDetailSheetOpen(true); }}
                      />
                    );
                  })}
                </div>
                <DragOverlay>
                  {activeWO ? (
                    <div className="w-64 opacity-90 rotate-2">
                      <WOCard
                        wo={activeWO}
                        selected={false}
                        onToggleSelect={() => {}}
                        onClick={() => {}}
                        isDragging
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>

            {/* RIGHT: Capacity Planning */}
            {rightPanelOpen && (
              <div className="w-72 shrink-0 hidden min-[1800px]:block">
                <Card className="border border-border/60 shadow-sm sticky top-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4 text-emerald-600" />
                      Capacity Planning
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[calc(100vh-340px)]">
                      <div className="p-2 space-y-2">
                        {/* Technician Cards */}
                        {techCapacity.map(tech => (
                          <div key={tech.id} className={`p-2.5 rounded-lg border ${tech.overAllocated ? 'border-red-200 bg-red-50/30' : 'border-transparent hover:bg-muted/50'}`}>
                            <div className="flex items-center gap-2">
                              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${tech.overAllocated ? 'bg-red-500' : 'bg-emerald-500'}`}>
                                {tech.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{tech.fullName}</p>
                                <p className="text-[10px] text-muted-foreground">{tech.assignedCount} WOs · {formatDuration(tech.totalHours || 0)}</p>
                              </div>
                              {tech.overAllocated && (
                                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                </TooltipTrigger><TooltipContent>Over-allocated</TooltipContent></Tooltip></TooltipProvider>
                              )}
                            </div>
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                                <span>Utilization</span>
                                <span className={tech.overAllocated ? 'text-red-600 font-medium' : ''}>{tech.utilization}%</span>
                              </div>
                              <Progress value={Math.min(tech.utilization, 100)} className="h-1.5" />
                            </div>
                            {/* Simple shift grid M-F */}
                            <div className="grid grid-cols-5 gap-0.5 mt-2">
                              {['M', 'T', 'W', 'T', 'F'].map((day, i) => (
                                <div key={i} className="h-5 rounded text-[8px] flex items-center justify-center font-medium bg-emerald-100 text-emerald-700">
                                  {day}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        {techCapacity.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground text-xs">No technicians found</div>
                        )}

                        {/* Skill Matching Suggestions */}
                        <Separator className="my-2" />
                        <div className="px-1">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Skill Match Suggestions</p>
                          <div className="space-y-1.5">
                            {workOrders.filter(wo => !wo.assignedTo && !['completed', 'closed'].includes(wo.status)).slice(0, 3).map(wo => (
                              <div key={wo.id} className="p-2 rounded border border-dashed border-emerald-200 bg-emerald-50/30">
                                <p className="text-[10px] font-medium truncate">{wo.title}</p>
                                <p className="text-[10px] text-muted-foreground">Priority: {wo.priority} · Est: {formatDuration(wo.estimatedHours || 0)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </TabsContent>

        {/* WORK PACKAGE TAB */}
        <TabsContent value="work-package">
          {/* Existing Work Packages */}
          {workPackages.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Layers className="h-4 w-4 text-emerald-600" />Existing Work Packages</h3>
                <Badge variant="outline" className="text-xs">{workPackages.length} packages</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {workPackages.map((wp: any) => {
                  const wpStatusColor: Record<string, string> = {
                    planned: 'bg-sky-100 text-sky-700 border-sky-200',
                    in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
                    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                    cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
                  };
                  const colorCls = wpStatusColor[wp.status] || 'bg-slate-100 text-slate-600 border-slate-200';
                  return (
                    <Card key={wp.id} className={`border ${wp.status === 'cancelled' ? 'opacity-60' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold truncate">{wp.name}</p>
                              <Badge variant="outline" className={`text-[10px] ${colorCls}`}>
                                {wp.status?.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            {wp.assignee && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <UserCheck className="h-3 w-3" />{wp.assignee.fullName}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" />{wp._count?.workOrders || wp.workOrders?.length || 0} WOs</span>
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(wp.totalEstimatedHours || 0)} est</span>
                              {wp.scheduledDate && (
                                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(wp.scheduledDate)}</span>
                              )}
                              {wp.shift && (
                                <Badge variant="outline" className="text-[10px]">{wp.shift}</Badge>
                              )}
                            </div>
                          </div>
                          {(isAdmin() || hasPermission('work_orders.delete')) && wp.status !== 'in_progress' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 shrink-0"
                              onClick={async () => {
                                try {
                                  const res = await api.delete(`/api/work-packages/${wp.id}`);
                                  if (res.success) {
                                    toast.success(res.message || 'Work package deleted');
                                    fetchWorkPackages();
                                  } else {
                                    toast.error(res.error || 'Failed to delete');
                                  }
                                } catch {
                                  toast.error('Failed to delete work package');
                                }
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
          {wpLoadingList && <Skeleton className="h-24 mt-4" />}
          {!wpLoadingList && workPackages.length === 0 && (
            <div className="mt-4 text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
              <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No work packages yet. Select work orders below to create one.</p>
            </div>
          )}

          <Card className="border border-border/60 shadow-sm mt-4">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4 text-emerald-600" />Work Package Builder</CardTitle>
                  <CardDescription className="text-xs mt-1">Group multiple work orders into a single coordinated work package</CardDescription>
                </div>
                {selectedWOs.length > 0 && (
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white sm:w-auto" size="sm" onClick={() => setWorkPackageDialogOpen(true)}>
                    <Layers className="h-4 w-4 mr-1.5" />Create Package ({selectedWOs.length})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search WOs to add..." value={woSearch} onChange={e => setWoSearch(e.target.value)} className="pl-9" />
                </div>
                {selectedWOs.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedWOs([])}>
                    <X className="h-3.5 w-3.5 mr-1" />Clear Selection
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredWOs.filter(wo => !['completed', 'closed'].includes(wo.status)).map(wo => (
                  <div
                    key={wo.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedWOs.includes(wo.id)
                        ? 'border-emerald-400 bg-emerald-50/50 ring-1 ring-emerald-200'
                        : 'border-border/60 hover:border-emerald-200 hover:shadow-sm'
                    }`}
                    onClick={() => toggleWOSelection(wo.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">{wo.woNumber}</span>
                      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${selectedWOs.includes(wo.id) ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/30'}`}>
                        {selectedWOs.includes(wo.id) && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                    <p className="text-sm font-medium mt-1.5 truncate">{wo.title}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <PriorityBadge priority={wo.priority} />
                      <span className="text-[10px] text-muted-foreground">{wo.assetName || 'No asset'}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(wo.estimatedHours || 0)}</span>
                      {wo.assignee && <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" />{wo.assignee.fullName}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {selectedWOs.length > 1 && (
                <Card className="mt-4 border-emerald-200 bg-emerald-50/30">
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold text-emerald-800 mb-2">Dependency Manager</p>
                    <p className="text-xs text-muted-foreground mb-3">Define execution order for selected work orders</p>
                    <div className="space-y-2">
                      {selectedWOs.map((woId, idx) => {
                        const wo = workOrders.find(w => w.id === woId);
                        if (!wo) return null;
                        return (
                          <div key={woId} className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono text-xs">{wo.woNumber}</Badge>
                            <span className="text-xs truncate flex-1">{wo.title}</span>
                            {idx > 0 && <ArrowDown className="h-3.5 w-3.5 text-emerald-600" />}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* BACKLOG AGING TAB */}
        <TabsContent value="backlog">
          <Card className="border border-border/60 shadow-sm mt-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ArrowDown className="h-4 w-4 text-amber-600" />Backlog Aging Analysis</CardTitle>
              <CardDescription className="text-xs">Open work orders by age bracket with urgency indicators</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-3 xl:grid-cols-5">
                {backlogAging.map(bracket => (
                  <div key={bracket.label} className={`text-center p-3 rounded-lg ${bracket.color}`}>
                    <p className="text-2xl font-bold">{bracket.count}</p>
                    <p className="text-[11px] font-medium mt-1">{bracket.label}</p>
                  </div>
                ))}
              </div>

              {/* Detail Table */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>WO #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Age (days)</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead className="hidden md:table-cell">Asset</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backlogAging.flatMap(b => b.items).length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground text-sm">No backlog items</TableCell></TableRow>
                    ) : backlogAging.flatMap(b => b.items.map(wo => {
                      const days = differenceInDays(new Date(), new Date(wo.createdAt));
                      const bracket = backlogAging.find(b => days >= b.min && days <= b.max);
                      return (
                        <TableRow key={wo.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => { setDetailWO(wo); setDetailSheetOpen(true); }}>
                          <TableCell className="font-mono text-xs">{wo.woNumber}</TableCell>
                          <TableCell className="font-medium text-sm max-w-[200px] truncate">{wo.title}</TableCell>
                          <TableCell><PriorityBadge priority={wo.priority} /></TableCell>
                          <TableCell>
                            <Badge variant="outline" className={bracket?.color || ''}>{days}d</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{wo.assignee?.fullName || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground hidden md:table-cell max-w-[150px] truncate">{wo.assetName || '—'}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setDetailWO(wo); setDetailSheetOpen(true); }}>
                              <Eye className="h-3 w-3 mr-1" />View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    }))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SHUTDOWN COORDINATION TAB */}
        <TabsContent value="shutdown">
          <Card className="border border-border/60 shadow-sm mt-4">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4 text-red-600" />Shutdown Coordination</CardTitle>
                  <CardDescription className="text-xs">Planned shutdowns, turnarounds, and outages with associated work orders</CardDescription>
                </div>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white sm:w-auto" size="sm" onClick={() => setCreateSTODialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />Plan Shutdown
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {stoLoading ? <div className="space-y-3"><Skeleton className="h-24 w-full rounded-lg" /><Skeleton className="h-24 w-full rounded-lg" /><Skeleton className="h-24 w-full rounded-lg" /></div> : stoEvents.length === 0 ? (
                <EmptyState icon={CalendarClock} title="No shutdown events" description='Click "Plan Shutdown" to create a new shutdown/turnaround/outage event.' />
              ) : (
                <div className="space-y-4">
                  {stoEvents.map((event: any) => {
                    const isCritical = (event.scopeJson as any)?.criticalPath === true || (event.milestonesJson as any)?.length > 0;
                    const stoStatusColor: Record<string, string> = {
                      planning: 'bg-amber-50 text-amber-700 border-amber-200',
                      scheduled: 'bg-sky-50 text-sky-700 border-sky-200',
                      pre_shutdown: 'bg-orange-50 text-orange-700 border-orange-200',
                      in_progress: 'bg-red-50 text-red-700 border-red-200',
                      startup: 'bg-violet-50 text-violet-700 border-violet-200',
                      completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
                    };
                    const typeLabel: Record<string, string> = {
                      planned_shutdown: 'Planned Shutdown',
                      turnaround: 'Turnaround',
                      forced_outage: 'Forced Outage',
                      emergency: 'Emergency',
                    };
                    return (
                      <Card key={event.id} className={`border ${isCritical ? 'border-red-200 bg-red-50/20' : 'border-border/60'} hover:shadow-md transition-shadow`}>
                        <CardContent className="p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isCritical ? 'bg-red-100 text-red-600' : 'bg-sky-100 text-sky-600'}`}>
                              {isCritical ? <AlertCircle className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-semibold">{event.name}</h3>
                                {event.stoNumber && <Badge variant="outline" className="font-mono text-[10px]">{event.stoNumber}</Badge>}
                                <Badge variant="outline" className={`text-[10px] ${stoStatusColor[event.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                  {(event.status || '').replace(/_/g, ' ').toUpperCase()}
                                </Badge>
                                {isCritical && <Badge variant="destructive" className="text-[10px]">CRITICAL PATH</Badge>}
                              </div>
                              <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Wrench className="h-3 w-3" />
                                  {typeLabel[event.type] || event.type}
                                </span>
                                {event.plannedStartDate && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {formatDate(event.plannedStartDate)}{event.plannedEndDate ? ` — ${formatDate(event.plannedEndDate)}` : ''}
                                  </span>
                                )}
                                {event.estimatedDurationHours != null && (
                                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(event.estimatedDurationHours || 0)} est.</span>
                                )}
                                {event.budgetAmount != null && event.budgetAmount > 0 && (
                                  <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(event.budgetAmount)}</span>
                                )}
                              </div>
                              {event.description && (
                                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{event.description}</p>
                              )}
                            </div>
                            <Button variant="outline" size="sm" className="h-8 w-full shrink-0 sm:w-auto" onClick={() => handleViewSTO(event)}>
                              <Eye className="h-3.5 w-3.5 mr-1" />View
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* WO Detail Sheet */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="sm:max-w-lg w-full overflow-y-auto">
          {detailWO && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-emerald-600" />
                  {detailWO.woNumber}
                </SheetTitle>
                <SheetDescription>{detailWO.title}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs text-muted-foreground">Status</Label><p className="text-sm mt-1 capitalize">{detailWO.status?.replace(/_/g, ' ')}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Priority</Label><div className="mt-1"><PriorityBadge priority={detailWO.priority} /></div></div>
                  <div><Label className="text-xs text-muted-foreground">Type</Label><p className="text-sm mt-1 capitalize">{detailWO.type || 'Corrective'}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Asset</Label><p className="text-sm mt-1">{detailWO.assetName || 'N/A'}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Assigned To</Label><p className="text-sm mt-1">{detailWO.assignee?.fullName || 'Unassigned'}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Est. Hours</Label><p className="text-sm mt-1">{formatDuration(detailWO.estimatedHours || 0)}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Planned Start</Label><p className="text-sm mt-1">{detailWO.plannedStart ? formatDate(detailWO.plannedStart) : '—'}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Created</Label><p className="text-sm mt-1">{formatDate(detailWO.createdAt)}</p></div>
                </div>
                {detailWO.description && (
                  <div><Label className="text-xs text-muted-foreground">Description</Label><p className="text-sm mt-1 bg-muted/50 rounded-lg p-3">{detailWO.description}</p></div>
                )}
                {detailWO.safetyNotes && (
                  <div><Label className="text-xs text-muted-foreground">Safety Notes</Label><p className="text-sm mt-1 bg-amber-50 rounded-lg p-3 text-amber-800">{detailWO.safetyNotes}</p></div>
                )}
                {/* Team Members */}
                {detailWO.teamMembers && detailWO.teamMembers.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Team Members</Label>
                    <div className="mt-1 space-y-1">
                      {detailWO.teamMembers.map((tm: any) => (
                        <div key={tm.id} className="flex items-center gap-2 text-sm">
                          <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-700">
                            {tm.user?.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                          </div>
                          <span>{tm.user?.fullName}</span>
                          <Badge variant="outline" className="text-[10px]">{tm.role?.replace(/_/g, ' ')?.replace(/\b\w/g, c => c.toUpperCase())}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create WO Dialog */}
      <ResponsiveDialog
        open={createWODialogOpen}
        onOpenChange={setCreateWODialogOpen}
        title="Create Work Order"
        footer={<Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreateWO} disabled={createWOLoading}>{createWOLoading ? 'Creating...' : 'Create WO'}</Button>}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={createWOForm.title} onChange={e => setCreateWOForm(f => ({ ...f, title: e.target.value }))} placeholder="Work order title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={createWOForm.priority} onValueChange={v => setCreateWOForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={createWOForm.type} onValueChange={v => setCreateWOForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corrective">Corrective</SelectItem>
                  <SelectItem value="preventive">Preventive</SelectItem>
                  <SelectItem value="predictive">Predictive</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Est. Hours</Label>
              <Input type="number" value={createWOForm.estimatedHours} onChange={e => setCreateWOForm(f => ({ ...f, estimatedHours: e.target.value }))} placeholder="4" />
            </div>
            <DatePicker label="Planned Start" value={createWOForm.plannedStart || undefined} onChange={v => setCreateWOForm(f => ({ ...f, plannedStart: v || '' }))} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={createWOForm.notes} onChange={e => setCreateWOForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." rows={3} />
          </div>
        </div>
      </ResponsiveDialog>

      {/* Work Package Dialog */}
      <ResponsiveDialog
        open={workPackageDialogOpen}
        onOpenChange={setWorkPackageDialogOpen}
        title="Create Work Package"
        footer={<Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreateWorkPackage} disabled={wpLoading}>{wpLoading ? 'Creating...' : 'Create Package'}</Button>}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Package Name *</Label>
            <Input value={wpForm.name} onChange={e => setWpForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Line 3 Overhaul" />
          </div>
          <div className="space-y-2">
            <Label>Assign To</Label>
            <Select value={wpForm.assignTo} onValueChange={v => setWpForm(f => ({ ...f, assignTo: v }))}>
              <SelectTrigger><SelectValue placeholder="Select technician..." /></SelectTrigger>
              <SelectContent>
                {technicians.map(tech => <SelectItem key={tech.id} value={tech.id}>{tech.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DatePicker label="Scheduled Date" value={wpForm.scheduledDate || undefined} onChange={v => setWpForm(f => ({ ...f, scheduledDate: v || '' }))} />
            <div className="space-y-2">
              <Label>Shift</Label>
              <Select value={wpForm.shift} onValueChange={v => setWpForm(f => ({ ...f, shift: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day Shift</SelectItem>
                  <SelectItem value="night">Night Shift</SelectItem>
                  <SelectItem value="weekend">Weekend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Selected Work Orders ({selectedWOs.length})</Label>
            <ScrollArea className="max-h-32 mt-1">
              <div className="space-y-1">
                {selectedWOs.map(woId => {
                  const wo = workOrders.find(w => w.id === woId);
                  return wo ? <div key={woId} className="text-xs flex items-center gap-2"><Badge variant="outline" className="font-mono text-[10px]">{wo.woNumber}</Badge><span className="truncate">{wo.title}</span></div> : null;
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      </ResponsiveDialog>

      {/* STO Detail Sheet */}
      <Sheet open={stoDetailOpen} onOpenChange={setStoDetailOpen}>
        <SheetContent className="sm:max-w-xl w-full overflow-y-auto">
          {stoDetailLoading ? (
            <div className="space-y-4 mt-6"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-32 w-full rounded-lg" /><Skeleton className="h-32 w-full rounded-lg" /></div>
          ) : stoDetailData ? (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-red-600" />
                  {stoDetailData.stoNumber || stoDetailData.name}
                </SheetTitle>
                <SheetDescription>{stoDetailData.name}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                {/* Status badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="capitalize">{(stoDetailData.status || '').replace(/_/g, ' ')}</Badge>
                  <Badge variant="outline" className="capitalize">{(stoDetailData.type || '').replace(/_/g, ' ')}</Badge>
                  {stoDetailData.estimatedDurationHours != null && (
                    <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{formatDuration(stoDetailData.estimatedDurationHours || 0)}</Badge>
                  )}
                </div>

                {/* Description */}
                {stoDetailData.description && (
                  <div><Label className="text-xs text-muted-foreground">Description</Label><p className="text-sm mt-1 bg-muted/50 rounded-lg p-3">{stoDetailData.description}</p></div>
                )}

                {/* Date & Schedule Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Planned Start</Label>
                    <p className="text-sm mt-1">{stoDetailData.plannedStartDate ? formatDate(stoDetailData.plannedStartDate) : '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Planned End</Label>
                    <p className="text-sm mt-1">{stoDetailData.plannedEndDate ? formatDate(stoDetailData.plannedEndDate) : '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Actual Start</Label>
                    <p className="text-sm mt-1">{stoDetailData.actualStartDate ? formatDate(stoDetailData.actualStartDate) : '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Actual End</Label>
                    <p className="text-sm mt-1">{stoDetailData.actualEndDate ? formatDate(stoDetailData.actualEndDate) : '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Actual Duration</Label>
                    <p className="text-sm mt-1">{stoDetailData.actualDurationHours != null ? formatDuration(stoDetailData.actualDurationHours) : '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Budget</Label>
                    <p className="text-sm mt-1">{stoDetailData.budgetAmount != null ? formatCurrency(stoDetailData.budgetAmount) : '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Actual Cost</Label>
                    <p className="text-sm mt-1 font-medium">{formatCurrency(stoDetailData.actualCost || 0)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Unit/Area</Label>
                    <p className="text-sm mt-1">{stoDetailData.unitId || '—'}</p>
                  </div>
                </div>

                {/* Scope (equipment & work packages) */}
                {stoDetailData.scopeJson && typeof stoDetailData.scopeJson === 'object' && Object.keys(stoDetailData.scopeJson).length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Scope</Label>
                    <div className="mt-1 bg-muted/50 rounded-lg p-3 space-y-1">
                      {Array.isArray(stoDetailData.scopeJson.equipment) && stoDetailData.scopeJson.equipment.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1">Equipment</p>
                          {stoDetailData.scopeJson.equipment.map((eq: any, i: number) => (
                            <p key={i} className="text-xs">• {eq.name || eq.assetName || eq}</p>
                          ))}
                        </div>
                      )}
                      {Array.isArray(stoDetailData.scopeJson.workPackages) && stoDetailData.scopeJson.workPackages.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1 mt-2">Work Packages</p>
                          {stoDetailData.scopeJson.workPackages.map((wp: any, i: number) => (
                            <p key={i} className="text-xs">• {wp.name || wp}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Milestones */}
                {(stoDetailData.milestones?.milestones?.length > 0 || (Array.isArray(stoDetailData.milestonesJson) && stoDetailData.milestonesJson.length > 0)) && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Milestones</Label>
                    <div className="mt-1 space-y-2">
                      {(stoDetailData.milestones?.milestones || stoDetailData.milestonesJson || []).map((ms: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${ms.completed ? 'bg-emerald-500' : ms.inProgress ? 'bg-amber-500' : 'bg-slate-300'}`} />
                          <span className="font-medium">{ms.name || ms.title}</span>
                          {ms.durationHours && <span className="text-muted-foreground">({formatDuration(ms.durationHours)})</span>}
                          {ms.completed && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 ml-auto">Done</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {stoDetailData.notes && (
                  <div><Label className="text-xs text-muted-foreground">Notes</Label><p className="text-sm mt-1 bg-muted/50 rounded-lg p-3">{stoDetailData.notes}</p></div>
                )}

                {/* Meta */}
                <Separator />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Created: {stoDetailData.createdAt ? formatDate(stoDetailData.createdAt) : ''}</span>
                  <span>Updated: {stoDetailData.updatedAt ? formatDate(stoDetailData.updatedAt) : ''}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-6"><EmptyState icon={CalendarClock} title="No details available" description="Could not load shutdown event details." /></div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create STO Dialog */}
      <ResponsiveDialog
        open={createSTODialogOpen}
        onOpenChange={setCreateSTODialogOpen}
        title="Plan Shutdown / Turnaround / Outage"
        footer={<Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreateSTO} disabled={createSTOLoading}>{createSTOLoading ? 'Creating...' : 'Create Event'}</Button>}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Event Name *</Label>
            <Input value={createSTOForm.name} onChange={e => setCreateSTOForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Annual Plant Turnaround" />
          </div>
          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={createSTOForm.type} onValueChange={v => setCreateSTOForm(f => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned_shutdown">Planned Shutdown</SelectItem>
                <SelectItem value="turnaround">Turnaround</SelectItem>
                <SelectItem value="forced_outage">Forced Outage</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={createSTOForm.description} onChange={e => setCreateSTOForm(f => ({ ...f, description: e.target.value }))} placeholder="Scope, objectives, etc." rows={3} />
          </div>
          <DateRangePicker label="Planned Period" from={createSTOForm.plannedStartDate || undefined} to={createSTOForm.plannedEndDate || undefined} onChange={(f, t) => setCreateSTOForm(form => ({ ...form, plannedStartDate: f || '', plannedEndDate: t || '' }))} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Est. Duration (hours)</Label>
              <Input type="number" value={createSTOForm.estimatedDurationHours} onChange={e => setCreateSTOForm(f => ({ ...f, estimatedDurationHours: e.target.value }))} placeholder="e.g., 168" />
            </div>
            <div className="space-y-2">
              <Label>Budget (₵)</Label>
              <Input type="number" value={createSTOForm.budgetAmount} onChange={e => setCreateSTOForm(f => ({ ...f, budgetAmount: e.target.value }))} placeholder="e.g., 50000" />
            </div>
          </div>
        </div>
      </ResponsiveDialog>

      {/* Convert MR to WO Dialog */}
      <ConvertMRToWODialog
        open={!!convertMR}
        onOpenChange={(open) => { if (!open) setConvertMR(null); }}
        mr={convertMR}
        onSuccess={handleConvertSuccess}
      />
    </div>
  );
}

// ============================================================================
// WO CARD COMPONENT (for Kanban)
// ============================================================================

function WOCard({ wo, selected, onToggleSelect, onClick, isDragging }: { wo: any; selected: boolean; onToggleSelect: () => void; onClick: () => void; isDragging?: boolean }) {
  return (
    <div
      className={`p-3 rounded-lg border transition-all cursor-pointer group ${
        isDragging
          ? 'border-emerald-400 bg-emerald-50/50 shadow-xl ring-2 ring-emerald-300'
          : selected
            ? 'border-emerald-400 bg-emerald-50/50 ring-1 ring-emerald-200'
            : 'border-border/60 hover:border-emerald-200 hover:shadow-sm bg-white'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">{wo.woNumber}</span>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <button onClick={onToggleSelect} className={`h-4 w-4 rounded border-2 flex items-center justify-center ${selected ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/30 hover:border-emerald-400'}`}>
              {selected && <CheckCircle2 className="h-3 w-3 text-white" />}
            </button>
          </TooltipTrigger><TooltipContent>Toggle selection</TooltipContent></Tooltip></TooltipProvider>
        </div>
      </div>
      <p className="text-xs font-medium leading-tight line-clamp-2 mb-2">{wo.title}</p>
      <div className="flex items-center gap-1.5 mb-1.5">
        <PriorityBadge priority={wo.priority} />
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {wo.assetName && <span className="truncate max-w-[80px]">{wo.assetName}</span>}
      </div>
      <Separator className="my-2" />
      <div className="flex items-center justify-between">
        {wo.assignee ? (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <div className="h-4 w-4 rounded-full bg-emerald-100 flex items-center justify-center text-[8px] font-bold text-emerald-700">
              {wo.assignee.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </div>
            <span className="truncate max-w-[60px]">{wo.assignee.fullName}</span>
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground italic">Unassigned</span>
        )}
        {wo.createdAt && <SLAIndicator createdAt={wo.createdAt} priority={wo.priority} />}
      </div>
    </div>
  );
}

// ============================================================================
// SORTABLE WORK ORDER CARD (for DnD Kanban)
// ============================================================================

function SortableWorkOrderCard({ wo, selected, onToggleSelect, onClick }: { wo: any; selected: boolean; onToggleSelect: () => void; onClick: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: wo.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="flex items-center gap-1 mb-1">
        <button
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <WOCard
          wo={wo}
          selected={selected}
          onToggleSelect={onToggleSelect}
          onClick={onClick}
        />
      </div>
    </div>
  );
}

// ============================================================================
// KANBAN COLUMN (with SortableContext)
// ============================================================================

function KanbanColumn({
  id,
  column,
  items,
  selectedWOs,
  onToggleSelect,
  onCardClick,
}: {
  id: string;
  column: (typeof KANBAN_COLUMNS)[number];
  items: any[];
  selectedWOs: string[];
  onToggleSelect: (id: string) => void;
  onCardClick: (wo: any) => void;
}) {
  const sortableIds = items.map(wo => wo.id);

  return (
    <div>
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border ${column.color} font-medium text-xs`}>
        <column.icon className="h-3.5 w-3.5" />
        {column.label}
        <Badge variant="outline" className="ml-auto text-[10px] bg-white/60">{items.length}</Badge>
      </div>
      <ScrollArea className="h-[calc(100vh-420px)] bg-muted/30 rounded-b-lg border border-t-0 p-2">
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-xs">Drop work orders here</div>
            )}
            {items.map(wo => (
              <SortableWorkOrderCard
                key={wo.id}
                wo={wo}
                selected={selectedWOs.includes(wo.id)}
                onToggleSelect={() => onToggleSelect(wo.id)}
                onClick={() => onCardClick(wo)}
              />
            ))}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}
