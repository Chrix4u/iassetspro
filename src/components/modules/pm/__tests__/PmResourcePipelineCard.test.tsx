import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PmResourcePipelineCard } from '../PmResourcePipelineCard';

const coverage = {
  materials: {
    recommendedCount: 2,
    requestedCount: 1,
    outstandingLabels: ['Bearing 6205'],
  },
  tools: {
    recommendedCount: 2,
    requestedCount: 1,
    outstandingLabels: ['Grease Gun'],
  },
};

describe('PmResourcePipelineCard', () => {
  it('keeps canonical outstanding PM resources visible and actionable after request rejection', () => {
    const html = renderToStaticMarkup(
      <PmResourcePipelineCard
        coverage={coverage}
        inventoryOperational
        toolsOperational
        canSubmit
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain('2 of 4 mapped resources');
    expect(html).toContain('Bearing 6205');
    expect(html).toContain('Grease Gun');
    expect(html).toContain('Submit Outstanding Planned Resources');
  });

  it('ignores recommendations from an unavailable operational module', () => {
    const html = renderToStaticMarkup(
      <PmResourcePipelineCard
        coverage={{
          materials: {
            recommendedCount: 2,
            requestedCount: 0,
            outstandingLabels: ['Bearing 6205', 'Seal Kit'],
          },
          tools: {
            recommendedCount: 1,
            requestedCount: 1,
            outstandingLabels: [],
          },
        }}
        inventoryOperational={false}
        toolsOperational
        canSubmit
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain('All mapped resources have entered the approval workflow');
    expect(html).toContain('1 currently covered by Repairs requests');
    expect(html).not.toContain('Bearing 6205');
    expect(html).not.toContain('Seal Kit');
    expect(html).not.toContain('Submit Outstanding Planned Resources');
  });
});
