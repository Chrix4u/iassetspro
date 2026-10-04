'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Link2, Plus, Trash2, X, RefreshCw,
  Package, Cpu, Droplets, Wrench, BookOpen, ClipboardCheck,
  Settings, Save
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const MAPPING_TYPES = [
  { value: 'component', label: 'Component', icon: Settings, color: '#10b981' },
  { value: 'spare_part', label: 'Spare Part', icon: Package, color: '#f59e0b' },
  { value: 'sensor', label: 'IoT Sensor', icon: Cpu, color: '#3b82f6' },
  { value: 'inspection_point', label: 'Inspection Point', icon: ClipboardCheck, color: '#8b5cf6' },
  { value: 'lubrication_point', label: 'Lubrication Point', icon: Droplets, color: '#06b6d4' },
  { value: 'pm_schedule', label: 'PM Schedule', icon: RefreshCw, color: '#ec4899' },
  { value: 'tool_requirement', label: 'Tool Requirement', icon: Wrench, color: '#f97316' },
  { value: 'work_instruction', label: 'Work Instruction', icon: BookOpen, color: '#14b8a6' },
];

interface MappingRecord {
  id: string;
  meshName: string;
  meshPath: string;
  mappingType: string;
  targetId: string;
  targetName?: string | null;
  color?: string | null;
  opacity: number;
  isHighlighted: boolean;
  isVisible: boolean;
}

interface ComponentMappingEditorProps {
  modelId: string;
  availableMeshes?: string[];
  onMappingSelect?: (mapping: MappingRecord) => void;
  onMappingToggle?: (mapping: MappingRecord, visible: boolean) => void;
}

export function ComponentMappingEditor({ modelId, availableMeshes = [], onMappingSelect, onMappingToggle }: ComponentMappingEditorProps) {
  const [mappings, setMappings] = useState<MappingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ meshName: '', meshPath: '', mappingType: 'component', targetId: '', targetName: '' });

  useEffect(() => {
    fetchMappings();
  }, [modelId, typeFilter, search]);

  const fetchMappings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ modelId, limit: '100' });
      if (typeFilter !== 'all') params.set('mappingType', typeFilter);
      if (search) params.set('search', search);
      const res = await api.get(`/api/mesh-mappings?${params}`);
      if (res.success) {
        setMappings(res.data?.data || []);
        setTypeCounts(res.data?.typeCounts || {});
      }
    } catch (err) {
      console.error('Failed to fetch mappings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!modelId || !addForm.meshName || !addForm.targetId) return;
    try {
      await api.post('/api/mesh-mappings', {
        modelId,
        ...addForm,
        meshPath: addForm.meshPath.trim() || addForm.meshName,
      });
      setShowAddForm(false);
      setAddForm({ meshName: '', meshPath: '', mappingType: 'component', targetId: '', targetName: '' });
      fetchMappings();
    } catch (err) {
      console.error('Failed to create mapping:', err);
    }
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/api/mesh-mappings/${id}`);
    fetchMappings();
  };

  const getTypeConfig = (type: string) => MAPPING_TYPES.find(t => t.value === type) || MAPPING_TYPES[0];

  return (
    <div className="space-y-4">
      {/* Type filter chips */}
      <div className="flex flex-wrap gap-2">
        <Badge variant={typeFilter === 'all' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setTypeFilter('all')}>
          All ({Object.values(typeCounts).reduce((a, b) => a + b, 0)})
        </Badge>
        {MAPPING_TYPES.map(t => (
          <Badge
            key={t.value}
            variant={typeFilter === t.value ? 'default' : 'outline'}
            className="cursor-pointer"
            style={typeFilter === t.value ? { backgroundColor: t.color, borderColor: t.color, color: '#fff' } : { borderColor: t.color, color: t.color }}
            onClick={() => setTypeFilter(t.value)}
          >
            {t.label} ({typeCounts[t.value] || 0})
          </Badge>
        ))}
      </div>

      {/* Add mapping button */}
      {!showAddForm ? (
        <Button variant="outline" className="w-full" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-2" />Add Component Mapping
        </Button>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">New Mapping</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAddForm(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Mesh Name</label>
                <Input placeholder="e.g., Pump_Impeller" value={addForm.meshName} onChange={e => setAddForm(f => ({ ...f, meshName: e.target.value }))} list="mesh-list" />
                {availableMeshes.length > 0 && (
                  <datalist id="mesh-list">
                    {availableMeshes.filter(m => !mappings.some(mp => mp.meshName === m)).map(m => <option key={m} value={m} />)}
                  </datalist>
                )}
              </div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Mesh Path</label>
                <Input placeholder="Root/Assembly/Part" value={addForm.meshPath} onChange={e => setAddForm(f => ({ ...f, meshPath: e.target.value }))} />
              </div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Type</label>
                <Select value={addForm.mappingType} onValueChange={v => setAddForm(f => ({ ...f, mappingType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MAPPING_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Target ID</label>
                <Input placeholder="Component/Part ID" value={addForm.targetId} onChange={e => setAddForm(f => ({ ...f, targetId: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">Display Name</label>
              <Input placeholder="Optional display name" value={addForm.targetName} onChange={e => setAddForm(f => ({ ...f, targetName: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={handleCreate}><Save className="h-4 w-4 mr-2" />Save Mapping</Button>
          </CardContent>
        </Card>
      )}

      {/* Mappings list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : mappings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Link2 className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">No mappings yet</p>
            <p className="text-xs">Map 3D meshes to components, parts, or sensors</p>
          </div>
        ) : (
          mappings.map(mapping => {
            const tc = getTypeConfig(mapping.mappingType);
            const TypeIcon = tc.icon;
            const mappingColor = mapping.color || tc.color;
            return (
              <Card key={mapping.id} className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer group" onClick={() => onMappingSelect?.(mapping)}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${mappingColor}20` }}>
                      <TypeIcon className="h-4 w-4" style={{ color: mappingColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-sm truncate">{mapping.targetName || mapping.meshName}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0" style={{ borderColor: mappingColor, color: mappingColor }}>
                          {tc.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{mapping.meshPath || mapping.meshName}</p>
                    </div>
                    <div
                      className="h-4 w-4 rounded-full border-2 cursor-pointer shrink-0"
                      style={{ backgroundColor: mapping.isVisible ? mappingColor : 'transparent', borderColor: mappingColor }}
                      onClick={e => { e.stopPropagation(); onMappingToggle?.(mapping, !mapping.isVisible); }}
                    />
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={e => { e.stopPropagation(); handleDelete(mapping.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
