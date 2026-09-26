import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const prismaConfig = fs.readFileSync('prisma.config.ts', 'utf8');
const db = fs.readFileSync('src/lib/db.ts', 'utf8');
const seed = fs.readFileSync('prisma/seed.ts', 'utf8');
const compose = fs.readFileSync('docker-compose.yml', 'utf8');
const deploy = fs.readFileSync('scripts/deploy-production-artifact-core.sh', 'utf8');

describe('PostgreSQL clean cutover contract', () => {
  it('uses PostgreSQL throughout Prisma and runtime', () => {
    expect(schema).toContain('provider = "postgresql"');
    expect(prismaConfig).toContain("'postgresql'");
    expect(db).toContain("@prisma/adapter-pg");
    expect(db).toContain('PrismaPg');
    expect(db).not.toContain('create-mariadb-adapter');
  });

  it('uses PostgreSQL for local/production container and backup tooling', () => {
    expect(compose).toContain('postgres:17-alpine');
    expect(compose).not.toContain('mariadb:');
    expect(deploy).toContain('pg_dump');
    expect(deploy).not.toContain('mysqldump');
    expect(deploy).not.toContain('mariadb-dump');
  });

  it('supports a destructive canonical-only staging bootstrap', () => {
    expect(seed).toContain('SEED_CANONICAL_ONLY');
    expect(seed).toContain('TRUNCATE TABLE');
    expect(seed).toContain("'roles'");
    expect(seed).toContain("'permissions'");
    expect(seed).toContain("'system_modules'");
    expect(seed).toContain("'status_transitions'");
    expect(seed).toContain('Plants, departments, employees, assets, components, inventory, tools, PM and work-order data are empty.');
  });
});
