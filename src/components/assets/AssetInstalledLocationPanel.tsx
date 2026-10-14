'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, MapPin } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

type LocationPathNode = {
  id: string
  name?: string | null
  locationCode?: string | null
}

type AssetLocationState = {
  loading: boolean
  primaryLocationId: string
  assetPath: LocationPathNode[]
  legacyLocation: string
}

const EMPTY_STATE: AssetLocationState = {
  loading: true,
  primaryLocationId: '',
  assetPath: [],
  legacyLocation: '',
}

function buildLegacyLocation(asset: any) {
  if (!asset) return ''

  const parts = [
    asset.plant?.name || asset.plant?.code,
    asset.building,
    asset.floor,
    asset.area,
    asset.location,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)

  return Array.from(new Set(parts)).join(' › ')
}

export function AssetInstalledLocationPanel({ assetId }: { assetId: string }) {
  const [state, setState] = useState<AssetLocationState>(EMPTY_STATE)

  useEffect(() => {
    let cancelled = false

    async function loadLocation() {
      setState(EMPTY_STATE)

      const [assignmentResponse, assetResponse] = await Promise.all([
        api.get<any>(`/api/assets/${assetId}/functional-locations`).catch(() => null),
        api.get<any>(`/api/assets/${assetId}`).catch(() => null),
      ])

      if (cancelled) return

      const legacyLocation = assetResponse?.success
        ? buildLegacyLocation(assetResponse.data)
        : ''
      const primaryLocationId = assignmentResponse?.success
        ? String(assignmentResponse.data?.primary?.functionalLocationId || '')
        : ''

      if (!primaryLocationId) {
        setState({ loading: false, primaryLocationId: '', assetPath: [], legacyLocation })
        return
      }

      const pathResponse = await api
        .get<any>(`/api/functional-locations/${encodeURIComponent(primaryLocationId)}/path`)
        .catch(() => null)

      if (cancelled) return

      const path = pathResponse?.success
        ? (Array.isArray(pathResponse.data) ? pathResponse.data : pathResponse.data?.path || [])
        : []

      setState({
        loading: false,
        primaryLocationId,
        assetPath: Array.isArray(path) ? path : [],
        legacyLocation,
      })
    }

    void loadLocation()
    return () => { cancelled = true }
  }, [assetId])

  const codedPath = useMemo(
    () => state.assetPath.map((node) => ({
      ...node,
      label: [node.locationCode, node.name].filter(Boolean).join(' · '),
    })),
    [state.assetPath],
  )

  return (
    <Card className="mx-4 mt-4 border-sky-200/70 bg-sky-50/40 shadow-none dark:border-sky-900/60 dark:bg-sky-950/20 sm:mx-5">
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-sky-600" />
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-300">
                Installed At / Asset Path
              </p>
            </div>

            {state.loading ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading installation path…</p>
            ) : codedPath.length > 0 ? (
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                {codedPath.map((node, index) => (
                  <div key={node.id} className="flex min-w-0 items-center gap-1.5">
                    <Badge variant="outline" className="max-w-full border-sky-200 bg-background/80 font-mono text-[11px] dark:border-sky-900">
                      <span className="truncate">{node.label || node.id}</span>
                    </Badge>
                    {index < codedPath.length - 1 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No Functional Location assigned.</p>
            )}
          </div>

          {state.primaryLocationId && (
            <Badge className="w-fit bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-900/40 dark:text-sky-200">
              Functional Location
            </Badge>
          )}
        </div>

        {state.legacyLocation && (
          <p className="mt-2 border-t border-sky-200/60 pt-2 text-[11px] text-muted-foreground dark:border-sky-900/50">
            <span className="font-medium">Legacy location:</span> {state.legacyLocation}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
