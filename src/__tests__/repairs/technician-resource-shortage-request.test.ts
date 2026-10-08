import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const panel = fs.readFileSync('src/components/modules/TechnicianWorkOrderV11Panels.tsx', 'utf8');
const toolCandidatesRoute = fs.readFileSync('src/app/api/work-orders/[id]/tool-candidates/route.ts', 'utf8');

describe('technician resource requests with store shortages', () => {
  it('keeps zero-stock materials selectable and does not block a larger material request', () => {
    expect(panel).not.toContain('.filter((item) => Number(item.currentStock ?? 0) > 0)');
    expect(panel).not.toContain('if (quantity > availableStock)');
    expect(panel).toContain('Stock shortfall');
  });

  it('keeps unavailable/short tools selectable and lets the request pipeline record the shortage', () => {
    expect(panel).toContain('/tool-candidates?status=all&limit=100');
    expect(panel).not.toContain(".filter((candidate) => candidate.status === 'available' && Number(candidate.quantity ?? 1) > 0)");
    expect(panel).not.toContain('if (quantity > availableQuantity)');
    expect(toolCandidatesRoute).toContain("rawStatus === 'all' ? null");
    expect(panel).toContain('Availability shortfall');
  });
});
