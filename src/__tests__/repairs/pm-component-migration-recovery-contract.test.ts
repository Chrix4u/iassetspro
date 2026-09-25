import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const migration = fs.readFileSync('prisma/migrations/20260925161000_add_pm_schedule_component/migration.sql', 'utf8');
const deploy = fs.readFileSync('scripts/deploy-production-artifact-core.sh', 'utf8');

describe('PM component migration production recovery', () => {
  it('uses MariaDB-compatible identifier quoting and ID width', () => {
    expect(migration).toContain('ALTER TABLE `pm_schedules`');
    expect(migration).toContain('`componentId` VARCHAR(191) NULL');
    expect(migration).toContain('REFERENCES `component_registry`(`id`)');
    expect(migration).not.toContain('ALTER TABLE "pm_schedules"');
  });

  it('only auto-recovers the known failed PM component migration', () => {
    expect(deploy).toContain('RECOVERABLE_FAILED_MIGRATION="20260925161000_add_pm_schedule_component"');
    expect(deploy).toContain('migrate resolve --rolled-back "$RECOVERABLE_FAILED_MIGRATION"');
    expect(deploy).toContain('Verified database backup: $BACKUP');
  });
});
