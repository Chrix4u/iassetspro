import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const db = fs.readFileSync('src/lib/db.ts', 'utf8');

describe('PostgreSQL standalone runtime adapter contract', () => {
  it('uses a statically traceable adapter import in the production bundle', () => {
    expect(db).toContain("import { createAdapter } from './create-postgres-adapter'");
    expect(db).not.toContain("require('./create-postgres-adapter')");
  });
});
