'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Box, ChevronRight, Cpu, Focus, Image as ImageIcon, Layers3,
  Loader2, Maximize2, Minus, Network, Plus, RefreshCw, Sparkles,
  Target, Wrench, ZoomIn, ZoomOut,
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
  _count?: { children?: number; sparePartLinks?: number; toolRequirements?: number };
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
  node, childrenByParent, selectedId, onSelect, depth = 0,
}: {
  node: MachineComponent;
  childrenByParent: Map<string, MachineComponent[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  const children = childrenByParent.get(node.id) || [];
  const nodeIcon = node.componentType === 'assembly'
    ? <Layers3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    : node.componentType === 'subassembly'
      ? <Network className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      : node.componentType === 'part'
        ? <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        : <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={
          'w-full rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted/60 cursor-pointer '
          + (selectedId === node.id ? 'border-primary bg-primary/5' : 'border-transparent')
        }
        style={{ paddingLeft: 10 + depth * 14 }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {nodeIcon}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{node.name}</div>
            <div className="truncate text-[10px] text-muted-foreground">
              {node.componentCode} · {node.componentType}
            </div>
          </div>
          {children.length > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>
      {children.map((child) => (
        <HierarchyNode
          key={child.id}
          node={child}
          childrenByParent={childrenByParent}
          selectedId={selectedId}
          onSelect={onSelect}
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

export function MachineVisualExplorer({ asset }: { asset: AssetSummary }) {
  const [components, setComponents] = useState<MachineComponent[]>([]);
  const [visuals, setVisuals] = useState<ComponentVisual[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState('realistic');
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [componentRes, visualRes] = await Promise.all([
        api.get('/api/component-registry?assetId=' + encodeURIComponent(asset.id) + '&limit=100'),
        api.get('/api/component-visuals?assetId=' + encodeURIComponent(asset.id)),
      ]);
      if (componentRes.success) setComponents((componentRes.data || []) as MachineComponent[]);
      if (visualRes.success) setVisuals((visualRes.data || []) as ComponentVisual[]);
    } catch {
      toast.error('Failed to load machine visual data');
    } finally {
      setLoading(false);
    }
  }, [asset.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setZoom(1); }, [selectedId, mode]);

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

  const desiredType = mode === 'realistic' ? 'ai_realistic' : mode === 'exploded' ? 'exploded' : 'technical_2d';
  const currentVisual = useMemo(() => {
    const target = visuals.filter((visual) =>
      visual.visualType === desiredType
      && (selectedId ? visual.componentId === selectedId : !visual.componentId && visual.assetId === asset.id)
    );
    return target.find((visual) => visual.isPrimary) || target[0] || null;
  }, [visuals, desiredType, selectedId, asset.id]);

  const fallbackImage = !selectedId && mode === 'realistic' ? asset.imageUrl || null : null;
  const imageUrl = currentVisual?.imageUrl || fallbackImage;

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
                selectedId={selectedId} onSelect={setSelectedId} />
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="realistic" className="cursor-pointer"><ImageIcon className="mr-1.5 h-3.5 w-3.5" />AI Realistic</TabsTrigger>
              <TabsTrigger value="technical" className="cursor-pointer"><Network className="mr-1.5 h-3.5 w-3.5" />Engineering 2D</TabsTrigger>
              <TabsTrigger value="exploded" className="cursor-pointer"><Layers3 className="mr-1.5 h-3.5 w-3.5" />Exploded</TabsTrigger>
            </TabsList>

            <TabsContent value="technical" className="mt-3">
              <EngineeringSchematic asset={asset} components={components} selectedId={selectedId} onSelect={setSelectedId} />
            </TabsContent>

            {['realistic', 'exploded'].map((tabMode) => (
              <TabsContent key={tabMode} value={tabMode} className="mt-3">
                <div className="relative flex min-h-[500px] items-center justify-center overflow-auto rounded-xl border bg-slate-950">
                  {imageUrl ? (
                    <img src={imageUrl} alt={(selected?.name || asset.name) + ' visual'}
                      className="max-h-[720px] origin-center object-contain transition-transform duration-200"
                      style={{ transform: 'scale(' + zoom + ')' }} />
                  ) : (
                    <div className="flex max-w-sm flex-col items-center gap-3 p-8 text-center text-slate-400">
                      <Sparkles className="h-10 w-10 text-cyan-400" />
                      <div className="text-sm font-semibold text-slate-200">No {tabMode === 'realistic' ? 'realistic' : 'exploded'} visual yet</div>
                      <p className="text-xs">Generate a dedicated AI view for this exact {selected?.componentType || 'machine'}.</p>
                    </div>
                  )}
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
                <div><div className="text-[10px] text-muted-foreground">Spare links</div><div className="font-semibold">{selected._count?.sparePartLinks || 0}</div></div>
                <div><div className="text-[10px] text-muted-foreground">Tool requirements</div><div className="font-semibold">{selected._count?.toolRequirements || 0}</div></div>
              </div>
            )}
            {(selected?.description || asset.description) && <p className="leading-relaxed text-muted-foreground">{selected?.description || asset.description}</p>}
          </CardContent>
        </Card>
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
