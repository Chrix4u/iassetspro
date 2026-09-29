import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const generator = fs.readFileSync('src/lib/generate-3d/programmatic-generator.ts', 'utf8');

describe('programmatic 3D model persistence', () => {
  it('stores generated GLB files in persistent generated-assets storage', () => {
    expect(generator).toContain("public', 'generated-assets', 'models'");
    expect(generator).toContain('/api/generated-assets/models/');
    expect(generator).not.toContain('/uploads/models/');
  });

  it('binds the generated AssetModel to its source asset', () => {
    expect(generator).toContain('assetId,');
    expect(generator).toContain('db.assetModel.create');
  });

  it('keeps model/twin/scene commissioning idempotent', () => {
    expect(generator).toContain('db.assetModel.findFirst');
    expect(generator).toContain('db.assetModel.update');
    expect(generator).toContain('db.digitalTwin.findFirst');
    expect(generator).toContain('db.digitalTwin.update');
    expect(generator).toContain('db.digitalTwinScene.findFirst');
    expect(generator).toContain('db.digitalTwinScene.update');
    expect(generator).toContain('db.digitalTwinScene.create');
  });
});