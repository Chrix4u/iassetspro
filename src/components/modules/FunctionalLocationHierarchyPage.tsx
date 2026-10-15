'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Factory,
  GitBranch,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Route,
  Search,
  Settings2,
  Wrench,
  X,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { useNavigationStore } from '@/stores/navigationStore'
import { HierarchyCommissioningPanel } from '@/components/assets/HierarchyCommissioningPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type HierarchyLevel = {
  id: string
  label: string
  codePrefix?: string | null
  order: number
  isRequired?: boolean
  allowAssetAssignment?: boolean
}

type HierarchySystem = {
  id: string
  name: string
  code: string
  purpose?: string | null
  description?: string | null
  isPrimary?: boolean
  codeMode: 'manual' | 'generated' | 'mixed'
  codeSeparator: string
  levels: HierarchyLevel[]
  _count?: { functionalLocations?: number }
}

type FunctionalLocation = {
  id: string
  hierarchySystemId: string
  hierarchyLevelId: string
  parentId?: string | null
  plantId?: string | null
  name: string
  description?: string | null
  locationCode: string
  depth: number
  status?: string
  hierarchyLevel?: HierarchyLevel | null
  plant?: { id: string; name: string } | null
  _count?: { children?: number }
}

type Plant = { id: string; name: string; code?: string | null }
type AssetNode = { id: string; name: string; assetTag: string; parentId?: string | null; status?: string; criticality?: string }
type LocationPathNode = { id: string; name: string; locationCode: string; depth: number; hierarchyLevelId: string }

type LevelDraft = {
  label: string
  codePrefix: string
  isRequired: boolean
  allowAssetAssignment: boolean
}

const defaultLevels: LevelDraft[] = [
  { label: 'Company', codePrefix: 'CO', isRequired: true, allowAssetAssignment: false },
  { label: 'Site / Plant', codePrefix: 'PL', isRequired: true, allowAssetAssignment: false },
  { label: 'Area', codePrefix: 'AR', isRequired: false, allowAssetAssignment: false },
  { label: 'Line / System', codePrefix: 'LN', isRequired: false, allowAssetAssignment: false },
  { label: 'Functional Location', codePrefix: 'FL', isRequired: true, allowAssetAssignment: true },
]

function LocationTreeNode({
  node,
  childrenByParent,
  expanded,
  onToggle,
  onSelect,
  selectedId,
}: {
  node: FunctionalLocation
  childrenByParent: Map<string, FunctionalLocation[]>
  expanded: Set<string>
  onToggle: (id: string) => void
  onSelect: (node: FunctionalLocation) => void
  selectedId?: string
}) {
  const children = childrenByParent.get(node.id) || []
  const isExpanded = expanded.has(node.id)
  const hasChildren = children.length > 0

  return (
    <div>
      <div
        className={`group flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/60 ${selectedId === node.id ? 'border-primary/40 bg-primary/5' : 'border-transparent'}`}
        style={{ marginLeft: `${Math.min(node.depth, 8) * 14}px` }}
      >
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-muted disabled:opacity-30"
          onClick={() => onToggle(node.id)}
          disabled={!hasChildren}
          aria-label={isExpanded ? 'Collapse location' : 'Expand location'}
        >
          {hasChildren ? (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="h-4 w-4" />}
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onSelect(node)}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-sm font-medium">{node.name}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold">{node.locationCode}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{node.hierarchyLevel?.label || 'Location'}</span>
              {node.plant?.name && <span>• {node.plant.name}</span>}
              {node.hierarchyLevel?.allowAssetAssignment && <span>• Asset-ready</span>}
            </div>
          </div>
        </button>
      </div>
      {hasChildren && isExpanded && children.map(child => (
        <LocationTreeNode
          key={child.id}
          node={child}
          childrenByParent={childrenByParent}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      ))}
    </div>
  )
}

