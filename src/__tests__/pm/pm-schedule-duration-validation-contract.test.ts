import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const collection = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');

describe('PM schedule estimated-duration validation contract', () => {
  it('keeps the required Prisma field valid when create input is blank or zero', () => {
    expect(schema).toContain('estimatedDuration Float // hours');
    expect(collection).toContain('Estimated duration must be a non-negative number of hours');
    expect(collection).toContain('estimatedDuration: normalizedEstimatedDuration');
    expect(collection).not.toContain('estimatedDuration: estimatedDuration || null');
  });

  it('normalizes and validates estimated duration on schedule edits too', () => {
    expect(detail).toContain('Estimated duration must be a non-negative number of hours');
    expect(detail).toContain('updateData.estimatedDuration = normalizedEstimatedDuration');
  });
});
