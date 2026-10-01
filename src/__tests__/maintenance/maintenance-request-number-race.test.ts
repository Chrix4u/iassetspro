import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/maintenance-requests/route.ts', 'utf8');

describe('maintenance request number allocation', () => {
  it('retries PostgreSQL unique collisions caused by concurrent MR creation', () => {
    expect(route).toContain('for (let attempt = 0; attempt < 5; attempt += 1)');
    expect(route).toContain("if (code !== 'P2002' || attempt === 4) throw error;");
    expect(route).toContain('Failed to allocate a unique maintenance request number');
  });
});
