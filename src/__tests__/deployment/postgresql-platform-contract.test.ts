import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('PostgreSQL platform contract', () => {
  it('uses PostgreSQL consistently across Prisma and runtime dependencies', () => {
    const schema = read('prisma/schema.prisma');
    const db = read('src/lib/db.ts');
    const pkg = JSON.parse(read('package.json'));

    expect(schema).toContain('provider = "postgresql"');
    expect(db).toContain("import { createAdapter } from './create-postgres-adapter'");
    expect(db).toContain('PostgreSQL adapter initialization failed');
    expect(pkg.dependencies['@prisma/adapter-pg']).toBeTruthy();
    expect(pkg.dependencies.pg).toBeTruthy();
    expect(pkg.dependencies['@prisma/adapter-mariadb']).toBeUndefined();
    expect(pkg.dependencies.mariadb).toBeUndefined();
    expect(pkg.dependencies.mysql2).toBeUndefined();
  });

  it('has one clean PostgreSQL baseline instead of replaying MySQL history', () => {
    const migrations = fs.readdirSync('prisma/migrations');
    expect(migrations).toEqual(['00000000000000_postgresql_baseline']);

    const baseline = read('prisma/migrations/00000000000000_postgresql_baseline/migration.sql');
    expect(baseline).toContain('CREATE SCHEMA IF NOT EXISTS "public"');
    expect(baseline).toContain('CREATE TABLE "users"');
    expect(baseline).toContain('"notificationPreferences" JSONB');
    expect(baseline).not.toContain('FOREIGN_KEY_CHECKS');
    expect(baseline).not.toContain('ENGINE=InnoDB');
  });

  it('runs hard CI database gates against real PostgreSQL services', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toContain('image: postgres:16-alpine');
    expect(ci).toContain('pg_isready -U repairs_uat -d repairs_uat');
    expect(ci).toContain('postgresql://repairs_uat:repairs_uat_pass@127.0.0.1:5432/repairs_uat?schema=public');
    expect(ci).toContain('postgresql://platform_e2e:platform_e2e_pass@127.0.0.1:5432/platform_e2e?schema=public');
    expect(ci).not.toContain('image: mariadb:');
  });

  it('deploys with PostgreSQL backups and a canary-safe first bootstrap', () => {
    const deploy = read('scripts/deploy-production-artifact-core.sh');
    const bootstrap = read('scripts/bootstrap-postgresql-staging.sh');

    expect(deploy).toContain('pg_dump');
    expect(deploy).toContain('pg_restore --list');
    expect(deploy).toContain('bootstrap-postgresql-staging.sh');
    expect(deploy).toContain('bun --env-file=.env run prisma/seed-constants.ts');
    expect(deploy).not.toContain('mysqldump');
    expect(deploy).not.toContain('mariadb-dump');

    expect(bootstrap).toContain('POSTGRESQL_SHARED_ENV:-/home/lightworld/shared/iassetspro/postgres.env');
    expect(bootstrap).toContain('shared PostgreSQL configuration is missing');
    expect(bootstrap).toContain('pg_isready');
    expect(bootstrap).toContain('PGPASSWORD="$PG_APP_PASSWORD" psql');
    expect(bootstrap).not.toContain('runuser -u postgres -- psql');
  });

  it('keeps operational staging empty and enables a race-safe first administrator setup', () => {
    const constants = read('prisma/seed-constants.ts');
    const setup = read('src/app/api/setup/first-admin/route.ts');

    for (const invariant of [
      'plants: await db.plant.count()',
      'departments: await db.department.count()',
      'assets: await db.asset.count()',
      'components: await db.componentRegistry.count()',
      'workOrders: await db.workOrder.count()',
      'maintenanceRequests: await db.maintenanceRequest.count()',
      'inventoryItems: await db.inventoryItem.count()',
      'tools: await db.tool.count()',
      'users: await db.user.count()',
    ]) {
      expect(constants).toContain(invariant);
    }
    expect(setup).toContain('pg_advisory_xact_lock');
    expect(setup).toContain('FIRST_ADMIN_ALREADY_CREATED');
    expect(setup).toContain("slug: 'admin'");
  });

  it('uses PostgreSQL infrastructure in local and Kubernetes deployments', () => {
    const compose = read('docker-compose.yml');
    const k8sApp = read('k8s/app-deployment.yaml');
    const k8sPg = read('k8s/postgresql-statefulset.yaml');

    expect(compose).toContain('image: postgres:16-alpine');
    expect(compose).toContain('pg_isready');
    expect(k8sApp).toContain('wait-for-postgres');
    expect(k8sPg).toContain('image: postgres:16-alpine');
    expect(fs.existsSync('k8s/mariadb-statefulset.yaml')).toBe(false);
  });
});
