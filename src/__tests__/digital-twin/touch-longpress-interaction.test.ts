import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const interactiveMesh = fs.readFileSync(
  'src/components/digital-twin/InteractiveMesh.tsx',
  'utf8',
);

describe('digital twin touch long-press interaction', () => {
  it('starts long-press only from a touch pointer-down, never from desktop hover', () => {
    expect(interactiveMesh).toContain("e.pointerType !== 'touch'");
    expect(interactiveMesh).toContain('onPointerDown={handlePointerDown}');
    expect(interactiveMesh).toContain('onPointerUp={handlePointerUp}');

    const hoverHandler = interactiveMesh.slice(
      interactiveMesh.indexOf('const handlePointerOver'),
      interactiveMesh.indexOf('const handlePointerDown'),
    );
    expect(hoverHandler).not.toContain('longPressTimerRef.current = setTimeout');
  });
});
