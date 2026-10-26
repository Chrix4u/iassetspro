'use client';

import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type PmResourceRequestCoverageBucket = {
  recommendedCount: number;
  requestedCount: number;
  outstandingLabels: string[];
};

export type PmResourceRequestCoverage = {
  materials: PmResourceRequestCoverageBucket;
  tools: PmResourceRequestCoverageBucket;
};

type Props = {
  coverage: PmResourceRequestCoverage;
  inventoryOperational: boolean;
  toolsOperational: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
};

const EMPTY_COVERAGE: PmResourceRequestCoverageBucket = {
  recommendedCount: 0,
  requestedCount: 0,
  outstandingLabels: [],
};

export function PmResourcePipelineCard({
  coverage,
  inventoryOperational,
  toolsOperational,
  canSubmit,
  onSubmit,
}: Props) {
  const materialCoverage = inventoryOperational ? coverage.materials : EMPTY_COVERAGE;
  const toolCoverage = toolsOperational ? coverage.tools : EMPTY_COVERAGE;
  const outstandingLabels = [
    ...materialCoverage.outstandingLabels,
    ...toolCoverage.outstandingLabels,
  ];
  const outstandingCount = outstandingLabels.length;
  const recommendedCount = materialCoverage.recommendedCount + toolCoverage.recommendedCount;
  const requestedCount = materialCoverage.requestedCount + toolCoverage.requestedCount;

  if (recommendedCount === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-semibold text-violet-800">Planned resource pipeline</p>
        <p className="text-[10px] text-violet-700">
          {outstandingCount > 0
            ? `${outstandingCount} of ${recommendedCount} mapped resource${recommendedCount === 1 ? '' : 's'} still need execution submission or resubmission`
            : 'All mapped resources have entered the approval workflow'}
          {requestedCount > 0 ? ` · ${requestedCount} currently covered by Repairs requests` : ''}
        </p>
        {outstandingCount > 0 && (
          <p className="mt-1 text-[10px] text-violet-700/80">
            Outstanding: {outstandingLabels.join(', ')}
          </p>
        )}
      </div>
      {canSubmit && outstandingCount > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-violet-300 bg-white text-violet-700 hover:bg-violet-50"
          onClick={onSubmit}
        >
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          Submit Outstanding Planned Resources
        </Button>
      )}
    </div>
  );
}
