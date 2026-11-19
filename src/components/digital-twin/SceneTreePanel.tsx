'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  TreePine,
  Circle,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronsUpDown,
  ChevronsDownUp,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { buildImportedAnatomyTree, type ImportedAnatomyMesh, type AnatomyTreeNode } from './anatomyBindings';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useDigitalTwinStore,
  type DigitalTwinScene,
  type MeshHealthEntry,
} from '@/stores/digitalTwinStore';

// ============================================================================
// Types
// ============================================================================

/** A tree node representing a mesh or assembly in the BOM structure */
interface TreeNode {
  id: string;
  name: string;
  meshName?: string;
  assetId?: string;
  assetName?: string;
  healthStatus?: MeshHealthEntry['status'];
  sourcePath?: string;
  componentCode?: string;
  verified?: boolean;
  children: TreeNode[];
  isExpanded?: boolean;
}

export interface SceneTreePanelProps {
  /** Whether the panel is visible */
  isOpen?: boolean;
  /** Callback to toggle panel visibility */
  onToggle?: () => void;
  /** Callback when a mesh is selected from the tree */
  onMeshSelect?: (meshName: string, assetId?: string) => void;
  /** External tree data (optional, auto-derived from scene if not provided) */
  treeData?: TreeNode[];
  /** Imported GLB/glTF hierarchy; populated only from actual CAD nodes. */
  anatomyMeshes?: ImportedAnatomyMesh[];
}

// ============================================================================
// Helper: Build tree from scene data
// ============================================================================

function buildTreeFromScene(
  scene: DigitalTwinScene | null,
  healthMap: Record<string, MeshHealthEntry>,
): TreeNode[] {
  if (!scene) return [];

  const meshNames = new Set<string>();

  if (scene.hotspots) {
    for (const hs of scene.hotspots) {
      meshNames.add(hs.meshName);
    }
  }

  if (scene.annotations) {
    for (const ann of scene.annotations) {
      if (ann.meshName) meshNames.add(ann.meshName);
    }
  }

  for (const key of Object.keys(healthMap)) {
    meshNames.add(key);
  }

  const children: TreeNode[] = Array.from(meshNames).map(name => {
    const health = healthMap[name];
    return {
      id: name,
      name: name.replace(/_/g, ' ').replace(/-/g, ' '),
      meshName: name,
      assetId: scene.assetId,
      assetName: scene.name,
      healthStatus: health?.status,
      children: [],
    };
  });

  return [
    {
      id: 'root',
      name: scene.name || 'Digital Twin',
      assetId: scene.assetId,
      children,
      isExpanded: true,
    },
  ];
}

function treeFromAnatomy(nodes: ReadonlyArray<AnatomyTreeNode>): TreeNode[] {
  return nodes.map(node=>({
    id:node.id,
    name:node.name,
    ...(node.mesh?{
      meshName:node.mesh.selectionKey,
      assetId:node.mesh.assetId || undefined,
      sourcePath:node.mesh.path,
      componentCode:node.mesh.componentCode,
      verified:node.mesh.verified,
    }:{}),
    children:treeFromAnatomy(node.children),
  }));
}

// ============================================================================
// Helper: Count all descendant nodes
// ============================================================================

function countDescendants(node: TreeNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  return count;
}

// ============================================================================
// Health status dot component
// ============================================================================

function HealthDot({ status }: { status?: MeshHealthEntry['status'] }) {
  if (!status) return <Circle className="h-2.5 w-2.5 text-slate-500" />;

  const colorMap: Record<string, string> = {
    healthy: 'text-emerald-400',
    warning: 'text-amber-400',
    critical: 'text-red-400',
    unknown: 'text-slate-500',
  };

  return (
    <Circle
      className={`h-2.5 w-2.5 fill-current ${colorMap[status] ?? colorMap.unknown}`}
    />
  );
}

// ============================================================================
// Component Count Badge
// ============================================================================

function ComponentCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge
      variant="outline"
      className="h-4 px-1.5 text-[9px] text-slate-400 border-slate-700 bg-slate-800/50 rounded-full leading-none"
    >
      {count}
    </Badge>
  );
}

// ============================================================================
// Tree Node Component (controlled expansion from parent)
// ============================================================================

interface TreeNodeItemProps {
  node: TreeNode;
  depth: number;
  selectedMeshName: string | null;
  expandedNodes: Set<string>;
  onSelect: (node: TreeNode) => void;
  onToggleExpand: (nodeId: string) => void;
}

