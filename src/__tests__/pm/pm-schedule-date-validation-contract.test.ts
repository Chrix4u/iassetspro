import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');

describe('PM schedule date validation contract', () => {
  it('rejects malformed create dates before Prisma receives them', () => {
    expect(collection).toContain('const normalizedLastCompletedDate');
    expect(collection).toContain('Number.isNaN(normalizedLastCompletedDate.getTime())');
    expect(collection).toContain('const normalizedNextDueDate');
    expect(collection).toContain('Number.isNaN(normalizedNextDueDate.getTime())');
    expect(collection).toContain('Last completed date must be a valid date');
    expect(collection).toContain('Next due date must be a valid date');
  });

  it('rejects malformed edit dates instead of persisting Invalid Date values', () => {
    expect(detail).toContain("field === 'lastCompletedDate'");
    expect(detail).toContain("field === 'nextDueDate'");
    expect(detail).toContain('Number.isNaN(normalizedDate.getTime())');
    expect(detail).toContain('must be a valid date');
  });
});
