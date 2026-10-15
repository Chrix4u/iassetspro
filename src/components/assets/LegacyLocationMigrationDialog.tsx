'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const LEGACY_SOURCES = [
  { value: 'company', label: 'Company profile' },
  { value: 'plant', label: 'Plant' },
  { value: 'department', label: 'Department' },
  { value: 'building', label: 'Asset · Building' },
  { value: 'floor', label: 'Asset · Floor' },
  { value: 'area', label: 'Asset · Area' },
  { value: 'location', label: 'Asset · Location' },
] as const

type LegacySource = (typeof LEGACY_SOURCES)[number]['value']
type LegacyMapping = Record<string, LegacySource | null>

type HierarchySystem = {
  id: string
  name: string
  codeMode: 'manual' | 'generated' | 'mixed'
  levels: Array<{
    id: string
    label: string
    order: number
    isRequired?: boolean
    allowAssetAssignment?: boolean
  }>
}

type Plant = { id: string; name: string; code?: string | null }

type PreviewRow = {
  assetId: string
  assetTag: string
  assetName: string
  status: 'ready' | 'blocked' | 'already_assigned'
  blockers: string[]
  targetLocationCode: string | null
}

type MigrationPreview = {
  hierarchySystemId: string
  mapping: LegacyMapping
  previewFingerprint: string
  safeToImport: boolean
  systemBlockers: string[]
  summary: {
    totalAssets: number
    readyAssets: number
    blockedAssets: number
    alreadyAssignedAssets: number
    proposedNodes: number
  }
  database: {
    nodesToCreate: number
    nodesToReuse: number
    conflictingNodes: Array<{ locationCode: string; reason: string }>
  }
  rows: PreviewRow[]
}

type ImportResult = {
  createdNodes: number
  reusedNodes: number
  assignedAssets: number
  skippedAlreadyAssigned: number
  blockedAssetsLeftUnchanged: number
}

