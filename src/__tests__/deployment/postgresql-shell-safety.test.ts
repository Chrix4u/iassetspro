import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const shellScripts = [
  'scripts/bootstrap-postgresql-staging.sh',
  'scripts/deploy-production-artifact-core.sh',
  'scripts/deploy-production-artifact.sh',
];

describe('PostgreSQL deployment shell safety', () => {
  it.each(shellScripts)('%s passes bash syntax validation', (script) => {
    expect(() => execFileSync('bash', ['-n', script], { stdio: 'pipe' })).not.toThrow();
  });

  it('does not retain direct MariaDB runtime adapter files', () => {
    expect(fs.existsSync('src/lib/create-mariadb-adapter.ts')).toBe(false);
    expect(fs.existsSync('src/lib/create-mariadb-adapter.js')).toBe(false);
    expect(fs.existsSync('scripts/seed-transitions.js')).toBe(false);
    expect(fs.existsSync('schema-mysql.sql')).toBe(false);
  });

  it('manual deployment helper links PostgreSQL runtime packages', () => {
    const source = fs.readFileSync('scripts/deploy-vps.sh', 'utf8');
    expect(source).toContain('node_modules/pg');
    expect(source).toContain('seed-transitions.ts');
    expect(source).not.toContain('node_modules/mariadb');
    expect(source).not.toContain('seed-transitions.js');
  });
});
