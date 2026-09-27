import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const verifier = fs.readFileSync('scripts/verify-rp01-uat.ts', 'utf8');

describe('RP-01 post-deploy verifier', () => {
  it('checks hierarchy, PM, inventory, resources and visual readiness', () => {
    expect(verifier).toContain('components.length < 77');
    expect(verifier).toContain('roots.length < 8');
    expect(verifier).toContain("id: 'uat_pm_bearing_500h'");
    expect(verifier).toContain('spareLinks < 11');
    expect(verifier).toContain('toolLinks < 8');
    expect(verifier).toContain('db.componentVisual.count');
    expect(verifier).toContain('aiImageReady');
  });

  it('treats missing AI credentials as a reported readiness dimension, not fake imagery', () => {
    expect(verifier).toContain('provider: aiConfig?.provider || null');
    expect(verifier).toContain('imageModel: aiConfig?.imageModel || null');
    expect(verifier).not.toContain('placeholder');
  });
});
