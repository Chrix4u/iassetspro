import { describe, expect, it } from 'vitest';
import { getBuiltinGeometrySpec, matchTemplate } from '@/lib/generate-3d/builtin-geometry';

describe('rotary printing fallback 3D geometry', () => {
  it('selects the dedicated printing-machine template', () => {
    expect(matchTemplate('Rotary Printing Machine RP-01')).toBe('printing_machine');
    expect(matchTemplate('Rotary screen printing 5')).toBe('printing_machine');
  });

  it('preserves the real asset name and includes printing-line anatomy', () => {
    const spec = getBuiltinGeometrySpec('Rotary Printing Machine RP-01');
    expect(spec.machineName).toBe('Rotary Printing Machine RP-01');
    expect(spec.parts.length).toBeGreaterThanOrEqual(12);
    const names = spec.parts.map((part) => part.name);
    for (const expected of [
      'Unwind Spindle',
      'Rotary Screen Cylinder A',
      'Ink Trough',
      'Dryer Tunnel',
      'Rewind Spindle',
      'Main Drive Motor',
      'Electrical Control Cabinet',
    ]) {
      expect(names).toContain(expected);
    }
  });
});