function EquipmentTreeNode({
  node,
  childrenByParent,
  expanded,
  onToggle,
  onOpen,
}: {
  node: AssetNode
  childrenByParent: Map<string, AssetNode[]>
  expanded: Set<string>
  onToggle: (id: string) => void
  onOpen: (asset: AssetNode) => void
}) {
  const children = childrenByParent.get(node.id) || []
  const hasChildren = children.length > 0
  const isExpanded = expanded.has(node.id)

  return (
    <div>
      <div className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/60">
        <button type="button" className="flex h-7 w-7 shrink-0 items-center justify-center" onClick={() => onToggle(node.id)} disabled={!hasChildren}>
          {hasChildren ? (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="h-4 w-4" />}
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(node)}>
          <div className="truncate text-sm font-medium">{node.name}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">{node.assetTag}</div>
        </button>
        {hasChildren && <Badge variant="secondary" className="shrink-0">{children.length}</Badge>}
      </div>
      {hasChildren && isExpanded && (
        <div className="ml-5 border-l pl-2">
          {children.map(child => (
            <EquipmentTreeNode key={child.id} node={child} childrenByParent={childrenByParent} expanded={expanded} onToggle={onToggle} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FunctionalLocationHierarchyPage() {
  const { hasPermission, isAdmin } = useAuthStore()
  const navigate = useNavigationStore(state => state.navigate)
  const [systems, setSystems] = useState<HierarchySystem[]>([])
  const [plants, setPlants] = useState<Plant[]>([])
  const [locations, setLocations] = useState<FunctionalLocation[]>([])
  const [assets, setAssets] = useState<AssetNode[]>([])
  const [selectedSystemId, setSelectedSystemId] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<FunctionalLocation | null>(null)
  const [locationPath, setLocationPath] = useState<LocationPathNode[]>([])
  const [locationSearch, setLocationSearch] = useState('')
  const [assetSearch, setAssetSearch] = useState('')
  const [selectedMachineId, setSelectedMachineId] = useState('')
  const [loading, setLoading] = useState(true)
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set())
  const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set())
  const [systemDialogOpen, setSystemDialogOpen] = useState(false)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [systemForm, setSystemForm] = useState({
    name: 'Primary Plant Structure',
    code: 'PRIMARY',
    description: '',
    purpose: 'functional_location',
    isPrimary: true,
    codeMode: 'generated' as 'manual' | 'generated' | 'mixed',
    separator: '-',
    levels: defaultLevels,
  })
  const [locationForm, setLocationForm] = useState({
    name: '',
    description: '',
    hierarchyLevelId: '',
    parentId: '',
    plantId: '',
    code: '',
    codeSegment: '',
    allowAssetAssignment: false,
  })

  const canManageHierarchy = isAdmin() || hasPermission('assets.hierarchy.manage')
  const canManageLocations = isAdmin() || hasPermission('assets.functional_locations.manage')

  const selectedSystem = useMemo(
    () => systems.find(system => system.id === selectedSystemId) || null,
    [selectedSystemId, systems],
  )

  const loadBase = useCallback(async () => {
    setLoading(true)
    try {
      const [systemsRes, plantsRes, assetsRes] = await Promise.all([
        api.get<HierarchySystem[]>('/api/hierarchy-systems'),
        api.get<Plant[]>('/api/plants'),
        api.get<AssetNode[]>('/api/assets?limit=500'),
      ])
      const nextSystems = systemsRes.success && Array.isArray(systemsRes.data) ? systemsRes.data : []
      setSystems(nextSystems)
      setPlants(plantsRes.success && Array.isArray(plantsRes.data) ? plantsRes.data : [])
      setAssets(assetsRes.success && Array.isArray(assetsRes.data) ? assetsRes.data : [])
      setSelectedSystemId(current => {
        if (current && nextSystems.some(system => system.id === current)) return current
        return nextSystems.find(system => system.isPrimary)?.id || nextSystems[0]?.id || ''
      })
    } catch {
      toast.error('Could not load hierarchy workspace')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLocations = useCallback(async (systemId: string) => {
    if (!systemId) {
      setLocations([])
      return
    }
    setLocationsLoading(true)
    try {
      const res = await api.get<FunctionalLocation[]>(`/api/functional-locations?hierarchySystemId=${encodeURIComponent(systemId)}&status=active`)
      const next = res.success && Array.isArray(res.data) ? res.data : []
      setLocations(next)
      setExpandedLocations(new Set(next.filter(location => location.depth === 0).map(location => location.id)))
      setSelectedLocation(current => current && next.some(location => location.id === current.id) ? current : null)
    } catch {
      setLocations([])
      toast.error('Could not load functional locations')
    } finally {
      setLocationsLoading(false)
    }
  }, [])

  useEffect(() => { void loadBase() }, [loadBase])
  useEffect(() => { void loadLocations(selectedSystemId) }, [loadLocations, selectedSystemId])

  useEffect(() => {
    if (!selectedLocation) {
      setLocationPath([])
      return
    }
    let cancelled = false
    api.get<LocationPathNode[]>(`/api/functional-locations/${selectedLocation.id}/path`).then(res => {
      if (!cancelled) setLocationPath(res.success && Array.isArray(res.data) ? res.data : [])
    }).catch(() => {
      if (!cancelled) setLocationPath([])
    })
    return () => { cancelled = true }
  }, [selectedLocation])

  const childrenByParent = useMemo(() => {
    const map = new Map<string, FunctionalLocation[]>()
    locations.forEach(location => {
      if (!location.parentId) return
      const list = map.get(location.parentId) || []
      list.push(location)
      map.set(location.parentId, list)
    })
    map.forEach(list => list.sort((a, b) => a.locationCode.localeCompare(b.locationCode)))
    return map
  }, [locations])

  const roots = useMemo(() => {
    const ids = new Set(locations.map(location => location.id))
    return locations
      .filter(location => !location.parentId || !ids.has(location.parentId))
      .sort((a, b) => a.locationCode.localeCompare(b.locationCode))
  }, [locations])

  const matchingLocations = useMemo(() => {
    const query = locationSearch.trim().toLowerCase()
    if (!query) return []
    return locations.filter(location =>
      location.name.toLowerCase().includes(query) ||
      location.locationCode.toLowerCase().includes(query) ||
      (location.hierarchyLevel?.label || '').toLowerCase().includes(query),
    )
  }, [locationSearch, locations])

  const assetChildrenByParent = useMemo(() => {
    const map = new Map<string, AssetNode[]>()
    assets.forEach(asset => {
      if (!asset.parentId) return
      const list = map.get(asset.parentId) || []
      list.push(asset)
      map.set(asset.parentId, list)
    })
    map.forEach(list => list.sort((a, b) => a.name.localeCompare(b.name)))
    return map
  }, [assets])

  const assetRoots = useMemo(() => {
    const ids = new Set(assets.map(asset => asset.id))
    return assets.filter(asset => !asset.parentId || !ids.has(asset.parentId)).sort((a, b) => a.name.localeCompare(b.name))
  }, [assets])

  const matchingAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase()
    if (!query) return []
    return assets.filter(asset => asset.name.toLowerCase().includes(query) || asset.assetTag.toLowerCase().includes(query))
  }, [assetSearch, assets])

  const toggleLocation = (id: string) => setExpandedLocations(current => {
    const next = new Set(current)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleAsset = (id: string) => setExpandedAssets(current => {
    const next = new Set(current)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const openCreateLocation = (parent?: FunctionalLocation | null) => {
    const orderedLevels = [...(selectedSystem?.levels || [])].sort((a, b) => a.order - b.order)
    let level = orderedLevels[0]
    if (parent) {
      const parentLevel = orderedLevels.find(item => item.id === parent.hierarchyLevelId)
      level = orderedLevels.find(item => item.order > (parentLevel?.order ?? -1)) || orderedLevels[orderedLevels.length - 1]
    }
    setLocationForm({
      name: '',
      description: '',
      hierarchyLevelId: level?.id || '',
      parentId: parent?.id || '',
      plantId: parent?.plantId || '',
      code: '',
      codeSegment: '',
      allowAssetAssignment: Boolean(level?.allowAssetAssignment),
    })
    setLocationDialogOpen(true)
  }

  const saveSystem = async () => {
    if (!systemForm.name.trim() || !systemForm.code.trim()) {
      toast.error('Hierarchy name and code are required')
      return
    }
    const levels = systemForm.levels.filter(level => level.label.trim())
    if (levels.length === 0) {
      toast.error('Add at least one hierarchy level')
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/api/hierarchy-systems', {
        name: systemForm.name.trim(),
        code: systemForm.code.trim().toUpperCase(),
        description: systemForm.description.trim() || undefined,
        purpose: systemForm.purpose,
        isPrimary: systemForm.isPrimary,
        codeMode: systemForm.codeMode,
        codeSeparator: systemForm.separator,
        levels,
      })
      if (!res.success) throw new Error(res.error || 'Failed to create hierarchy system')
      toast.success('Hierarchy system created')
      setSystemDialogOpen(false)
      setSystemForm({ name: '', code: '', description: '', purpose: 'functional_location', isPrimary: false, codeMode: 'generated', separator: '-', levels: defaultLevels })
      await loadBase()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create hierarchy system')
    } finally {
      setSaving(false)
    }
  }

  const saveLocation = async () => {
    if (!selectedSystem || !locationForm.name.trim() || !locationForm.hierarchyLevelId) {
      toast.error('Name and hierarchy level are required')
      return
    }
    if (selectedSystem.codeMode === 'manual' && !locationForm.code.trim()) {
      toast.error('Location Code is required for manual code mode')
      return
    }
    if (selectedSystem.codeMode === 'generated' && !locationForm.codeSegment.trim()) {
      toast.error('Code segment is required for generated code mode')
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/api/functional-locations', {
        hierarchySystemId: selectedSystem.id,
        hierarchyLevelId: locationForm.hierarchyLevelId,
        parentId: locationForm.parentId || undefined,
        plantId: locationForm.plantId || undefined,
        name: locationForm.name.trim(),
        description: locationForm.description.trim() || undefined,
        locationCode: locationForm.code.trim() || undefined,
        codeSegment: locationForm.codeSegment.trim() || undefined,
      })
      if (!res.success) throw new Error(res.error || 'Failed to create functional location')
      toast.success('Functional location created')
      setLocationDialogOpen(false)
      await loadLocations(selectedSystem.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create functional location')
    } finally {
      setSaving(false)
    }
  }

  const updateLevelDraft = (index: number, patch: Partial<LevelDraft>) => {
    setSystemForm(current => ({
      ...current,
      levels: current.levels.map((level, levelIndex) => levelIndex === index ? { ...level, ...patch } : level),
    }))
  }

  const moveLevel = (index: number, direction: -1 | 1) => {
    setSystemForm(current => {
      const target = index + direction
      if (target < 0 || target >= current.levels.length) return current
      const levels = [...current.levels]
      const [moved] = levels.splice(index, 1)
      levels.splice(target, 0, moved)
      return { ...current, levels }
    })
  }

  if (loading) {
    return <div className="page-content flex min-h-[18rem] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="page-content min-w-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400"><Route className="h-4 w-4" /> Asset paths & structures</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Asset & Location Hierarchy</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Configure where assets are installed without mixing location paths with equipment parent/child or internal machine components.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 lg:w-auto">
          {canManageHierarchy && <Button variant="outline" className="flex-1 lg:flex-none" onClick={() => setSystemDialogOpen(true)}><Settings2 className="mr-2 h-4 w-4" />New hierarchy system</Button>}
          {canManageLocations && selectedSystem && <Button className="flex-1 lg:flex-none" onClick={() => openCreateLocation(selectedLocation)}><Plus className="mr-2 h-4 w-4" />Add location</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><GitBranch className="h-5 w-5 text-violet-600" /><div><div className="text-xl font-bold">{systems.length}</div><div className="text-xs text-muted-foreground">Hierarchy systems</div></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-emerald-600" /><div><div className="text-xl font-bold">{locations.length}</div><div className="text-xs text-muted-foreground">Functional locations</div></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><Building2 className="h-5 w-5 text-sky-600" /><div><div className="text-xl font-bold">{assets.length}</div><div className="text-xs text-muted-foreground">Assets / equipment</div></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><Factory className="h-5 w-5 text-amber-600" /><div><div className="text-xl font-bold">{plants.length}</div><div className="text-xs text-muted-foreground">Plants in scope</div></div></div></CardContent></Card>
      </div>

      <Tabs defaultValue="functional" className="min-w-0">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="functional"><MapPin className="mr-2 h-4 w-4" />Functional Locations</TabsTrigger>
          <TabsTrigger value="equipment"><Layers className="mr-2 h-4 w-4" />Equipment Structure</TabsTrigger>
          <TabsTrigger value="machine"><Cpu className="mr-2 h-4 w-4" />Machine Structure</TabsTrigger>
        </TabsList>

        <TabsContent value="functional" className="mt-4 min-w-0 space-y-4">
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(14rem,22rem)_1fr] md:items-center">
              <div>
                <Label>Hierarchy system</Label>
                <Select value={selectedSystemId} onValueChange={value => { setSelectedSystemId(value); setSelectedLocation(null) }}>
                  <SelectTrigger className="mt-1.5 w-full"><SelectValue placeholder="Select hierarchy system" /></SelectTrigger>
                  <SelectContent>{systems.map(system => <SelectItem key={system.id} value={system.id}>{system.name}{system.isPrimary ? ' · Primary' : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {selectedSystem ? (
                <div className="min-w-0 rounded-lg bg-muted/40 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{selectedSystem.name}</span>{selectedSystem.isPrimary && <Badge>Primary</Badge>}<Badge variant="outline">{selectedSystem.purpose || 'functional_location'}</Badge><Badge variant="outline">{selectedSystem.codeMode} codes</Badge><Badge variant="outline">Separator: {selectedSystem.codeSeparator}</Badge></div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">{[...selectedSystem.levels].sort((a, b) => a.order - b.order).map((level, index) => <React.Fragment key={level.id}><span className="rounded bg-background px-2 py-1">{level.label}</span>{index < selectedSystem.levels.length - 1 && <ChevronRight className="mt-1 h-3 w-3" />}</React.Fragment>)}</div>
                </div>
              ) : <div className="text-sm text-muted-foreground">Create a hierarchy system to start building asset paths.</div>}
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,.8fr)]">
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><CardTitle className="text-base">Functional Locations</CardTitle><CardDescription>Where assets are installed. Location Code is the human-readable identifier.</CardDescription></div>
                  {canManageLocations && selectedSystem && <Button size="sm" onClick={() => openCreateLocation(null)}><Plus className="mr-1.5 h-4 w-4" />Root location</Button>}
                </div>
                <div className="relative mt-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search name, level or Location Code..." value={locationSearch} onChange={event => setLocationSearch(event.target.value)} /></div>
              </CardHeader>
              <CardContent className="min-w-0">
                {locationsLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : !selectedSystem ? <div className="py-16 text-center text-sm text-muted-foreground">No hierarchy system selected.</div> : locations.length === 0 ? <div className="py-16 text-center"><MapPin className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-3 text-sm font-medium">No functional locations yet</p><p className="mt-1 text-xs text-muted-foreground">Create the first coded location in this hierarchy system.</p></div> : locationSearch ? (
                  <div className="space-y-1">{matchingLocations.map(location => <button type="button" key={location.id} className="flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted" onClick={() => setSelectedLocation(location)}><MapPin className="h-4 w-4 shrink-0 text-emerald-600" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{location.name}</div><div className="truncate font-mono text-xs text-muted-foreground">{location.locationCode}</div></div><Badge variant="outline" className="shrink-0">{location.hierarchyLevel?.label || 'Location'}</Badge></button>)}</div>
                ) : <div className="space-y-1">{roots.map(root => <LocationTreeNode key={root.id} node={root} childrenByParent={childrenByParent} expanded={expandedLocations} onToggle={toggleLocation} onSelect={setSelectedLocation} selectedId={selectedLocation?.id} />)}</div>}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader><CardTitle className="text-base">Selected location</CardTitle><CardDescription>Coded path, level and assignment capability.</CardDescription></CardHeader>
              <CardContent>
                {!selectedLocation ? <div className="py-12 text-center text-sm text-muted-foreground">Select a location to inspect its full asset path.</div> : (
                  <div className="space-y-5">
                    <div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Location Code</div><div className="mt-1 break-all font-mono text-lg font-bold">{selectedLocation.locationCode}</div></div>
                    <div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Asset path</div><div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">{locationPath.map((item, index) => <React.Fragment key={item.id}><span className={item.id === selectedLocation.id ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{item.name}</span>{index < locationPath.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}</React.Fragment>)}</div></div>
                    <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Level</div><div className="mt-1 font-medium">{selectedLocation.hierarchyLevel?.label || '-'}</div></div><div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Plant</div><div className="mt-1 font-medium">{selectedLocation.plant?.name || 'Company-wide'}</div></div></div>
                    <div className="flex flex-wrap gap-2">{selectedLocation.hierarchyLevel?.allowAssetAssignment ? <Badge className="bg-emerald-600">Assets can be installed here</Badge> : <Badge variant="secondary">Structural node only</Badge>}{selectedLocation.status !== 'active' && <Badge variant="destructive">Inactive</Badge>}</div>
                    {canManageLocations && <Button variant="outline" className="w-full" onClick={() => openCreateLocation(selectedLocation)}><Plus className="mr-2 h-4 w-4" />Add child location</Button>}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="equipment" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Equipment Structure</CardTitle><CardDescription>Maintainable asset-to-asset relationships. This is separate from physical location.</CardDescription><div className="relative mt-2 max-w-lg"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={assetSearch} onChange={event => setAssetSearch(event.target.value)} placeholder="Search asset name or tag..." /></div></CardHeader>
            <CardContent>{assetSearch ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{matchingAssets.map(asset => <button type="button" key={asset.id} className="min-w-0 rounded-lg border p-3 text-left hover:bg-muted" onClick={() => navigate('assets-machines', { id: asset.id })}><div className="truncate text-sm font-medium">{asset.name}</div><div className="truncate font-mono text-xs text-muted-foreground">{asset.assetTag}</div></button>)}</div> : <div className="space-y-1">{assetRoots.map(root => <EquipmentTreeNode key={root.id} node={root} childrenByParent={assetChildrenByParent} expanded={expandedAssets} onToggle={toggleAsset} onOpen={asset => navigate('assets-machines', { id: asset.id })} />)}</div>}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="machine" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Machine Structure</CardTitle><CardDescription>Assembly → subassembly → component → part. Choose a machine to commission or inspect its internal hierarchy.</CardDescription></CardHeader>
            <CardContent className="max-w-xl"><Label>Machine / Asset</Label><Select value={selectedMachineId} onValueChange={setSelectedMachineId}><SelectTrigger className="mt-1.5 w-full"><SelectValue placeholder="Select machine..." /></SelectTrigger><SelectContent>{assets.map(asset => <SelectItem key={asset.id} value={asset.id}>{asset.name} · {asset.assetTag}</SelectItem>)}</SelectContent></Select></CardContent>
          </Card>
          {selectedMachineId ? <HierarchyCommissioningPanel assetId={selectedMachineId} /> : <Card><CardContent className="py-16 text-center"><Wrench className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-3 text-sm text-muted-foreground">Select a machine to view or build its internal component hierarchy.</p></CardContent></Card>}
        </TabsContent>
      </Tabs>

      <Dialog open={systemDialogOpen} onOpenChange={setSystemDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Build hierarchy system</DialogTitle><DialogDescription>Define the labels and Location Code rules your company actually uses. You are not limited to Plant / Department / Area.</DialogDescription></DialogHeader>
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Name</Label><Input className="mt-1.5" value={systemForm.name} onChange={event => setSystemForm(current => ({ ...current, name: event.target.value }))} placeholder="e.g. Primary Plant Structure" /></div><div><Label>System code</Label><Input className="mt-1.5 font-mono" value={systemForm.code} onChange={event => setSystemForm(current => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="PRIMARY" /></div></div>
            <div><Label>Description</Label><Textarea className="mt-1.5" value={systemForm.description} onChange={event => setSystemForm(current => ({ ...current, description: event.target.value }))} placeholder="How this hierarchy is used..." /></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><Label>Purpose</Label><Select value={systemForm.purpose} onValueChange={value => setSystemForm(current => ({ ...current, purpose: value }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="functional_location">Functional Location</SelectItem><SelectItem value="electrical">Electrical</SelectItem><SelectItem value="process">Process</SelectItem><SelectItem value="utilities">Utilities</SelectItem><SelectItem value="facilities">Facilities</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></div><div><Label>Code mode</Label><Select value={systemForm.codeMode} onValueChange={value => setSystemForm(current => ({ ...current, codeMode: value as 'manual' | 'generated' | 'mixed' }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual Location Code</SelectItem><SelectItem value="generated">Generated from segments</SelectItem><SelectItem value="mixed">Mixed</SelectItem></SelectContent></Select></div><div><Label>Separator</Label><Select value={systemForm.separator} onValueChange={value => setSystemForm(current => ({ ...current, separator: value }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{['-', '_', '.', '/', ':'].map(separator => <SelectItem key={separator} value={separator}>{separator}</SelectItem>)}</SelectContent></Select></div><div className="flex items-end"><label className="flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm"><span>Primary system</span><Switch checked={systemForm.isPrimary} onCheckedChange={checked => setSystemForm(current => ({ ...current, isPrimary: checked }))} /></label></div></div>
            <div>
              <div className="mb-2 flex items-center justify-between"><div><Label>Hierarchy levels</Label><p className="text-xs text-muted-foreground">Add, remove and order the labels before creating this system.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setSystemForm(current => ({ ...current, levels: [...current.levels, { label: 'New Level', codePrefix: '', isRequired: false, allowAssetAssignment: false }] }))}><Plus className="mr-1 h-3.5 w-3.5" />Level</Button></div>
              <div className="space-y-2">{systemForm.levels.map((level, index) => <div key={`${index}-${level.label}`} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[2rem_minmax(9rem,1.4fr)_5rem_auto_auto_auto]"><div className="flex flex-col gap-1"><Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => moveLevel(index, -1)}>↑</Button><Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index === systemForm.levels.length - 1} onClick={() => moveLevel(index, 1)}>↓</Button></div><Input value={level.label} onChange={event => updateLevelDraft(index, { label: event.target.value })} placeholder="Level label" /><Input value={level.codePrefix} onChange={event => updateLevelDraft(index, { codePrefix: event.target.value.toUpperCase() })} placeholder="Prefix" className="font-mono" /><label className="flex items-center gap-2 text-xs"><Switch checked={level.isRequired} onCheckedChange={checked => updateLevelDraft(index, { isRequired: checked })} />Required</label><label className="flex items-center gap-2 text-xs"><Switch checked={level.allowAssetAssignment} onCheckedChange={checked => updateLevelDraft(index, { allowAssetAssignment: checked })} />Asset-ready</label><Button type="button" variant="ghost" size="icon" disabled={systemForm.levels.length === 1} onClick={() => setSystemForm(current => ({ ...current, levels: current.levels.filter((_, levelIndex) => levelIndex !== index) }))}><X className="h-4 w-4" /></Button></div>)}</div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSystemDialogOpen(false)}>Cancel</Button><Button onClick={saveSystem} disabled={saving}>{saving ? 'Creating...' : 'Create hierarchy system'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add functional location</DialogTitle><DialogDescription>Create a coded node in {selectedSystem?.name || 'the selected hierarchy'}.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Name</Label><Input className="mt-1.5" value={locationForm.name} onChange={event => setLocationForm(current => ({ ...current, name: event.target.value }))} placeholder="e.g. Printing Line 01" /></div>
            <div><Label>Level</Label><Select value={locationForm.hierarchyLevelId} onValueChange={value => { const level = selectedSystem?.levels.find(item => item.id === value); setLocationForm(current => ({ ...current, hierarchyLevelId: value, allowAssetAssignment: Boolean(level?.allowAssetAssignment) })) }}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Select level" /></SelectTrigger><SelectContent>{[...(selectedSystem?.levels || [])].sort((a, b) => a.order - b.order).map(level => <SelectItem key={level.id} value={level.id}>{level.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Parent</Label><Select value={locationForm.parentId || '__root__'} onValueChange={value => setLocationForm(current => ({ ...current, parentId: value === '__root__' ? '' : value }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__root__">No parent / root</SelectItem>{locations.map(location => <SelectItem key={location.id} value={location.id}>{location.locationCode} · {location.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Plant scope</Label><Select value={locationForm.plantId || '__company__'} onValueChange={value => setLocationForm(current => ({ ...current, plantId: value === '__company__' ? '' : value }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__company__">Company-wide</SelectItem>{plants.map(plant => <SelectItem key={plant.id} value={plant.id}>{plant.name}</SelectItem>)}</SelectContent></Select></div>
            {selectedSystem?.codeMode !== 'generated' && <div><Label>Location Code{selectedSystem?.codeMode === 'mixed' ? ' (optional override)' : ''}</Label><Input className="mt-1.5 font-mono" value={locationForm.code} onChange={event => setLocationForm(current => ({ ...current, code: event.target.value }))} placeholder="TEMA-PRT-L01" /></div>}
            {selectedSystem?.codeMode !== 'manual' && <div><Label>Code segment</Label><Input className="mt-1.5 font-mono" value={locationForm.codeSegment} onChange={event => setLocationForm(current => ({ ...current, codeSegment: event.target.value }))} placeholder="L01" /></div>}
            <div className="sm:col-span-2"><Label>Description</Label><Textarea className="mt-1.5" value={locationForm.description} onChange={event => setLocationForm(current => ({ ...current, description: event.target.value }))} /></div>
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm sm:col-span-2"><div><div className="font-medium">Allow asset assignment</div><div className="text-xs text-muted-foreground">Inherited from the selected hierarchy level. Change the level definition when creating a hierarchy system.</div></div><Switch checked={locationForm.allowAssetAssignment} disabled /></label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLocationDialogOpen(false)}>Cancel</Button><Button onClick={saveLocation} disabled={saving}>{saving ? 'Creating...' : 'Create functional location'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
