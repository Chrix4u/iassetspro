import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = fs.readFileSync('scripts/deploy-production-release.sh', 'utf8');

describe('production release pre-migration backup', () => {
  it('detects the DATABASE_URL protocol before selecting a dump tool', () => {
    expect(script).toContain('DB_PROTOCOL=');
    expect(script).toContain('case "$DB_PROTOCOL" in');
  });

  it('uses pg_dump for PostgreSQL and verifies the compressed backup', () => {
    expect(script).toContain('postgresql|postgres)');
    expect(script).toContain('command -v pg_dump');
    expect(script).toContain('PGPASSWORD="$DB_PASS" "$DUMP_BIN"');
    expect(script).toContain('--no-owner --no-privileges');
    expect(script).toContain('gzip -t "$BACKUP"');
  });

  it('retains the legacy MySQL backup path for compatible deployments', () => {
    expect(script).toContain('mysql|mariadb)');
    expect(script).toContain('mariadb-dump || command -v mysqldump');
    expect(script).toContain('MYSQL_PWD="$DB_PASS" "$DUMP_BIN"');
  });

  it('fails closed for unsupported database protocols', () => {
    expect(script).toContain('unsupported DATABASE_URL protocol');
    expect(script).toContain('exit 1');
  });
});
