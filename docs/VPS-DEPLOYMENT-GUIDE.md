# iAssetsPro VPS Deployment Guide

> Current database platform: **PostgreSQL**
> Deployment model: GitHub-built immutable artifact → VPS canary → PM2 cutover

## Production/staging principles

- Never build application code or install application dependencies on the VPS during deployment.
- GitHub CI builds and tests the exact release artifact.
- Deployment is bound to the successful CI run ID and exact commit SHA.
- PostgreSQL is reachable locally on the VPS; application database credentials are generated server-side and are never committed to Git.
- The previous release remains active until the new PostgreSQL-backed canary passes.
- Database backups are created with `pg_dump` and verified with `pg_restore --list` before pending migrations are applied.

## Database configuration

Use a PostgreSQL URL only:

```env
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/DATABASE?schema=public
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=USER
DB_PASSWORD=PASSWORD
DB_NAME=DATABASE
```

Do not store real credentials in documentation, source files, issue comments, or commit messages.

## Clean staging cutover

The staging migration intentionally preserves no operational/demo records.

1. The release bootstrap creates/reuses a dedicated PostgreSQL role and database.
2. The generated credential is stored only in the root-owned VPS PostgreSQL config and candidate release `.env`.
3. Prisma applies the clean PostgreSQL baseline.
4. The constants-only seed creates RBAC, module registry, trades and canonical workflow transitions.
5. The seed verifies that users, plants, departments, assets, components, work orders, maintenance requests, inventory items and tools are all empty.
6. The PostgreSQL-backed release starts on a canary port.
7. Only a healthy canary may replace the active PM2 process.

## First-time commissioning

After the clean cutover, open the normal login page. When the database has no users, the page exposes **Complete first-time setup**.

The first-admin endpoint:

- works only while the user table is empty;
- requires the pre-seeded `admin` role;
- enforces a strong password;
- uses a PostgreSQL transaction advisory lock to prevent two simultaneous first-admin creations;
- permanently closes itself after the first user exists.

After signing in, commission the environment manually: plant → departments → employees/roles → inventory/stores → tools → assets → assemblies/subassemblies/components → component spare links → PM → maintenance request → work order → execution → completion → reports.

## Release verification

A release is not considered deployed until all of the following match the intended merge SHA:

- main CI completed successfully;
- production artifact checksum and embedded release SHA verified;
- PostgreSQL migration/backup steps succeeded;
- canary health succeeded;
- PM2 cutover succeeded;
- local and public post-cutover health checks succeeded.

## Rollback

The artifact deployment wrapper verifies production after any core failure. If cutover has occurred and the new runtime is unhealthy, it restores the immediately previous release and restarts PM2. During the first PostgreSQL cutover, the previous MariaDB-backed release remains independently usable until PostgreSQL canary/cutover succeeds.

## Legacy MariaDB environment

The previous MariaDB staging database is retained only as a temporary rollback dependency during the first PostgreSQL cutover. After PostgreSQL commissioning is verified, revoke the retired database credentials and decommission the old database according to the staging cleanup plan.
