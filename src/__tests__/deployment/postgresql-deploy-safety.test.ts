import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('PostgreSQL deployment safety', () => {
  it('never restores a checked-in prebuilt Prisma client in deploy helpers', () => {
    for (const path of ['DEPLOY.sh', 'rebuild.sh', 'scripts/webuzo-setup.sh', 'scripts/webuzo-deploy.sh', 'scripts/vm-deploy.sh']) {
      expect(read(path), path).not.toContain('cp -r prisma/prebuilt/.prisma');
    }
  });

  it('does not use prisma db push or accept-data-loss in production helpers', () => {
    for (const path of ['rebuild.sh', 'scripts/webuzo-setup.sh', 'scripts/webuzo-deploy.sh', 'scripts/start-production.sh']) {
      expect(read(path), path).not.toContain('prisma db push');
      expect(read(path), path).not.toContain('--accept-data-loss');
      expect(read(path), path).toContain('prisma migrate deploy');
    }
  });

  it('validates or generates the PostgreSQL Prisma client instead of trusting stale generated code', () => {
    expect(read('DEPLOY.sh')).toContain('provider[[:space:]]*=[[:space:]]*"postgresql"');
    expect(read('scripts/webuzo-setup.sh')).toContain('npx prisma generate');
    expect(read('scripts/webuzo-deploy.sh')).toContain('npx prisma generate');
    expect(read('scripts/vm-deploy.sh')).toContain('bunx prisma generate');
    expect(read('scripts/vm-deploy.sh')).toContain('@prisma/adapter-pg');
    expect(read('scripts/vm-deploy.sh')).toContain('node_modules/pg');
    expect(read('scripts/vm-deploy.sh')).not.toContain('@prisma/adapter-mariadb');
    expect(read('scripts/vm-deploy.sh')).not.toContain('node_modules/mariadb');
    expect(read('scripts/start-production.sh')).toContain('bunx prisma migrate deploy');
  });
});
