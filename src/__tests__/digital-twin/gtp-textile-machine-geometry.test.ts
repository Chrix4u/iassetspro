import { describe, expect, it } from 'vitest';
import { getBuiltinGeometrySpec, matchTemplate } from '@/lib/generate-3d/builtin-geometry';

describe('GTP textile-machine fallback 3D geometry', () => {
  const cases = [
    {
      name: 'Stenter Machine 6',
      template: 'stenter',
      parts: ['Infeed Pin Roller', 'Left Stenter Chain', 'Drying Chamber 1', 'Batching Outfeed Roller'],
    },
    {
      name: 'Singeing Machine',
      template: 'singeing',
      parts: ['Singeing Burner', 'Saturator Mangle', 'First Washer', 'J-Box Plaiter'],
    },
    {
      name: 'Mercerizer',
      template: 'mercerizer',
      parts: ['First Caustic Mangle', 'Caustic Circulation Pump', 'Washing Tank 1', 'Water Mangle'],
    },
    {
      name: 'Rope Soaper Machine 2',
      template: 'rope_soaper',
      parts: ['Scutcher Assembly', 'Process Compartment 1', 'Squeezer Mangle', 'Soap Dosing Tank'],
    },
  ] as const;

  for (const machine of cases) {
    it('selects a dedicated template for ' + machine.name, () => {
      expect(matchTemplate(machine.name)).toBe(machine.template);
      const spec = getBuiltinGeometrySpec(machine.name);
      expect(spec.machineName).toBe(machine.name);
      expect(spec.parts.length).toBeGreaterThanOrEqual(12);
      const names = spec.parts.map((part) => part.name);
      for (const expected of machine.parts) expect(names).toContain(expected);
    });
  }
});
