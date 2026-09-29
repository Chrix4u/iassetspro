import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/generated-assets/[...path]/route.ts', 'utf8');

describe('generated asset runtime delivery', () => {
  it('streams only supported generated model/image types from persistent storage', () => {
    expect(route).toContain("process.env.GENERATED_ASSETS_DIR");
    expect(route).toContain("'model/gltf-binary'");
    expect(route).toContain("'model/gltf+json'");
    expect(route).toContain("'image/png'");
  });

  it('protects the generated-assets root from path traversal', () => {
    expect(route).toContain('resolve(GENERATED_ROOT, relative)');
    expect(route).toContain("absolute.startsWith(GENERATED_ROOT + '/')");
    expect(route).toContain('Invalid generated asset path');
  });

  it('serves generated files dynamically rather than relying on the Next public manifest', () => {
    expect(route).toContain("dynamic = 'force-dynamic'");
    expect(route).toContain('readFile(absolute)');
    expect(route).toContain("'Cache-Control': 'public, max-age=3600, immutable'");
  });
});