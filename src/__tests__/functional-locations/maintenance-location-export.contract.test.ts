import { describe, expect, it } from 'vitest';

import {
  WORK_ORDER_HEADERS,
  workOrderRow,
} from '@/app/api/reports/maintenance/export/route';

describe('maintenance report export functional-location columns', () => {
  it('exports Location Code and Asset Path alongside the transition Location column', () => {
    const values = workOrderRow({
      woNumber: 'WO-1',
      title: 'Repair printer',
      assetName: 'Printer 01',
      location: 'Tema Factory > Printing > Line 01 > Position 03',
      functionalLocationCode: 'TEMA-PRT-L01-P03',
      functionalLocationPath: 'Tema Factory > Printing > Line 01 > Position 03',
    });
    const record = Object.fromEntries(WORK_ORDER_HEADERS.map((header, index) => [header, values[index]]));

    expect(record.Location).toBe('Tema Factory > Printing > Line 01 > Position 03');
    expect(record['Location Code']).toBe('TEMA-PRT-L01-P03');
    expect(record['Asset Path']).toBe('Tema Factory > Printing > Line 01 > Position 03');
  });

  it('keeps blank structured columns safe for legacy-only export rows', () => {
    const values = workOrderRow({
      woNumber: 'WO-2',
      title: 'Legacy repair',
      location: 'Old Workshop',
    });
    const record = Object.fromEntries(WORK_ORDER_HEADERS.map((header, index) => [header, values[index]]));

    expect(record.Location).toBe('Old Workshop');
    expect(record['Location Code']).toBe('');
    expect(record['Asset Path']).toBe('');
  });
});
