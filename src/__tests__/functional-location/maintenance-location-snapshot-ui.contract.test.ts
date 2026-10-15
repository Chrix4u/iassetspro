import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatMaintenanceLocationDisplay } from '@/lib/functional-location/display';

const oldLocation = {
  functionalLocationIdSnapshot: 'loc-old',
  functionalLocationNameSnapshot: 'Position 03',
  functionalLocationCodeSnapshot: 'TEMA-PRT-L01-P03',
  functionalLocationPathSnapshot: 'Tema Factory > Printing > Line 01 > Position 03',
  functionalLocationPathCodeSnapshot: 'TEMA-PRT-L01-P03 — Tema Factory > Printing > Line 01 > Position 03',
  functionalLocationSourceSnapshot: 'structured',
};

const currentAsset = {
  id: 'asset-1',
  name: 'Printer 01',
  location: 'Legacy Position 99',
  functionalLocation: {
    id: 'loc-new',
    name: 'Position 99',
    locationCode: 'TEMA-PRT-L02-P99',
    path: 'Tema Factory > Printing > Line 02 > Position 99',
    pathCode: 'TEMA-PRT-L02-P99 — Tema Factory > Printing > Line 02 > Position 99',
    source: 'structured' as const,
    legacyPath: 'Legacy Position 99',
  },
};

describe('maintenance snapshot display formatter', () => {
  it('shows a frozen maintenance location and current asset location after relocation', () => {
    expect(formatMaintenanceLocationDisplay({ ...oldLocation, asset: currentAsset })).toEqual(expect.objectContaining({
      maintenancePath: oldLocation.functionalLocationPathSnapshot,
      maintenanceCode: oldLocation.functionalLocationCodeSnapshot,
      currentPath: currentAsset.functionalLocation.path,
      currentCode: currentAsset.functionalLocation.locationCode,
      hasFrozenSnapshot: true,
      differsFromCurrent: true,
    }));
  });

  it('does not duplicate labels when frozen and current structured locations are identical', () => {
    const sameAsset = {
      ...currentAsset,
      functionalLocation: {
        ...currentAsset.functionalLocation,
        id: 'loc-old',
        name: 'Position 03',
        locationCode: oldLocation.functionalLocationCodeSnapshot,
        path: oldLocation.functionalLocationPathSnapshot,
        pathCode: oldLocation.functionalLocationPathCodeSnapshot,
      },
    };
    expect(formatMaintenanceLocationDisplay({ ...oldLocation, asset: sameAsset }).differsFromCurrent).toBe(false);
  });

  it('uses the current display without historical duplication for pre-Phase-3C records', () => {
    expect(formatMaintenanceLocationDisplay({ asset: currentAsset })).toEqual(expect.objectContaining({
      maintenancePath: currentAsset.functionalLocation.path,
      currentPath: currentAsset.functionalLocation.path,
      hasFrozenSnapshot: false,
      differsFromCurrent: false,
    }));
  });
});

describe('maintenance page location labels', () => {
  const maintenanceUi = fs.readFileSync(
    path.join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'),
    'utf8',
  );

  it('renders explicit historical/current labels only through the shared formatter', () => {
    expect(maintenanceUi).toContain('formatMaintenanceLocationDisplay');
    expect(maintenanceUi).toContain('Maintenance Location');
    expect(maintenanceUi).toContain('Current Asset Location');
    expect(maintenanceUi).toContain('differsFromCurrent');
  });
});
