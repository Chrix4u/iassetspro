import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'),
  'utf8',
);
const start = source.indexOf('export function CreateMRForm');
const end = source.indexOf('// MR DETAIL PAGE', start);
const form = source.slice(start, end);

describe('Create Maintenance Request UX contract', () => {
  it('renders Location exactly once and never ties it to machine-down state', () => {
    expect(form.match(/<Label>Location<\/Label>/g) || []).toHaveLength(1);
    expect(form).not.toContain("itemType === 'machine' && !machineDown");
    expect(form).not.toContain("assetMode === 'registered' && !machineDown");
  });

  it('provides direct registered and manual asset modes', () => {
    expect(form).toContain('Select Registered Asset');
    expect(form).toContain('Asset / Item Name *');
    expect(form).not.toContain('manualMode');
    expect(form).not.toContain('manualAssetId');
    expect(form).not.toContain('__create_new__');
  });

  it('uses server-side asset search and validates both modes', () => {
    expect(form).toContain("params.set('search', q)");
    expect(form).toContain("assetMode === 'registered' && !assetId");
    expect(form).toContain("assetMode === 'manual' && !cleanManualAssetName");
  });
});
