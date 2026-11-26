'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'

import { api } from '@/lib/api'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type FunctionalLocation = {
  id: string
  name: string
  locationCode: string
  parentId?: string | null
  plantId?: string | null
  status?: string
  hierarchyLevel?: { label?: string; allowAssetAssignment?: boolean; isActive?: boolean } | null
}

export type FunctionalLocationPickerProps = {
  value?: string
  onValueChange: (value: string) => void
  hierarchySystemId?: string
  plantId?: string
  allowAssetAssignmentOnly?: boolean
  disabled?: boolean
  label?: string
  placeholder?: string
  className?: string
}

function buildBreadcrumb(location: FunctionalLocation, byId: Map<string, FunctionalLocation>) {
  const parts: FunctionalLocation[] = []
  const visited = new Set<string>()
  let current: FunctionalLocation | undefined = location

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    parts.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  return parts.map(item => item.name).join(' › ')
}

export function FunctionalLocationPicker({
  value,
  onValueChange,
  hierarchySystemId,
  plantId,
  allowAssetAssignmentOnly = true,
  disabled = false,
  label = 'Functional Location',
  placeholder = 'Select functional location',
  className,
}: FunctionalLocationPickerProps) {
  const scopeKey = JSON.stringify([hierarchySystemId || '', plantId || ''])
  const [result, setResult] = useState<{ key: string; locations: FunctionalLocation[]; error: boolean } | null>(null)
  const loading = result?.key !== scopeKey
  const failed = !loading && result.error
  const locations = useMemo(() => result?.key === scopeKey ? result.locations : [], [result, scopeKey])
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    setResult(null)
    const params = new URLSearchParams({ status: 'active' })
    if (hierarchySystemId) params.set('hierarchySystemId', hierarchySystemId)
    if (plantId) params.set('plantId', plantId)

    // The form's selected plant must override the shell's previously selected plant.
    const options = plantId ? { headers: { 'x-plant-id': plantId } } : undefined
    api.get<FunctionalLocation[]>(`/api/functional-locations?${params.toString()}`, options).then(res => {
      if (!cancelled) setResult({ key: scopeKey, locations: res.success && Array.isArray(res.data) ? res.data : [], error: !res.success || !Array.isArray(res.data) })
    }).catch(() => {
      if (!cancelled) setResult({ key: scopeKey, locations: [], error: true })
    })

    return () => { cancelled = true }
  }, [hierarchySystemId, plantId, scopeKey, retry])

  const options = useMemo(() => {
    const byId = new Map(locations.map(location => [location.id, location]))
    return locations
      .filter(location => !plantId || location.plantId === plantId)
      .filter(location => !allowAssetAssignmentOnly || (location.hierarchyLevel?.allowAssetAssignment && location.hierarchyLevel.isActive !== false))
      .map(location => ({
        ...location,
        breadcrumb: buildBreadcrumb(location, byId),
      }))
      .sort((a, b) => a.locationCode.localeCompare(b.locationCode))
  }, [allowAssetAssignmentOnly, locations, plantId])

  return (
    <div className={className}>
      {label && <Label className="mb-1.5 block">{label}</Label>}
      <Select value={value || ''} onValueChange={onValueChange} disabled={disabled || loading || failed || options.length === 0}>
        <SelectTrigger aria-label={label || 'Functional location'} className="w-full min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SelectValue placeholder={loading ? 'Loading locations...' : failed ? 'Locations unavailable' : placeholder} />
          </div>
        </SelectTrigger>
        <SelectContent className="max-w-[min(42rem,calc(100vw-2rem))]">
          {options.map(location => (
            <SelectItem key={location.id} value={location.id}>
              <span className="font-mono text-xs font-semibold">{location.locationCode}</span>
              <span className="ml-2 text-muted-foreground">{location.breadcrumb}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {failed ? (
        <div role="alert" className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-destructive">
          <span>Could not load locations for the selected plant.</span>
          <button type="button" className="font-medium underline" onClick={() => setRetry(n => n + 1)}>Retry</button>
        </div>
      ) : !loading && options.length === 0 ? (
        <p role="status" className="mt-1.5 text-xs text-muted-foreground">
          No active {allowAssetAssignmentOnly ? 'assignable ' : ''}locations in {hierarchySystemId ? 'this hierarchy' : 'the primary hierarchy'} for this selection.
        </p>
      ) : null}
    </div>
  )
}

export default FunctionalLocationPicker
