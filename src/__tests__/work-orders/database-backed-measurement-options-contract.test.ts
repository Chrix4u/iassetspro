import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('database-backed work order measurement options', () => {
  it('derives measurement units and thresholds from active component inspection points', () => {
    const route = read('src/app/api/work-orders/[id]/measurements/route.ts');

    expect(route).toContain('db.componentInspectionPoint.findFirst');
    expect(route).toContain("inspectionType: 'measurement'");
    expect(route).toContain('isActive: true');
    expect(route).toContain('const canonicalRange = parseNormalRange(inspectionPoint.normalRange);');
    expect(route).toContain('unit: canonicalRange.unit');
    expect(route).toContain('minThreshold: canonicalRange.min');
    expect(route).toContain('maxThreshold: canonicalRange.max');
    expect(route).not.toContain('acceptableMin ??');
    expect(route).not.toContain('acceptableMax ??');
  });

  it('exposes only configured work-order component measurement choices to the technician UI', () => {
    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');

    expect(page).toContain('measurementRes as any).options');
    expect(page).toContain('Select configured parameter...');
    expect(page).toContain('Unit from component setup');
    expect(page).toContain('selectedOption.componentId');
    expect(page).toContain('selectedOption.parameterKey');
    expect(page).not.toContain('placeholder=\"Parameter e.g. vibration\"');
    expect(page).not.toContain('placeholder=\"Unit e.g. mm/s\"');
  });
});
