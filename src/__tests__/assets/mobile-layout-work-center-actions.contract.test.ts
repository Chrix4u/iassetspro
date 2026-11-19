import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const machineFields = readFileSync('src/components/assets/MachineCommissioningFields.tsx', 'utf8');
const assetDetail = readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');
const productionPage = readFileSync('src/components/modules/ProductionPages.tsx', 'utf8')
  .split('export function ProductionWorkCentersPage() {')[1]
  ?.split('export function ProductionResourcePlanningPage() {')[0] ?? '';
const workCenterList = readFileSync('src/app/api/work-centers/route.ts', 'utf8');
const workCenterItem = readFileSync('src/app/api/work-centers/[id]/route.ts', 'utf8');

describe('mobile asset commissioning and detail layout', () => {
  it('puts the minimum and maximum inputs on the same row on phones', () => {
    expect(machineFields).toContain('grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3');
    expect(machineFields).toContain('<Label>Minimum</Label>');
    expect(machineFields).toContain('<Label>Maximum</Label>');
    expect(machineFields).not.toContain('Acceptable minimum');
    expect(machineFields).not.toContain('Acceptable maximum');
    expect(machineFields).toContain('col-span-2 min-w-0 space-y-1 md:col-span-1');
  });

  it('lets the parameter name use full mobile width and keeps delete beside inspection', () => {
    expect(machineFields).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(machineFields).toContain('col-span-2 min-w-0 space-y-1 sm:col-span-1');
    expect(machineFields).toContain('aria-label={\'Remove parameter \'+(i+1)}');
  });

  it('displays specifications as full-width mobile rows and wraps long codes', () => {
    expect(assetDetail).toContain('grid min-w-0 grid-cols-1 gap-x-6 lg:grid-cols-2');
    expect(assetDetail).toContain('[overflow-wrap:anywhere]');
    expect(assetDetail).toContain('specificationEntries.length > 0');
    expect(assetDetail).toContain("'displaypath', 'display_path'");
    expect(assetDetail).toContain('max-w-full whitespace-normal break-all text-left font-mono');
  });
});

describe('work center view/edit and persistence', () => {
  it('wires view and edit menu actions to the record endpoint', () => {
    expect(productionPage).toContain("onSelect={() => void openWorkCenter(r, 'view')}");
    expect(productionPage).toContain("onSelect={() => void openWorkCenter(r, 'edit')}");
    expect(productionPage).toContain("api.get('/api/work-centers/' + encodeURIComponent(r.id))");
    expect(productionPage).toContain('data-testid="work-center-details"');
    expect(productionPage).toContain('data-testid="work-center-form"');
  });

  it('uses matching backend permissions, validates capacity and refreshes after saving', () => {
    expect(productionPage).toContain("hasPermission('work_centers.create')");
    expect(productionPage).toContain("hasPermission('work_centers.update')");
    expect(productionPage).toContain("api.put('/api/work-centers/' + encodeURIComponent(selectedWorkCenter!.id), payload)");
    expect(productionPage).toContain('await refreshWorkCenters()');
    expect(productionPage).toContain('capacity: form.capacity.trim() ? Number(form.capacity) : null');
    expect(workCenterItem).toContain('Capacity must be a nonnegative whole number');
  });

  it('keeps deactivated work centers out of the list', () => {
    expect(workCenterList).toContain('const where: Record<string, unknown> = { isActive: true };');
    expect(workCenterList).not.toContain('where: Object.keys(where).length > 1');
  });
});
