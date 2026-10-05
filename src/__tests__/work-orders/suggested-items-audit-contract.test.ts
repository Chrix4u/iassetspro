import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(
  join(process.cwd(), 'src/app/api/work-orders/[id]/suggested-items/route.ts'),
  'utf8',
);

describe('suggested-items recommendation removal audit', () => {
  it('returns before removal when a blocking execution request exists', () => {
    expect(route).toContain('if (activeRequest) {');
    expect(route).toContain("status: 409");
  });

  it('does not reference the narrowed-away blocking request after the guard', () => {
    expect(route).not.toContain('priorRequestId: activeRequest?.id');
    expect(route).toContain('priorRequestId: null');
  });
});
