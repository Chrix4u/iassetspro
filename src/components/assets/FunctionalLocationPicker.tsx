'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'

import { api } from '@/lib/api'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type HierarchySystem = {
  id: string
  name: string
  isPrimary?: boolean
}

type FunctionalLocation = {
  id: string
  name: string
  locationCode: string
  parentId?: string | null
  plantId?: string | null
  status?: string
  hierarchyLevel?: { label?: string; allowAssetAssignment?: boolean } | null
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
  const [systems, setSystems] = useState<HierarchySystem[]>([])
  const [resolvedSystemId, setResolvedSystemId] = useState(hierarchySystemId || '')
  const [locations, setLocations] = useState<FunctionalLocation[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (hierarchySystemId) {
      setResolvedSystemId(hierarchySystemId)
      return
    }

    let cancelled = false
    api.get<HierarchySystem[]>('/api/hierarchy-systems').then(res => {
      if (cancelled || !res.success || !Array.isArray(res.data)) return
      setSystems(res.data)
      const primary = res.data.find(system => system.isPrimary) || res.data[0]
      setResolvedSystemId(primary?.id || '')
    }).catch(() => undefined)

    return () => { cancelled = true }
  }, [hierarchySystemId])

  useEffect(() => {
    if (!resolvedSystemId) {
      setLocations([])
      return
    }

    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ hierarchySystemId: resolvedSystemId, status: 'active' })
    if (plantId) params.set('plantId', plantId)

    api.get<FunctionalLocation[]>(`/api/functional-locations?${params.toString()}`).then(res => {
      if (!cancelled) setLocations(res.success && Array.isArray(res.data) ? res.data : [])
    }).catch(() => {
      if (!cancelled) setLocations([])
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [plantId, resolvedSystemId])

  const options = useMemo(() => {
    const byId = new Map(locations.map(location => [location.id, location]))
    return locations
      .filter(location => !plantId || location.plantId === plantId)
      .filter(location => !allowAssetAssignmentOnly || location.hierarchyLevel?.allowAssetAssignment)
      .map(location => ({
        ...location,
        breadcrumb: buildBreadcrumb(location, byId),
      }))
      .sort((a, b) => a.locationCode.localeCompare(b.locationCode))
  }, [allowAssetAssignmentOnly, locations, plantId])

  const effectiveDisabled = disabled || loading || !resolvedSystemId

  return (
    <div className={className}>
      {label && <Label className="mb-1.5 block">{label}</Label>}
      <Select value={value || ''} onValueChange={onValueChange} disabled={effectiveDisabled}>
        <SelectTrigger className="w-full min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SelectValue placeholder={loading ? 'Loading locations...' : systems.length === 0 && !hierarchySystemId ? 'No hierarchy configured' : placeholder} />
          </div>
        </SelectTrigger>
        <SelectContent className="max-w-[min(42rem,calc(100vw-2rem))]">
          {options.map(location => (
            <SelectItem key={location.id} value={location.id}>
              <span className="font-mono text-xs font-semibold">{location.locationCode}</span>
              <span className="ml-2 text-muted-foreground">{location.breadcrumb}</span>
            </SelectItem>
          ))}
          {!loading && options.length === 0 && (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              No active assignable functional locations found.
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  )
}

export default FunctionalLocationPicker
