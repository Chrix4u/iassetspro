import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const tags = [
  'uat-gtp-350-1-011','uat-gtp-350-2-012','uat-gtp-350-3-013','uat-gtp-350-4-014','uat-gtp-350-5-015',
  'uat-gtp-340-6-008','uat-gtp-312-1-027','uat-gtp-314-1-001','uat-gtp-309-2-002',
];

describe('GTP persisted schematic visual assets', () => {
  it('ships technical 2D and exploded schematics for every commissioned GTP machine', () => {
    for (const tag of tags) {
      for (const mode of ['technical-2d', 'exploded']) {
        const file = path.join(process.cwd(), 'public/generated-assets/gtp-visuals', tag + '-' + mode + '.svg');
        expect(fs.existsSync(file), file).toBe(true);
        const svg = fs.readFileSync(file, 'utf8');
        expect(svg).toContain('<svg');
        expect(svg).toContain('Hierarchy-derived commissioning schematic');
        expect(svg).toContain('not OEM CAD');
      }
    }
  });

  it('registers the visuals as generated schematics rather than AI-realistic imagery', () => {
    const commissioner = fs.readFileSync(
      path.join(process.cwd(), 'scripts/commission-gtp-schematic-visuals.ts'),
      'utf8',
    );
    expect(commissioner).toContain("sourceProvider:'generated_svg'");
    expect(commissioner).toContain("['technical_2d','exploded']");
    expect(commissioner).toContain('Expected ${tags.length*2} active GTP schematics');
  });
});
