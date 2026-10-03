import { describe, expect, it } from 'vitest';
import { getBuiltinGeometrySpec, matchTemplate } from '@/lib/generate-3d/builtin-geometry';

describe('GTP textile machine fallback geometry', () => {
  const cases = [
    ['Stenter 6', 'stenter', ['Heating Chamber 1', 'Left Tenter Rail', 'Exit Cooling Roller']],
    ['Singeing Machine', 'singeing_machine', ['Brush Cleaning Unit', 'Burner Section', 'Quench Trough']],
    ['Mercerizer', 'mercerizer', ['Caustic Impregnation Trough', 'Stretch Roller', 'Neutralization Trough']],
    ['Rope Soaper Machine 2', 'rope_soaper', ['Soaping Trough 1', 'Circulation Pump', 'Final Squeeze Roller']],
  ] as const;

  for (const [name, template, anatomy] of cases) {
    it(`maps ${name} to its dedicated textile template`, () => {
      expect(matchTemplate(name)).toBe(template);
      const spec = getBuiltinGeometrySpec(name);
      expect(spec.machineName).toBe(name);
      expect(spec.description.toLowerCase()).toContain('engineering approximation');
      const names = spec.parts.map((item) => item.name);
      for (const expected of anatomy) expect(names).toContain(expected);
      expect(spec.parts.length).toBeGreaterThanOrEqual(10);
    });
  }
});
