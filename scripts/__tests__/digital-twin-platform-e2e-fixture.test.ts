import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const seedSource = fs.readFileSync(path.join(root, 'prisma/seed.ts'), 'utf8');
const fixtureSource = fs.readFileSync(path.join(root, 'scripts/enable-digital-twin-platform-e2e.ts'), 'utf8');
const workflowSource = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');

describe('Digital Twin platform E2E licensing fixture', () => {
  it('keeps Digital Twin unlicensed in the normal demo seed', () => {
    expect(seedSource).toContain("code: 'digital_twin'");
    expect(seedSource).toMatch(/code: 'digital_twin'[\s\S]*?licensed: false/);
  });

  it('hard-gates the fixture and activates only the Digital Twin module', () => {
    expect(fixtureSource).toContain("FIXTURE_GUARD = 'IASSETSPRO_PLATFORM_E2E_FIXTURE'");
    expect(fixtureSource).toContain("process.env[FIXTURE_GUARD] !== '1'");
    expect(fixtureSource).toContain("MODULE_CODE = 'digital_twin'");
    expect(fixtureSource).toContain("EXPECTED_DATABASE_NAME = 'platform_e2e'");
    expect(fixtureSource).toContain("process.env.CI !== 'true'");
    expect(fixtureSource).toContain('databaseName !== EXPECTED_DATABASE_NAME');
    expect(fixtureSource).toContain('isSystemLicensed: true');
    expect(fixtureSource).toContain("DEFAULT_COMPANY_ID = '__default__'");
    expect(fixtureSource).toContain('companyId: DEFAULT_COMPANY_ID');
    expect(fixtureSource).toContain('isActive: true');
    expect(fixtureSource).toContain('isEnabled: true');
    expect(fixtureSource).toContain('licensedAt: now');
  });

  it('runs the guarded activation only inside the isolated platform E2E job', () => {
    expect(workflowSource).toContain('Enable Digital Twin platform E2E fixture');
    expect(workflowSource).toContain("IASSETSPRO_PLATFORM_E2E_FIXTURE: '1'");
    expect(workflowSource).toContain('bunx tsx scripts/enable-digital-twin-platform-e2e.ts');

    const seedIndex = workflowSource.indexOf('Seed full platform demo data');
    const fixtureIndex = workflowSource.indexOf('Enable Digital Twin platform E2E fixture');
    const e2eIndex = workflowSource.indexOf('Run platform Playwright E2E (Chromium only)');
    expect(seedIndex).toBeGreaterThan(-1);
    expect(fixtureIndex).toBeGreaterThan(seedIndex);
    expect(e2eIndex).toBeGreaterThan(fixtureIndex);
  });
});
