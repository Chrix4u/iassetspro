'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Network, Target } from 'lucide-react';
import { MachineVisualExplorer, type MachineExplorerSelection } from '@/components/digital-twin/MachineVisualExplorer';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Button } from '@/components/ui/button';

export type PmTargetAsset = {
  id: string;
  name: string;
  assetTag: string;
  location?: string | null;
  functionalLocation?: { path?: string | null; locationCode?: string | null } | null;
  description?: string | null;
  imageUrl?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  criticality?: string | null;
  status?: string | null;
  specification?: string | null;
};

interface Props {
  asset: PmTargetAsset | null;
  componentId: string | null;
  technicalPath?: Array<{ id: string; name: string; componentCode?: string | null }>;
  onChange: (componentId: string | null, path: Array<{ id: string; name: string; componentCode?: string | null }>) => void;
}

export function PmTargetTreePicker({ asset, componentId, technicalPath = [], onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MachineExplorerSelection>({ component: null, path: [] });
  const locationPath = asset?.functionalLocation?.path?.trim() || asset?.location?.trim() || 'No functional location assigned';
  const locationCode = asset?.functionalLocation?.locationCode?.trim() || null;
  const technicalLabel = useMemo(() => {
    if (!asset) return 'Select an asset first';
    if (!componentId || technicalPath.length === 0) return `${asset.name} · Whole machine`;
    return [asset.name, ...technicalPath.map((item) => item.componentCode || item.name)].join(' › ');
  }, [asset, componentId, technicalPath]);

  useEffect(() => {
    setDraft({ component: null, path: [] });
  }, [asset?.id]);

  const openPicker = () => {
    setOpen(true);
  };

  const confirm = () => {
    onChange(
      draft.component?.id || null,
      draft.path.map((item) => ({ id: item.id, name: item.name, componentCode: item.componentCode })),
    );
    setOpen(false);
  };

  return (
    <>
      <div className="space-y-3 rounded-lg border bg-muted/15 p-3">
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={openPicker} disabled={!asset}>
            <Target className="mr-1.5 h-3.5 w-3.5" />Choose PM Target
          </Button>
        </div>
        <div className="min-w-0 rounded-md border bg-background/70 px-3 py-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><MapPin className="h-3 w-3" />Location Path</p>
          <p className="mt-1 break-words text-xs font-medium" title={locationPath}>{locationPath}</p>
          {locationCode && <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{locationCode}</p>}
        </div>
        <div className="min-w-0 rounded-md border bg-background/70 px-3 py-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><Network className="h-3 w-3" />Technical Path</p>
          <p className="mt-1 break-words text-xs font-medium" title={technicalLabel}>{technicalLabel}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{componentId ? 'Exact maintainable node selected' : 'Whole machine target'}</p>
        </div>
      </div>

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        size="explorer"
        title="Choose PM Target"
        description="Select the exact coded maintainable node. Select the machine itself for Whole machine PM."
        footer={<div className="flex w-full justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" onClick={confirm}>Use Selected Target</Button></div>}
      >
        {asset && (
          <MachineVisualExplorer
            key={`${asset.id}:${componentId || 'machine'}`}
            asset={{
              id: asset.id,
              name: asset.name,
              assetTag: asset.assetTag,
              description: asset.description,
              imageUrl: asset.imageUrl,
              manufacturer: asset.manufacturer,
              model: asset.model,
              criticality: asset.criticality,
              status: asset.status,
              specification: asset.specification,
            }}
            initialComponentId={componentId}
            selectionMode
            onSelectionChange={setDraft}
          />
        )}
      </ResponsiveDialog>
    </>
  );
}
