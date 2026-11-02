import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cron = readFileSync(resolve(process.cwd(), 'src/app/api/pm-schedules/check-due-cron/route.ts'), 'utf8');

describe('direct PM cron observability contract', () => {
  it('surfaces generated direct-assignment work orders separately from schedule-shaped details', () => {
    expect(cron).toContain('directAssignments?: {');
    expect(cron).toContain('const directGeneratedDetails = generationPayload.data.engines?.directAssignments?.results');
    expect(cron).toContain('.filter((result) => !result.skipped)');
    expect(cron).toContain('directGeneratedDetails,');
  });
});
