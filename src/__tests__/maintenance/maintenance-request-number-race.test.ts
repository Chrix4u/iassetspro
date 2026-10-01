import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/maintenance-requests/route.ts', 'utf8');

describe('maintenance request number allocation', () => {
  it('serializes allocation and ignores non-canonical historical/UAT request numbers', () => {
    expect(route).toContain('$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${MR_NUMBER_LOCK_KEY})`)');
    expect(route).toContain('canonicalPattern.exec(candidate.requestNumber)');
    expect(route).toContain('maxSequence = Math.max(maxSequence, sequence)');
    expect(route).toContain('maxSequence + 1');
    expect(route).toContain("padStart(4, '0')");
  });
});
