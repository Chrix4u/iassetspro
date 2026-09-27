'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Box, ChevronRight, Cpu, Focus, Image as ImageIcon, Layers3,
  Loader2, Maximize2, Minus, Network, Plus, RefreshCw, Sparkles,
  CalendarClock, PackageCheck, Target, Wrench, ZoomIn, ZoomOut,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

type MachineComponent = {
  id: string;
  parentId?: string | null;
  componentCode: string;
  name: string;
  description?: string | null;
  componentType: string;
  criticality: string;
  lifecycleStatus: string;
  healthScore: number;
  operatingHours: number;
  specification?: string | null;
  _count?: { children?: number; sparePartLinks?: number; toolRequirements?: number; pmSchedules?: number };
};

type ComponentDetail = MachineComponent & {
  sparePartLinks?: Array<{
    id: string;
    sparePartCode: string;
    sparePartName: string;
    quantityRequired: number;
    inventoryItem?: {
      id: string;
      itemCode: string;
      name: string;
      currentStock: number;
      unitOfMeasure: string;
      unitCost?: number | null;
    } | null;
  }>;
  toolRequirements?: Array<{
    id: string;
    toolCode: string;
    toolName: string;
    quantityRequired: number;
    taskType: string;
    tool?: {
      id: string;
      name: string;
      toolCode: string;
      status: string;
      condition: string;
    } | null;
  }>;
  pmSchedules?: Array<{
    id: string;
    title: string;
    frequencyType: string;
    frequencyValue: number;
    nextDueDate?: string | null;
    priority: string;
    autoGenerateWO: boolean;
  }>;
};

type ComponentVisual = {
  id: string;
  assetId?: string | null;
  componentId?: string | null;
  visualType: string;
  title: string;
  imageUrl: string;
  thumbnailUrl?: string | null;
  zoomLevel: number;
  isPrimary: boolean;
};

type AssetSummary = {
  id: string;
  name: string;
  assetTag: string;
  description?: string | null;
  imageUrl?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  criticality?: string | null;
  status?: string | null;
  specification?: string | null;
};

