import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/work-orders/reports/route.ts', 'utf8');

describe('work order report component repair-date aggregation', () => {
  it('keeps lastRepairDate as a Date during aggregation and serializes only at the response boundary', () => {
    expect(route).toContain('existing.lastRepairDate = wo.actualEnd;');
    expect(route).toContain('lastRepairDate: wo.actualEnd ?? null,');
    expect(route).toContain('lastRepairDate: c.lastRepairDate?.toISOString() || null,');
    expect(route).not.toContain('existing.lastRepairDate = wo.actualEnd.toISOString();');
    expect(route).not.toContain('lastRepairDate: wo.actualEnd?.toISOString() ?? null,');
  });
});