import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const machineGenerator = fs.readFileSync('scripts/generate-uat-machine-visuals.ts', 'utf8');
const assetGenerator = fs.readFileSync('src/app/api/assets/ai-generate/route.ts', 'utf8');
const componentGenerator = fs.readFileSync('src/app/api/component-visuals/generate/route.ts', 'utf8');
const generatedRoute = fs.readFileSync('src/app/api/generated-assets/[...path]/route.ts', 'utf8');
const deploy = fs.readFileSync('scripts/deploy-production-artifact-core.sh', 'utf8');

describe('generated asset persistence contract', () => {
  it('writes generated machine and component images into persistent storage', () => {
    expect(machineGenerator).toContain('process.env.GENERATED_ASSETS_DIR');
    expect(assetGenerator).toContain('process.env.GENERATED_ASSETS_DIR');
    expect(componentGenerator).toContain('process.env.GENERATED_ASSETS_DIR');
  });

  it('serves newly generated images through the generated-assets API', () => {
    expect(machineGenerator).toContain("'/api/generated-assets/component-visuals/'");
    expect(componentGenerator).toContain("'/api/generated-assets/component-visuals/'");
    expect(assetGenerator).toContain('`/api/generated-assets/${filename}`');
    expect(generatedRoute).toContain("'.svg': 'image/svg+xml'");
  });

  it('keeps immutable releases linked to the shared generated-asset store', () => {
    expect(deploy).toContain('ln -s "$GENERATED_ASSETS_DIR" "$NEW_RELEASE/public/generated-assets"');
    expect(deploy).not.toContain('cp -a "$GENERATED_ASSETS_DIR"/. "$NEW_RELEASE/public/generated-assets"/');
  });
});