function TreeNodeItem({
  node,
  depth,
  selectedMeshName,
  expandedNodes,
  onSelect,
  onToggleExpand,
}: TreeNodeItemProps) {
  const hasChildren = node.children.length > 0;
  const isSelected = node.meshName ? selectedMeshName === node.meshName : false;
  const isExpanded = expandedNodes.has(node.id);
  const childCount = countDescendants(node);

  return (
    <div>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`
                flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer
                transition-colors duration-100 text-xs group
                ${isSelected
                  ? 'bg-cyan-500/15 text-cyan-300 shadow-sm shadow-cyan-500/5'
                  : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'
                }
              `}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              onClick={() => {
                if (hasChildren) onToggleExpand(node.id);
                if (node.meshName) onSelect(node);
              }}
            >
              {/* Expand/collapse arrow */}
              {hasChildren ? (
                <button
                  className="flex items-center justify-center h-3.5 w-3.5 rounded hover:bg-white/10 transition-colors shrink-0"
                  onClick={e => {
                    e.stopPropagation();
                    onToggleExpand(node.id);
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-slate-500" />
                  )}
                </button>
              ) : (
                <div className="w-3.5 shrink-0 flex items-center justify-center">
                  <div className="h-1 w-1 rounded-full bg-slate-600" />
                </div>
              )}

              {/* Health dot */}
              <HealthDot status={node.healthStatus} />

              {/* Node name */}
              <span className={`truncate flex-1 font-medium ${isSelected ? 'text-cyan-300' : ''}`}>
                {node.name}
              </span>

              {node.meshName && node.sourcePath && (
                <span className={node.verified
                    ? 'shrink-0 rounded bg-emerald-500/15 px-1 text-[9px] text-emerald-300'
                    : 'shrink-0 rounded bg-slate-700 px-1 text-[9px] text-slate-400'}>
                  {node.verified ? 'Linked' : 'Visual'}
                </span>
              )}

              {/* Component count badge */}
              {hasChildren && !isExpanded && (
                <ComponentCountBadge count={childCount} />
              )}

              {/* Asset indicator (root node) */}
              {node.assetId && !node.meshName && (
                <TreePine className="h-3 w-3 text-slate-500 opacity-60" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className="bg-slate-900 border-slate-700 text-slate-200 text-xs max-w-[200px]"
          >
            <div>
              <p className="font-medium">{node.name}</p>
              {node.meshName && (
                <>
                  <p className="text-[10px] text-slate-400 mt-0.5 break-all">Source: {node.sourcePath || node.meshName}</p>
                  <p className="text-[10px] mt-1 text-slate-300">
                    {node.verified
                      ? `Linked to verified component ${node.componentCode || ''}`
                      : 'Visual geometry only · not a verified maintenance part'}
                  </p>
                </>
              )}
              {node.healthStatus && (
                <p className="text-[10px] mt-0.5">
                  Health:{' '}
                  <span className={
                    node.healthStatus === 'healthy' ? 'text-emerald-400' :
                    node.healthStatus === 'warning' ? 'text-amber-400' :
                    'text-red-400'
                  }>
                    {node.healthStatus}
                  </span>
                </p>
              )}
              {childCount > 0 && (
                <p className="text-[10px] text-slate-400 mt-0.5">{childCount} components</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Children (only render when expanded) */}
      {hasChildren && isExpanded && (
        <div className="animate-in fade-in-0 duration-150 slide-in-from-top-1">
          {node.children.map(child => (
            <TreeNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedMeshName={selectedMeshName}
              expandedNodes={expandedNodes}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main SceneTreePanel Component
// ============================================================================

export function SceneTreePanel({
  isOpen = true,
  onToggle,
  onMeshSelect,
  treeData: externalTreeData,
  anatomyMeshes,
}: SceneTreePanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));
  const currentScene = useDigitalTwinStore(s => s.currentScene);
  const selectedMeshName = useDigitalTwinStore(s => s.selectedMeshName);
  const selectMesh = useDigitalTwinStore(s => s.selectMesh);
  const iotHealthMap = useDigitalTwinStore(s => s.iotHealthMap);

  // Build tree data
  const treeData = useMemo(() => {
    if (externalTreeData) return externalTreeData;
    if (anatomyMeshes?.length) {
      return [{
        id:'root', name:currentScene?.name || 'Imported CAD Assembly',
        children:treeFromAnatomy(buildImportedAnatomyTree(anatomyMeshes)),
      }];
    }
    return buildTreeFromScene(currentScene, iotHealthMap);
  }, [externalTreeData, anatomyMeshes, currentScene, iotHealthMap]);

  // Filter tree by search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return treeData;

    const query = searchQuery.toLowerCase();

    function filterNodes(nodes: TreeNode[]): TreeNode[] {
      return nodes.reduce<TreeNode[]>((acc, node) => {
        const nameMatch = [node.name,node.meshName,node.sourcePath,node.componentCode]
          .some(value=>value?.toLowerCase().includes(query));
        const filteredChildren = filterNodes(node.children);

        if (nameMatch || filteredChildren.length > 0) {
          acc.push({
            ...node,
            children: filteredChildren,
            isExpanded: true,
          });
        }
        return acc;
      }, []);
    }

    return filterNodes(treeData);
  }, [treeData, searchQuery]);

  // Count total nodes
  const totalNodes = useMemo(() => {
    let count = 0;
    function countNodes(nodes: TreeNode[]) {
      for (const node of nodes) {
        count++;
        countNodes(node.children);
      }
    }
    countNodes(treeData);
    return count;
  }, [treeData]);

  // Auto-expand all when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      const allIds = new Set<string>();
      function collectIds(nodes: TreeNode[]) {
        for (const node of nodes) {
          allIds.add(node.id);
          collectIds(node.children);
        }
      }
      collectIds(filteredTree);
      setExpandedNodes(allIds);
    }
  }, [searchQuery, filteredTree]);

  // Toggle expand/collapse for a single node
  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Expand all
  const handleExpandAll = useCallback(() => {
    const allIds = new Set<string>();
    function collectIds(nodes: TreeNode[]) {
      for (const node of nodes) {
        allIds.add(node.id);
        collectIds(node.children);
      }
    }
    collectIds(filteredTree);
    setExpandedNodes(allIds);
  }, [filteredTree]);

  // Collapse all
  const handleCollapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  // Handle mesh selection
  const handleSelect = useCallback(
    (node: TreeNode) => {
      if (onMeshSelect && node.meshName) {
        onMeshSelect(node.meshName, node.assetId || '');
      } else if (node.meshName) {
        selectMesh(node.meshName, node.assetId || '');
      }
    },
    [onMeshSelect, selectMesh],
  );

  // Collapsed state — show only toggle button
  if (!isOpen) {
    return (
      <div className="absolute top-3 left-3 z-30">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                className="h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
                style={{
                  background: 'rgba(15,15,25,0.8)',
                  border: '1px solid rgba(148,163,184,0.12)',
                  backdropFilter: 'blur(16px)',
                }}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-slate-900 border-slate-700 text-slate-200 text-xs">
              Scene Tree ({totalNodes} nodes)
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div
      className="absolute top-0 left-0 z-20 h-full flex flex-col"
      style={{
        width: '280px',
        background: 'rgba(10,10,18,0.92)',
        borderRight: '1px solid rgba(148,163,184,0.1)',
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <TreePine className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-200 tracking-wide uppercase">
            {anatomyMeshes?.length ? 'Imported CAD Anatomy' : 'Scene Tree'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-slate-400 border-slate-700">
            {totalNodes}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-6 w-6 text-slate-400 hover:text-slate-200"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-7 pl-7 pr-7 text-xs bg-white/5 border-white/10 rounded-md text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-cyan-500/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Expand/Collapse All */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/5">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExpandAll}
                className="h-6 px-2 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-white/5"
              >
                <ChevronsUpDown className="h-3 w-3 mr-1" />
                Expand All
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-slate-900 border-slate-700 text-slate-200 text-[10px]">
              Expand all tree nodes
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCollapseAll}
                className="h-6 px-2 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-white/5"
              >
                <ChevronsDownUp className="h-3 w-3 mr-1" />
                Collapse All
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-slate-900 border-slate-700 text-slate-200 text-[10px]">
              Collapse all tree nodes
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {filteredTree.length > 0 ? (
            filteredTree.map(node => (
              <TreeNodeItem
                key={node.id}
                node={node}
                depth={0}
                selectedMeshName={selectedMeshName}
                expandedNodes={expandedNodes}
                onSelect={handleSelect}
                onToggleExpand={handleToggleExpand}
              />
            ))
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <Search className="h-6 w-6 mb-2 opacity-50" />
              <span className="text-xs">No nodes match &ldquo;{searchQuery}&rdquo;</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <TreePine className="h-6 w-6 mb-2 opacity-50" />
              <span className="text-xs">No scene loaded</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-white/5 text-[10px] text-slate-500">
        <span>
          {filteredTree.length} node{filteredTree.length !== 1 ? 's' : ''}
        </span>
        {selectedMeshName && (
          <span className="text-cyan-400 flex items-center gap-1">
            <Circle className="h-1.5 w-1.5 fill-current" />
            Selected: {selectedMeshName.replace(/_/g, ' ')}
          </span>
        )}
      </div>
    </div>
  );
}

export default SceneTreePanel;
