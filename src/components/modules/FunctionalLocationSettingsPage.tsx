'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Building2,
  ChevronRight,
  GitBranch,
  MapPin,
  Move,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { EmptyState, LoadingSkeleton } from '@/components/shared/helpers';

interface HierarchyLevel {
  id: string;
  order: number;
  label: string;
  description?: string | null;
  isRequired: boolean;
  allowAssetAssignment: boolean;
  codePrefix?: string | null;
  isActive: boolean;
}

interface HierarchySystem {
  id: string;
  name: string;
  code: string;
  purpose: string;
  description?: string | null;
  isPrimary: boolean;
  isActive: boolean;
  codeMode: 'manual' | 'generated' | 'mixed';
  codeSeparator: '-' | '_' | '.' | '/' | ':';
  allowCodeOverride: boolean;
  levels: HierarchyLevel[];
  _count?: { functionalLocations: number };
}

interface FunctionalLocation {
  id: string;
  hierarchySystemId: string;
  hierarchyLevelId: string;
  parentId: string | null;
  name: string;
  codeSegment?: string | null;
  locationCode: string;
  description?: string | null;
  status: string;
  plantId?: string | null;
  depth: number;
  hierarchyLevel: HierarchyLevel;
  plant?: { id: string; name: string; code: string } | null;
  _count?: { children: number };
}

interface PlantOption {
  id: string;
  code: string;
  name: string;
}

interface DraftLevel {
  order: number;
  label: string;
  description: string;
  isRequired: boolean;
  allowAssetAssignment: boolean;
  codePrefix: string;
  isActive: boolean;
}

const newDraftLevel = (order: number): DraftLevel => ({
  order,
  label: '',
  description: '',
  isRequired: true,
  allowAssetAssignment: false,
  codePrefix: '',
  isActive: true,
});

const initialSystemForm = {
  name: '',
  code: '',
  purpose: 'functional_location',
  description: '',
  codeMode: 'mixed' as 'manual' | 'generated' | 'mixed',
  codeSeparator: '-' as '-' | '_' | '.' | '/' | ':',
  allowCodeOverride: true,
  isPrimary: false,
  isActive: true,
  levels: [
    { ...newDraftLevel(1), label: 'Site / Plant', allowAssetAssignment: false },
    { ...newDraftLevel(2), label: 'Area', allowAssetAssignment: false },
    { ...newDraftLevel(3), label: 'Functional Location', allowAssetAssignment: true },
  ],
};

const initialLocationForm = {
  name: '',
  description: '',
  codeSegment: '',
  locationCode: '',
  plantId: 'global',
};

