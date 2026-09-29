import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/admin/gtp-migration/parity/route.ts', 'utf8');

describe('GTP post-import PostgreSQL parity certificate', () => {
  it('locks the known workbook baseline to its exact source SHA', () => {
    expect(route).toContain('b05a023b0486693ae54186f985e9a04b175571fabfc7a17f1b3963188a7967cc');
    expect(route).toContain('sourceRows: 2807');
    expect(route).toContain('breakdowns: 411');
    expect(route).toContain('priorityOne2025: 236');
    expect(route).toContain('priorityOneResponseMinutes: 308180');
    expect(route).toContain('week32Breakdowns: 6');
    expect(route).toContain('staleCachedPivotBreakdowns: 412');
  });

  it('verifies transactional structure and workbook metrics from imported PostgreSQL rows', () => {
    expect(route).toContain("action: 'historical_import'");
    expect(route).toContain("entityType: 'work_order'");
    expect(route).toContain('linkedPairs');
    expect(route).toContain("row.type === 'breakdown'");
    expect(route).toContain("row.priority === 'critical'");
    expect(route).toContain('isoWeekNumber(row.createdAt) === 32');
    expect(route).toContain('Object.values(checks).every(Boolean)');
  });

  it('treats authoritative JobRecords rather than the stale cached pivot as truth', () => {
    expect(route).toContain('stale cached Excel breakdown pivot is informational only');
    expect(route).toContain('is not treated as the source of truth');
  });
});
