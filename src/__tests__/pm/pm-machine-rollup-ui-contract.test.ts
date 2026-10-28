import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  try { return readFileSync(resolve(process.cwd(), path), 'utf8'); } catch { return ''; }
}

const panelSource = source('src/components/modules/pm/PmMachineRollupPanel.tsx');
const maintenanceSource = source('src/components/modules/MaintenancePages.tsx');
const rollupRoute = source('src/app/api/pm-assignments/rollup/route.ts');
const bundleRoute = source('src/app/api/pm-assignments/bundle/route.ts');

describe('PM machine roll-up UI contract', () => {
  it('loads machine-scoped due and near-due work with exact technical paths', () => {
    expect(panelSource).toContain('/api/pm-assignments/rollup');
    expect(panelSource).toContain('Machine PM Roll-up');
    expect(panelSource).toContain('Technical Path');
    expect(panelSource).toContain('Due');
    expect(panelSource).toContain('Near Due');
    expect(panelSource).toContain('Planning Window');
  });

  it('shows Running and Standstill as explicit separate bundle dimensions', () => {
    expect(panelSource).toContain('Running');
    expect(panelSource).toContain('Standstill');
    expect(panelSource).toContain('Create Work Bundle');
    expect(panelSource).toContain('/api/pm-assignments/bundle');
  });

  it('is mounted on PM Planning and backed by scoped roll-up/bundle APIs', () => {
    expect(maintenanceSource).toContain('PmMachineRollupPanel');
    expect(rollupRoute).toContain('getPmMachineRollup');
    expect(rollupRoute).toContain('canAccessPlantStrict');
    expect(bundleRoute).toContain('createPmAssignmentBundle');
    expect(bundleRoute).toContain('work_orders.create');
  });
});
