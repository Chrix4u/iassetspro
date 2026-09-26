import { defineConfig } from 'prisma/config';

function loadDatabaseUrl(): string {
  let url = process.env.DATABASE_URL || '';

  if (!url) {
    const host = process.env.PGHOST || process.env.DB_HOST;
    const port = process.env.PGPORT || process.env.DB_PORT || '5432';
    const user = process.env.PGUSER || process.env.DB_USER;
    const password = process.env.PGPASSWORD || process.env.DB_PASSWORD;
    const database = process.env.PGDATABASE || process.env.DB_NAME;
    if (host && user && password && database) {
      url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
    }
  }

  if (!url && process.env.CI) {
    url = 'postgresql://ci:ci@127.0.0.1:5432/iassetspro_ci';
  }

  if (!/^postgres(?:ql)?:\/\//.test(url)) {
    throw new Error(
      'DATABASE_URL must be a PostgreSQL connection string. Example: postgresql://user:password@host:5432/iassetspro',
    );
  }

  return url;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'bun ./prisma/seed.ts',
  },
  datasource: {
    url: loadDatabaseUrl(),
  },
});
