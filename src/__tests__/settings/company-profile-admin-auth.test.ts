import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(join(process.cwd(), 'src/app/api/company-profile/route.ts'), 'utf8');

describe('company profile update authorization', () => {
  it('imports isAdmin from the canonical auth helper', () => {
    expect(route).toContain("import { getSession, hasPermission, isAdmin } from '@/lib/auth';");
  });

  it('allows system settings permission or admin authorization', () => {
    expect(route).toContain("!hasPermission(session, 'system_settings.update') && !isAdmin(session)");
  });
});
