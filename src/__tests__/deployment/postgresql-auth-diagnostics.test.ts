import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('PostgreSQL authentication diagnostics', () => {
  it('requires PostgreSQL in environment validation', () => {
    const source = read('src/services/environmentValidation.service.ts');
    expect(source).toContain("['postgres:', 'postgresql:'].includes(parsed.protocol)");
    expect(source).toContain('PostgreSQL is required');
    expect(source).not.toContain("url.startsWith('mysql://')");
    expect(source).not.toContain("url.startsWith('mariadb://')");
  });

  it('does not leak DB exceptions or advise db push through login responses', () => {
    const source = read('src/app/api/auth/login/route.ts');
    expect(source).not.toContain('Run: npx prisma db push');
    expect(source).not.toContain('Database error: ${fallbackErr');
    expect(source).not.toContain('Session creation failed: ${fallbackErr');
    expect(source).not.toContain('error: message');
    expect(source).toContain('Authentication service is temporarily unavailable');
    expect(source).toContain('Authentication session could not be created');
    expect(source).toContain('Authentication request could not be completed');
  });
});
