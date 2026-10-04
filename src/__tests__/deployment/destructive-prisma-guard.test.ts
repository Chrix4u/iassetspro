import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const script = path.resolve(process.cwd(), 'scripts/guard-destructive-prisma.mjs');

function run(env: Record<string, string | undefined>) {
  return spawnSync(process.execPath, [script, 'test-op'], {
    env: {
      ...process.env,
      NODE_ENV: '',
      DATABASE_URL: '',
      IASSETSPRO_ALLOW_DESTRUCTIVE_DB: '',
      ...env,
    },
    encoding: 'utf8',
  });
}

describe('destructive Prisma command guard', () => {
  it('permits clearly local PostgreSQL development targets', () => {
    const result = run({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://dev:dev@127.0.0.1:5432/iassetspro_dev',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('permitted for local PostgreSQL host 127.0.0.1');
  });

  it('blocks all destructive commands in production by default', () => {
    const result = run({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://dev:dev@127.0.0.1:5432/iassetspro',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('NODE_ENV=production');
  });

  it('blocks remote PostgreSQL hosts outside production too', () => {
    const result = run({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://dev:dev@db.example.internal:5432/iassetspro',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not an approved local-development host');
  });

  it('requires PostgreSQL', () => {
    const result = run({
      NODE_ENV: 'development',
      DATABASE_URL: 'mysql://dev:dev@127.0.0.1:3306/iassetspro',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PostgreSQL is required');
  });

  it('allows an explicit one-command override', () => {
    const result = run({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://ops:ops@db.example.internal:5432/iassetspro',
      IASSETSPRO_ALLOW_DESTRUCTIVE_DB: '1',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('OVERRIDE accepted');
  });
});
