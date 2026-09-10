'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
  OnNodesChange,
  OnEdgesChange,
  type NodeChange,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import { nodeTypes, edgeTypes, type AssetNodeData, type InstrumentNodeData, type ElectricalNodeData, type ControlNodeData, type HeatExchangerNodeData, type VesselNodeData } from './DiagramNodeTypes';
import { diagramTemplates, diagramTypeMeta, type DiagramTemplate } from './DiagramTemplates';

import {
  Plus, Save, FolderOpen, Download, Trash2, Copy, Undo2, Redo2,
  Maximize2, ZoomIn, ZoomOut, LayoutGrid, FileDown, Search,
  ChevronLeft, ChevronRight, Cpu, Thermometer, GitBranch, CircleDot,
  Droplets, Zap, Wind, FlaskConical, Settings, Shield, X,
  Layers, Info, MoreVertical, ArrowLeft, Lock, Unlock, Grid3X3,
  Map, AlertTriangle, FileImage, Users, Clock, RotateCcw, ChevronUp,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ============================================================================
// TYPES
// ============================================================================

interface SystemDiagram {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  nodes: string; // JSON
  edges: string; // JSON
  viewport?: string | null;
  thumbnailUrl?: string | null;
  version: number;
  isActive: boolean;
  isTemplate?: boolean;
  createdById: string;
  createdByIdUser?: { id: string; fullName: string; username: string };
  updatedByIdUser?: { id: string; fullName: string; username: string };
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// HELPER: Template Preview Miniature
// ============================================================================

function TemplatePreview({ template }: { template: DiagramTemplate }) {
  const meta = diagramTypeMeta[template.diagramType];
  const nodeCount = template.nodes.length;
  const edgeCount = template.edges.length;
  // Generate a mini schematic representation
  const containerStyle: React.CSSProperties = {
    width: '100%', height: '100%', borderRadius: 6,
    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
    position: 'relative', overflow: 'hidden',
  };
  const dotsOverlay: React.CSSProperties = {
    position: 'absolute', inset: 0, opacity: 0.15,
    backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)',
    backgroundSize: '8px 8px',
  };
  // Position small dots to represent nodes
  const miniNodes = template.nodes.slice(0, 12).map((n, i) => {
    const xPct = Math.max(5, Math.min(90, ((n.position.x + 100) / 1600) * 100));
    const yPct = Math.max(10, Math.min(85, ((n.position.y + 50) / 600) * 100));
    const d = n.data as Record<string, unknown>;
    const status = (d.status as string) || 'operational';
    const color = status === 'warning' || status === 'standby' ? '#f59e0b' : status === 'critical' || status === 'fault' || status === 'alarm' ? '#ef4444' : status === 'stopped' || status === 'inactive' ? '#6b7280' : '#10b981';
    return (
      <div key={i} style={{
        position: 'absolute', left: `${xPct}%`, top: `${yPct}%`,
        width: 6, height: 6, borderRadius: 2,
        background: color, opacity: 0.9,
        transform: 'translate(-50%, -50%)',
      }} />
    );
  });
  // Draw lines for edges
  const miniEdges = template.edges.slice(0, 10).map((e, i) => {
    const src = template.nodes.find(n => n.id === e.source);
    const tgt = template.nodes.find(n => n.id === e.target);
    if (!src || !tgt) return null;
    const x1 = Math.max(5, Math.min(90, ((src.position.x + 100) / 1600) * 100));
    const y1 = Math.max(10, Math.min(85, ((src.position.y + 50) / 600) * 100));
    const x2 = Math.max(5, Math.min(90, ((tgt.position.x + 100) / 1600) * 100));
    const y2 = Math.max(10, Math.min(85, ((tgt.position.y + 50) / 600) * 100));
    return (
      <svg key={i} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <line x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`} stroke="#475569" strokeWidth="0.5" opacity="0.4" />
      </svg>
    );
  });

  return (
    <div style={containerStyle}>
      <div style={dotsOverlay} />
      {miniEdges}
      {miniNodes}
      <div style={{
        position: 'absolute', bottom: 4, right: 6,
        fontSize: 8, color: '#64748b', fontWeight: 600,
        fontFamily: 'monospace',
      }}>
        {nodeCount}N / {edgeCount}E
      </div>
    </div>
  );
}

// ============================================================================
// DIAGRAM VALIDATION HELPER
// ============================================================================

interface DiagramValidation {
  disconnectedNodes: string[];
  warnings: string[];
}

function validateDiagram(nodes: Node[], edges: Edge[]): DiagramValidation {
  const warnings: string[] = [];
  const disconnectedNodes: string[] = [];

  if (nodes.length === 0) return { disconnectedNodes, warnings };

  // Find all nodes that have at least one connection
  const connectedNodeIds = new Set<string>();
  edges.forEach((e) => {
    connectedNodeIds.add(e.source);
    connectedNodeIds.add(e.target);
  });

  // Find disconnected nodes (exclude junction nodes which can be optional)
  nodes.forEach((n) => {
    if (!connectedNodeIds.has(n.id) && n.type !== 'junctionNode') {
      disconnectedNodes.push(n.id);
      const label = (n.data as Record<string, unknown>)?.label as string || n.id;
      warnings.push(`"${label}" has no connections`);
    }
  });

  // Check for missing connections (nodes with no outgoing edges)
  const nodeIdsWithOutgoing = new Set(edges.map(e => e.source));
  const sinkNodes = nodes.filter(n => !nodeIdsWithOutgoing.has(n.id) && connectedNodeIds.has(n.id) && n.type !== 'junctionNode');
  if (sinkNodes.length > 1 && nodes.length > 3) {
    warnings.push(`${sinkNodes.length} nodes have no outgoing connections`);
  }

  return { disconnectedNodes, warnings };
}

// ============================================================================
// AUTO-LAYOUT (simple grid layout)
// ============================================================================

function autoLayoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  // Build adjacency to determine layers
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map(n => n.id));

  nodes.forEach(n => { inDegree.set(n.id, 0); adj.set(n.id, []); });
  edges.forEach(e => {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      adj.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  });

  // Topological sort into layers
  const layers: string[][] = [];
  const visited = new Set<string>();
  let queue = nodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);
  if (queue.length === 0) queue = [nodes[0].id]; // fallback

  while (queue.length > 0) {
    const layer: string[] = [];
    const nextQueue: string[] = [];
    queue.forEach(id => {
      if (visited.has(id)) return;
      visited.add(id);
      layer.push(id);
      (adj.get(id) || []).forEach(target => {
        const newDeg = (inDegree.get(target) || 1) - 1;
        inDegree.set(target, newDeg);
        if (newDeg <= 0) nextQueue.push(target);
      });
    });
    if (layer.length > 0) layers.push(layer);
    queue = nextQueue;
  }

  // Add any unvisited nodes
  nodes.forEach(n => {
    if (!visited.has(n.id)) {
      if (layers.length === 0) layers.push([]);
      layers[layers.length - 1].push(n.id);
    }
  });

  // Position nodes in a grid
  const HORIZONTAL_GAP = 280;
  const VERTICAL_GAP = 160;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  return nodes.map(n => {
    let layerIdx = layers.findIndex(l => l.includes(n.id));
    if (layerIdx === -1) layerIdx = 0;
    const nodesInLayer = layers[layerIdx] || [];
    const posInLayer = nodesInLayer.indexOf(n.id);

    return {
      ...n,
      position: {
        x: layerIdx * HORIZONTAL_GAP + 80,
        y: posInLayer * VERTICAL_GAP + 80,
      },
    };
  });
}

// ============================================================================
// FLOW EDITOR (wrapped in ReactFlowProvider)
// ============================================================================

let nodeIdCounter = 1;
const generateNodeId = () => `node-${Date.now()}-${nodeIdCounter++}`;

function createNode(type: string, position: { x: number; y: number }, overrides?: Partial<Node['data']>): Node {
  const id = generateNodeId();
  const baseData: Record<string, unknown> = { label: '' };

  switch (type) {
    case 'assetNode':
      baseData.label = 'New Equipment';
      baseData.assetType = 'default';
      baseData.status = 'operational';
      baseData.criticality = 'medium';
      baseData.health = 100;
      baseData.parameters = [];
      break;
    case 'sensorNode':
      baseData.label = 'SENSOR-01';
      baseData.parameter = 'Measurement';
      baseData.value = 0;
      baseData.unit = '°C';
      baseData.min = 0;
      baseData.max = 100;
      baseData.status = 'normal';
      break;
    case 'valveNode':
      baseData.label = 'VALVE-01';
      baseData.state = 'closed';
      baseData.valveType = 'isolation';
      break;
    case 'junctionNode':
      baseData.label = '';
      break;
    case 'pumpNode':
      baseData.label = 'PUMP-01';
      baseData.pumpType = 'centrifugal';
      baseData.status = 'stopped';
      baseData.health = 100;
      baseData.flowRate = 0;
      baseData.head = 0;
      break;
    case 'tankNode':
      baseData.label = 'TANK-01';
      baseData.fillLevel = 0;
      baseData.capacity = 5000;
      baseData.temperature = 20;
      baseData.levelStatus = 'normal';
      baseData.medium = 'Water';
      break;
    case 'motorNode':
      baseData.label = 'MOTOR-01';
      baseData.rpm = 0;
      baseData.powerRating = 15;
      baseData.status = 'stopped';
      baseData.vibration = 0;
      baseData.temperature = 25;
      baseData.current = 0;
      break;
    case 'pipeNode':
      baseData.label = 'PIPE-01';
      baseData.diameter = '100';
      baseData.material = 'CS';
      baseData.flowRate = 0;
      baseData.pressure = 0;
      baseData.flowDirection = 'forward';
      break;
    case 'instrumentNode':
      baseData.label = 'New Instrument';
      baseData.tag = `PT-${Math.floor(Math.random() * 900 + 100)}`;
      baseData.measureType = 'Pressure';
      baseData.value = null;
      baseData.unit = 'bar';
      baseData.alarmHigh = null;
      baseData.alarmLow = null;
      baseData.status = 'normal';
      break;
    case 'electricalNode':
      baseData.label = 'New Electrical';
      baseData.name = `SWGR-${Math.floor(Math.random() * 900 + 100)}`;
      baseData.equipType = 'switchgear';
      baseData.voltage = null;
      baseData.current = null;
      baseData.power = null;
      baseData.status = 'energized';
      break;
    case 'controlNode':
      baseData.label = 'New Controller';
      baseData.name = `PLC-${Math.floor(Math.random() * 900 + 100)}`;
      baseData.controllerType = 'PLC';
      baseData.ioCount = { in: 0, out: 0 };
      baseData.scanRate = 100;
      baseData.status = 'running';
      baseData.program = null;
      break;
    case 'heatExchangerNode':
      baseData.label = 'New Heat Exchanger';
      baseData.name = `HE-${Math.floor(Math.random() * 900 + 100)}`;
      baseData.exchangerType = 'shell_tube';
      baseData.hotIn = null;
      baseData.hotOut = null;
      baseData.coldIn = null;
      baseData.coldOut = null;
      baseData.effectiveness = null;
      baseData.status = 'operational';
      break;
    case 'vesselNode':
      baseData.label = 'New Vessel';
      baseData.name = `V-${Math.floor(Math.random() * 900 + 100)}`;
      baseData.vesselType = 'separator';
      baseData.pressure = null;
      baseData.temperature = null;
      baseData.level = null;
      baseData.status = 'operational';
      break;
  }

  return {
    id,
    type,
    position,
    data: { ...baseData, ...overrides },
  };
}

// --- Properties Panel Component ---

function PropertiesPanel({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
}: {
  selectedNode: Node | null;
  onUpdateNode: (id: string, data: Partial<Node['data']>) => void;
  onDeleteNode: (id: string) => void;
}) {
  if (!selectedNode) {
    return (
      <div className="flex items-center justify-center h-full text-center p-6">
        <div className="space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mx-auto">
            <Info className="w-5 h-5 text-slate-500" />
          </div>
          <p className="text-xs text-slate-500">Select a node to view its properties</p>
        </div>
      </div>
    );
  }

  const data = selectedNode.data as Record<string, unknown>;
  const nodeType = selectedNode.type || 'assetNode';

  const handleChange = (key: string, value: unknown) => {
    onUpdateNode(selectedNode.id, { [key]: value });
  };

  const statusColorMap: Record<string, string> = {
    operational: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    running: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    standby: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    normal: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    alarm: 'bg-red-500/20 text-red-400 border-red-500/30',
    fault: 'bg-red-500/20 text-red-400 border-red-500/30',
    open: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    closed: 'bg-red-500/20 text-red-400 border-red-500/30',
    partial: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    stopped: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    high: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    low: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              {nodeType.replace(/([A-Z])/g, ' $1').trim()}
            </span>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-red-400" onClick={() => onDeleteNode(selectedNode.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete node</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <Separator className="bg-slate-700/50" />

        {/* Common fields */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-400 font-medium">Label</Label>
            <Input
              value={(data.label as string) || ''}
              onChange={(e) => handleChange('label', e.target.value)}
              className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"
              placeholder="Node label"
            />
          </div>
        </div>

        {/* Asset Node specific fields */}
        {nodeType === 'assetNode' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Asset Type</Label>
              <Select value={(data.assetType as string) || 'default'} onValueChange={(v) => handleChange('assetType', v)}>
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {['default', 'chiller', 'pump', 'transformer', 'switchgear', 'mcc', 'motor', 'compressor', 'dryer', 'filter', 'receiver', 'ahu', 'vav', 'supply', 'generator', 'enduser', 'valve'].map((t) => (
                    <SelectItem key={t} value={t} className="text-xs text-slate-300">{t.replace(/([A-Z])/g, ' $1').trim()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Status</Label>
              <Select value={(data.status as string) || 'operational'} onValueChange={(v) => handleChange('status', v)}>
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {['operational', 'standby', 'warning', 'critical'].map((s) => (
                    <SelectItem key={s} value={s} className="text-xs text-slate-300 capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(data.status as string) && (
                <Badge variant="outline" className={`text-[10px] mt-1.5 ${statusColorMap[(data.status as string)] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                  {(data.status as string).toUpperCase()}
                </Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Criticality</Label>
              <Select value={(data.criticality as string) || 'medium'} onValueChange={(v) => handleChange('criticality', v)}>
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {['low', 'medium', 'high', 'critical'].map((c) => (
                    <SelectItem key={c} value={c} className="text-xs text-slate-300 capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Health Score</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={(data.health as number) ?? 100}
                onChange={(e) => handleChange('health', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>

            {Array.isArray(data.parameters) && (data.parameters as Array<{ name: string; value: string; unit: string }>).length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Parameters</Label>
                <div className="space-y-1">
                  {(data.parameters as Array<{ name: string; value: string; unit: string }>).map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-slate-800/50">
                      <span className="text-[10px] text-slate-400">{p.name}</span>
                      <span className="text-[10px] font-mono text-slate-300">{p.value} {p.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Sensor Node specific fields */}
        {nodeType === 'sensorNode' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Parameter</Label>
              <Input value={(data.parameter as string) || ''} onChange={(e) => handleChange('parameter', e.target.value)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Value</Label>
                <Input type="number" step={0.1} value={(data.value as number) ?? 0} onChange={(e) => handleChange('value', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Unit</Label>
                <Input value={(data.unit as string) || ''} onChange={(e) => handleChange('unit', e.target.value)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Min</Label>
                <Input type="number" step={0.1} value={(data.min as number) ?? 0} onChange={(e) => handleChange('min', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Max</Label>
                <Input type="number" step={0.1} value={(data.max as number) ?? 100} onChange={(e) => handleChange('max', parseFloat(e.target.value) || 100)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Status</Label>
              <Select value={(data.status as string) || 'normal'} onValueChange={(v) => handleChange('status', v)}>
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {['normal', 'warning', 'alarm'].map((s) => (
                    <SelectItem key={s} value={s} className="text-xs text-slate-300 capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Valve Node specific fields */}
        {nodeType === 'valveNode' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">State</Label>
              <Select value={(data.state as string) || 'closed'} onValueChange={(v) => handleChange('state', v)}>
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {['open', 'closed', 'partial'].map((s) => (
                    <SelectItem key={s} value={s} className="text-xs text-slate-300 capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(data.state as string) && (
                <Badge variant="outline" className={`text-[10px] mt-1.5 ${statusColorMap[(data.state as string)] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                  {(data.state as string).toUpperCase()}
                </Badge>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Valve Type</Label>
              <Select value={(data.valveType as string) || 'isolation'} onValueChange={(v) => handleChange('valveType', v)}>
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {['isolation', 'bypass', 'control', 'distribution', 'ats'].map((t) => (
                    <SelectItem key={t} value={t} className="text-xs text-slate-300 capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Pump Node specific fields */}
        {nodeType === 'pumpNode' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Pump Type</Label>
              <Select value={(data.pumpType as string) || 'centrifugal'} onValueChange={(v) => handleChange('pumpType', v)}>
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {['centrifugal', 'reciprocating', 'gear', 'diaphragm', 'submersible'].map((t) => (
                    <SelectItem key={t} value={t} className="text-xs text-slate-300 capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Status</Label>
              <Select value={(data.status as string) || 'stopped'} onValueChange={(v) => handleChange('status', v)}>
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {['running', 'stopped', 'fault'].map((s) => (
                    <SelectItem key={s} value={s} className="text-xs text-slate-300 capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(data.status as string) && (
                <Badge variant="outline" className={`text-[10px] mt-1.5 ${statusColorMap[(data.status as string)] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                  {(data.status as string).toUpperCase()}
                </Badge>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Health Score</Label>
              <Input type="number" min={0} max={100} value={(data.health as number) ?? 100} onChange={(e) => handleChange('health', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Flow Rate</Label>
                <Input type="number" step={0.1} value={(data.flowRate as number) ?? 0} onChange={(e) => handleChange('flowRate', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Head (m)</Label>
                <Input type="number" step={0.1} value={(data.head as number) ?? 0} onChange={(e) => handleChange('head', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
            </div>
          </>
        )}

        {/* Tank Node specific fields */}
        {nodeType === 'tankNode' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Fill Level (%)</Label>
              <Input type="number" min={0} max={100} value={(data.fillLevel as number) ?? 0} onChange={(e) => handleChange('fillLevel', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Capacity (L)</Label>
                <Input type="number" value={(data.capacity as number) ?? 5000} onChange={(e) => handleChange('capacity', parseInt(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Temp (°C)</Label>
                <Input type="number" step={0.1} value={(data.temperature as number) ?? 20} onChange={(e) => handleChange('temperature', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Level Status</Label>
                <Select value={(data.levelStatus as string) || 'normal'} onValueChange={(v) => handleChange('levelStatus', v)}>
                  <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['high', 'normal', 'low'].map((s) => (
                      <SelectItem key={s} value={s} className="text-xs text-slate-300 capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Medium</Label>
                <Input value={(data.medium as string) || ''} onChange={(e) => handleChange('medium', e.target.value)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
            </div>
          </>
        )}

        {/* Motor Node specific fields */}
        {nodeType === 'motorNode' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Status</Label>
              <Select value={(data.status as string) || 'stopped'} onValueChange={(v) => handleChange('status', v)}>
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {['running', 'stopped', 'fault'].map((s) => (
                    <SelectItem key={s} value={s} className="text-xs text-slate-300 capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(data.status as string) && (
                <Badge variant="outline" className={`text-[10px] mt-1.5 ${statusColorMap[(data.status as string)] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                  {(data.status as string).toUpperCase()}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">RPM</Label>
                <Input type="number" value={(data.rpm as number) ?? 0} onChange={(e) => handleChange('rpm', parseInt(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Power (kW)</Label>
                <Input type="number" step={0.1} value={(data.powerRating as number) ?? 15} onChange={(e) => handleChange('powerRating', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Current (A)</Label>
                <Input type="number" step={0.1} value={(data.current as number) ?? 0} onChange={(e) => handleChange('current', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Vibration</Label>
                <Input type="number" step={0.1} value={(data.vibration as number) ?? 0} onChange={(e) => handleChange('vibration', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Temperature (°C)</Label>
              <Input type="number" step={0.1} value={(data.temperature as number) ?? 25} onChange={(e) => handleChange('temperature', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
            </div>
          </>
        )}

        {/* Pipe Node specific fields */}
        {nodeType === 'pipeNode' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Diameter</Label>
              <Input value={(data.diameter as string) || '100'} onChange={(e) => handleChange('diameter', e.target.value)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Material</Label>
              <Select value={(data.material as string) || 'CS'} onValueChange={(v) => handleChange('material', v)}>
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {['CS', 'SS', 'Copper', 'PVC', 'HDPE', 'Cast Iron'].map((m) => (
                    <SelectItem key={m} value={m} className="text-xs text-slate-300">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Flow (m³/h)</Label>
                <Input type="number" step={0.1} value={(data.flowRate as number) ?? 0} onChange={(e) => handleChange('flowRate', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Pressure (bar)</Label>
                <Input type="number" step={0.1} value={(data.pressure as number) ?? 0} onChange={(e) => handleChange('pressure', parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-400 font-medium">Flow Direction</Label>
              <Select value={(data.flowDirection as string) || 'forward'} onValueChange={(v) => handleChange('flowDirection', v)}>
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {['forward', 'reverse'].map((d) => (
                    <SelectItem key={d} value={d} className="text-xs text-slate-300 capitalize">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Instrument Node specific fields */}
        {nodeType === 'instrumentNode' && (() => {
          const d = data as unknown as InstrumentNodeData;
          return (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Tag</Label>
                <Input value={d.tag || ''} onChange={(e) => handleChange('tag', e.target.value)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Measure Type</Label>
                <Input value={d.measureType || ''} onChange={(e) => handleChange('measureType', e.target.value)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-400 font-medium">Value</Label>
                  <Input type="number" step={0.1} value={d.value?.toString() ?? ''} onChange={(e) => handleChange('value', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-400 font-medium">Unit</Label>
                  <Input value={d.unit || ''} onChange={(e) => handleChange('unit', e.target.value)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-400 font-medium">Alarm High</Label>
                  <Input type="number" step={0.1} value={d.alarmHigh?.toString() ?? ''} onChange={(e) => handleChange('alarmHigh', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-400 font-medium">Alarm Low</Label>
                  <Input type="number" step={0.1} value={d.alarmLow?.toString() ?? ''} onChange={(e) => handleChange('alarmLow', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
              </div>
            </>
          );
        })()}

        {/* Electrical Node specific fields */}
        {nodeType === 'electricalNode' && (() => {
          const d = data as unknown as ElectricalNodeData;
          return (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Name</Label>
                <Input value={d.name || ''} onChange={(e) => handleChange('name', e.target.value)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Equipment Type</Label>
                <Select value={d.equipType || 'switchgear'} onValueChange={(v) => handleChange('equipType', v)}>
                  <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['switchgear', 'transformer', 'mcc', 'breaker', 'generator'].map((t) => (
                      <SelectItem key={t} value={t} className="text-xs text-slate-300 capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-400 font-medium">Voltage</Label>
                  <Input type="number" step={1} value={d.voltage?.toString() ?? ''} onChange={(e) => handleChange('voltage', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-400 font-medium">Current</Label>
                  <Input type="number" step={0.1} value={d.current?.toString() ?? ''} onChange={(e) => handleChange('current', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Power (kW)</Label>
                <Input type="number" step={0.1} value={d.power?.toString() ?? ''} onChange={(e) => handleChange('power', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Status</Label>
                <Select value={d.status || 'energized'} onValueChange={(v) => handleChange('status', v)}>
                  <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['energized', 'deenergized', 'fault', 'maintenance'].map((s) => (
                      <SelectItem key={s} value={s} className="text-xs text-slate-300 capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          );
        })()}

        {/* Control Node specific fields */}
        {nodeType === 'controlNode' && (() => {
          const d = data as unknown as ControlNodeData;
          return (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Name</Label>
                <Input value={d.name || ''} onChange={(e) => handleChange('name', e.target.value)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Controller Type</Label>
                <Select value={d.controllerType || 'PLC'} onValueChange={(v) => handleChange('controllerType', v)}>
                  <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['PLC', 'DCS', 'SIS', 'SCADA'].map((t) => (
                      <SelectItem key={t} value={t} className="text-xs text-slate-300">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Scan Rate (ms)</Label>
                <Input type="number" value={d.scanRate?.toString() ?? ''} onChange={(e) => handleChange('scanRate', e.target.value ? parseInt(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Program</Label>
                <Input value={d.program ?? ''} onChange={(e) => handleChange('program', e.target.value)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Status</Label>
                <Select value={d.status || 'running'} onValueChange={(v) => handleChange('status', v)}>
                  <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['running', 'stopped', 'fault', 'programming'].map((s) => (
                      <SelectItem key={s} value={s} className="text-xs text-slate-300 capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          );
        })()}

        {/* Heat Exchanger Node specific fields */}
        {nodeType === 'heatExchangerNode' && (() => {
          const d = data as unknown as HeatExchangerNodeData;
          return (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Name</Label>
                <Input value={d.name || ''} onChange={(e) => handleChange('name', e.target.value)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Exchanger Type</Label>
                <Select value={d.exchangerType || 'shell_tube'} onValueChange={(v) => handleChange('exchangerType', v)}>
                  <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['shell_tube', 'plate', 'air_cooled'].map((t) => (
                      <SelectItem key={t} value={t} className="text-xs text-slate-300 capitalize">{t.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-400 font-medium">Hot In (°C)</Label>
                  <Input type="number" step={0.1} value={d.hotIn?.toString() ?? ''} onChange={(e) => handleChange('hotIn', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-400 font-medium">Hot Out (°C)</Label>
                  <Input type="number" step={0.1} value={d.hotOut?.toString() ?? ''} onChange={(e) => handleChange('hotOut', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-400 font-medium">Cold In (°C)</Label>
                  <Input type="number" step={0.1} value={d.coldIn?.toString() ?? ''} onChange={(e) => handleChange('coldIn', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-400 font-medium">Cold Out (°C)</Label>
                  <Input type="number" step={0.1} value={d.coldOut?.toString() ?? ''} onChange={(e) => handleChange('coldOut', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Effectiveness (%)</Label>
                <Input type="number" step={0.1} min={0} max={100} value={d.effectiveness?.toString() ?? ''} onChange={(e) => handleChange('effectiveness', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
            </>
          );
        })()}

        {/* Vessel Node specific fields */}
        {nodeType === 'vesselNode' && (() => {
          const d = data as unknown as VesselNodeData;
          return (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Name</Label>
                <Input value={d.name || ''} onChange={(e) => handleChange('name', e.target.value)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Vessel Type</Label>
                <Select value={d.vesselType || 'separator'} onValueChange={(v) => handleChange('vesselType', v)}>
                  <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['separator', 'reactor', 'distillation', 'absorber', 'flash'].map((t) => (
                      <SelectItem key={t} value={t} className="text-xs text-slate-300 capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-400 font-medium">Pressure (bar)</Label>
                  <Input type="number" step={0.1} value={d.pressure?.toString() ?? ''} onChange={(e) => handleChange('pressure', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-400 font-medium">Temperature (°C)</Label>
                  <Input type="number" step={0.1} value={d.temperature?.toString() ?? ''} onChange={(e) => handleChange('temperature', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-400 font-medium">Level (%)</Label>
                <Input type="number" min={0} max={100} value={d.level?.toString() ?? ''} onChange={(e) => handleChange('level', e.target.value ? parseFloat(e.target.value) : null)} className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
              </div>
            </>
          );
        })()}

        {/* Node ID (read-only) */}
        <Separator className="bg-slate-700/50" />
        <div className="space-y-1">
          <span className="text-[10px] text-slate-500">Node ID</span>
          <p className="text-[10px] font-mono text-slate-600 break-all">{selectedNode.id}</p>
        </div>
      </div>
    </ScrollArea>
  );
}

// --- Flow Editor Inner ---

function FlowEditorInner({
  initialNodes,
  initialEdges,
  onSave,
  diagramName,
}: {
  initialNodes: Node[];
  initialEdges: Edge[];
  onSave: (nodes: Node[], edges: Edge[]) => void;
  diagramName: string;
}) {
  const { hasPermission, isAdmin } = useAuthStore();
  const canEdit = hasPermission('digital_twin.manage') || hasPermission('digital_twin.manage') || isAdmin();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const reactFlowInstance = useReactFlow();
  const { fitView, zoomIn, zoomOut, getNodes, getEdges } = reactFlowInstance;

  // toolbar states
  const [nodesDraggable, setNodesDraggable] = useState(true);
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true);
  const [minimapVisible, setMinimapVisible] = useState(true);

  // Validation state
  const validation = useMemo(() => validateDiagram(nodes, edges), [nodes, edges]);

  const onConnect = useCallback(
    (params: Connection) => {
      const edgeType = params.sourceHandle === 'signal' ? 'signalEdge' : 'processFlowEdge';
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: edgeType,
            data: edgeType === 'processFlowEdge' ? { flowStatus: 'normal' } : undefined,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      if (deleted.some((n) => n.id === selectedNode?.id)) {
        setSelectedNode(null);
      }
    },
    [selectedNode],
  );

  const addNodeAtCenter = useCallback(
    (type: string) => {
      const { x, y, zoom } = reactFlowInstance.getViewport();
      const position = reactFlowInstance.project({
        x: (window.innerWidth / 2 - x) / zoom - 90,
        y: (window.innerHeight / 2 - y) / zoom - 50,
      });
      const newNode = createNode(type, position);
      setNodes((nds) => [...nds, newNode]);
      setSelectedNode(newNode);
    },
    [reactFlowInstance, setNodes],
  );

  const updateNodeData = useCallback(
    (id: string, newData: Partial<Node['data']>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...newData } } : n)),
      );
      setSelectedNode((prev) => (prev?.id === id ? { ...prev, data: { ...prev.data, ...newData } } : prev));
    },
    [setNodes],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      if (selectedNode?.id === id) setSelectedNode(null);
    },
    [setNodes, setEdges, selectedNode],
  );

  const handleSave = useCallback(() => {
    const currentNodes = getNodes();
    const currentEdges = getEdges();
    onSave(currentNodes, currentEdges);
  }, [getNodes, getEdges, onSave]);

  // Register save event listener
  useEffect(() => {
    const handler = () => handleSave();
    window.addEventListener('diagram-save', handler);
    return () => window.removeEventListener('diagram-save', handler);
  }, [handleSave]);

  const handleExportImage = useCallback(() => {
    try {
      const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement;
      if (!viewportEl) return;

      // Clone viewport to capture current state
      const clone = viewportEl.cloneNode(true) as HTMLElement;
      clone.style.transform = 'none';
      
      const svgData = `
        <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
          <rect width="100%" height="100%" fill="#0f172a"/>
          <g transform="translate(0,0) scale(1)">
            ${clone.innerHTML}
          </g>
        </svg>`;

      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${diagramName || 'diagram'}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Diagram exported as SVG');
    } catch {
      toast.error('Failed to export image');
    }
  }, [diagramName]);

  const handleAutoLayout = useCallback(() => {
    const currentNodes = getNodes();
    const currentEdges = getEdges();
    const layouted = autoLayoutNodes(currentNodes, currentEdges);
    setNodes(layouted);
    setTimeout(() => fitView({ padding: 0.2 }), 50);
    toast.success('Auto-layout applied');
  }, [getNodes, getEdges, setNodes, fitView]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedNode && canEdit) {
        deleteNode(selectedNode.id);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        // ReactFlow's built-in undo via onNodesChange/onEdgesChange
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, canEdit, deleteNode, handleSave]);

  const toolbarBtnStyle = "h-7 w-7 text-slate-400 hover:bg-slate-700 hover:text-white";

  return (
    <div className="flex h-full w-full">
      {/* Canvas */}
      <div className="flex-1 relative" style={{ background: '#0f172a' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={canEdit && nodesDraggable ? onNodesChange : undefined}
          onEdgesChange={canEdit ? onEdgesChange : undefined}
          onConnect={canEdit ? onConnect : undefined}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodesDelete={onNodesDelete}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' } }}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode="Delete"
          selectionKeyCode="Shift"
          multiSelectionKeyCode="Shift"
          nodesDraggable={nodesDraggable}
          snapToGrid={snapToGridEnabled}
          snapGrid={[16, 16]}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />

          {minimapVisible && (
            <MiniMap
              nodeStrokeWidth={3}
              nodeColor={(n) => {
                const d = n.data as Record<string, unknown>;
                const status = d.status as string || d.state as string || 'operational';
                if (status === 'warning' || status === 'partial' || status === 'standby' || status === 'high') return '#f59e0b';
                if (status === 'critical' || status === 'alarm' || status === 'fault' || status === 'low') return '#ef4444';
                if (status === 'stopped' || status === 'inactive' || status === 'closed') return '#6b7280';
                return '#10b981';
              }}
              maskColor="rgba(15, 23, 42, 0.7)"
              style={{ background: '#1e293b', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 8 }}
            />
          )}
          <Controls
            showInteractive={false}
            style={{
              background: '#1e293b',
              border: '1px solid rgba(148,163,184,0.15)',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          />

          {/* ===== TOP TOOLBAR ===== */}
          <Panel position="top-left" className="pointer-events-auto">
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg" style={{
              background: 'rgba(30,41,59,0.9)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(148,163,184,0.12)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}>
              <TooltipProvider delayDuration={0}>
                {/* Add Node Dropdown */}
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white gap-1">
                        <Plus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Add Node</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="bg-slate-800 border-slate-700 min-w-[180px]">
                      <DropdownMenuItem onClick={() => addNodeAtCenter('assetNode')} className="text-xs text-slate-300 gap-2">
                        <Cpu className="h-3.5 w-3.5 text-emerald-400" /> Equipment
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addNodeAtCenter('sensorNode')} className="text-xs text-slate-300 gap-2">
                        <Thermometer className="h-3.5 w-3.5 text-sky-400" /> Sensor
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addNodeAtCenter('valveNode')} className="text-xs text-slate-300 gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-amber-400" /> Valve
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-slate-700" />
                      <DropdownMenuItem onClick={() => addNodeAtCenter('pumpNode')} className="text-xs text-slate-300 gap-2">
                        <Droplets className="h-3.5 w-3.5 text-cyan-400" /> Pump
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addNodeAtCenter('tankNode')} className="text-xs text-slate-300 gap-2">
                        <Layers className="h-3.5 w-3.5 text-teal-400" /> Tank
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addNodeAtCenter('motorNode')} className="text-xs text-slate-300 gap-2">
                        <Zap className="h-3.5 w-3.5 text-violet-400" /> Motor
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addNodeAtCenter('pipeNode')} className="text-xs text-slate-300 gap-2">
                        <Settings className="h-3.5 w-3.5 text-sky-400" /> Pipe
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-slate-700" />
                      <DropdownMenuItem onClick={() => addNodeAtCenter('junctionNode')} className="text-xs text-slate-300 gap-2">
                        <CircleDot className="h-3.5 w-3.5 text-slate-400" /> Junction
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-slate-700" />
                      <div className="px-2 py-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">P&ID</div>
                      <DropdownMenuItem onClick={() => addNodeAtCenter('instrumentNode')} className="text-xs text-slate-300 gap-2">
                        <Thermometer className="h-3.5 w-3.5 text-cyan-400" /> Instrument
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addNodeAtCenter('vesselNode')} className="text-xs text-slate-300 gap-2">
                        <FlaskConical className="h-3.5 w-3.5 text-slate-400" /> Vessel
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addNodeAtCenter('heatExchangerNode')} className="text-xs text-slate-300 gap-2">
                        <ArrowLeftRight className="h-3.5 w-3.5 text-orange-400" /> Heat Exchanger
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-slate-700" />
                      <div className="px-2 py-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Electrical</div>
                      <DropdownMenuItem onClick={() => addNodeAtCenter('electricalNode')} className="text-xs text-slate-300 gap-2">
                        <Zap className="h-3.5 w-3.5 text-amber-400" /> Electrical
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-slate-700" />
                      <div className="px-2 py-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Control</div>
                      <DropdownMenuItem onClick={() => addNodeAtCenter('controlNode')} className="text-xs text-slate-300 gap-2">
                        <Cpu className="h-3.5 w-3.5 text-violet-400" /> Controller
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <div className="w-px h-5 bg-slate-700" />

                {/* Undo/Redo (ReactFlow built-in) */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className={toolbarBtnStyle} disabled>
                      <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Undo</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className={toolbarBtnStyle} disabled>
                      <Redo2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Redo</TooltipContent>
                </Tooltip>

                <div className="w-px h-5 bg-slate-700" />

                {/* Zoom */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className={toolbarBtnStyle} onClick={() => zoomIn()}>
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom In</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className={toolbarBtnStyle} onClick={() => zoomOut()}>
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom Out</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className={toolbarBtnStyle} onClick={() => fitView({ padding: 0.2 })}>
                      <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fit View</TooltipContent>
                </Tooltip>

                <div className="w-px h-5 bg-slate-700" />

                {/* Lock/Unlock */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${!nodesDraggable ? 'text-amber-400 bg-amber-500/10' : toolbarBtnStyle}`}
                      onClick={() => setNodesDraggable(!nodesDraggable)}
                    >
                      {nodesDraggable ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{nodesDraggable ? 'Unlock nodes' : 'Lock nodes'}</TooltipContent>
                </Tooltip>

                {/* Grid Snap */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${snapToGridEnabled ? 'text-emerald-400 bg-emerald-500/10' : toolbarBtnStyle}`}
                      onClick={() => setSnapToGridEnabled(!snapToGridEnabled)}
                    >
                      <Grid3X3 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Grid Snap {snapToGridEnabled ? 'ON' : 'OFF'}</TooltipContent>
                </Tooltip>

                {/* Minimap Toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${minimapVisible ? 'text-emerald-400 bg-emerald-500/10' : toolbarBtnStyle}`}
                      onClick={() => setMinimapVisible(!minimapVisible)}
                    >
                      <Map className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Minimap</TooltipContent>
                </Tooltip>

                <div className="w-px h-5 bg-slate-700" />

                {/* Auto Layout */}
                {canEdit && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className={toolbarBtnStyle} onClick={handleAutoLayout}>
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Auto Layout</TooltipContent>
                  </Tooltip>
                )}

                {/* Export PNG */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className={toolbarBtnStyle} onClick={handleExportImage}>
                      <FileImage className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export as PNG</TooltipContent>
                </Tooltip>

                <div className="w-px h-5 bg-slate-700" />

                {/* Properties toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${propertiesOpen ? 'text-emerald-400 bg-emerald-500/10' : toolbarBtnStyle}`}
                      onClick={() => setPropertiesOpen(!propertiesOpen)}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Properties Panel</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </Panel>

          {/* Diagram name + validation overlay */}
          <Panel position="top-center">
            <div className="flex items-center gap-2 px-3 py-1 rounded-md" style={{
              background: 'rgba(30,41,59,0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(148,163,184,0.08)',
            }}>
              <span className="text-xs font-semibold text-slate-300">{diagramName}</span>
              {validation.warnings.length > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1 cursor-help">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {validation.warnings.length}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <div className="space-y-1">
                        {validation.warnings.slice(0, 5).map((w, i) => (
                          <p key={i} className="text-xs">{w}</p>
                        ))}
                        {validation.warnings.length > 5 && (
                          <p className="text-xs text-muted-foreground">...and {validation.warnings.length - 5} more</p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </Panel>

          {/* Bottom status bar */}
          <Panel position="bottom-left" className="pointer-events-auto">
            <div className="flex items-center gap-3 px-3 py-1 rounded-md text-[10px] text-slate-500" style={{
              background: 'rgba(30,41,59,0.7)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(148,163,184,0.06)',
            }}>
              <span>{nodes.length} nodes</span>
              <span>{edges.length} edges</span>
              {!nodesDraggable && (
                <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20 px-1.5 py-0">
                  <Lock className="h-2 w-2 mr-0.5" /> LOCKED
                </Badge>
              )}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Properties Panel */}
      {propertiesOpen && (
        <div className="w-72 border-l border-slate-700/50 flex flex-col" style={{ background: '#1e293b' }}>
          <div className="px-3 py-2.5 border-b border-slate-700/50 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Properties</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-slate-300" onClick={() => setPropertiesOpen(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <PropertiesPanel
              selectedNode={selectedNode}
              onUpdateNode={updateNodeData}
              onDeleteNode={deleteNode}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FLOW EDITOR WRAPPER
// ============================================================================

function FlowEditor(props: Parameters<typeof FlowEditorInner>[0]) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}

// ============================================================================
// MAIN SYSTEM DIAGRAM PAGE
// ============================================================================

export default function SystemDiagramPage({ twinId, twinName }: { twinId?: string; twinName?: string } = {}) {
  const { hasPermission, isAdmin, user } = useAuthStore();
  const canEdit = hasPermission('digital_twin.manage') || hasPermission('digital_twin.manage') || isAdmin();

  // List state
  const [diagrams, setDiagrams] = useState<SystemDiagram[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [totalCount, setTotalCount] = useState(0);

  // Editor state
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [currentDiagram, setCurrentDiagram] = useState<SystemDiagram | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  // Twin context (when opened from digital twin viewer)
  const [twinContext] = useState({ twinId: twinId || null, twinName: twinName || null });

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', type: 'process' });

  // Template dialog
  const [templateOpen, setTemplateOpen] = useState(false);

  // Template gallery dialog
  const [galleryOpen, setGalleryOpen] = useState(false);

  // Fetch diagrams
  const fetchDiagrams = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      params.set('limit', '50');

      const res = await api.get(`/api/system-diagrams?${params.toString()}`);
      if (res.success && Array.isArray(res.data)) {
        setDiagrams(res.data);
        setTotalCount(res.data.length);
      }
    } catch {
      toast.error('Failed to load diagrams');
    }
    setLoading(false);
  }, [searchQuery, typeFilter]);

  useEffect(() => { fetchDiagrams(); }, [fetchDiagrams]);

  // Create diagram
  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast.error('Diagram name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/api/system-diagrams', {
        name: createForm.name,
        description: createForm.description || null,
        type: createForm.type,
        nodes: [],
        edges: [],
      });
      if (res.success && res.data) {
        toast.success('Diagram created');
        setCreateOpen(false);
        setCreateForm({ name: '', description: '', type: 'process' });
        const diagram = res.data as SystemDiagram;
        setCurrentDiagram(diagram);
        setEditorKey((k) => k + 1);
        setView('editor');
        fetchDiagrams();
      } else {
        toast.error(res.error || 'Failed to create diagram');
      }
    } catch {
      toast.error('Failed to create diagram');
    }
    setSaving(false);
  };

  // Load from template
  const handleLoadTemplate = async (template: DiagramTemplate) => {
    setSaving(true);
    try {
      const res = await api.post('/api/system-diagrams', {
        name: `${template.name} - Copy`,
        description: template.description,
        type: template.diagramType,
        nodes: template.nodes,
        edges: template.edges,
      });
      if (res.success && res.data) {
        toast.success(`Loaded "${template.name}" template`);
        setTemplateOpen(false);
        setGalleryOpen(false);
        const diagram = res.data as SystemDiagram;
        setCurrentDiagram(diagram);
        setEditorKey((k) => k + 1);
        setView('editor');
        fetchDiagrams();
      } else {
        toast.error(res.error || 'Failed to load template');
      }
    } catch {
      toast.error('Failed to load template');
    }
    setSaving(false);
  };

  // Duplicate diagram
  const handleDuplicateDiagram = async (diagram: SystemDiagram) => {
    setSaving(true);
    try {
      const res = await api.post('/api/system-diagrams', {
        name: `${diagram.name} (Copy)`,
        description: diagram.description,
        type: diagram.type,
        nodes: parseNodes(diagram),
        edges: parseEdges(diagram),
      });
      if (res.success && res.data) {
        toast.success('Diagram duplicated');
        fetchDiagrams();
      } else {
        toast.error(res.error || 'Failed to duplicate diagram');
      }
    } catch {
      toast.error('Failed to duplicate diagram');
    }
    setSaving(false);
  };

  // Open existing diagram
  const handleOpenDiagram = (diagram: SystemDiagram) => {
    setCurrentDiagram(diagram);
    setEditorKey((k) => k + 1);
    setView('editor');
  };

  // Save diagram
  const handleSaveDiagram = async (nodes: Node[], edges: Edge[]) => {
    if (!currentDiagram) return;
    setSaving(true);
    try {
      const res = await api.put(`/api/system-diagrams/${currentDiagram.id}`, {
        nodes,
        edges,
      });
      if (res.success) {
        toast.success('Diagram saved');
        setCurrentDiagram((prev) => prev ? { ...prev, nodes: JSON.stringify(nodes), edges: JSON.stringify(edges), version: (prev.version || 0) + 1 } : null);
      } else {
        toast.error(res.error || 'Failed to save diagram');
      }
    } catch {
      toast.error('Failed to save diagram');
    }
    setSaving(false);
  };

  // Delete diagram
  const handleDeleteDiagram = async (id: string) => {
    try {
      const res = await api.delete(`/api/system-diagrams/${id}`);
      if (res.success) {
        toast.success('Diagram deleted');
        setDiagrams((prev) => prev.filter((d) => d.id !== id));
        if (currentDiagram?.id === id) {
          setCurrentDiagram(null);
          setView('list');
        }
      } else {
        toast.error(res.error || 'Failed to delete diagram');
      }
    } catch {
      toast.error('Failed to delete diagram');
    }
  };

  // Map flat seed types to ReactFlow custom node types
  const flatTypeToReactFlow: Record<string, string> = {
    process: 'assetNode',
    equipment: 'assetNode',
    instrument: 'instrumentNode',
    tank: 'tankNode',
    utility: 'assetNode',
    sensor: 'sensorNode',
    valve: 'valveNode',
    pump: 'pumpNode',
    motor: 'motorNode',
    pipe: 'pipeNode',
    junction: 'junctionNode',
    electrical: 'electricalNode',
    control: 'controlNode',
    heatExchanger: 'heatExchangerNode',
    vessel: 'vesselNode',
    dryer: 'heatExchangerNode',
  };

  // Parse nodes/edges from stored JSON, normalizing flat format to ReactFlow format
  const parseNodes = (diagram: SystemDiagram): Node[] => {
    try {
      const parsed = JSON.parse(diagram.nodes);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((n: Record<string, unknown>) => {
        // Already in ReactFlow format (has position object)
        if (n.position && typeof n.position === 'object') {
          return n as unknown as Node;
        }
        // Flat format: { id, label, x, y, type } → ReactFlow format
        const x = typeof n.x === 'number' ? n.x : 0;
        const y = typeof n.y === 'number' ? n.y : 0;
        const rawType = (n.type as string) || 'assetNode';
        const nodeType = flatTypeToReactFlow[rawType] || rawType;
        return {
          id: String(n.id),
          type: nodeType,
          position: { x, y },
          data: {
            label: String(n.label || n.id || ''),
            assetType: n.assetType || null,
            status: n.status || 'operational',
            criticality: n.criticality || 'medium',
            health: n.health || 100,
            parameters: n.parameters || [],
            assetId: n.assetId || null,
          },
        } as Node;
      });
    } catch {
      return [];
    }
  };

  const parseEdges = (diagram: SystemDiagram): Edge[] => {
    try {
      const parsed = JSON.parse(diagram.edges);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((e: Record<string, unknown>) => {
        // Already in ReactFlow format (has source property)
        if (e.source) {
          return e as unknown as Edge;
        }
        // Flat format: { id, from, to, label?, type? } → ReactFlow format
        // Default to processFlowEdge for animated flow visualization
        const rawType = e.type as string | undefined;
        return {
          id: String(e.id),
          source: String(e.from || ''),
          target: String(e.to || ''),
          ...(e.label ? { label: String(e.label) } : {}),
          // Map flat format types to custom edge types with animation
          type: rawType === 'pipe' ? 'pipeEdge'
              : rawType === 'signal' ? 'signalEdge'
              : rawType === 'cable' ? 'cableEdge'
              : rawType === 'dashed' ? 'processFlowEdge'
              : 'processFlowEdge',
          data: {
            ...(e.data as Record<string, unknown> || {}),
            // Ensure flowStatus is set for animation
            flowStatus: ((e.data as Record<string, unknown>)?.flowStatus as string) || 'normal',
          },
          ...(e.style ? { style: e.style } : {}),
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#10b981' },
        } as Edge;
      });
    } catch {
      return [];
    }
  };

  // Filter diagrams
  const filteredDiagrams = useMemo(() => {
    return diagrams;
  }, [diagrams]);

  // ============ LIST VIEW ============
  if (view === 'list') {
    return (
      <div className="page-content">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">System Diagrams</h1>
            <p className="text-muted-foreground mt-1">-grade process and instrumentation diagrams</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setGalleryOpen(true)} className="gap-2">
              <LayoutGrid className="h-4 w-4" />
              Template Gallery
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)} className="gap-2">
              <Copy className="h-4 w-4" />
              Templates
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                New Diagram
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search diagrams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(diagramTypeMeta).map(([key, meta]) => (
                <SelectItem key={key} value={key}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{totalCount} diagram{totalCount !== 1 ? 's' : ''}</span>
        </div>

        {/* Diagram Cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border/60 p-5">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-full mb-4" />
                <Skeleton className="h-32 w-full rounded-lg mb-3" />
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredDiagrams.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
              <Layers className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-sm font-semibold mb-1">No diagrams found</h3>
            <p className="text-xs text-muted-foreground mb-4">
              {searchQuery || typeFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first diagram or load a template'}
            </p>
            <div className="flex items-center gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={() => setGalleryOpen(true)} className="gap-2">
                <LayoutGrid className="h-3.5 w-3.5" />
                Template Gallery
              </Button>
              {canEdit && (
                <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
                  <Plus className="h-3.5 w-3.5" />
                  Create New
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDiagrams.map((diagram) => {
              const typeMeta = diagramTypeMeta[diagram.type] || diagramTypeMeta.process;
              const nodeCount = (() => { try { return JSON.parse(diagram.nodes).length; } catch { return 0; } })();
              const edgeCount = (() => { try { return JSON.parse(diagram.edges).length; } catch { return 0; } })();
              const timeAgo = new Date(diagram.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              const lastEditor = diagram.updatedByIdUser?.fullName || diagram.createdByIdUser?.fullName || 'Unknown';

              return (
                <div
                  key={diagram.id}
                  className="group rounded-xl border border-border/60 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden"
                  onClick={() => handleOpenDiagram(diagram)}
                >
                  {/* Mini preview area */}
                  <div className="h-36 rounded-t-xl relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
                    <div className="absolute inset-0 opacity-20" style={{
                      backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)',
                      backgroundSize: '16px 16px',
                    }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-slate-500/50">{nodeCount}</div>
                        <div className="text-[10px] text-slate-600">nodes</div>
                      </div>
                    </div>
                    {/* Type badge */}
                    <div className="absolute top-2 left-2">
                      <Badge variant="outline" className={`text-[10px] font-medium ${typeMeta.color} ${typeMeta.bgColor} border-0`}>
                        {typeMeta.label}
                      </Badge>
                    </div>
                    {/* Version badge */}
                    <div className="absolute top-2 right-2">
                      <Badge variant="outline" className="text-[10px] bg-slate-800/80 text-slate-400 border-slate-700">
                        v{diagram.version || 1}
                      </Badge>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-4">
                    <h3 className="font-semibold text-sm truncate">{diagram.name}</h3>
                    {diagram.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{diagram.description}</p>
                    )}

                    {/* Collaboration info */}
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span className="truncate">{lastEditor}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <Clock className="h-3 w-3 flex-shrink-0" />
                      <span>{timeAgo}</span>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{nodeCount} nodes</span>
                        <span>{edgeCount} edges</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
                        {canEdit && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => handleOpenDiagram(diagram)} className="text-xs gap-2">
                                <FolderOpen className="h-3.5 w-3.5" /> Open
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { handleDuplicateDiagram(diagram); }} className="text-xs gap-2">
                                <Copy className="h-3.5 w-3.5" /> Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleDeleteDiagram(diagram.id)} className="text-xs gap-2 text-red-500 focus:text-red-500">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create System Diagram</DialogTitle>
              <DialogDescription>Start a new diagram from scratch or load a pre-built template</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Diagram Name *</Label>
                <Input
                  placeholder="e.g. Chilled Water Distribution"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  placeholder="Optional description..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Diagram Type</Label>
                <Select value={createForm.type} onValueChange={(v) => setCreateForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(diagramTypeMeta).map(([key, meta]) => (
                      <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={saving || !createForm.name.trim()}>
                {saving ? 'Creating...' : 'Create Diagram'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Template List Dialog */}
        <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
          <DialogContent className="sm:max-w-lg max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Diagram Templates</DialogTitle>
              <DialogDescription>Load a pre-built enterprise diagram template</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="grid gap-3 py-2">
                {diagramTemplates.map((template) => {
                  const meta = diagramTypeMeta[template.diagramType];
                  return (
                    <div
                      key={template.id}
                      className="flex items-center gap-4 p-3 rounded-lg border border-border/60 hover:border-primary/30 hover:bg-muted/30 cursor-pointer transition-all"
                      onClick={() => handleLoadTemplate(template)}
                    >
                      <div className={`w-12 h-12 rounded-xl ${meta.bgColor} flex items-center justify-center shrink-0`}>
                        {template.diagramType === 'hvac' && <Wind className="h-5 w-5 text-sky-500" />}
                        {template.diagramType === 'electrical' && <Zap className="h-5 w-5 text-amber-500" />}
                        {template.diagramType === 'process' && <FlaskConical className="h-5 w-5 text-emerald-500" />}
                        {template.diagramType === 'piping' && <Droplets className="h-5 w-5 text-cyan-500" />}
                        {template.diagramType === 'safety' && <Shield className="h-5 w-5 text-red-500" />}
                        {template.diagramType === 'control' && <Settings className="h-5 w-5 text-violet-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold">{template.name}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="outline" className={`text-[10px] ${meta.color} ${meta.bgColor} border-0`}>
                            {meta.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {template.nodes.length} nodes / {template.edges.length} edges
                          </span>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="shrink-0 gap-1" disabled={saving}>
                        <Copy className="h-3.5 w-3.5" />
                        Use
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTemplateOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Template Gallery Dialog */}
        <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Template Gallery</DialogTitle>
              <DialogDescription>Choose a pre-built enterprise diagram template to get started</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-2">
                {diagramTemplates.map((template) => {
                  const meta = diagramTypeMeta[template.diagramType];
                  return (
                    <div
                      key={template.id}
                      className="rounded-xl border border-border/60 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer overflow-hidden group"
                      onClick={() => handleLoadTemplate(template)}
                    >
                      {/* Preview */}
                      <div className="h-40">
                        <TemplatePreview template={template} />
                      </div>
                      {/* Info */}
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={`text-[9px] ${meta.color} ${meta.bgColor} border-0`}>
                            {meta.label}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground">
                            {template.nodes.length} nodes · {template.edges.length} edges
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold mt-1.5">{template.name}</h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
                        <Button
                          variant="ghost" size="sm"
                          className="w-full mt-2 h-7 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          disabled={saving}
                        >
                          <Copy className="h-3 w-3" />
                          Use Template
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGalleryOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ============ EDITOR VIEW ============
  const nodes = currentDiagram ? parseNodes(currentDiagram) : [];
  const edges = currentDiagram ? parseEdges(currentDiagram) : [];

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col" style={{ background: '#0f172a' }}>
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50 shrink-0" style={{ background: '#1e293b' }}>
        <div className="flex items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1 text-slate-400 hover:text-white" onClick={() => setView('list')}>
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs">Back</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to list</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Separator orientation="vertical" className="h-5 bg-slate-700" />
          <div>
            <h2 className="text-sm font-semibold text-slate-200">{currentDiagram?.name || 'New Diagram'}</h2>
            {currentDiagram?.description && (
              <p className="text-[10px] text-slate-500 line-clamp-1">{currentDiagram.description}</p>
            )}
          </div>
          {currentDiagram && (
            <Badge variant="outline" className={`text-[10px] ${diagramTypeMeta[currentDiagram.type]?.bgColor || ''} ${diagramTypeMeta[currentDiagram.type]?.color || ''} border-0`}>
              {diagramTypeMeta[currentDiagram.type]?.label || currentDiagram.type}
            </Badge>
          )}
          {currentDiagram && (
            <Badge variant="outline" className="text-[10px] bg-slate-800/80 text-slate-400 border-slate-700">
              v{currentDiagram.version || 1}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canEdit && currentDiagram && (
            <Button
              size="sm"
              onClick={() => {
                const event = new CustomEvent('diagram-save');
                window.dispatchEvent(event);
              }}
              disabled={saving}
              className="gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">{saving ? 'Saving...' : 'Save'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Editor Canvas */}
      <div className="flex-1 overflow-hidden">
        <FlowEditor
          key={editorKey}
          initialNodes={nodes}
          initialEdges={edges}
          onSave={handleSaveDiagram}
          diagramName={currentDiagram?.name || 'New Diagram'}
        />
      </div>
    </div>
  );
}
