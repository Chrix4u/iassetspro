'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { MachineVisualExplorer } from '@/components/digital-twin/MachineVisualExplorer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  HierarchyCommissioningPanel as HierarchyCommissioningForm,
} from '@/components/assets/HierarchyCommissioningForm';
import type { ExistingComponent } from '@/components/assets/HierarchyCommissioningForm';

export type { ExistingComponent } from '@/components/assets/HierarchyCommissioningForm';

type MachineAssetSummary = {
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

type HierarchyCommissioningPanelProps = {
  assetId: string;
  existingComponents?: ExistingComponent[];
  onComplete?: () => void;
  onCancel?: () => void;
};

export function HierarchyCommissioningPanel({
  assetId,
  existingComponents,
  onComplete,
  onCancel,
}: HierarchyCommissioningPanelProps) {
  const [asset, setAsset] = useState<MachineAssetSummary | null>(null);
  const [assetLoading, setAssetLoading] = useState(true);
  const [assetLoadError, setAssetLoadError] = useState('');
  const [hierarchyRevision, setHierarchyRevision] = useState(0);

  const loadAsset = useCallback(async () => {
    setAssetLoading(true);
    setAssetLoadError('');
    setAsset(null);
    try {
      const response = await api.get<MachineAssetSummary>(
        `/api/assets/${encodeURIComponent(assetId)}`,
      );
      if (!response.success || !response.data?.id) {
        throw new Error(response.error || 'Could not load the selected machine');
      }
      setAsset(response.data);
    } catch (error) {
      setAssetLoadError(error instanceof Error ? error.message : 'Could not load the selected machine');
    } finally {
      setAssetLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void loadAsset();
  }, [loadAsset]);

  const handleCommissioningComplete = useCallback(() => {
    setHierarchyRevision((current) => current + 1);
    onComplete?.();
  }, [onComplete]);

  return (
    <div className="space-y-4">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Registered machine structure</CardTitle>
          <CardDescription>
            Existing Component Registry hierarchy for this machine. The machine is the root; assemblies,
            subassemblies, components and parts are shown beneath it independently of Parent Asset relationships.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {assetLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading registered machine hierarchy…
            </div>
          ) : assetLoadError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Machine structure could not be loaded.</p>
                  <p className="mt-1 break-words text-xs">{assetLoadError}</p>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void loadAsset()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          ) : asset ? (
            <MachineVisualExplorer
              key={`${asset.id}:${hierarchyRevision}`}
              asset={asset}
            />
          ) : null}
        </CardContent>
      </Card>

      <HierarchyCommissioningForm
        assetId={assetId}
        existingComponents={existingComponents}
        onComplete={handleCommissioningComplete}
        onCancel={onCancel}
      />
    </div>
  );
}