export function FunctionalLocationSettingsPage() {
  const { hasPermission, isAdmin } = useAuthStore();
  const canManageHierarchy = isAdmin() || hasPermission('assets.hierarchy.manage');
  const canManageLocations = isAdmin() || hasPermission('assets.functional_locations.manage');

  const [systems, setSystems] = useState<HierarchySystem[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState('');
  const [locations, setLocations] = useState<FunctionalLocation[]>([]);
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [createSystemOpen, setCreateSystemOpen] = useState(false);
  const [systemForm, setSystemForm] = useState(initialSystemForm);
  const [savingSystem, setSavingSystem] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [locationParent, setLocationParent] = useState<FunctionalLocation | null>(null);
  const [locationForm, setLocationForm] = useState(initialLocationForm);
  const [savingLocation, setSavingLocation] = useState(false);
  const [moveTarget, setMoveTarget] = useState<FunctionalLocation | null>(null);
  const [newParentId, setNewParentId] = useState('__root__');
  const [moving, setMoving] = useState(false);

  const selectedSystem = useMemo(
    () => systems.find((system) => system.id === selectedSystemId) ?? null,
    [systems, selectedSystemId],
  );

  const loadSystems = useCallback(async () => {
    const res = await api.get<HierarchySystem[]>('/api/hierarchy-systems');
    if (!res.success || !res.data) {
      toast.error(res.error || 'Failed to load hierarchy systems');
      setLoading(false);
      return;
    }
    const next = Array.isArray(res.data) ? res.data : [];
    setSystems(next);
    setSelectedSystemId((current) => {
      if (current && next.some((system) => system.id === current)) return current;
      return next.find((system) => system.isPrimary)?.id || next[0]?.id || '';
    });
    setLoading(false);
  }, []);

  const loadLocations = useCallback(async (hierarchySystemId: string) => {
    if (!hierarchySystemId) {
      setLocations([]);
      return;
    }
    setLocationsLoading(true);
    const res = await api.get<FunctionalLocation[]>(`/api/functional-locations?hierarchySystemId=${encodeURIComponent(hierarchySystemId)}`);
    if (res.success && res.data) setLocations(Array.isArray(res.data) ? res.data : []);
    else toast.error(res.error || 'Failed to load functional locations');
    setLocationsLoading(false);
  }, []);

  useEffect(() => {
    void Promise.all([
      loadSystems(),
      api.get<PlantOption[]>('/api/plants').then((res) => {
        if (res.success && res.data) setPlants(Array.isArray(res.data) ? res.data : []);
      }),
    ]);
  }, [loadSystems]);

  useEffect(() => {
    void loadLocations(selectedSystemId);
  }, [selectedSystemId, loadLocations]);

  const activeLevels = useMemo(
    () => (selectedSystem?.levels || []).filter((level) => level.isActive).sort((a, b) => a.order - b.order),
    [selectedSystem],
  );

  const nextLevelForParent = useCallback((parent: FunctionalLocation | null) => {
    if (!parent) return activeLevels[0] ?? null;
    const parentLevel = activeLevels.find((level) => level.id === parent.hierarchyLevelId);
    if (!parentLevel) return null;
    return activeLevels.find((level) => level.order > parentLevel.order) ?? null;
  }, [activeLevels]);

  const filteredLocations = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((location) =>
      location.name.toLowerCase().includes(q)
      || location.locationCode.toLowerCase().includes(q)
      || location.hierarchyLevel.label.toLowerCase().includes(q)
      || location.plant?.name.toLowerCase().includes(q),
    );
  }, [locations, searchText]);

  const treeRows = useMemo(() => {
    if (searchText.trim()) return filteredLocations.map((location) => ({ location, depth: 0 }));
    const byParent = new Map<string | null, FunctionalLocation[]>();
    for (const location of filteredLocations) {
      const key = location.parentId ?? null;
      const siblings = byParent.get(key) || [];
      siblings.push(location);
      byParent.set(key, siblings);
    }
    for (const siblings of byParent.values()) siblings.sort((a, b) => a.locationCode.localeCompare(b.locationCode));
    const rows: Array<{ location: FunctionalLocation; depth: number }> = [];
    const visit = (parentId: string | null, depth: number) => {
      for (const location of byParent.get(parentId) || []) {
        rows.push({ location, depth });
        visit(location.id, depth + 1);
      }
    };
    visit(null, 0);
    return rows;
  }, [filteredLocations, searchText]);

  const resetSystemForm = () => setSystemForm(initialSystemForm);

  const updateDraftLevel = (index: number, patch: Partial<DraftLevel>) => {
    setSystemForm((current) => ({
      ...current,
      levels: current.levels.map((level, levelIndex) => levelIndex === index ? { ...level, ...patch } : level),
    }));
  };

  const moveDraftLevel = (index: number, direction: -1 | 1) => {
    setSystemForm((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.levels.length) return current;
      const levels = [...current.levels];
      [levels[index], levels[target]] = [levels[target], levels[index]];
      return { ...current, levels: levels.map((level, levelIndex) => ({ ...level, order: levelIndex + 1 })) };
    });
  };

  const removeDraftLevel = (index: number) => {
    setSystemForm((current) => {
      if (current.levels.length === 1) return current;
      const levels = current.levels.filter((_, levelIndex) => levelIndex !== index)
        .map((level, levelIndex) => ({ ...level, order: levelIndex + 1 }));
      return { ...current, levels };
    });
  };

  const createSystem = async () => {
    if (!systemForm.name.trim() || !systemForm.code.trim()) {
      toast.error('Hierarchy name and code are required');
      return;
    }
    if (systemForm.levels.some((level) => !level.label.trim())) {
      toast.error('Every hierarchy level needs a label');
      return;
    }
    setSavingSystem(true);
    const payload = {
      ...systemForm,
      name: systemForm.name.trim(),
      code: systemForm.code.trim(),
      description: systemForm.description.trim() || null,
      levels: systemForm.levels.map((level, index) => ({
        ...level,
        order: index + 1,
        label: level.label.trim(),
        description: level.description.trim() || null,
        codePrefix: level.codePrefix.trim() || null,
      })),
    };
    const res = await api.post('/api/hierarchy-systems', payload);
    if (res.success) {
      toast.success('Hierarchy system created');
      setCreateSystemOpen(false);
      resetSystemForm();
      await loadSystems();
      const createdId = (res.data as { id?: string } | undefined)?.id;
      if (createdId) setSelectedSystemId(createdId);
    } else toast.error(res.error || 'Failed to create hierarchy system');
    setSavingSystem(false);
  };

  const openLocationDialog = (parent: FunctionalLocation | null) => {
    const nextLevel = nextLevelForParent(parent);
    if (!nextLevel) {
      toast.error(parent ? 'No lower active hierarchy level is configured below this location' : 'No active hierarchy level is configured');
      return;
    }
    setLocationParent(parent);
    setLocationForm({ ...initialLocationForm, plantId: parent?.plantId || 'global' });
    setLocationDialogOpen(true);
  };

  const createLocation = async () => {
    if (!selectedSystem) return;
    const hierarchyLevel = nextLevelForParent(locationParent);
    if (!hierarchyLevel || !locationForm.name.trim()) {
      toast.error('Location name and a valid hierarchy level are required');
      return;
    }
    if (selectedSystem.codeMode === 'manual' && !locationForm.locationCode.trim()) {
      toast.error('Location Code is required for a manual-code hierarchy');
      return;
    }
    if (selectedSystem.codeMode === 'generated' && !locationForm.codeSegment.trim()) {
      toast.error('Code segment is required for a generated-code hierarchy');
      return;
    }
    setSavingLocation(true);
    const payload = {
      hierarchySystemId: selectedSystem.id,
      hierarchyLevelId: hierarchyLevel.id,
      parentId: locationParent?.id || null,
      name: locationForm.name.trim(),
      description: locationForm.description.trim() || null,
      codeSegment: locationForm.codeSegment.trim() || null,
      locationCode: locationForm.locationCode.trim() || null,
      plantId: locationForm.plantId === 'global' ? null : locationForm.plantId,
    };
    const res = await api.post('/api/functional-locations', payload);
    if (res.success) {
      toast.success('Functional location created');
      setLocationDialogOpen(false);
      setLocationParent(null);
      setLocationForm(initialLocationForm);
      await loadLocations(selectedSystem.id);
      await loadSystems();
    } else toast.error(res.error || 'Failed to create functional location');
    setSavingLocation(false);
  };

  const moveCandidates = useMemo(
    () => locations.filter((candidate) => candidate.id !== moveTarget?.id),
    [locations, moveTarget],
  );

  const levelForMoveDestination = useCallback((parentId: string) => {
    if (parentId === '__root__') return activeLevels[0] ?? null;
    const parent = locations.find((location) => location.id === parentId) ?? null;
    return nextLevelForParent(parent);
  }, [activeLevels, locations, nextLevelForParent]);

  const moveLocation = async () => {
    if (!moveTarget) return;
    const destinationLevel = levelForMoveDestination(newParentId);
    if (!destinationLevel) {
      toast.error('The selected destination has no valid child level');
      return;
    }
    setMoving(true);
    const res = await api.post(`/api/functional-locations/${moveTarget.id}/move`, {
      newParentId: newParentId === '__root__' ? null : newParentId,
      hierarchyLevelId: destinationLevel.id,
    });
    if (res.success) {
      toast.success('Functional location moved');
      setMoveTarget(null);
      setNewParentId('__root__');
      await loadLocations(selectedSystemId);
    } else toast.error(res.error || 'Failed to move functional location');
    setMoving(false);
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="page-content min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Hierarchy & Locations</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Build company-specific asset paths and Location Codes without changing the physical machine/component hierarchy.
          </p>
        </div>
        {canManageHierarchy && (
          <Button onClick={() => setCreateSystemOpen(true)} className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Plus className="mr-1.5 h-4 w-4" />Create Hierarchy
          </Button>
        )}
      </div>

      {systems.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12">
            <EmptyState
              icon={GitBranch}
              title="No hierarchy systems yet"
              description="Create a primary functional-location hierarchy such as Company → Site → Area → Functional Location."
              action={canManageHierarchy ? { label: 'Create Hierarchy', onClick: () => setCreateSystemOpen(true) } : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(18rem,0.36fr)_minmax(0,1fr)]">
          <Card className="min-w-0 border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Hierarchy Systems</CardTitle>
              <CardDescription>Choose the location view to configure and browse.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 min-w-0">
              <Select value={selectedSystemId} onValueChange={setSelectedSystemId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select hierarchy" /></SelectTrigger>
                <SelectContent>
                  {systems.map((system) => (
                    <SelectItem key={system.id} value={system.id}>
                      {system.name}{system.isPrimary ? ' · Primary' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedSystem && (
                <div className="space-y-4">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">{selectedSystem.code}</Badge>
                      {selectedSystem.isPrimary && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Primary</Badge>}
                      <Badge variant={selectedSystem.isActive ? 'secondary' : 'outline'}>{selectedSystem.isActive ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium">{selectedSystem.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedSystem.codeMode} codes · separator “{selectedSystem.codeSeparator}” · {selectedSystem._count?.functionalLocations || 0} locations
                    </p>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Configured levels</Label>
                      <Badge variant="outline">{selectedSystem.levels.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {[...selectedSystem.levels].sort((a, b) => a.order - b.order).map((level) => (
                        <div key={level.id} className="flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{level.order}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{level.label}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {level.codePrefix ? `Prefix ${level.codePrefix}` : 'No prefix'} · {level.allowAssetAssignment ? 'Assets allowed' : 'Container level'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Existing level definitions are protected in this release; create a new hierarchy for structural redesigns until guarded configuration edits are enabled.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 border-0 shadow-sm">
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-base">Functional Locations</CardTitle>
                <CardDescription>Where assets are installed. This is independent from equipment/component structure.</CardDescription>
              </div>
              {canManageLocations && selectedSystem && activeLevels.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => openLocationDialog(null)}>
                  <Plus className="mr-1.5 h-4 w-4" />Add Root
                </Button>
              )}
            </CardHeader>
            <CardContent className="min-w-0 space-y-3">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search name, Location Code, level or plant..." className="pl-9" />
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <div className="min-w-[38rem]">
                  <div className="grid grid-cols-[minmax(17rem,1.4fr)_minmax(9rem,.7fr)_minmax(8rem,.65fr)_auto] gap-2 border-b bg-muted/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Location</span><span>Level</span><span>Scope</span><span className="text-right">Actions</span>
                  </div>
                  {locationsLoading ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">Loading locations…</div>
                  ) : treeRows.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">{searchText ? 'No matching functional locations.' : 'No functional locations yet.'}</div>
                  ) : treeRows.map(({ location, depth }) => (
                    <div key={location.id} className="grid grid-cols-[minmax(17rem,1.4fr)_minmax(9rem,.7fr)_minmax(8rem,.65fr)_auto] items-center gap-2 border-b px-3 py-2.5 last:border-b-0">
                      <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${Math.min(depth, 8) * 1.1}rem` }}>
                        {depth > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />}
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge variant="outline" className="shrink-0 font-mono text-[10px]">{location.locationCode}</Badge>
                            <span className="truncate text-sm font-medium">{location.name}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{location._count?.children || 0} child location(s)</p>
                        </div>
                      </div>
                      <span className="truncate text-xs">{location.hierarchyLevel.label}</span>
                      <span className="truncate text-xs text-muted-foreground">{location.plant ? `${location.plant.code} · ${location.plant.name}` : 'Global'}</span>
                      <div className="flex justify-end gap-1">
                        {canManageLocations && nextLevelForParent(location) && (
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => openLocationDialog(location)}>
                            <Plus className="mr-1 h-3.5 w-3.5" />Child
                          </Button>
                        )}
                        {canManageLocations && (
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setMoveTarget(location); setNewParentId('__root__'); }}>
                            <Move className="mr-1 h-3.5 w-3.5" />Move
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ResponsiveDialog
        open={createSystemOpen}
        onOpenChange={setCreateSystemOpen}
        title="Create Hierarchy System"
        description="Define the company terminology and Location Code rules before adding locations."
        size="extra-wide"
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCreateSystemOpen(false)}>Cancel</Button>
            <Button onClick={createSystem} disabled={savingSystem}>{savingSystem ? 'Creating…' : 'Create Hierarchy'}</Button>
          </div>
        )}
      >
        <div className="grid min-w-0 gap-4 py-1 md:grid-cols-2">
          <div className="space-y-1.5"><Label>Name *</Label><Input value={systemForm.name} onChange={(event) => setSystemForm((form) => ({ ...form, name: event.target.value }))} placeholder="Primary Plant Structure" /></div>
          <div className="space-y-1.5"><Label>System Code *</Label><Input value={systemForm.code} onChange={(event) => setSystemForm((form) => ({ ...form, code: event.target.value }))} placeholder="PRIMARY" /></div>
          <div className="space-y-1.5"><Label>Purpose</Label><Select value={systemForm.purpose} onValueChange={(purpose) => setSystemForm((form) => ({ ...form, purpose }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['functional_location','electrical','process','utilities','facilities','custom'].map((purpose) => <SelectItem key={purpose} value={purpose}>{purpose.replace('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Location Code Mode</Label><Select value={systemForm.codeMode} onValueChange={(codeMode: 'manual' | 'generated' | 'mixed') => setSystemForm((form) => ({ ...form, codeMode }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mixed">Mixed</SelectItem><SelectItem value="generated">Generated</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Code Separator</Label><Select value={systemForm.codeSeparator} onValueChange={(codeSeparator: '-' | '_' | '.' | '/' | ':') => setSystemForm((form) => ({ ...form, codeSeparator }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['-','_','.','/',':'].map((separator) => <SelectItem key={separator} value={separator}>{separator}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-end gap-6 pb-2">
            <label className="flex items-center gap-2 text-sm"><Switch checked={systemForm.allowCodeOverride} onCheckedChange={(allowCodeOverride) => setSystemForm((form) => ({ ...form, allowCodeOverride }))} />Allow code override</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={systemForm.isPrimary} onCheckedChange={(isPrimary) => setSystemForm((form) => ({ ...form, isPrimary }))} />Primary</label>
          </div>
          <div className="space-y-1.5 md:col-span-2"><Label>Description</Label><Textarea value={systemForm.description} onChange={(event) => setSystemForm((form) => ({ ...form, description: event.target.value }))} /></div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-sm font-semibold">Hierarchy levels</p><p className="text-xs text-muted-foreground">Rename levels to match each company’s terminology.</p></div>
            <Button type="button" variant="outline" size="sm" onClick={() => setSystemForm((form) => ({ ...form, levels: [...form.levels, newDraftLevel(form.levels.length + 1)] }))}><Plus className="mr-1 h-3.5 w-3.5" />Add Level</Button>
          </div>
          <div className="space-y-2">
            {systemForm.levels.map((level, index) => (
              <div key={`${level.order}-${index}`} className="grid min-w-0 gap-2 rounded-lg border p-3 md:grid-cols-[2.2rem_minmax(10rem,1fr)_minmax(7rem,.55fr)_auto] md:items-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span>
                <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                  <Input value={level.label} onChange={(event) => updateDraftLevel(index, { label: event.target.value })} placeholder="Level label" />
                  <Input value={level.codePrefix} onChange={(event) => updateDraftLevel(index, { codePrefix: event.target.value })} placeholder="Code prefix (optional)" />
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1.5"><Switch checked={level.isRequired} onCheckedChange={(isRequired) => updateDraftLevel(index, { isRequired })} />Required</label>
                  <label className="flex items-center gap-1.5"><Switch checked={level.allowAssetAssignment} onCheckedChange={(allowAssetAssignment) => updateDraftLevel(index, { allowAssetAssignment })} />Assets</label>
                </div>
                <div className="flex justify-end gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => moveDraftLevel(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === systemForm.levels.length - 1} onClick={() => moveDraftLevel(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" disabled={systemForm.levels.length === 1} onClick={() => removeDraftLevel(index)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={locationDialogOpen}
        onOpenChange={setLocationDialogOpen}
        title={locationParent ? `Add child under ${locationParent.locationCode}` : 'Add root functional location'}
        description={nextLevelForParent(locationParent) ? `Level: ${nextLevelForParent(locationParent)?.label}` : undefined}
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setLocationDialogOpen(false)}>Cancel</Button>
            <Button onClick={createLocation} disabled={savingLocation}>{savingLocation ? 'Saving…' : 'Add Location'}</Button>
          </div>
        )}
      >
        <div className="grid min-w-0 gap-4 py-1 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Name *</Label><Input value={locationForm.name} onChange={(event) => setLocationForm((form) => ({ ...form, name: event.target.value }))} placeholder="Printing Line 01" /></div>
          {selectedSystem?.codeMode !== 'manual' && (
            <div className="space-y-1.5"><Label>Code Segment {selectedSystem?.codeMode === 'generated' ? '*' : ''}</Label><Input value={locationForm.codeSegment} onChange={(event) => setLocationForm((form) => ({ ...form, codeSegment: event.target.value }))} placeholder="L01" /></div>
          )}
          {(selectedSystem?.codeMode === 'manual' || (selectedSystem?.codeMode === 'mixed' && selectedSystem.allowCodeOverride)) && (
            <div className="space-y-1.5"><Label>Location Code {selectedSystem?.codeMode === 'manual' ? '*' : '(override)'}</Label><Input value={locationForm.locationCode} onChange={(event) => setLocationForm((form) => ({ ...form, locationCode: event.target.value }))} placeholder="TEMA-PRT-L01" /></div>
          )}
          <div className="space-y-1.5"><Label>Plant scope</Label><Select value={locationForm.plantId} onValueChange={(plantId) => setLocationForm((form) => ({ ...form, plantId }))} disabled={Boolean(locationParent?.plantId)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="global">Global / inherited</SelectItem>{plants.map((plant) => <SelectItem key={plant.id} value={plant.id}>{plant.code} · {plant.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Textarea value={locationForm.description} onChange={(event) => setLocationForm((form) => ({ ...form, description: event.target.value }))} /></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Final Location Code, level order, uniqueness, plant scope and parent validity are enforced by the server.</p>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={Boolean(moveTarget)}
        onOpenChange={(open) => { if (!open) setMoveTarget(null); }}
        title="Move Functional Location"
        description={moveTarget ? `${moveTarget.locationCode} · ${moveTarget.name}` : undefined}
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setMoveTarget(null)}>Cancel</Button>
            <Button onClick={moveLocation} disabled={moving}>{moving ? 'Moving…' : 'Move Location'}</Button>
          </div>
        )}
      >
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>New parent</Label>
            <Select value={newParentId} onValueChange={setNewParentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">Root of hierarchy</SelectItem>
                {moveCandidates.filter((candidate) => Boolean(nextLevelForParent(candidate))).map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>{candidate.locationCode} · {candidate.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><Building2 className="h-4 w-4" /><span>Moves are validated for hierarchy level order, plant scope and cycle safety.</span></div>
            <div className="mt-2 flex items-center gap-2"><ArrowRight className="h-4 w-4" /><span>Descendant Location Codes are recalculated by the server when required.</span></div>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

export default FunctionalLocationSettingsPage;
