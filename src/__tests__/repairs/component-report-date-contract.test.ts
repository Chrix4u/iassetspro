import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/work-orders/reports/route.ts', 'utf8');

describe('component repair report date contract', () => {
  it('keeps lastRepairDate as Date until final JSON serialization', () => {
    expect(route).toContain('lastRepairDate: Date | null;');
    expect(route).toContain('existing.lastRepairDate = wo.actualEnd;');
    expect(route).toContain('lastRepairDate: wo.actualEnd ?? null');
    expect(route).toContain('lastRepairDate: c.lastRepairDate?.toISOString() || null');
    expect(route).not.toContain('existing.lastRepairDate = wo.actualEnd.toISOString();');
  });
});
