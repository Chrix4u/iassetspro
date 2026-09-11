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
    expect(form).toContain('Registered Asset');
    expect(form).toContain('Manual Entry');
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


  it('keeps a selected registered asset available after search reset', () => {
    expect(form).toContain('!q && assetId && !assets.some');
    expect(form).toContain('/api/assets/${encodeURIComponent(assetId)}');
    expect(form).toContain('}, [assetId]);');
  });

  it('does not clear Location when switching registered/manual modes', () => {
    const registered = form.slice(form.indexOf('const switchToRegistered'), form.indexOf('const switchToManual'));
    const manual = form.slice(form.indexOf('const switchToManual'), form.indexOf('const handleSubmit'));
    expect(registered).not.toContain("setLocation('')");
    expect(manual).not.toContain("setLocation('')");
  });
  it('keeps the client-facing form concise and presentation-ready', () => {
    const verboseImplementationCopy = [
      'Search the asset register by name, tag, serial, manufacturer, or model',
      'Use for an item or asset that is not yet registered',
      'Selecting an asset can populate its registered location below.',
      'This records the request against the name entered here without creating a new Asset Register record.',
      'Location stays visible regardless of asset source or down status.',
      'Down status affects operational urgency only; it never hides Location.',
    ];
    for (const copy of verboseImplementationCopy) expect(form).not.toContain(copy);
    expect(form).toContain('placeholder="Building, floor, line or area"');
    expect(form).toContain('Submitting maintenance request...');
  });

});
