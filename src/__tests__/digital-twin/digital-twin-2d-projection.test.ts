import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewer = fs.readFileSync('src/components/digital-twin/DigitalTwinViewer.tsx', 'utf8');
const toolbar = fs.readFileSync('src/components/digital-twin/TwinToolbar.tsx', 'utf8');

describe('digital twin 2D projection modes', () => {
  it('supports explicit orthographic front, top and side views beside 3D perspective', () => {
    expect(viewer).toContain('OrthographicCamera');
    for (const mode of ['2d-front', '2d-top', '2d-side']) {
      expect(viewer).toContain(mode);
      expect(toolbar).toContain(mode);
    }
    expect(toolbar).toContain('3D Perspective');
    expect(toolbar).toContain('2D Front');
    expect(toolbar).toContain('2D Top');
    expect(toolbar).toContain('2D Side');
  });

  it('locks rotation in 2D mode while preserving viewer controls', () => {
    expect(viewer).toContain("locked2D={viewMode !== '3d'}");
    expect(viewer).toContain('enableRotate={!locked2D}');
    expect(toolbar).toContain('Exploded View');
    expect(toolbar).toContain('Section Plane');
    expect(toolbar).toContain('IoT Overlay');
  });
});