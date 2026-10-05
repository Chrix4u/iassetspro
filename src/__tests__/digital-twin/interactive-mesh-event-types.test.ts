import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/components/digital-twin/InteractiveMesh.tsx', 'utf8');

describe('InteractiveMesh React Three Fiber event types', () => {
  it('uses ThreeEvent for handlers that stop propagation', () => {
    expect(source).not.toContain('(e: THREE.Event) => {');
    expect(source.match(/ThreeEvent<MouseEvent>/g)?.length).toBe(3);
    expect(source.match(/ThreeEvent<PointerEvent>/g)?.length).toBe(4);
    expect(source.match(/e\.stopPropagation\(\)/g)?.length).toBeGreaterThanOrEqual(7);
  });
});
