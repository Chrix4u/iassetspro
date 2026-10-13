import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const schemaPath = resolve(root, 'prisma/schema.prisma');
const migrationPath = resolve(root, 'prisma/migrations/20261013223000_functional_location_core/migration.sql');

const schema = readFileSync(schemaPath, 'utf8');
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('functional location schema contract', () => {
  it('defines hierarchy systems, levels, and functional locations as separate models', () => {
    expect(schema).toContain('model HierarchySystem {');
    expect(schema).toContain('model HierarchyLevel {');
    expect(schema).toContain('model FunctionalLocation {');
  });

  it('keeps location codes unique within a hierarchy system and indexes tree traversal', () => {
    expect(schema).toContain('@@unique([hierarchySystemId, locationCode])');
    expect(schema).toContain('@@index([hierarchySystemId, parentId])');
    expect(schema).toContain('@@index([plantId])');
  });

  it('keeps ordered hierarchy levels unique within each system', () => {
    expect(schema).toContain('@@unique([hierarchySystemId, order])');
  });

  it('adds only an additive migration with strong hierarchy constraints', () => {
    expect(existsSync(migrationPath), 'functional location migration must exist').toBe(true);
    expect(migration).toContain('CREATE TABLE "hierarchy_systems"');
    expect(migration).toContain('CREATE TABLE "hierarchy_levels"');
    expect(migration).toContain('CREATE TABLE "functional_locations"');
    expect(migration).toMatch(/UNIQUE[^\n]*hierarchySystemId[^\n]*locationCode/i);
    expect(migration).toMatch(/WHERE[^;]*isPrimary[^;]*isActive/i);
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });

  it('preserves existing legacy asset location fields during phase 1', () => {
    expect(schema).toMatch(/\blocation\s+String\?/);
    expect(schema).toMatch(/\bbuilding\s+String\?/);
    expect(schema).toMatch(/\bfloor\s+String\?/);
    expect(schema).toMatch(/\barea\s+String\?/);
    expect(schema).toMatch(/\bdepartmentId\s+String\?/);
  });
});