export function LegacyLocationMigrationDialog({
  open,
  onOpenChange,
  hierarchySystem,
  plants,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hierarchySystem: HierarchySystem
  plants: Plant[]
  onImported?: () => void | Promise<void>
}) {
  const [plantId, setPlantId] = useState('__all__')
  const [mapping, setMapping] = useState<LegacyMapping>({})
  const [preview, setPreview] = useState<MigrationPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [confirmation, setConfirmation] = useState('')

  const orderedLevels = useMemo(
    () => [...hierarchySystem.levels].sort((a, b) => a.order - b.order),
    [hierarchySystem.levels],
  )

  const runPreview = useCallback(async (mappingOverride?: LegacyMapping, plantOverride?: string, inferMapping = false) => {
    setPreviewing(true)
    try {
      const reviewedMapping = inferMapping ? undefined : mappingOverride ?? (Object.keys(mapping).length ? mapping : undefined)
      const reviewedPlantId = plantOverride ?? plantId
      const response = await api.post<MigrationPreview>('/api/admin/functional-location-migration/preview', {
        hierarchySystemId: hierarchySystem.id,
        plantId: reviewedPlantId === '__all__' ? undefined : reviewedPlantId,
        mapping: reviewedMapping,
      })
      if (!response.success || !response.data) throw new Error(response.error || 'Legacy location preview failed')
      setPreview(response.data)
      setMapping(response.data.mapping)
      setConfirmation('')
    } catch (error) {
      setPreview(null)
      toast.error(error instanceof Error ? error.message : 'Legacy location preview failed')
    } finally {
      setPreviewing(false)
    }
  }, [hierarchySystem.id, mapping, plantId])

  useEffect(() => {
    if (!open) return
    setPlantId('__all__')
    setMapping({})
    setPreview(null)
    setConfirmation('')
    void runPreview(undefined, '__all__', true)
    // run once for each dialog/system opening; mapping returned by server is authoritative.
  }, [open, hierarchySystem.id])

  const updateMapping = (levelId: string, value: string) => {
    setMapping(current => ({ ...current, [levelId]: value === '__none__' ? null : value as LegacySource }))
    setPreview(null)
    setConfirmation('')
  }

  const updatePlant = (value: string) => {
    setPlantId(value)
    setPreview(null)
    setConfirmation('')
  }

  const executeImport = async () => {
    if (!preview?.previewFingerprint) return toast.error('Run and review a fresh preview first')
    if (confirmation !== 'IMPORT READY LEGACY LOCATIONS') return toast.error('Enter the exact migration confirmation phrase')
    setImporting(true)
    try {
      const response = await api.post<ImportResult>('/api/admin/functional-location-migration/import', {
        hierarchySystemId: hierarchySystem.id,
        plantId: plantId === '__all__' ? undefined : plantId,
        mapping,
        previewFingerprint: preview.previewFingerprint,
        confirmation,
      })
      if (!response.success || !response.data) throw new Error(response.error || 'Legacy location import failed')
      toast.success(`Legacy migration completed · ${response.data.assignedAssets} asset(s) assigned, ${response.data.createdNodes} location node(s) created`)
      await onImported?.()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Legacy location import failed')
      setPreview(null)
      setConfirmation('')
    } finally {
      setImporting(false)
    }
  }

  const sampleRows = preview?.rows.slice(0, 12) ?? []
  const blockers = [
    ...(preview?.systemBlockers || []),
    ...(preview?.database.conflictingNodes.map(item => `${item.locationCode}: ${item.reason}`) || []),
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-emerald-600" />Migrate legacy locations</DialogTitle>
          <DialogDescription>
            Preview legacy Plant, Department and asset location fields before creating structured Location Codes. Existing structured assignments are never overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[72vh] space-y-5 overflow-y-auto px-6 py-5">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-semibold">{hierarchySystem.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">Legacy fields remain untouched. Import only creates/reuses functional locations and current assignment records.</div>
              </div>
              <Badge variant={hierarchySystem.codeMode === 'manual' ? 'destructive' : 'outline'}>{hierarchySystem.codeMode} codes</Badge>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(13rem,.45fr)_minmax(0,1fr)]">
            <div>
              <Label>Plant scope</Label>
              <Select value={plantId} onValueChange={updatePlant}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All accessible plants</SelectItem>
                  {plants.map(plant => <SelectItem key={plant.id} value={plant.id}>{plant.name}{plant.code ? ` · ${plant.code}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <div><Label>Legacy source mapping</Label><p className="mt-1 text-xs text-muted-foreground">Map each customer-defined hierarchy level to the legacy field that contains that part of the path.</p></div>
                <Button variant="outline" size="sm" onClick={() => void runPreview()} disabled={previewing}>{previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Preview migration</Button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {orderedLevels.map(level => (
                  <div key={level.id} className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,.9fr)] items-center gap-2 rounded-lg border p-2.5">
                    <div className="min-w-0"><div className="truncate text-sm font-medium">{level.label}</div><div className="text-[11px] text-muted-foreground">{level.isRequired ? 'Required' : 'Optional'} · {level.allowAssetAssignment ? 'Asset-ready' : 'Structural'}</div></div>
                    <Select value={mapping[level.id] || '__none__'} onValueChange={value => updateMapping(level.id, value)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Not mapped" /></SelectTrigger>
                      <SelectContent><SelectItem value="__none__">Not mapped</SelectItem>{LEGACY_SOURCES.map(source => <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {previewing && !preview ? <div className="flex items-center justify-center py-10 text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Building migration preview…</div> : null}

          {preview ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <div className="rounded-xl border p-3"><div className="text-xl font-bold text-emerald-600">{preview.summary.readyAssets}</div><div className="text-xs text-muted-foreground">Ready assets</div></div>
                <div className="rounded-xl border p-3"><div className="text-xl font-bold text-amber-600">{preview.summary.blockedAssets}</div><div className="text-xs text-muted-foreground">Blocked assets</div></div>
                <div className="rounded-xl border p-3"><div className="text-xl font-bold">{preview.summary.alreadyAssignedAssets}</div><div className="text-xs text-muted-foreground">Already assigned</div></div>
                <div className="rounded-xl border p-3"><div className="text-xl font-bold">{preview.database.nodesToCreate}</div><div className="text-xs text-muted-foreground">Nodes to create</div></div>
                <div className="rounded-xl border p-3"><div className="text-xl font-bold">{preview.database.nodesToReuse}</div><div className="text-xs text-muted-foreground">Nodes to reuse</div></div>
              </div>

              {blockers.length ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Import blockers</div>
                  <ul className="mt-2 space-y-1 pl-5 text-xs">{blockers.slice(0, 8).map((item, index) => <li key={`${index}-${item}`} className="list-disc">{item}</li>)}</ul>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-semibold">Preview is structurally safe</div><div className="mt-0.5 text-xs opacity-80">Only the {preview.summary.readyAssets} ready asset(s) will be imported. Blocked rows remain unchanged for reconciliation.</div></div></div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between"><div><div className="text-sm font-semibold">Asset preview</div><div className="text-xs text-muted-foreground">First {Math.min(sampleRows.length, 12)} of {preview.summary.totalAssets} asset(s)</div></div><Badge variant="outline">Fingerprint {preview.previewFingerprint.slice(0, 10)}…</Badge></div>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[44rem] text-left text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2.5">Asset</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Proposed Location Code / blocker</th></tr></thead>
                    <tbody className="divide-y">{sampleRows.map(row => <tr key={row.assetId}><td className="px-3 py-2.5"><div className="font-medium">{row.assetName}</div><div className="font-mono text-xs text-muted-foreground">{row.assetTag}</div></td><td className="px-3 py-2.5"><Badge variant={row.status === 'ready' ? 'default' : row.status === 'blocked' ? 'destructive' : 'secondary'}>{row.status.replace('_', ' ')}</Badge></td><td className="px-3 py-2.5">{row.targetLocationCode ? <code className="break-all text-xs font-semibold">{row.targetLocationCode}</code> : <span className="text-xs text-muted-foreground">{row.blockers[0] || 'Existing structured assignment retained'}</span>}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /><div><div className="text-sm font-semibold">Final confirmation</div><p className="mt-0.5 text-xs text-muted-foreground">A fresh preview fingerprint is checked again at import time. If data changes, the import stops and asks for a new preview.</p></div></div>
                <Label className="mt-4 block">Type IMPORT READY LEGACY LOCATIONS</Label>
                <Input className="mt-1.5 font-mono" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="IMPORT READY LEGACY LOCATIONS" />
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          <Button onClick={() => void executeImport()} disabled={!preview?.safeToImport || confirmation !== 'IMPORT READY LEGACY LOCATIONS' || importing}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
            Import ready legacy locations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
