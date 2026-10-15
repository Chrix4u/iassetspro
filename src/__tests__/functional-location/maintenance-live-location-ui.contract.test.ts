import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { formatFunctionalLocationDisplay } from '@/lib/functional-location/display';

const maintenancePagesSource = fs.readFileSync(
  path.join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'),
  'utf8',
);

const typesSource = fs.readFileSync(
  path.join(process.cwd(), 'src/types/index.ts'),
  'utf8',
);

describe('maintenance live functional-location display', () => {
  it('formats structured location code and breadcrumb separately', () => {
    expect(formatFunctionalLocationDisplay({
      location: 'Legacy Position',
      functionalLocation: {
        id: 'loc-1',
        name: 'Position 03',
        locationCode: 'TEMA-PRT-L01-P03',
        path: 'Tema Factory > Printing > Line 01 > Position 03',
        pathCode: 'TEMA-PRT-L01-P03 — Tema Factory > Printing > Line 01 > Position 03',
        source: 'structured',
        legacyPath: 'Legacy Position',
      },
    })).toEqual({
      path: 'Tema Factory > Printing > Line 01 > Position 03',
      code: 'TEMA-PRT-L01-P03',
      compact: 'TEMA-PRT-L01-P03 · Tema Factory > Printing > Line 01 > Position 03',
      source: 'structured',
    });
  });

  it('falls back to legacy location text without inventing a Location Code', () => {
    expect(formatFunctionalLocationDisplay({ location: 'Old Workshop' })).toEqual({
      path: 'Old Workshop',
      code: null,
      compact: 'Old Workshop',
      source: 'legacy',
    });
  });

  it('types asset functionalLocation and uses the formatter across MR, WO and PM UI', () => {
    expect(typesSource).toContain('export interface FunctionalLocationProjection');
    expect(typesSource).toMatch(/functionalLocation\?: FunctionalLocationProjection \| null/);
    expect(maintenancePagesSource).toContain("from '@/lib/functional-location/display'");
    expect((maintenancePagesSource.match(/formatFunctionalLocationDisplay\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((maintenancePagesSource.match(/Functional Location/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(maintenancePagesSource).toContain('Location Code');
    expect(maintenancePagesSource).not.toContain("{(mr as any).asset?.location || '-'}");
  });
});