function safeJson(value?: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function badgeClass(criticality?: string) {
  if (criticality === 'critical') return 'border-red-200 bg-red-50 text-red-700';
  if (criticality === 'high') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function HierarchyNode({
  node, childrenByParent, selectedId, onSelect, expandedIds, onToggle, depth = 0,
}: {
  node: MachineComponent;
  childrenByParent: Map<string, MachineComponent[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  depth?: number;
}) {
  const children = childrenByParent.get(node.id) || [];
  const expanded = expandedIds.has(node.id);
  const nodeIcon = node.componentType === 'assembly'
    ? <Layers3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    : node.componentType === 'subassembly'
      ? <Network className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      : node.componentType === 'part'
        ? <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        : <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  return (
    <div>
      <div
        className={
          'flex w-full items-center rounded-lg border px-2.5 py-2 transition-colors hover:bg-muted/60 '
          + (selectedId === node.id ? 'border-primary bg-primary/5' : 'border-transparent')
        }
        style={{ paddingLeft: 10 + depth * 14 }}
      >
        {children.length > 0 ? (
          <button
            type="button"
            aria-label={(expanded ? 'Collapse ' : 'Expand ') + node.name}
            aria-expanded={expanded}
            onClick={() => onToggle(node.id)}
            className="mr-1 rounded p-0.5 hover:bg-muted cursor-pointer"
          >
            <ChevronRight className={'h-3.5 w-3.5 text-muted-foreground transition-transform ' + (expanded ? 'rotate-90' : '')} />
          </button>
        ) : <span className="mr-1 h-4 w-4 shrink-0" />}
        <button type="button" onClick={() => onSelect(node.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer">
          {nodeIcon}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{node.name}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{node.componentCode} · {node.componentType}</span>
          </span>
        </button>
      </div>
      {expanded && children.map((child) => (
        <HierarchyNode
          key={child.id}
          node={child}
          childrenByParent={childrenByParent}
          selectedId={selectedId}
          onSelect={onSelect}
          expandedIds={expandedIds}
          onToggle={onToggle}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function EngineeringSchematic({
  asset, components, selectedId, onSelect,
}: {
  asset: AssetSummary;
  components: MachineComponent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const layout = useMemo(() => {
    const byParent = new Map<string, MachineComponent[]>();
    const roots: MachineComponent[] = [];
    components.forEach((component) => {
      if (!component.parentId) roots.push(component);
      else byParent.set(component.parentId, [...(byParent.get(component.parentId) || []), component]);
    });
    const rows: MachineComponent[][] = [];
    let current = roots;
    let guard = 0;
    while (current.length && guard < 8) {
      rows.push(current);
      current = current.flatMap((item) => byParent.get(item.id) || []);
      guard += 1;
    }
    return rows;
  }, [components]);

  const width = Math.max(900, ...layout.map((row) => row.length * 230 + 80));
  const height = Math.max(440, (layout.length + 1) * 150);

  const positions = new Map<string, { x: number; y: number }>();
  layout.forEach((row, rowIndex) => {
    const y = 180 + rowIndex * 140;
    const gap = width / (row.length + 1);
    row.forEach((component, index) => positions.set(component.id, { x: gap * (index + 1), y }));
  });

  return (
    <div className="h-full min-h-[460px] overflow-auto rounded-xl border bg-slate-950">
      <svg width={width} height={height} role="img" aria-label="Machine component engineering schematic">
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(148,163,184,0.09)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#020617" />
        <rect width="100%" height="100%" fill="url(#grid)" />
        <g onClick={() => onSelect(null)} className="cursor-pointer">
          <rect x={width / 2 - 130} y={32} rx={14} width={260} height={84}
            fill={selectedId === null ? '#0f766e' : '#0f172a'} stroke="#38bdf8" strokeWidth="2" />
          <text x={width / 2} y={68} textAnchor="middle" fill="#f8fafc" fontSize="15" fontWeight="700">{asset.name}</text>
          <text x={width / 2} y={92} textAnchor="middle" fill="#94a3b8" fontSize="11">{asset.assetTag}</text>
        </g>
        {layout.flat().map((component) => {
          const pos = positions.get(component.id);
          if (!pos) return null;
          const parentPos = component.parentId ? positions.get(component.parentId) : { x: width / 2, y: 116 };
          return parentPos ? (
            <line key={'edge-' + component.id} x1={parentPos.x} y1={parentPos.y + 38}
              x2={pos.x} y2={pos.y - 34} stroke="#475569" strokeWidth="2" />
          ) : null;
        })}
        {layout.flat().map((component) => {
          const pos = positions.get(component.id);
          if (!pos) return null;
          const selected = selectedId === component.id;
          return (
            <g key={component.id} onClick={() => onSelect(component.id)} className="cursor-pointer">
              <rect x={pos.x - 92} y={pos.y - 34} rx={10} width={184} height={68}
                fill={selected ? '#0f766e' : '#0f172a'} stroke={selected ? '#5eead4' : '#64748b'} strokeWidth={selected ? 3 : 1.5} />
              <text x={pos.x} y={pos.y - 7} textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600">
                {component.name.length > 26 ? component.name.slice(0, 24) + '…' : component.name}
              </text>
              <text x={pos.x} y={pos.y + 14} textAnchor="middle" fill="#94a3b8" fontSize="9">
                {component.componentCode} · {component.componentType}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}


function ProgrammaticEngineeringView({
  asset, selected, childNodes, exploded, zoom, onSelect,
}: {
  asset: AssetSummary;
  selected: MachineComponent | null;
  childNodes: MachineComponent[];
  exploded: boolean;
  zoom: number;
  onSelect: (id: string) => void;
}) {
  const subjectName = selected?.name || asset.name;
  const subjectCode = selected?.componentCode || asset.assetTag;
  const subjectType = selected?.componentType || 'machine';
  const visibleChildren = childNodes.slice(0, 10);
  const width = 1040;
  const height = 620;
  const centerX = width / 2;
  const centerY = exploded ? 250 : 270;
  const bodyWidth = selected?.componentType === 'part' ? 300 : 430;
  const bodyHeight = selected?.componentType === 'part' ? 150 : 220;

  return (
    <div className="relative min-h-[500px] overflow-auto rounded-xl border bg-slate-950">
      <div
        className="origin-center transition-transform duration-200"
        style={{ transform: 'scale(' + zoom + ')', transformOrigin: 'center center' }}
      >
        <svg
          viewBox={'0 0 ' + width + ' ' + height}
          className="mx-auto min-h-[500px] min-w-[860px] max-w-full"
          role="img"
          aria-label={(exploded ? 'Exploded engineering view of ' : '2D engineering view of ') + subjectName}
        >
          <defs>
            <pattern id={exploded ? 'exploded-grid' : 'technical-grid'} width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
            </pattern>
            <marker id="engineering-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
            </marker>
          </defs>
          <rect width={width} height={height} fill="#020617" />
          <rect width={width} height={height} fill={'url(#' + (exploded ? 'exploded-grid' : 'technical-grid') + ')'} />

          <text x="42" y="42" fill="#e2e8f0" fontSize="20" fontWeight="700">{subjectName}</text>
          <text x="42" y="66" fill="#94a3b8" fontSize="12">{subjectCode} · {subjectType} · deterministic engineering fallback</text>

          <g>
            <line x1={centerX - bodyWidth / 2 - 60} y1={centerY} x2={centerX + bodyWidth / 2 + 60} y2={centerY} stroke="#334155" strokeDasharray="8 8" />
            <line x1={centerX} y1={centerY - bodyHeight / 2 - 60} x2={centerX} y2={centerY + bodyHeight / 2 + 60} stroke="#334155" strokeDasharray="8 8" />
            <rect
              x={centerX - bodyWidth / 2}
              y={centerY - bodyHeight / 2}
              width={bodyWidth}
              height={bodyHeight}
              rx="16"
              fill="#0f172a"
              stroke="#38bdf8"
              strokeWidth="3"
            />
            <rect
              x={centerX - bodyWidth / 2 + 28}
              y={centerY - bodyHeight / 2 + 28}
              width={bodyWidth - 56}
              height={bodyHeight - 56}
              rx="10"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeDasharray={exploded ? '12 8' : undefined}
            />
            <circle cx={centerX} cy={centerY} r={selected?.componentType === 'part' ? 38 : 54} fill="#0b2536" stroke="#5eead4" strokeWidth="3" />
            <circle cx={centerX} cy={centerY} r={selected?.componentType === 'part' ? 16 : 24} fill="#020617" stroke="#94a3b8" strokeWidth="2" />
            <text x={centerX} y={centerY + bodyHeight / 2 + 34} textAnchor="middle" fill="#cbd5e1" fontSize="12">{subjectCode}</text>
          </g>

          {visibleChildren.map((child, index) => {
            const count = Math.max(visibleChildren.length, 1);
            const lane = index - (count - 1) / 2;
            const childX = exploded ? centerX + lane * 120 : (index % 2 === 0 ? 170 : width - 170);
            const childY = exploded ? 470 : 145 + Math.floor(index / 2) * 86;
            const startX = exploded ? centerX : (childX < centerX ? centerX - bodyWidth / 2 : centerX + bodyWidth / 2);
            const startY = exploded ? centerY + bodyHeight / 2 : centerY;
            return (
              <g key={child.id} onClick={() => onSelect(child.id)} className="cursor-pointer">
                <line
                  x1={startX}
                  y1={startY}
                  x2={childX}
                  y2={childY - 30}
                  stroke="#64748b"
                  strokeWidth="1.5"
                  markerEnd="url(#engineering-arrow)"
                />
                <rect x={childX - 82} y={childY - 30} width="164" height="60" rx="9" fill="#111827" stroke="#64748b" />
                <text x={childX} y={childY - 4} textAnchor="middle" fill="#f8fafc" fontSize="10" fontWeight="600">
                  {child.name.length > 24 ? child.name.slice(0, 22) + '…' : child.name}
                </text>
                <text x={childX} y={childY + 15} textAnchor="middle" fill="#94a3b8" fontSize="8.5">{child.componentCode}</text>
              </g>
            );
          })}

          {visibleChildren.length === 0 && (
            <text x={centerX} y="548" textAnchor="middle" fill="#94a3b8" fontSize="12">
              Lowest registered maintainable level · no child geometry registered
            </text>
          )}
          <text x="42" y="588" fill="#64748b" fontSize="10">
            Programmatic 2D engineering fallback — AI imagery remains separate and requires a configured image provider.
          </text>
        </svg>
      </div>
    </div>
  );
}


async function loadAllMachineComponents(assetId: string): Promise<MachineComponent[]> {
  const all: MachineComponent[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await api.get(
      '/api/component-registry?assetId=' + encodeURIComponent(assetId)
      + '&limit=100&page=' + page,
    );
    if (!response.success) {
      throw new Error(response.error || 'Failed to load machine component hierarchy');
    }

    all.push(...((response.data || []) as MachineComponent[]));
    const reportedTotalPages = Number(response.pagination?.totalPages || 1);
    totalPages = Number.isFinite(reportedTotalPages) && reportedTotalPages > 0
      ? Math.min(reportedTotalPages, 1000)
      : 1;
    page += 1;
  } while (page <= totalPages);

  return all;
}

export function MachineVisualExplorer({ asset }: { asset: AssetSummary }) {
  const [components, setComponents] = useState<MachineComponent[]>([]);
  const [visuals, setVisuals] = useState<ComponentVisual[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ComponentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState('realistic');
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allComponents, visualRes] = await Promise.all([
        loadAllMachineComponents(asset.id),
        api.get('/api/component-visuals?assetId=' + encodeURIComponent(asset.id)),
      ]);
      setComponents(allComponents);
      if (visualRes.success) setVisuals((visualRes.data || []) as ComponentVisual[]);
    } catch {
      toast.error('Failed to load machine visual data');
    } finally {
      setLoading(false);
    }
  }, [asset.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setZoom(1); }, [selectedId, mode]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setSelectedDetail(null);
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);
    api.get('/api/component-registry/' + encodeURIComponent(selectedId))
      .then((response) => {
        if (cancelled) return;
        if (response.success) setSelectedDetail((response.data || null) as ComponentDetail | null);
        else setSelectedDetail(null);
      })
      .catch(() => {
        if (!cancelled) setSelectedDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedId]);

  const componentMap = useMemo(() => new Map(components.map((item) => [item.id, item])), [components]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, MachineComponent[]>();
    components.forEach((item) => {
      if (item.parentId) map.set(item.parentId, [...(map.get(item.parentId) || []), item]);
    });
    return map;
  }, [components]);
  const roots = useMemo(() => components.filter((item) => !item.parentId), [components]);
  const selected = selectedId ? componentMap.get(selectedId) || null : null;
  const detail = selectedDetail && selectedDetail.id === selectedId ? selectedDetail : null;

  useEffect(() => {
    if (!selectedId) return;
    setExpandedIds((current) => {
      const next = new Set(current);
      let node = componentMap.get(selectedId);
      let guard = 0;
      while (node?.parentId && guard < 12) {
        next.add(node.parentId);
        node = componentMap.get(node.parentId);
        guard += 1;
      }
      return next;
    });
  }, [selectedId, componentMap]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const path = useMemo(() => {
    if (!selected) return [];
    const chain: MachineComponent[] = [];
    let current: MachineComponent | undefined = selected;
    let guard = 0;
    while (current && guard < 12) {
      chain.unshift(current);
      current = current.parentId ? componentMap.get(current.parentId) : undefined;
      guard += 1;
    }
    return chain;
  }, [selected, componentMap]);

  const desiredType = mode === 'realistic'
    ? 'ai_realistic'
    : mode === 'exploded'
      ? 'exploded'
      : 'technical_2d';
  const currentVisual = useMemo(() => {
    const target = visuals.filter((visual) =>
      visual.visualType === desiredType
      && (selectedId ? visual.componentId === selectedId : !visual.componentId && visual.assetId === asset.id)
    );
    return target.find((visual) => visual.isPrimary) || target[0] || null;
  }, [visuals, desiredType, selectedId, asset.id]);

  const fallbackImage = !selectedId && mode === 'realistic' ? asset.imageUrl || null : null;
  const imageUrl = currentVisual?.imageUrl || fallbackImage;
  const drillChildren = selectedId ? (childrenByParent.get(selectedId) || []) : roots;
  const parentTarget = selected?.parentId ? componentMap.get(selected.parentId) || null : null;

  const generateVisual = async () => {
    setGenerating(true);
    try {
      const res = await api.post('/api/component-visuals/generate', {
        assetId: asset.id,
        componentId: selectedId,
        visualType: desiredType,
      }, { timeout: 180_000 });
      if (!res.success) throw new Error(res.error || 'Generation failed');
      toast.success('AI visual generated');
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || 'AI visual generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const specs = safeJson(selected?.specification || asset.specification);
  const details = Object.entries(specs).slice(0, 8);

  if (loading) {
    return <div className="flex min-h-[520px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_290px]">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Network className="h-4 w-4" />Machine hierarchy</CardTitle></CardHeader>
        <CardContent className="p-2">
          <button type="button" onClick={() => setSelectedId(null)}
            className={'w-full rounded-lg border px-3 py-2 text-left cursor-pointer hover:bg-muted/60 ' + (selectedId === null ? 'border-primary bg-primary/5' : 'border-transparent')}>
            <div className="text-xs font-semibold">{asset.name}</div>
            <div className="text-[10px] text-muted-foreground">{asset.assetTag} · machine</div>
          </button>
          <ScrollArea className="mt-1 h-[560px] pr-1">
            {roots.map((root) => (
              <HierarchyNode key={root.id} node={root} childrenByParent={childrenByParent}
                selectedId={selectedId} onSelect={setSelectedId}
                expandedIds={expandedIds} onToggle={toggleExpanded} />
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm flex items-center gap-2"><Focus className="h-4 w-4" />Deep visual explorer</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                <button className="hover:text-foreground cursor-pointer" onClick={() => setSelectedId(null)}>{asset.name}</button>
                {path.map((item) => <React.Fragment key={item.id}><ChevronRight className="h-3 w-3" /><button className="hover:text-foreground cursor-pointer" onClick={() => setSelectedId(item.id)}>{item.name}</button></React.Fragment>)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((v) => Math.max(0.6, +(v - 0.2).toFixed(2)))}><ZoomOut className="h-3.5 w-3.5" /></Button>
              <span className="min-w-12 text-center text-[11px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((v) => Math.min(4, +(v + 0.2).toFixed(2)))}><ZoomIn className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(1)}><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="realistic" className="cursor-pointer"><ImageIcon className="mr-1.5 h-3.5 w-3.5" />AI Realistic</TabsTrigger>
              <TabsTrigger value="diagram" className="cursor-pointer"><Network className="mr-1.5 h-3.5 w-3.5" />Diagram</TabsTrigger>
              <TabsTrigger value="technical2d" className="cursor-pointer"><Focus className="mr-1.5 h-3.5 w-3.5" />Engineering 2D</TabsTrigger>
              <TabsTrigger value="exploded" className="cursor-pointer"><Layers3 className="mr-1.5 h-3.5 w-3.5" />Exploded</TabsTrigger>
            </TabsList>

            <TabsContent value="diagram" className="mt-3">
              <EngineeringSchematic asset={asset} components={components} selectedId={selectedId} onSelect={setSelectedId} />
            </TabsContent>

            {['realistic', 'technical2d', 'exploded'].map((tabMode) => (
              <TabsContent key={tabMode} value={tabMode} className="mt-3 space-y-2">
                {tabMode === 'realistic' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                    AI-generated reference visualization — not an OEM drawing or verified as-built photograph. Verify geometry, dimensions, clearances and procedures against approved engineering documents and the physical machine before maintenance.
                  </div>
                )}
                <div className="relative min-h-[500px] overflow-auto rounded-xl border bg-slate-950">
                  <div className="flex min-h-[500px] items-center justify-center p-6">
                    {imageUrl ? (
                      <img src={imageUrl} alt={(selected?.name || asset.name) + ' visual'}
                        className="max-h-[760px] origin-center object-contain transition-transform duration-200"
                        style={{ transform: 'scale(' + zoom + ')' }} />
                    ) : tabMode === 'realistic' ? (
                      <div className="flex max-w-sm flex-col items-center gap-3 p-8 text-center text-slate-400">
                        <Sparkles className="h-10 w-10 text-cyan-400" />
                        <div className="text-sm font-semibold text-slate-200">No realistic visual yet</div>
                        <p className="text-xs">Generate a dedicated real AI image for this exact {selected?.componentType || 'machine'} after an image-capable provider is configured.</p>
                      </div>
                    ) : (
                      <ProgrammaticEngineeringView
                        asset={asset}
                        selected={selected}
                        childNodes={drillChildren}
                        exploded={tabMode === 'exploded'}
                        zoom={zoom}
                        onSelect={setSelectedId}
                      />
                    )}
                  </div>

                  <div className="absolute left-3 top-3 max-w-[280px] rounded-xl border border-white/10 bg-slate-950/90 p-2.5 shadow-xl backdrop-blur">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">Drill into parts</div>
                      {selectedId && (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-slate-300 hover:text-white"
                          onClick={() => setSelectedId(parentTarget?.id || null)}>
                          Up one level
                        </Button>
                      )}
                    </div>
                    {drillChildren.length > 0 ? (
                      <div className="space-y-1">
                        {drillChildren.map((child) => (
                          <button key={child.id} type="button" onClick={() => setSelectedId(child.id)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left text-[11px] text-slate-100 transition-colors hover:bg-cyan-500/15">
                            <span className="min-w-0 truncate">{child.name}</span>
                            <Badge variant="outline" className="border-slate-600 bg-slate-900/70 text-[9px] text-slate-300">{child.componentType}</Badge>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] leading-relaxed text-slate-400">Lowest registered level reached. This item can still hold spare, PM, tool and work-order history.</div>
                    )}
                  </div>

                  <div className="absolute bottom-3 right-3 flex gap-2">
                    <Button size="sm" onClick={generateVisual} disabled={generating} className="cursor-pointer">
                      {generating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                      {imageUrl ? 'Regenerate' : 'Generate AI visual'}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" />Selected item</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <div className="font-semibold">{selected?.name || asset.name}</div>
              <div className="text-muted-foreground">{selected?.componentCode || asset.assetTag}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className={badgeClass(selected?.criticality || asset.criticality || undefined)}>{selected?.criticality || asset.criticality || 'medium'}</Badge>
              <Badge variant="outline">{selected?.componentType || 'machine'}</Badge>
              <Badge variant="outline">{selected?.lifecycleStatus || asset.status || 'operational'}</Badge>
            </div>
            {selected && (
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2.5">
                <div><div className="text-[10px] text-muted-foreground">Health</div><div className="font-semibold">{selected.healthScore}%</div></div>
                <div><div className="text-[10px] text-muted-foreground">Runtime</div><div className="font-semibold">{selected.operatingHours.toLocaleString()} h</div></div>
                <div><div className="text-[10px] text-muted-foreground">PM schedules</div><div className="font-semibold">{detail?.pmSchedules?.length ?? selected._count?.pmSchedules ?? 0}</div></div>
                <div><div className="text-[10px] text-muted-foreground">Spare links</div><div className="font-semibold">{detail?.sparePartLinks?.length ?? selected._count?.sparePartLinks ?? 0}</div></div>
                <div><div className="text-[10px] text-muted-foreground">Tool requirements</div><div className="font-semibold">{detail?.toolRequirements?.length ?? selected._count?.toolRequirements ?? 0}</div></div>
                <div><div className="text-[10px] text-muted-foreground">WO automation</div><div className="font-semibold">{detail?.pmSchedules?.some((item) => item.autoGenerateWO) ? 'Enabled' : '—'}</div></div>
              </div>
            )}
            {(selected?.description || asset.description) && <p className="leading-relaxed text-muted-foreground">{selected?.description || asset.description}</p>}
          </CardContent>
        </Card>
        {selected && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />Maintenance intelligence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {detailLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading component maintenance links...</div>
              ) : (
                <>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-semibold">Preventive maintenance</span>
                      <Badge variant="outline">{detail?.pmSchedules?.length || 0}</Badge>
                    </div>
                    <div className="space-y-1.5">
                      {(detail?.pmSchedules || []).slice(0, 5).map((schedule) => (
                        <div key={schedule.id} className="rounded-md border p-2">
                          <div className="font-medium">{schedule.title}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                            <span>{schedule.frequencyType.replace(/_/g, ' ')} × {schedule.frequencyValue}</span>
                            <span>· {schedule.priority}</span>
                            {schedule.nextDueDate && <span>· Due {new Date(schedule.nextDueDate).toLocaleDateString()}</span>}
                          </div>
                        </div>
                      ))}
                      {!detail?.pmSchedules?.length && <div className="text-muted-foreground">No component-level PM schedule linked yet.</div>}
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-semibold"><PackageCheck className="h-3.5 w-3.5" />Store-linked spares</span>
                      <Badge variant="outline">{detail?.sparePartLinks?.length || 0}</Badge>
                    </div>
                    <div className="space-y-1.5">
                      {(detail?.sparePartLinks || []).slice(0, 5).map((link) => (
                        <div key={link.id} className="flex items-start justify-between gap-3 rounded-md border p-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{link.sparePartName}</div>
                            <div className="text-[10px] text-muted-foreground">{link.inventoryItem?.itemCode || link.sparePartCode}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-semibold">{link.inventoryItem ? link.inventoryItem.currentStock.toLocaleString() : '—'}</div>
                            <div className="text-[10px] text-muted-foreground">{link.inventoryItem?.unitOfMeasure || 'not linked'}</div>
                          </div>
                        </div>
                      ))}
                      {!detail?.sparePartLinks?.length && <div className="text-muted-foreground">No store spare linked to this component.</div>}
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-semibold"><Wrench className="h-3.5 w-3.5" />Required tools</span>
                      <Badge variant="outline">{detail?.toolRequirements?.length || 0}</Badge>
                    </div>
                    <div className="space-y-1.5">
                      {(detail?.toolRequirements || []).slice(0, 5).map((requirement) => (
                        <div key={requirement.id} className="flex items-start justify-between gap-3 rounded-md border p-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{requirement.toolName}</div>
                            <div className="text-[10px] text-muted-foreground">{requirement.taskType.replace(/_/g, ' ')} · Qty {requirement.quantityRequired}</div>
                          </div>
                          <Badge variant="outline" className="shrink-0">{requirement.tool?.status || 'not linked'}</Badge>
                        </div>
                      ))}
                      {!detail?.toolRequirements?.length && <div className="text-muted-foreground">No tool requirement linked to this component.</div>}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Box className="h-4 w-4" />Technical specification</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {details.length ? details.map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="max-w-[150px] text-right font-medium">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
              </div>
            )) : <div className="text-xs text-muted-foreground">No structured specification available.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}