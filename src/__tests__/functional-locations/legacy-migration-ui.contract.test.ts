import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => {
  const full = resolve(root, path);
  expect(existsSync(full), `${path} must exist`).toBe(true);
  return existsSync(full) ? readFileSync(full, 'utf8') : '';
};

describe('legacy functional-location migration UI', () => {
  it('exposes the migration only to administrators from the hierarchy workspace', () => {
    const page = read('src/components/modules/FunctionalLocationHierarchyPage.tsx');
    expect(page).toContain("import { LegacyLocationMigrationDialog } from '@/components/assets/LegacyLocationMigrationDialog'");
    expect(page).toContain('const canMigrateLegacyLocations = isAdmin()');
    expect(page).toContain('Migrate legacy locations');
    expect(page).toContain('<LegacyLocationMigrationDialog');
  });

  it('forces preview before import and keeps level-to-legacy mapping visible/editable', () => {
    const dialog = read('src/components/assets/LegacyLocationMigrationDialog.tsx');
    expect(dialog).toContain("'/api/admin/functional-location-migration/preview'");
    expect(dialog).toContain("'/api/admin/functional-location-migration/import'");
    expect(dialog).toContain('Legacy source mapping');
    expect(dialog).toContain('previewFingerprint');
    expect(dialog).toContain("IMPORT READY LEGACY LOCATIONS");
    expect(dialog).toContain('setPreview(null)');
  });

  it('shows ready, blocked, already-assigned and node-create/reuse counts before execution', () => {
    const dialog = read('src/components/assets/LegacyLocationMigrationDialog.tsx');
    expect(dialog).toContain('Ready assets');
    expect(dialog).toContain('Blocked assets');
    expect(dialog).toContain('Already assigned');
    expect(dialog).toContain('Nodes to create');
    expect(dialog).toContain('Nodes to reuse');
  });
});
