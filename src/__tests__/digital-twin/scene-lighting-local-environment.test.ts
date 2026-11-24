import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/digital-twin/SceneLighting.tsx', 'utf8');

describe('network-independent 3D scene lighting', () => {
  it('builds reflections from local light geometry without loading remote HDRI presets', () => {
    expect(source).toContain('<Environment');
    expect(source).toContain('frames={1}');
    expect(source).toContain('resolution={128}');
    expect(source.match(/<Lightformer /g)).toHaveLength(3);
    expect(source).not.toContain('preset=');
    expect(source).not.toContain('files=');
    expect(source).not.toContain('http');
    expect(source).toContain('<directionalLight');
    expect(source).toContain('<hemisphereLight');
  });
});
